import { PacketId, packetIdName } from '../Enums/PacketId.js';
import { Channel } from '../Enums/Channel.js';
import { FishReader } from './FishReader.js';
import { FishWriter, toU8 } from './FishWriter.js';
import { readPacket, writePacket, DEFAULT_OPTIONS } from './PacketCodec.js';

/**
 * Transport framing.
 *
 * FishNet (TransportManager / PacketBundle) sends datagrams shaped like
 *     [uint32 tick LE][packet][packet]...
 * where every packet starts with a uint16 PacketId.
 *
 * Bayou (FishNet's WebGL WebSocket transport, used by browser builds) appends
 * the channel id as ONE TRAILING BYTE to each WebSocket message
 * (CommonSocket.AddChannel / RemoveChannel):
 *     [uint32 tick][packets...][channel]
 *
 * Bayou's WebGL jslib also runs a keep-alive worker that sends a raw 5 byte
 * frame [0x0E][uint32 unix seconds] every 10s; FishNet drops it server-side
 * because it is <= 4 bytes after the channel is removed.
 */
export const Framing = Object.freeze({ Bayou: 'bayou', Raw: 'raw' });

export const TICK_LENGTH = 4;
export const PACKETID_LENGTH = 2;
/** TransportManager.SPLIT_PACKET_HEADER_LENGTH (packetId + count, count assumed 4). */
export const SPLIT_HEADER_LENGTH = 6;
/** Bayou default MTU. */
export const DEFAULT_MTU = 1023;
/** MINIMUM_MTU_RESERVE + default custom reserve. */
export const MTU_RESERVE = 2;

export function isBayouKeepAlive(u8) {
  return u8.length === 5 && u8[0] === PacketId.PingPong;
}

/**
 * Parses one WebSocket message.
 * @param {Uint8Array|ArrayBuffer} bytes
 * @param {{direction:'in'|'out', framing?:string, options?:object, state?:object}} ctx
 */
export function parseFrame(bytes, ctx) {
  const u8 = toU8(bytes);
  const framing = ctx.framing || Framing.Bayou;
  const frame = {
    direction: ctx.direction,
    framing,
    size: u8.length,
    bytes: u8,
    channel: Channel.Reliable,
    tick: null,
    packets: [],
    modified: false,
    errors: [],
  };

  const track = ctx.track && ctx.state;
  if (framing === Framing.Bayou && ctx.direction === 'out' && isBayouKeepAlive(u8)) {
    frame.keepAlive = true;
    frame.keepAliveSeconds = new DataView(u8.buffer, u8.byteOffset + 1, 4).getUint32(0, true);
    if (track) ctx.state.onFrame(frame);
    return frame;
  }

  let end = u8.length;
  if (framing === Framing.Bayou) {
    if (end < 1) { frame.empty = true; if (track) ctx.state.onFrame(frame); return frame; }
    frame.channel = u8[end - 1];
    end -= 1;
  }
  if (end <= TICK_LENGTH) { frame.empty = true; if (track) ctx.state.onFrame(frame); return frame; }

  const reader = new FishReader(u8, 0, end);
  frame.tick = reader.readTick();
  const pctx = { direction: ctx.direction, channel: frame.channel, options: { ...DEFAULT_OPTIONS, ...(ctx.options || {}) }, state: ctx.state };
  if (track) {
    ctx.state.onFrame(frame);
    pctx.onPacket = (p) => ctx.state.onPacket(p, frame);
  }

  if (reader.remaining >= 2 && reader.peekPacketId() === PacketId.Split) {
    const p = readPacket(reader, pctx);
    frame.split = { expectedMessages: p.expectedMessages, chunk: p.chunk };
    frame.packets.push(p);
    return frame;
  }

  frame.packets = parsePackets(reader, pctx, frame.errors);
  return frame;
}

/** Reads packets until the reader is empty; undecodable data becomes one opaque packet. */
export function parsePackets(reader, pctx, errors = []) {
  const out = [];
  while (reader.remaining > 0) {
    const start = reader.position;
    try {
      const p = readPacket(reader, pctx);
      out.push(p);
      // Apply immediately: a spawn's RpcLinks must be known before later packets in the same datagram.
      if (pctx.onPacket) pctx.onPacket(p);
    } catch (e) {
      reader.position = start;
      const raw = reader.readRemaining().slice();
      const id = raw.length >= 2 ? raw[0] | (raw[1] << 8) : -1;
      errors.push(`${packetIdName(id)} @${start}: ${e.message}`);
      const op = { id, name: 'Opaque', claimedName: packetIdName(id), opaque: true, raw, error: e.message, direction: pctx.direction, channel: pctx.channel, dirty: false };
      out.push(op);
      if (pctx.onPacket) pctx.onPacket(op);
      break;
    }
  }
  return out;
}

/** Concatenates (non-dropped) packets. */
export function encodePackets(packets, ctx = {}) {
  const w = new FishWriter(256);
  for (const p of packets) if (!p.drop) writePacket(w, p, ctx);
  return w.toBytes();
}

/** Wraps a packet body into a transport frame. */
export function wrapFrame(body, { tick = 0, channel = Channel.Reliable, framing = Framing.Bayou } = {}) {
  const extra = framing === Framing.Bayou ? 1 : 0;
  const out = new Uint8Array(TICK_LENGTH + body.length + extra);
  new DataView(out.buffer).setUint32(0, tick >>> 0, true);
  out.set(body, TICK_LENGTH);
  if (extra) out[out.length - 1] = channel & 0xff;
  return out;
}

/**
 * Re-encodes a parsed frame. Untouched frames are returned byte-for-byte.
 * May return several frames when edits pushed the datagram over the MTU.
 */
export function encodeFrame(frame, ctx = {}) {
  if (frame.keepAlive || frame.empty) return [frame.bytes];
  const changed = frame.modified || frame.packets.some((p) => p.dirty || p.drop);
  if (!changed) return [frame.bytes];
  const live = frame.packets.filter((p) => !p.drop);
  if (!live.length) return [];
  return buildFrames(live, {
    tick: frame.tick,
    channel: frame.channel,
    framing: frame.framing,
    direction: frame.direction,
    options: ctx.options,
    mtu: ctx.mtu,
  });
}

/**
 * Packs packets into as few frames as possible, honouring the MTU, and uses
 * PacketId.Split for single packets that are too large (TransportManager.SendSplitMessage).
 */
export function buildFrames(packets, { tick = 0, channel = Channel.Reliable, framing = Framing.Bayou, direction = 'out', options, mtu = DEFAULT_MTU } = {}) {
  const maxSegment = mtu - MTU_RESERVE; // tick + body must fit (TransportManager.GetMTUWithReserve)
  const maxBody = maxSegment - TICK_LENGTH;
  const frames = [];
  let cur = new FishWriter(256);
  const flush = () => {
    if (cur.length) frames.push(wrapFrame(cur.toBytes(), { tick, channel, framing }));
    cur = new FishWriter(256);
  };

  for (const p of packets) {
    const bytes = (() => { const w = new FishWriter(64); writePacket(w, p, { direction, channel, options }); return w.toBytes(); })();
    if (bytes.length > maxBody) {
      flush();
      splitIntoFrames(bytes, { tick, framing, mtu }).forEach((f) => frames.push(f));
      continue;
    }
    if (cur.length + bytes.length > maxBody) flush();
    cur.writeBytes(bytes);
  }
  flush();
  return frames;
}

/** TransportManager.SendSplitMessage: pieces are always sent on the reliable channel. */
export function splitIntoFrames(message, { tick = 0, framing = Framing.Bayou, mtu = DEFAULT_MTU } = {}) {
  const maxSegmentLength = mtu - MTU_RESERVE - SPLIT_HEADER_LENGTH - TICK_LENGTH;
  const count = Math.ceil(message.length / maxSegmentLength);
  const frames = [];
  for (let i = 0; i < count; i++) {
    const chunk = message.subarray(i * maxSegmentLength, Math.min(message.length, (i + 1) * maxSegmentLength));
    const w = new FishWriter(chunk.length + 8);
    w.writePacketId(PacketId.Split).writeInt32(count).writeBytes(chunk);
    frames.push(wrapFrame(w.toBytes(), { tick, channel: Channel.Reliable, framing }));
  }
  return frames;
}

/** Collects split pieces; resolves to the reassembled message when complete. */
export class SplitAssembler {
  constructor() { this.reset(); }
  reset() { this.expected = 0; this.chunks = []; this.frames = []; this.tick = null; }
  get active() { return this.expected > 0; }
  /** @returns {Uint8Array|null} full message once every piece arrived */
  add(frame) {
    const { expectedMessages, chunk } = frame.split;
    if (!this.active || expectedMessages !== this.expected) {
      this.reset();
      this.expected = expectedMessages;
      this.tick = frame.tick;
    }
    this.chunks.push(chunk);
    this.frames.push(frame);
    if (this.chunks.length < this.expected) return null;
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

/**
 * Parses a reassembled split message (no tick, no channel).
 * Pass ctx.onPacket to observe packets as they are decoded.
 */
export function parseMessage(bytes, ctx) {
  const errors = [];
  const reader = new FishReader(toU8(bytes));
  const packets = parsePackets(reader, { direction: ctx.direction, channel: ctx.channel ?? Channel.Reliable, options: { ...DEFAULT_OPTIONS, ...(ctx.options || {}) }, state: ctx.state, onPacket: ctx.onPacket }, errors);
  return { packets, errors };
}
