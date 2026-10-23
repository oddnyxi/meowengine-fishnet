import { channelName } from './Enums/Channel.js';
import { PacketId, STARTING_RPC_LINK_INDEX } from './Enums/PacketId.js';

export const toHex = (u8, max = Infinity) => {
  if (!u8) return '';
  const n = Math.min(u8.length, max);
  let s = '';
  for (let i = 0; i < n; i++) s += (i ? ' ' : '') + u8[i].toString(16).padStart(2, '0');
  return n < u8.length ? `${s} … (+${u8.length - n})` : s;
};

export function hexDump(u8, width = 16) {
  if (!u8 || !u8.length) return '(empty)';
  const lines = [];
  for (let i = 0; i < u8.length; i += width) {
    const row = u8.subarray(i, i + width);
    const hex = [...row].map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(width * 3 - 1);
    const asc = [...row].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${i.toString(16).padStart(4, '0')}  ${hex}  ${asc}`);
  }
  return lines.join('\n');
}

const SKIP = new Set(['raw', 'dirty', 'drop', 'direction', 'channel']);

/** JSON-safe view of a decoded packet (bytes -> hex, BigInt -> string). */
export function packetToJSON(p, { maxBytes = 512 } = {}) {
  const conv = (v) => {
    if (v instanceof Uint8Array) return { bytes: v.length, hex: toHex(v, maxBytes) };
    if (typeof v === 'bigint') return v.toString();
    if (Array.isArray(v)) return v.map(conv);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, x] of Object.entries(v)) if (!SKIP.has(k) && typeof x !== 'function') o[k] = conv(x);
      return o;
    }
    return v;
  };
  return conv(p);
}

const fmtV = (v) => (v ? `(${[v.x, v.y, v.z].map((n) => (n == null ? '–' : (+n).toFixed(2))).join(', ')})` : '');

/** One-line description used in lists. */
export function describePacket(p) {
  if (!p) return '';
  if (p.name === 'BayouKeepAlive') return 'transport keep-alive';
  if (p.opaque) return `${p.claimedName} [${p.raw.length}b undecoded] ${p.error || ''}`;
  const tgt = p.objectId != null ? `obj ${p.objectId}${p.componentIndex != null ? `:${p.componentIndex}` : ''}` : '';
  const nm = p.rpcName ? ` «${p.rpcName}»` : '';
  switch (p.id) {
    case PacketId.Authenticated: return `clientId ${p.connectionId}${p.predictedObjectIds ? `, ${p.predictedObjectIds.length} predicted ids` : ''}`;
    case PacketId.Split: return `piece of ${p.expectedMessages}, ${p.chunk.length}b`;
    case PacketId.ObjectSpawn:
      return `obj ${p.objectId} ${p.isSceneObject ? `scene ${p.sceneId}` : `prefab ${p.prefabId}`} owner ${p.ownerId} ${fmtV(p.localPosition)} payload ${p.payload.length}b sync ${p.syncTypes.length}b${p.rpcLinks && p.rpcLinks.length ? ` links ${p.rpcLinks.reduce((n, g) => n + g.links.length, 0)}` : ''}`;
    case PacketId.ObjectDespawn: return `obj ${p.objectId}${p.despawnType ? ' (pool)' : ''}`;
    case PacketId.OwnershipChange: return `obj ${p.objectId} -> client ${p.newOwnerId}`;
    case PacketId.SyncType: return `${tgt} ${p.data.length}b`;
    case PacketId.Broadcast: return `key 0x${p.key.toString(16).padStart(4, '0')}${p.broadcastName ? ` «${p.broadcastName}»` : ''} ${p.data.length}b`;
    case PacketId.PingPong: case PacketId.TimingUpdate: return `tick ${p.tick}`;
    case PacketId.StateUpdate: return `clientTick ${p.clientTick} ${p.payload.length}b`;
    case PacketId.Version: return p.direction === 'in' ? `server dev build: ${p.isServerDevelopment}` : `FishNet ${p.version}`;
    case PacketId.PredictedSpawnResult: return `${p.success ? 'ok' : 'rejected'} used ${p.usedObjectId} next ${p.nextObjectId}`;
    case PacketId.Disconnect: return 'kicked / disconnected by server';
    default:
      if (p.id >= STARTING_RPC_LINK_INDEX) return `link ${p.linkIndex}${p.link ? ` -> ${p.linkedTo} ${tgt} #${p.hash}` : ' (unknown)'}${nm} ${p.args.length}b`;
      if (p.hash !== undefined) return `${tgt} #${p.hash}${nm} ${p.args.length}b${p.unboundedArgs ? '+' : ''}`;
      return '';
  }
}

/** Compact, JSON-safe capture entry for caches/exports. */
export function summarizePacket(e) {
  return {
    seq: e.seq,
    time: e.t,
    direction: e.direction,
    tick: e.tick,
    channel: channelName(e.channel),
    flag: e.flag || undefined,
    name: e.packet.name,
    info: describePacket(e.packet),
    raw: toHex(e.packet.raw),
    decoded: packetToJSON(e.packet),
  };
}
