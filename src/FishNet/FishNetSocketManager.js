import MeowEngine from '../Browser/GlobalTypeDefs';
import EventEmitter from '../Browser/Utility/EventEmitter';
import { PacketId } from './Enums/PacketId.js';
import { Channel } from './Enums/Channel.js';
import { toU8 } from './Protocol/FishWriter.js';
import {
  Framing, parseFrame, encodeFrame, buildFrames, parseMessage, SplitAssembler, DEFAULT_MTU,
} from './Protocol/Framing.js';
import { DEFAULT_OPTIONS } from './Protocol/PacketCodec.js';
import { profileForVersion } from './Protocol/Versions.js';
import { NetworkState } from './State/NetworkState.js';
import { OnMessage } from './Handlers/OnMessageHandler.js';
import { SendMessage } from './Handlers/SendMessageHandler.js';

/** Runtime configuration (mirrored into MeowEngine.Config.FishNet). */
export const FishNetConfig = {
  /** 'auto' detects Bayou (trailing channel byte) vs raw framing from the Version handshake. */
  framing: 'auto',
  /** Bayou MTU. Raised automatically if the game is seen sending bigger frames. */
  mtu: DEFAULT_MTU,
  /** Treat sockets whose URL contains this as FishNet even before the handshake is seen. */
  urlHint: 'blayzegames',
  /** Decode traffic (required for hooks/inspection). When false everything passes through untouched. */
  decode: true,
  /** Keep a ring buffer of decoded packets for the inspector. */
  capture: true,
  captureLimit: 2000,
  debugIncomingPackets: false,
  debugOutgoingPackets: false,
  /** Force a FishNet version profile (e.g. '4.6.5'); empty = use the version the game announces. */
  assumeVersion: '',
  ...DEFAULT_OPTIONS,
};

/** The version profile currently in effect. */
export function activeProfile() {
  return profileForVersion(FishNetConfig.assumeVersion || FishNetSocketManager.state.fishnetVersion);
}

const codecOptions = () => {
  const p = activeProfile();
  return {
    rpcHashSize: FishNetConfig.rpcHashSize,
    spawnRotationPacking: FishNetConfig.spawnRotationPacking,
    predictedSpawning: FishNetConfig.predictedSpawning,
    sceneObjectDetails: FishNetConfig.sceneObjectDetails,
    validateRpcLengths: FishNetConfig.validateRpcLengths,
    initializeOrderFormat: p.initializeOrderFormat,
    rpcLinkTypeFormat: p.rpcLinkTypeFormat,
    predictedIdCountFormat: p.predictedIdCountFormat,
    predictedSpawnResultLinks: p.predictedSpawnResultLinks,
  };
};

/**
 * Context handed to 'incoming' / 'outgoing' hooks.
 * Mutate packets (then call ctx.modify(pkt)), drop them, or inject new ones.
 */
class HookContext {
  constructor(session, direction, frame) {
    this.session = session;
    this.direction = direction;
    this.frame = frame;
    this.packets = frame.packets;
    this.state = session.manager.state;
    this.dropped = false;
  }
  /** Re-serialise this packet from its (edited) fields. */
  modify(pkt) { pkt.dirty = true; this.frame.modified = true; return pkt; }
  /** Remove a single packet. */
  dropPacket(pkt) { pkt.drop = true; this.frame.modified = true; }
  /** Drop the whole frame. */
  drop() { this.dropped = true; }
  /** Append a packet to this frame (same direction/channel). */
  inject(pkt) {
    pkt.direction = this.direction;
    pkt.channel = pkt.channel ?? this.frame.channel;
    pkt.dirty = true;
    this.frame.packets.push(pkt);
    this.frame.modified = true;
    return pkt;
  }
  find(id) { return this.packets.filter((p) => p.id === id); }
}

/** One hooked WebSocket. */
export class FishNetSession {
  constructor(manager, ws, url, natives) {
    this.manager = manager;
    this.ws = ws;
    this.url = String(url);
    this.natives = natives;
    this.isFishNet = null; // null = undecided
    this.framing = FishNetConfig.framing === 'auto' ? null : FishNetConfig.framing;
    this.undecidedFrames = 0;
    this.splitIn = new SplitAssembler();
    this.splitOut = new SplitAssembler();
    this.heldIn = [];
    this.heldOut = [];
    this._onmessage = null;
    this._listeners = [];
    this.id = ++manager._sessionCounter;
  }

  get state() { return this.manager.state; }

  // ------------------------------------------------------------------ detection

  _detect(u8) {
    const framings = this.framing ? [this.framing] : [Framing.Bayou, Framing.Raw];
    for (const framing of framings) {
      try {
        const f = parseFrame(u8, { direction: 'out', framing, options: codecOptions() });
        const v = f.packets[0];
        if (v && v.id === PacketId.Version && typeof v.version === 'string' && /^\d+\.\d+/.test(v.version)) return { framing, version: v.version };
      } catch { /* try next */ }
    }
    return null;
  }

  _confirm(framing, reason, version = null) {
    this.isFishNet = true;
    this.framing = framing;
    const st = this.state;
    st.reset();
    st.url = this.url;
    st.connected = true;
    st.confirmed = true;
    st.connectedAt = Date.now();
    st.framing = framing;
    if (version) st.fishnetVersion = version;
    this.manager.active = this;
    const profile = activeProfile();
    st.profile = profile;
    MeowEngine.Log.Instance?.info?.(`[FishNet] ${reason}: ${this.url} (${framing} framing, FishNet ${version || 'unknown'})`);
    if (!profile.supported) {
      this.decodeDisabled = true;
      MeowEngine.Log.Instance?.warn?.(`[FishNet] FishNet ${version} uses a pre-4.4.3 wire format that is not supported; traffic will be passed through without decoding. Set "Assume FishNet version" to override.`);
    }
    this.manager.emit('connected', this);
  }

  // ------------------------------------------------------------------ outgoing

  handleOutgoing(data) {
    const send = (bytes) => this.natives.send.call(this.ws, bytes);
    if (!FishNetConfig.decode || this.isFishNet === false || this.decodeDisabled || typeof data === 'string' || (typeof Blob !== 'undefined' && data instanceof Blob)) {
      return send(data);
    }
    let u8;
    try { u8 = toU8(data); } catch { return send(data); }

    if (this.isFishNet === null) {
      const fr = this._detect(u8);
      if (fr) this._confirm(fr.framing, 'FishNet handshake detected', fr.version);
      else if (FishNetConfig.urlHint && this.url.includes(FishNetConfig.urlHint) && ++this.undecidedFrames > 1) this._confirm(this.framing || Framing.Bayou, 'Assuming FishNet from URL');
      else if (++this.undecidedFrames > 8) { this.isFishNet = false; return send(data); }
      else return send(data);
    }

    if (this.decodeDisabled) return send(data);
    if (u8.length > FishNetConfig.mtu) FishNetConfig.mtu = u8.length;

    let frame;
    try {
      frame = parseFrame(u8, { direction: 'out', framing: this.framing, options: codecOptions(), state: this.state, track: true });
    } catch (e) {
      this.manager._error('outgoing parse', e);
      return send(data);
    }

    // Split pieces are held until the whole message is present, then patched as one.
    if (frame.split) {
      this.heldOut.push(u8);
      const full = this.splitOut.add(frame);
      if (!full) return undefined;
      const held = this.heldOut;
      this.heldOut = [];
      const tick = this.splitOut.tick;
      this.splitOut.reset();
      return this._processMessage('out', full, tick, held, send);
    }
    if (this.heldOut.length) { this.heldOut.forEach(send); this.heldOut = []; this.splitOut.reset(); }

    return this._processFrame('out', frame, send);
  }

  // ------------------------------------------------------------------ incoming

  handleIncoming(ev) {
    const deliverOriginal = () => this._deliver(ev.data, ev);
    const data = ev.data;
    if (!FishNetConfig.decode || this.isFishNet !== true || this.decodeDisabled || !(data instanceof ArrayBuffer || ArrayBuffer.isView(data))) return deliverOriginal();

    const u8 = toU8(data);
    let frame;
    try {
      frame = parseFrame(u8, { direction: 'in', framing: this.framing, options: codecOptions(), state: this.state, track: true });
    } catch (e) {
      this.manager._error('incoming parse', e);
      return deliverOriginal();
    }
    const deliver = (bytes) => this._deliver(bytes === u8 ? data : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ev);

    if (frame.split) {
      this.heldIn.push(u8);
      const full = this.splitIn.add(frame);
      if (!full) return undefined;
      const held = this.heldIn;
      this.heldIn = [];
      const tick = this.splitIn.tick;
      this.splitIn.reset();
      return this._processMessage('in', full, tick, held, deliver);
    }
    if (this.heldIn.length) { this.heldIn.forEach(deliver); this.heldIn = []; this.splitIn.reset(); }

    return this._processFrame('in', frame, deliver);
  }

  // ------------------------------------------------------------------ common

  _processFrame(direction, frame, emit) {
    const m = this.manager;
    try {
      if (frame.keepAlive || frame.empty) {
        m._capture(frame, null, this);
        return emit(frame.bytes);
      }
      const ctx = new HookContext(this, direction, frame);
      m._runHooks(ctx);
      if (ctx.dropped) { this.state.stats.dropped++; m._capture(frame, 'dropped', this); return undefined; }
      // Only the server enforces the MTU; frames for the local client may be any size.
      const out = encodeFrame(frame, { options: codecOptions(), mtu: direction === 'out' ? FishNetConfig.mtu : 1 << 30 });
      if (frame.modified || out.length !== 1 || out[0] !== frame.bytes) this.state.stats.modified++;
      m._capture(frame, frame.modified ? 'modified' : null, this);
      let r;
      for (const b of out) r = emit(b);
      return r;
    } catch (e) {
      m._error(`${direction} hook`, e);
      return emit(frame.bytes);
    }
  }

  /** A reassembled split message (packets only, no tick/channel). */
  _processMessage(direction, full, tick, originals, emit) {
    const m = this.manager;
    try {
      const frame = {
        direction, framing: this.framing, size: full.length, bytes: full, channel: Channel.Reliable, tick,
        packets: [], modified: false, errors: [], reassembledFrom: originals.length,
      };
      const parsed = parseMessage(full, { direction, channel: Channel.Reliable, options: codecOptions(), state: this.state, onPacket: (p) => this.state.onPacket(p, frame) });
      frame.packets = parsed.packets;
      frame.errors = parsed.errors;
      const { packets } = frame;
      const ctx = new HookContext(this, direction, frame);
      m._runHooks(ctx);
      if (ctx.dropped) { this.state.stats.dropped++; m._capture(frame, 'dropped', this); return undefined; }
      const changed = frame.modified || packets.some((p) => p.dirty || p.drop);
      m._capture(frame, changed ? 'modified' : null, this);
      if (!changed) { let r; for (const b of originals) r = emit(b); return r; }
      this.state.stats.modified++;
      const live = packets.filter((p) => !p.drop);
      const frames = buildFrames(live, { tick, channel: Channel.Reliable, framing: this.framing, direction, options: codecOptions(), mtu: direction === 'out' ? FishNetConfig.mtu : 1 << 30 });
      let r;
      for (const b of frames) r = emit(b);
      return r;
    } catch (e) {
      m._error(`${direction} split hook`, e);
      let r;
      for (const b of originals) r = emit(b);
      return r;
    }
  }

  /** Hands a message to the game's own handlers. */
  _deliver(data, original) {
    let ev;
    try {
      ev = new MessageEvent('message', { data, origin: original ? original.origin : '', lastEventId: original ? original.lastEventId : '' });
      for (const k of ['target', 'currentTarget', 'srcElement']) Object.defineProperty(ev, k, { value: this.ws });
    } catch {
      ev = { type: 'message', data, target: this.ws, currentTarget: this.ws };
    }
    const call = (fn) => {
      try {
        if (typeof fn === 'function') fn.call(this.ws, ev);
        else if (fn && typeof fn.handleEvent === 'function') fn.handleEvent(ev);
      } catch (e) {
        setTimeout(() => { throw e; });
      }
    };
    if (this._onmessage) call(this._onmessage);
    for (const l of this._listeners.slice()) {
      call(l.fn);
      if (l.once) this._listeners = this._listeners.filter((x) => x !== l);
    }
  }

  // ------------------------------------------------------------------ API

  /** Sends packets to the server, bypassing hooks. */
  sendToServer(packets, { channel = Channel.Reliable, tick } = {}) {
    if (this.isFishNet !== true) throw new Error('Not connected to a FishNet server');
    const list = (Array.isArray(packets) ? packets : [packets]).map((p) => ({ direction: 'out', channel, ...p, dirty: p.dirty ?? true }));
    const frames = buildFrames(list, { tick: tick ?? this.state.lastClientTick, channel, framing: this.framing, direction: 'out', options: codecOptions(), mtu: FishNetConfig.mtu });
    frames.forEach((b) => this.natives.send.call(this.ws, b));
    this.state.stats.injected += list.length;
    this.manager._captureInjected('out', list, frames, this);
    return frames.length;
  }

  /** Delivers packets to the game client as if the server had sent them. */
  injectToClient(packets, { channel = Channel.Reliable, tick } = {}) {
    if (this.isFishNet !== true) throw new Error('Not connected to a FishNet server');
    const list = (Array.isArray(packets) ? packets : [packets]).map((p) => ({ direction: 'in', channel, ...p, dirty: p.dirty ?? true }));
    const frames = buildFrames(list, { tick: tick ?? this.state.lastServerTick, channel, framing: this.framing, direction: 'in', options: codecOptions(), mtu: 1 << 30 });
    frames.forEach((b) => this._deliver(b.buffer, null));
    this.state.stats.injected += list.length;
    this.manager._captureInjected('in', list, frames, this);
    return frames.length;
  }

  close(code, reason) { this.ws.close(code, reason); }
}

/**
 * Installs the WebSocket hook and owns the shared NetworkState.
 * Events: 'connected', 'disconnected', 'incoming', 'outgoing', 'packet', 'capture', 'error'.
 */
class Manager extends EventEmitter {
  constructor() {
    super();
    this.state = new NetworkState();
    this.sessions = new Set();
    this.active = null;
    this.capture = [];
    this.captureSeq = 0;
    this.capturePaused = false;
    this._sessionCounter = 0;
    this.installed = false;
  }

  overrideSocket() {
    if (this.installed) return;
    const Native = window.WebSocket;
    if (Native && Native.__meowFishNet) { this.installed = true; return; }
    const natives = {
      send: Native.prototype.send,
      add: Native.prototype.addEventListener,
      remove: Native.prototype.removeEventListener,
    };
    const manager = this;

    class MeowWebSocket extends Native {
      constructor(url, protocols) {
        if (protocols === undefined) super(url); else super(url, protocols);
        manager._attach(this, url, natives);
      }
    }
    Object.defineProperty(MeowWebSocket, 'name', { value: 'WebSocket' });
    MeowWebSocket.__meowFishNet = true;
    window.WebSocket = MeowWebSocket;
    this.installed = true;
    console.log('[FishNet] WebSocket hook installed');
  }

  _attach(ws, url, natives) {
    const session = new FishNetSession(this, ws, url, natives);
    this.sessions.add(session);

    ws.send = function send(data) { return session.handleOutgoing(data); };

    Object.defineProperty(ws, 'onmessage', {
      configurable: true,
      enumerable: true,
      get: () => session._onmessage,
      set: (fn) => { session._onmessage = typeof fn === 'function' || (fn && typeof fn === 'object') ? fn : null; },
    });
    ws.addEventListener = function addEventListener(type, fn, opts) {
      if (type === 'message') {
        if (fn && !session._listeners.some((l) => l.fn === fn)) session._listeners.push({ fn, once: !!(opts && typeof opts === 'object' && opts.once) });
        return undefined;
      }
      return natives.add.call(this, type, fn, opts);
    };
    ws.removeEventListener = function removeEventListener(type, fn, opts) {
      if (type === 'message') { session._listeners = session._listeners.filter((l) => l.fn !== fn); return undefined; }
      return natives.remove.call(this, type, fn, opts);
    };

    natives.add.call(ws, 'message', (ev) => session.handleIncoming(ev));
    natives.add.call(ws, 'close', (ev) => {
      this.sessions.delete(session);
      if (this.active === session) {
        this.state.connected = false;
        this.active = null;
        MeowEngine.Log.Instance?.info?.(`[FishNet] Disconnected (${ev.code}${ev.reason ? ' ' + ev.reason : ''})`);
        this.emit('disconnected', { session, code: ev.code, reason: ev.reason });
      }
    });
  }

  _runHooks(ctx) {
    const evt = ctx.direction === 'in' ? 'incoming' : 'outgoing';
    for (const p of ctx.packets.slice()) {
      this.emit('packet', { packet: p, ctx });
      this.emit(`packet:${p.name}`, { packet: p, ctx });
    }
    this.emit(evt, ctx);
    // Legacy emitters kept for existing patch code.
    (ctx.direction === 'in' ? OnMessage : SendMessage).emit('data', ctx);
    const dbg = ctx.direction === 'in' ? FishNetConfig.debugIncomingPackets : FishNetConfig.debugOutgoingPackets;
    if (dbg) console.log(`[FishNet] ${ctx.direction === 'in' ? '<-' : '->'} tick ${ctx.frame.tick}`, ctx.packets.map((p) => p.name).join(', '), ctx.frame);
  }

  _capture(frame, flag, session) {
    if (!FishNetConfig.capture || this.capturePaused) return;
    const t = Date.now();
    const push = (p) => {
      const e = { seq: ++this.captureSeq, t, direction: frame.direction, tick: frame.tick, channel: frame.channel, flag, packet: p, frameSize: frame.size, session: session.id };
      this.capture.push(e);
      this.emit('capture', e);
    };
    if (frame.keepAlive) push({ name: 'BayouKeepAlive', raw: frame.bytes, seconds: frame.keepAliveSeconds });
    else frame.packets.forEach(push);
    const over = this.capture.length - FishNetConfig.captureLimit;
    if (over > 0) this.capture.splice(0, over);
  }

  _captureInjected(direction, packets, frames, session) {
    this._capture({ direction, tick: direction === 'in' ? this.state.lastServerTick : this.state.lastClientTick, channel: packets[0]?.channel ?? 0, packets, size: frames.reduce((n, f) => n + f.length, 0) }, 'injected', session);
  }

  _error(where, e) {
    this.state.stats.errors++;
    console.warn(`[FishNet] ${where} failed, passing data through untouched:`, e);
    this.emit('error', { where, error: e });
  }

  clearCapture() { this.capture = []; }
}

export const FishNetSocketManager = new Manager();
export default FishNetSocketManager;
