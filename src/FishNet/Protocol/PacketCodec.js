import { PacketId, STARTING_RPC_LINK_INDEX, packetIdName } from '../Enums/PacketId.js';
import { Channel } from '../Enums/Channel.js';
import {
  SpawnType, spawnTypeNames, TransformPropertiesFlag, AutoPackType, UNSET_OBJECTID_VALUE, RESERVE,
} from '../Enums/Spawning.js';
import { FishReader } from './FishReader.js';
import { FishWriter, toU8 } from './FishWriter.js';
import { RPC_TYPE_TO_PACKET_ID, PACKET_ID_TO_RPC_TYPE } from './Versions.js';

/**
 * Encoding/decoding of individual FishNet packets (the things that follow the
 * 4-byte tick inside a transport datagram). Every decoded packet keeps its exact
 * original bytes in `raw`; it is re-serialised from its fields only when `dirty`
 * is set, so untouched traffic is always forwarded byte-for-byte.
 *
 * Directions: 'in' = server -> client, 'out' = client -> server.
 */

export const DEFAULT_OPTIONS = Object.freeze({
  /** NetworkBehaviour._rpcHashSize: 1 unless a single behaviour has > 255 RPCs. */
  rpcHashSize: 1,
  /** ServerManager.SpawnPacking.Rotation (default PackedLess = 8 byte quaternion). */
  spawnRotationPacking: AutoPackType.PackedLess,
  /** ServerManager allow predicted spawning: 'auto' | true | false. Affects Authenticated. */
  predictedSpawning: 'auto',
  /** DebugManager.WriteSceneObjectDetails on a development server. */
  sceneObjectDetails: false,
  /** DebugManager.ValidateRpcLengths on a development build. */
  validateRpcLengths: false,
  // ---- version dependent (see Versions.js); defaults are FishNet >= 4.6.9
  /** Spawn initialize order: 'int32' (packed, >= 4.6.6) or 'int8' (unpacked sbyte). */
  initializeOrderFormat: 'int32',
  /** Spawn RpcLink kind: 'packetId16' (>= 4.6.3) or 'rpcType8'. */
  rpcLinkTypeFormat: 'packetId16',
  /** Authenticated predicted id count: 'packed' (>= 4.6.9) or 'uint8'. */
  predictedIdCountFormat: 'packed',
  /** Successful PredictedSpawnResult carries RpcLinks (old 4.x). */
  predictedSpawnResultLinks: false,
});

const VALID_IDS = new Set([1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 20, 21]);
export const isPlausiblePacketId = (id) => VALID_IDS.has(id) || id >= STARTING_RPC_LINK_INDEX;

const RPC_KINDS = new Set([PacketId.ServerRpc, PacketId.ObserversRpc, PacketId.TargetRpc, PacketId.Replicate, PacketId.Reconcile]);

/** Packets.GetPacketLength: length present on reliable, or always for Broadcast/SyncType/Reconcile. */
export function hasLengthPrefix(packetId, channel, linkRpcPacketId) {
  if (channel === Channel.Reliable) return true;
  const pid = packetId >= STARTING_RPC_LINK_INDEX ? linkRpcPacketId : packetId;
  return pid === PacketId.Broadcast || pid === PacketId.SyncType || pid === PacketId.Reconcile;
}

// ===================================================================== decode

/**
 * Reads one packet at reader.position.
 * @returns {object} packet
 */
export function readPacket(reader, ctx) {
  const start = reader.position;
  const id = reader.readPacketId();
  const pkt = { id, name: packetIdName(id), direction: ctx.direction, channel: ctx.channel, dirty: false };
  if (!ctx.options || ctx.options.predictedSpawning === undefined) ctx = { ...ctx, options: { ...DEFAULT_OPTIONS, ...(ctx.options || {}) } };
  const o = ctx.options;

  try {
    if (id >= STARTING_RPC_LINK_INDEX) readRpcLink(reader, pkt, ctx);
    else if (RPC_KINDS.has(id)) readRpc(reader, pkt, ctx);
    else {
      switch (id) {
        case PacketId.Authenticated: readAuthenticated(reader, pkt, ctx); break;
        case PacketId.Split:
          pkt.expectedMessages = reader.readInt32();
          pkt.chunk = reader.readRemaining().slice();
          break;
        case PacketId.ObjectSpawn: readSpawn(reader, pkt, ctx); break;
        case PacketId.ObjectDespawn:
          if (ctx.direction === 'in') {
            pkt.objectId = reader.readNetworkObjectId();
            pkt.despawnType = reader.readUInt8();
          } else {
            pkt.target = reader.readNetworkObject();
            pkt.objectId = pkt.target.objectId;
          }
          break;
        case PacketId.PredictedSpawnResult:
          pkt.success = reader.readBoolean();
          pkt.usedObjectId = reader.readNetworkObjectId();
          pkt.nextObjectId = reader.readNetworkObjectId();
          if (o.predictedSpawnResultLinks && pkt.success) {
            pkt.rpcLinksRaw = reader.readBytes(reader.readUInt16Unpacked()).slice();
            try { pkt.rpcLinks = parseSpawnRpcLinks(pkt.rpcLinksRaw, o.rpcLinkTypeFormat); } catch { pkt.rpcLinks = null; }
          }
          break;
        case PacketId.SyncType:
          pkt.target = reader.readNetworkBehaviour();
          pkt.objectId = pkt.target.objectId;
          pkt.componentIndex = pkt.target.componentIndex;
          pkt.length = reader.readUInt32Unpacked();
          pkt.data = reader.readBytes(pkt.length).slice();
          break;
        case PacketId.OwnershipChange:
          pkt.target = reader.readNetworkObject();
          pkt.objectId = pkt.target.objectId;
          pkt.newOwnerId = reader.readNetworkConnectionId();
          break;
        case PacketId.Broadcast:
          pkt.key = reader.readUInt16();
          pkt.length = reader.readInt32();
          pkt.data = reader.readBytes(pkt.length).slice();
          if (ctx.state) pkt.broadcastName = ctx.state.broadcastName(pkt.key);
          break;
        case PacketId.PingPong:
        case PacketId.TimingUpdate:
          pkt.tick = reader.readTick();
          break;
        case PacketId.Disconnect:
          // ClientManager clears the reader: everything after is ignored.
          pkt.ignoredTail = reader.readRemaining().slice();
          break;
        case PacketId.StateUpdate:
          pkt.clientTick = reader.readTick();
          pkt.length = reader.readInt32Unpacked();
          pkt.payload = reader.readBytes(pkt.length).slice();
          break;
        case PacketId.Version:
          if (ctx.direction === 'in') pkt.isServerDevelopment = reader.readBoolean();
          else pkt.version = reader.readString();
          break;
        default:
          throw new Error(`Unhandled PacketId ${id}`);
      }
    }
  } catch (e) {
    // Leave the reader at the start of this packet so the caller can make it opaque.
    reader.position = start;
    throw e;
  }

  pkt.raw = reader.buffer.slice(start, reader.position);
  return pkt;
}

function readTargetForRpc(reader, pkt, o) {
  if (o.validateRpcLengths) {
    pkt.debugLength = reader.readInt32Unpacked();
    pkt.debugInfo = reader.readString();
  }
  pkt.target = reader.readNetworkBehaviour();
  pkt.objectId = pkt.target.objectId;
  pkt.componentIndex = pkt.target.componentIndex;
}

function readRpc(reader, pkt, ctx) {
  const o = ctx.options || DEFAULT_OPTIONS;
  readTargetForRpc(reader, pkt, o);
  pkt.hasLength = hasLengthPrefix(pkt.id, ctx.channel);
  if (pkt.hasLength) {
    pkt.length = reader.readInt32();
    const body = new FishReader(reader.readBytes(pkt.length));
    pkt.hash = o.rpcHashSize === 2 ? body.readUInt16() : body.readUInt8();
    pkt.args = body.readRemaining().slice();
  } else {
    // Unreliable without a length: the RPC owns the rest of the datagram as far
    // as we can tell without the game's generated reader.
    pkt.hash = o.rpcHashSize === 2 ? reader.readUInt16() : reader.readUInt8();
    pkt.args = reader.readRemaining().slice();
    pkt.unboundedArgs = true;
  }
  if (ctx.state) pkt.rpcName = ctx.state.rpcName(pkt);
}

function readRpcLink(reader, pkt, ctx) {
  const o = ctx.options || DEFAULT_OPTIONS;
  pkt.linkIndex = pkt.id;
  const link = ctx.state ? ctx.state.rpcLinks.get(pkt.id) : null;
  if (link) {
    pkt.link = link;
    pkt.objectId = link.objectId;
    pkt.componentIndex = link.componentIndex;
    pkt.hash = link.hash;
    pkt.linkedTo = packetIdName(link.rpcPacketId);
  }
  if (o.validateRpcLengths) {
    pkt.debugLength = reader.readInt32Unpacked();
    pkt.debugInfo = reader.readString();
  }
  pkt.hasLength = hasLengthPrefix(pkt.id, ctx.channel, link ? link.rpcPacketId : undefined);
  if (pkt.hasLength) {
    pkt.length = reader.readInt32();
    pkt.args = reader.readBytes(pkt.length).slice();
  } else {
    pkt.args = reader.readRemaining().slice();
    pkt.unboundedArgs = true;
  }
  if (ctx.state) pkt.rpcName = ctx.state.rpcName(pkt);
}

function readAuthenticated(reader, pkt, ctx) {
  pkt.connectionId = reader.readNetworkConnectionId();
  pkt.predictedObjectIds = null;
  let mode = ctx.options ? ctx.options.predictedSpawning : 'auto';
  if (mode === 'auto' && ctx.state && ctx.state.learned.predictedSpawning != null) mode = ctx.state.learned.predictedSpawning;
  if (mode === false || reader.remaining === 0) return;

  const save = reader.position;
  const countFormat = ctx.options ? ctx.options.predictedIdCountFormat : 'packed';
  try {
    const count = countFormat === 'uint8' ? reader.readUInt8() : reader.readInt32();
    if (count < 0 || count > 4096) throw new Error('implausible predicted id count');
    const ids = [];
    for (let i = 0; i < count; i++) ids.push(reader.readNetworkObjectId());
    if (mode === 'auto' && reader.remaining > 0 && (reader.remaining < 2 || !isPlausiblePacketId(reader.peekPacketId()))) {
      throw new Error('no packet boundary after predicted ids');
    }
    pkt.predictedObjectIds = ids;
  } catch (e) {
    if (mode === true) throw e;
    reader.position = save;
  }
}

function readSpawn(reader, pkt, ctx) {
  const o = ctx.options || DEFAULT_OPTIONS;
  if (ctx.direction === 'out') pkt.predictedLength = reader.readUInt16Unpacked();

  const st = reader.readUInt8();
  pkt.spawnType = st;
  pkt.spawnTypes = spawnTypeNames(st);
  pkt.isSceneObject = (st & SpawnType.Scene) === SpawnType.Scene;
  pkt.isGlobal = (st & SpawnType.InstantiatedGlobal) === SpawnType.InstantiatedGlobal;
  pkt.isPredictedSpawner = (st & SpawnType.IsPredictedSpawner) === SpawnType.IsPredictedSpawner;

  pkt.nested = null;
  if ((st & SpawnType.Nested) === SpawnType.Nested) {
    const componentIndex = reader.readUInt8();
    const parent = reader.readNetworkBehaviour();
    pkt.nested = { componentIndex, parent };
  }

  pkt.objectId = reader.readNetworkObjectId();
  pkt.collectionId = reader.readUInt16();
  pkt.initializeOrder = o.initializeOrderFormat === 'int8' ? reader.readInt8() : reader.readInt32();
  pkt.ownerId = reader.readNetworkConnectionId();

  const tpf = reader.readUInt8();
  pkt.transformFlags = tpf;
  if ((tpf & TransformPropertiesFlag.Position) === TransformPropertiesFlag.Position) pkt.localPosition = reader.readVector3();
  if ((tpf & TransformPropertiesFlag.Rotation) === TransformPropertiesFlag.Rotation) pkt.localRotation = reader.readQuaternion(o.spawnRotationPacking);
  if ((tpf & TransformPropertiesFlag.Scale) === TransformPropertiesFlag.Scale) pkt.localScale = reader.readVector3();

  if (pkt.isSceneObject) {
    pkt.sceneId = reader.readUInt64Unpacked();
    if (o.sceneObjectDetails) {
      pkt.sceneName = reader.readString();
      pkt.objectName = reader.readString();
    }
  } else {
    pkt.prefabId = reader.readNetworkObjectId();
  }

  pkt.payload = reader.readBytes(reader.readUInt32Unpacked()).slice();
  pkt.rpcLinksRaw = reader.readBytes(reader.readUInt16Unpacked()).slice();
  pkt.syncTypes = reader.readBytes(reader.readUInt32Unpacked()).slice();
  try {
    pkt.rpcLinks = parseSpawnRpcLinks(pkt.rpcLinksRaw, o.rpcLinkTypeFormat);
  } catch (e) {
    pkt.rpcLinks = null; // keep rpcLinksRaw, which writeSpawn falls back to
    pkt.rpcLinksError = e.message;
  }
}

/**
 * NetworkBehaviour.WriteRpcLinks, repeated per behaviour that has links:
 *   componentIndex u8, count u16, count x (linkIndex u16, rpcHash u16, kind)
 * where kind is a u16 PacketId (>= 4.6.3) or a u8 RpcType flag (older).
 */
export function parseSpawnRpcLinks(bytes, format = 'packetId16') {
  const out = [];
  if (!bytes || !bytes.length) return out;
  const r = new FishReader(bytes);
  while (r.remaining > 0) {
    const componentIndex = r.readUInt8();
    const count = r.readUInt16();
    const links = [];
    for (let i = 0; i < count; i++) {
      const linkIndex = r.readUInt16Unpacked();
      const hash = r.readUInt16Unpacked();
      const rpcPacketId = format === 'rpcType8' ? (RPC_TYPE_TO_PACKET_ID[r.readUInt8()] ?? 0) : r.readUInt16Unpacked();
      links.push({ linkIndex, hash, rpcPacketId });
    }
    out.push({ componentIndex, links });
  }
  return out;
}

export function writeSpawnRpcLinks(groups, format = 'packetId16') {
  const w = new FishWriter();
  for (const g of groups || []) {
    w.writeUInt8(g.componentIndex).writeUInt16(g.links.length);
    for (const l of g.links) {
      w.writeUInt16Unpacked(l.linkIndex).writeUInt16Unpacked(l.hash);
      if (format === 'rpcType8') w.writeUInt8(PACKET_ID_TO_RPC_TYPE[l.rpcPacketId] ?? 0);
      else w.writeUInt16Unpacked(l.rpcPacketId);
    }
  }
  return w.toBytes();
}

// ===================================================================== encode

/** Serialises a packet (raw bytes unless dirty). */
export function writePacket(w, pkt, ctx = {}) {
  if (!pkt.dirty && pkt.raw) return w.writeBytes(pkt.raw);
  const o = { ...DEFAULT_OPTIONS, ...(ctx.options || {}) };
  const channel = pkt.channel ?? ctx.channel ?? Channel.Reliable;
  const direction = pkt.direction || ctx.direction;
  const id = pkt.id;

  if (id === undefined || id === null) {
    if (pkt.raw) return w.writeBytes(pkt.raw);
    throw new Error('Packet has no id');
  }
  if (pkt.opaque) return w.writeBytes(pkt.raw);

  w.writePacketId(id);

  if (id >= STARTING_RPC_LINK_INDEX) {
    if (o.validateRpcLengths) w.writeInt32Unpacked(pkt.debugLength ?? 0).writeString(pkt.debugInfo ?? '');
    const args = toU8(pkt.args || new Uint8Array(0));
    const linkPid = pkt.link ? pkt.link.rpcPacketId : undefined;
    if (hasLengthPrefix(id, channel, linkPid)) w.writeInt32(args.length);
    return w.writeBytes(args);
  }

  if (RPC_KINDS.has(id)) {
    if (o.validateRpcLengths) w.writeInt32Unpacked(pkt.debugLength ?? 0).writeString(pkt.debugInfo ?? '');
    w.writeNetworkBehaviour(pkt.target || { objectId: pkt.objectId, isSpawned: true, componentIndex: pkt.componentIndex });
    const args = toU8(pkt.args || new Uint8Array(0));
    const hashSize = o.rpcHashSize === 2 ? 2 : 1;
    if (hasLengthPrefix(id, channel)) w.writeInt32(args.length + hashSize);
    // NetworkBehaviour.WriteRpcHash: 2-byte variant writes (byte)hash as a ushort.
    if (hashSize === 2) w.writeUInt16(pkt.hash & 0xff); else w.writeUInt8(pkt.hash);
    return w.writeBytes(args);
  }

  switch (id) {
    case PacketId.Authenticated:
      w.writeNetworkConnectionId(pkt.connectionId);
      if (pkt.predictedObjectIds) {
        if (o.predictedIdCountFormat === 'uint8') w.writeUInt8(pkt.predictedObjectIds.length);
        else w.writeInt32(pkt.predictedObjectIds.length);
        pkt.predictedObjectIds.forEach((x) => w.writeNetworkObjectId(x));
      }
      return w;
    case PacketId.Split:
      return w.writeInt32(pkt.expectedMessages).writeBytes(pkt.chunk);
    case PacketId.ObjectSpawn:
      return writeSpawn(w, pkt, o, direction);
    case PacketId.ObjectDespawn:
      if (direction === 'in') return w.writeNetworkObjectId(pkt.objectId).writeUInt8(pkt.despawnType ?? 0);
      return w.writeNetworkObject(pkt.target || { objectId: pkt.objectId, isSpawned: true });
    case PacketId.PredictedSpawnResult:
      w.writeBoolean(pkt.success).writeNetworkObjectId(pkt.usedObjectId).writeNetworkObjectId(pkt.nextObjectId);
      if (o.predictedSpawnResultLinks && pkt.success) {
        const l = pkt.rpcLinks ? writeSpawnRpcLinks(pkt.rpcLinks, o.rpcLinkTypeFormat) : toU8(pkt.rpcLinksRaw || new Uint8Array(0));
        w.writeUInt16Unpacked(l.length).writeBytes(l);
      }
      return w;
    case PacketId.SyncType: {
      const data = toU8(pkt.data || new Uint8Array(0));
      return w.writeNetworkBehaviour(pkt.target).writeUInt32Unpacked(data.length).writeBytes(data);
    }
    case PacketId.OwnershipChange:
      return w.writeNetworkObject(pkt.target || { objectId: pkt.objectId, isSpawned: true }).writeNetworkConnectionId(pkt.newOwnerId);
    case PacketId.Broadcast: {
      const data = toU8(pkt.data || new Uint8Array(0));
      return w.writeUInt16(pkt.key).writeInt32(data.length).writeBytes(data);
    }
    case PacketId.PingPong:
    case PacketId.TimingUpdate:
      return w.writeTick(pkt.tick >>> 0);
    case PacketId.Disconnect:
      return w;
    case PacketId.StateUpdate: {
      const p = toU8(pkt.payload || new Uint8Array(0));
      return w.writeTick(pkt.clientTick >>> 0).writeInt32Unpacked(p.length).writeBytes(p);
    }
    case PacketId.Version:
      return direction === 'in' ? w.writeBoolean(!!pkt.isServerDevelopment) : w.writeString(pkt.version);
    default:
      throw new Error(`Cannot encode PacketId ${id}`);
  }
}

function writeSpawn(w, pkt, o, direction) {
  let lenPos = -1;
  if (direction === 'out') { lenPos = w.position; w.writeUInt16Unpacked(0); }
  const contentStart = w.position;

  let st = pkt.spawnType ?? SpawnType.Instantiated;
  if (pkt.nested) st |= SpawnType.Nested; else st &= ~SpawnType.Nested;
  w.writeUInt8(st);
  if (pkt.nested) w.writeUInt8(pkt.nested.componentIndex).writeNetworkBehaviour(pkt.nested.parent);

  w.writeNetworkObjectId(pkt.objectId).writeUInt16(pkt.collectionId ?? 0);
  if (o.initializeOrderFormat === 'int8') w.writeInt8(pkt.initializeOrder ?? 0); else w.writeInt32(pkt.initializeOrder ?? 0);
  w.writeNetworkConnectionId(pkt.ownerId ?? -1);

  let tpf = 0;
  if (pkt.localPosition) tpf |= TransformPropertiesFlag.Position;
  if (pkt.localRotation) tpf |= TransformPropertiesFlag.Rotation;
  if (pkt.localScale) tpf |= TransformPropertiesFlag.Scale;
  w.writeUInt8(tpf);
  if (pkt.localPosition) w.writeVector3(pkt.localPosition);
  if (pkt.localRotation) w.writeQuaternion(pkt.localRotation, o.spawnRotationPacking);
  if (pkt.localScale) w.writeVector3(pkt.localScale);

  if ((st & SpawnType.Scene) === SpawnType.Scene) {
    w.writeUInt64Unpacked(pkt.sceneId ?? 0n);
    if (o.sceneObjectDetails) w.writeString(pkt.sceneName ?? '').writeString(pkt.objectName ?? '');
  } else {
    w.writeNetworkObjectId(pkt.prefabId ?? 0);
  }

  const payload = toU8(pkt.payload || new Uint8Array(0));
  const links = pkt.rpcLinks ? writeSpawnRpcLinks(pkt.rpcLinks, o.rpcLinkTypeFormat) : toU8(pkt.rpcLinksRaw || new Uint8Array(0));
  const sync = toU8(pkt.syncTypes || new Uint8Array(0));
  w.writeUInt32Unpacked(payload.length).writeBytes(payload);
  w.writeUInt16Unpacked(links.length).writeBytes(links);
  w.writeUInt32Unpacked(sync.length).writeBytes(sync);

  if (lenPos >= 0) w.insertUInt16(w.position - contentStart, lenPos);
  return w;
}

export function encodePacket(pkt, ctx) {
  const w = new FishWriter(64);
  writePacket(w, pkt, ctx);
  return w.toBytes();
}

/** Marks a packet modified so it is re-serialised from its fields. */
export function markDirty(pkt) { pkt.dirty = true; return pkt; }

// ============================================================ convenience makers

const mk = (id, fields) => ({ id, name: packetIdName(id), dirty: true, ...fields });

export const Packets = {
  version: (version) => mk(PacketId.Version, { direction: 'out', version }),
  pingPong: (tick) => mk(PacketId.PingPong, { tick }),
  broadcast: (key, data) => mk(PacketId.Broadcast, { key, data: toU8(data) }),
  /** target = { objectId, componentIndex } */
  serverRpc: ({ objectId, componentIndex = 0, hash, args = new Uint8Array(0) }) =>
    mk(PacketId.ServerRpc, { direction: 'out', target: { objectId, isSpawned: true, componentIndex }, objectId, componentIndex, hash, args: toU8(args) }),
  observersRpc: ({ objectId, componentIndex = 0, hash, args = new Uint8Array(0) }) =>
    mk(PacketId.ObserversRpc, { direction: 'in', target: { objectId, isSpawned: true, componentIndex }, objectId, componentIndex, hash, args: toU8(args) }),
  targetRpc: ({ objectId, componentIndex = 0, hash, args = new Uint8Array(0) }) =>
    mk(PacketId.TargetRpc, { direction: 'in', target: { objectId, isSpawned: true, componentIndex }, objectId, componentIndex, hash, args: toU8(args) }),
  rpcLink: ({ linkIndex, args = new Uint8Array(0), link = null }) => mk(linkIndex, { linkIndex, link, args: toU8(args) }),
  syncType: ({ objectId, componentIndex = 0, data }) =>
    mk(PacketId.SyncType, { target: { objectId, isSpawned: true, componentIndex }, data: toU8(data) }),
  ownershipChange: ({ objectId, newOwnerId }) => mk(PacketId.OwnershipChange, { direction: 'in', target: { objectId, isSpawned: true }, objectId, newOwnerId }),
  despawn: ({ objectId, despawnType = 0 }) => mk(PacketId.ObjectDespawn, { direction: 'in', objectId, despawnType }),
};

export { UNSET_OBJECTID_VALUE, RESERVE };
