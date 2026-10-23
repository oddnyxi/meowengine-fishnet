import MeowEngine from '../../Browser/GlobalTypeDefs';
import { FishNetSocketManager } from '../FishNetSocketManager.js';
import { PacketId } from '../Enums/PacketId.js';
import { summarizePacket } from '../Inspect.js';

/**
 * Default FishNet patches: keeps MeowEngine.RoomInstance in sync with the
 * FishNet session (players = owning connections of spawned objects), logs
 * joins/leaves and fills the per-room packet cache.
 *
 * Add your own patches with:
 *   FishNetSocketManager.addListener('outgoing', (ctx) => { ... ctx.modify(pkt) ... })
 *   FishNetSocketManager.addListener('packet:ServerRpc', ({ packet, ctx }) => { ... })
 */
export class FishNetPatching {
  static initPatches() {
    const m = FishNetSocketManager;
    const st = m.state;
    window.MeowEngine = window.MeowEngine || MeowEngine;
    MeowEngine.Events = MeowEngine.Events || {};

    let known = new Set();
    let pending = null;
    const syncPlayers = () => {
      pending = null;
      const clients = st.getClients();
      const players = clients.map((c) => FishNetPatching.toPlayer(c));
      MeowEngine.RoomInstance.Players = players;
      MeowEngine.RoomInstance.Information.PlayerCount = players.length;

      const now = new Set(clients.map((c) => c.clientId));
      for (const id of now) if (!known.has(id)) MeowEngine.Log.Instance?.info?.(`[FishNet] Client ${id} joined${id === st.connectionId ? ' (you)' : ''}`);
      for (const id of known) if (!now.has(id)) MeowEngine.Log.Instance?.info?.(`[FishNet] Client ${id} left`);
      known = now;
    };
    const schedule = () => { if (!pending) pending = setTimeout(syncPlayers, 100); };

    st.addListener('spawn', schedule);
    st.addListener('despawn', schedule);
    st.addListener('ownership', schedule);
    st.addListener('transform', schedule);
    st.addListener('reset', () => { known = new Set(); schedule(); });
    m.addListener('disconnected', () => { FishNetPatching.clearPlayers(); known = new Set(); });

    m.addListener('connected', (session) => {
      const url = new URL(session.url, location.href);
      MeowEngine.RoomInstance.Information.RoomName = url.host;
      MeowEngine.RoomInstance.Information.RoomId = String(session.id);
    });

    st.addListener('authenticated', (id) => {
      MeowEngine.LocalPlayer.ActorNr = id;
      MeowEngine.Log.Instance?.info?.(`[FishNet] Authenticated as client ${id} (FishNet ${st.fishnetVersion || '?'})`);
    });
    st.addListener('ping', (ms) => { MeowEngine.LocalPlayer.Ping = ms; });

    // Per-room packet cache (used by the Packet Cache export).
    m.addListener('capture', (e) => {
      const cfg = MeowEngine.Config;
      const incoming = e.direction === 'in';
      if (incoming ? !cfg.cacheIncomingPackets : !cfg.cacheOutgoingPackets) return;
      const key = FishNetPatching.getRoomKey();
      const bucket = incoming ? MeowEngine.RoomInstance.CachedIncomingPackets : MeowEngine.RoomInstance.CachedOutgoingPackets;
      (bucket[key] = bucket[key] || []).push(summarizePacket(e));
    });

    // Keep the local player's object id handy.
    m.addListener('packet', ({ packet }) => {
      if (packet.id === PacketId.ObjectSpawn && packet.direction === 'in' && packet.ownerId === st.connectionId && MeowEngine.LocalPlayer.ObjectId === -1) {
        MeowEngine.LocalPlayer.ObjectId = packet.objectId;
      }
    });

    console.log('[FishNet] Patches initialized');
  }

  static toPlayer(c) {
    const main = c.objects[0];
    return {
      actorNr: c.clientId,
      clientId: c.clientId,
      isLocal: c.isLocal,
      name: c.isLocal ? (MeowEngine.LocalPlayer.Username || 'You') : `Client ${c.clientId}`,
      objectId: main ? main.objectId : -1,
      objectIds: c.objects.map((o) => o.objectId),
      prefabIds: [...new Set(c.objects.map((o) => o.prefabId).filter((x) => x != null))],
      position: c.position || { x: 0, y: 0, z: 0 },
      rotation: c.rotation || { x: 0, y: 0, z: 0, w: 1 },
      lastUpdate: c.lastUpdate,
      // Game specific values are not part of FishNet itself; fill these from the
      // game's own RPCs/SyncTypes once identified in the RPC explorer.
      rank: 0, kd: 0, team: 0, kills: 0, health: null, ping: 0, platform: 'Unknown',
    };
  }

  static clearPlayers() {
    MeowEngine.RoomInstance.Players = [];
    MeowEngine.RoomInstance.Information.PlayerCount = 0;
    MeowEngine.LocalPlayer.ObjectId = -1;
  }

  static getRoomKey() {
    const i = MeowEngine.RoomInstance?.Information;
    return `${i?.RoomName || 'Unknown'} ${i?.RoomId || 'Unknown'}`;
  }
}

export default FishNetPatching;
