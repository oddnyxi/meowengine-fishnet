import { PacketId, packetIdName, STARTING_RPC_LINK_INDEX } from '../Enums/PacketId.js';
import { UNSET_OBJECTID_VALUE } from '../Enums/Spawning.js';
import { stableHashU16 } from '../Protocol/Hashing.js';
import { tryDecodeTransformRpcArgs } from '../Protocol/NetworkTransform.js';
import { parseMessage } from '../Protocol/Framing.js';
import EventEmitter from '../../Browser/Utility/EventEmitter';

const STORAGE_KEY = 'meowengine:fishnet-registry';

/**
 * Client-side mirror of the FishNet session, rebuilt purely from traffic:
 * connection id, ticks/ping, spawned NetworkObjects, owners, RpcLinks, plus a
 * user-editable registry that names RPC hashes and broadcast keys.
 */
export class NetworkState extends EventEmitter {
  constructor() {
    super();
    this.registry = { rpcs: {}, broadcasts: {} };
    this.loadRegistry();
    this.reset();
  }

  reset() {
    this.url = null;
    this.connected = false;
    this.connectedAt = 0;
    this.confirmed = false;
    this.fishnetVersion = null;
    this.isServerDevelopment = null;
    this.connectionId = null;
    this.predictedObjectIds = [];
    this.lastServerTick = 0;
    this.lastClientTick = 0;
    this.lastTimingTick = 0;
    this.pingMs = null;
    this._pingSent = new Map(); // client tick -> performance.now()
    this.objects = new Map(); // objectId -> info
    this.rpcLinks = new Map(); // linkIndex -> { objectId, componentIndex, hash, rpcPacketId }
    this.learned = { predictedSpawning: null };
    this.stats = this._newStats();
    this.rpcStats = new Map(); // key -> aggregate
    this.emit('reset', this);
  }

  _newStats() {
    return {
      in: { frames: 0, bytes: 0, packets: 0, byName: {} },
      out: { frames: 0, bytes: 0, packets: 0, byName: {} },
      errors: 0,
      modified: 0,
      dropped: 0,
      injected: 0,
    };
  }

  // ------------------------------------------------------------------ registry

  loadRegistry() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) {
        const d = JSON.parse(s);
        this.registry.rpcs = d.rpcs || {};
        this.registry.broadcasts = d.broadcasts || {};
      }
    } catch { /* storage unavailable */ }
  }

  saveRegistry() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.registry)); } catch { /* ignore */ }
  }

  /** Name a broadcast by its C# type FullName (the key is FNV-1 folded to 16 bits). */
  registerBroadcast(typeFullName, name = typeFullName) {
    const key = stableHashU16(typeFullName);
    this.registry.broadcasts[key] = name;
    this.saveRegistry();
    return key;
  }

  nameBroadcastKey(key, name) { this.registry.broadcasts[key] = name; this.saveRegistry(); }

  broadcastName(key) { return this.registry.broadcasts[key] || null; }

  /**
   * RPC identity. Hashes are per NetworkBehaviour type, so the key includes the
   * spawned object's prefab (or scene id) and the component index.
   */
  rpcKey(pkt) {
    const obj = pkt.objectId != null ? this.objects.get(pkt.objectId) : null;
    const kind = pkt.id >= STARTING_RPC_LINK_INDEX ? (pkt.link ? packetIdName(pkt.link.rpcPacketId) : 'RpcLink') : pkt.name;
    const owner = obj ? (obj.prefabId != null ? `p${obj.prefabId}` : `s${obj.sceneId}`) : `o${pkt.objectId ?? '?'}`;
    return `${kind}|${owner}|c${pkt.componentIndex ?? '?'}|h${pkt.hash ?? '?'}`;
  }

  rpcName(pkt) { return this.registry.rpcs[this.rpcKey(pkt)] || null; }

  nameRpc(key, name) {
    if (name) this.registry.rpcs[key] = name; else delete this.registry.rpcs[key];
    this.saveRegistry();
  }

  // ------------------------------------------------------------------ tracking

  onFrame(frame) {
    const s = this.stats[frame.direction];
    s.frames++;
    s.bytes += frame.size;
    if (frame.errors && frame.errors.length) this.stats.errors += frame.errors.length;
    if (frame.tick != null) {
      if (frame.direction === 'in') this.lastServerTick = frame.tick;
      else this.lastClientTick = frame.tick;
    }
  }

  /** Applies a decoded packet to the mirror. */
  onPacket(pkt, frame) {
    const dir = pkt.direction;
    const s = this.stats[dir];
    s.packets++;
    const label = pkt.opaque ? 'Opaque' : pkt.name;
    s.byName[label] = (s.byName[label] || 0) + 1;

    switch (pkt.id) {
      case PacketId.Version:
        if (dir === 'out') this.fishnetVersion = pkt.version;
        else this.isServerDevelopment = pkt.isServerDevelopment;
        break;
      case PacketId.Authenticated:
        if (dir === 'in') {
          this.connectionId = pkt.connectionId;
          this.predictedObjectIds = pkt.predictedObjectIds || [];
          if (this.learned.predictedSpawning == null) this.learned.predictedSpawning = !!pkt.predictedObjectIds;
          this.emit('authenticated', pkt.connectionId);
        }
        break;
      case PacketId.PingPong:
        if (dir === 'out') {
          this._pingSent.set(pkt.tick, performance.now());
          if (this._pingSent.size > 32) this._pingSent.delete(this._pingSent.keys().next().value);
        } else if (this._pingSent.has(pkt.tick)) {
          this.pingMs = Math.round(performance.now() - this._pingSent.get(pkt.tick));
          this._pingSent.delete(pkt.tick);
          this.emit('ping', this.pingMs);
        }
        break;
      case PacketId.TimingUpdate:
        this.lastTimingTick = pkt.tick;
        break;
      case PacketId.ObjectSpawn:
        if (dir === 'in') this._spawn(pkt, frame);
        break;
      case PacketId.ObjectDespawn:
        if (dir === 'in') this._despawn(pkt.objectId);
        break;
      case PacketId.OwnershipChange: {
        const o = this.objects.get(pkt.objectId);
        if (o) { o.ownerId = pkt.newOwnerId; this.emit('ownership', o); }
        break;
      }
      case PacketId.PredictedSpawnResult:
        if (pkt.nextObjectId !== UNSET_OBJECTID_VALUE) this.predictedObjectIds.push(pkt.nextObjectId);
        break;
      case PacketId.StateUpdate:
        // StateUpdate carries further (reconcile) packets; decode them for inspection.
        try { pkt.nested = parseMessage(pkt.payload, { direction: dir, channel: pkt.channel, state: this }).packets; } catch { /* ignore */ }
        break;
      default:
        break;
    }

    if (pkt.hash !== undefined || pkt.id >= STARTING_RPC_LINK_INDEX || pkt.id === PacketId.Broadcast || pkt.id === PacketId.SyncType) {
      this._trackRpc(pkt);
    }
  }

  _spawn(pkt, frame) {
    const info = {
      objectId: pkt.objectId,
      prefabId: pkt.isSceneObject ? null : pkt.prefabId,
      sceneId: pkt.isSceneObject ? String(pkt.sceneId) : null,
      sceneName: pkt.sceneName || null,
      objectName: pkt.objectName || null,
      collectionId: pkt.collectionId,
      ownerId: pkt.ownerId,
      spawnTypes: pkt.spawnTypes,
      isGlobal: pkt.isGlobal,
      parent: pkt.nested ? pkt.nested.parent : null,
      componentIndexInParent: pkt.nested ? pkt.nested.componentIndex : null,
      position: pkt.localPosition || null,
      rotation: pkt.localRotation || null,
      scale: pkt.localScale || null,
      payloadLength: pkt.payload.length,
      syncTypesLength: pkt.syncTypes.length,
      rpcLinks: [],
      spawnedAtTick: frame ? frame.tick : null,
      spawnedAt: Date.now(),
      lastUpdate: Date.now(),
      transformSource: null,
    };
    for (const g of pkt.rpcLinks || []) {
      for (const l of g.links) {
        const link = { objectId: pkt.objectId, componentIndex: g.componentIndex, hash: l.hash, rpcPacketId: l.rpcPacketId };
        this.rpcLinks.set(l.linkIndex, link);
        info.rpcLinks.push({ linkIndex: l.linkIndex, ...link });
      }
    }
    this.objects.set(pkt.objectId, info);
    this.emit('spawn', info);
  }

  _despawn(objectId) {
    const o = this.objects.get(objectId);
    if (!o) return;
    for (const l of o.rpcLinks) {
      const cur = this.rpcLinks.get(l.linkIndex);
      if (cur && cur.objectId === objectId) this.rpcLinks.delete(l.linkIndex);
    }
    this.objects.delete(objectId);
    this.emit('despawn', o);
  }

  _trackRpc(pkt) {
    const key = pkt.id === PacketId.Broadcast ? `Broadcast|k${pkt.key}` : this.rpcKey(pkt);
    let e = this.rpcStats.get(key);
    if (!e) {
      e = { key, direction: pkt.direction, kind: pkt.id === PacketId.Broadcast ? 'Broadcast' : pkt.linkedTo || pkt.name, count: 0, lastSize: 0, objectId: pkt.objectId, componentIndex: pkt.componentIndex, hash: pkt.hash, broadcastKey: pkt.key, lastArgs: null };
      this.rpcStats.set(key, e);
    }
    e.count++;
    e.direction = pkt.direction;
    e.lastAt = Date.now();
    const body = pkt.args || pkt.data;
    e.lastSize = body ? body.length : 0;
    e.lastArgs = body || null;

    // Opportunistic NetworkTransform decoding: keeps object positions current.
    if (pkt.args && pkt.objectId != null && pkt.direction === 'in') {
      const nt = tryDecodeTransformRpcArgs(pkt.args);
      if (nt) {
        e.looksLikeNetworkTransform = true;
        const o = this.objects.get(pkt.objectId);
        if (o) {
          const p = o.position || { x: 0, y: 0, z: 0 };
          if (nt.position) o.position = { x: nt.position.x ?? p.x, y: nt.position.y ?? p.y, z: nt.position.z ?? p.z };
          if (nt.rotation) o.rotation = nt.rotation;
          o.lastUpdate = Date.now();
          o.transformSource = key;
          this.emit('transform', o);
        }
      }
    }
  }

  // ------------------------------------------------------------------ queries

  /** Groups spawned objects by owning connection. */
  getClients() {
    const map = new Map();
    for (const o of this.objects.values()) {
      if (o.ownerId == null || o.ownerId < 0) continue;
      let c = map.get(o.ownerId);
      if (!c) {
        c = { clientId: o.ownerId, isLocal: o.ownerId === this.connectionId, objects: [], position: null, rotation: null, lastUpdate: 0 };
        map.set(o.ownerId, c);
      }
      c.objects.push(o);
      // The most recently moved owned object stands in for the player's position.
      if (o.position && o.lastUpdate >= c.lastUpdate) {
        c.position = o.position;
        c.rotation = o.rotation;
        c.lastUpdate = o.lastUpdate;
      }
    }
    return [...map.values()].sort((a, b) => a.clientId - b.clientId);
  }

  snapshot() {
    return {
      url: this.url,
      connected: this.connected,
      fishnetVersion: this.fishnetVersion,
      isServerDevelopment: this.isServerDevelopment,
      connectionId: this.connectionId,
      lastServerTick: this.lastServerTick,
      lastClientTick: this.lastClientTick,
      pingMs: this.pingMs,
      objects: [...this.objects.values()],
      rpcLinks: Object.fromEntries(this.rpcLinks),
      stats: this.stats,
    };
  }
}

export default NetworkState;
