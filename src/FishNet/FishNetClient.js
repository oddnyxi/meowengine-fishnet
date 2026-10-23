import { FishNetSocketManager, activeProfile } from './FishNetSocketManager.js';
import { Channel } from './Enums/Channel.js';
import { PacketId } from './Enums/PacketId.js';
import { Packets } from './Protocol/PacketCodec.js';
import { FishWriter } from './Protocol/FishWriter.js';
import { FishReader } from './Protocol/FishReader.js';
import { broadcastKey } from './Protocol/Hashing.js';
import { encodeTransformRpcArgs } from './Protocol/NetworkTransform.js';

/**
 * High-level API over the active FishNet connection.
 * Exposed as MeowEngine.FishNetClient.Instance.
 *
 * All "args" are the RPC's serialised parameters, in declaration order, using
 * FishNet's default serializers (see FishWriter). Hashes are the per-behaviour
 * RPC indices FishNet's code generator assigns; find them in the RPC explorer.
 */
export class FishNetClient {
  get manager() { return FishNetSocketManager; }
  get state() { return FishNetSocketManager.state; }
  get session() { return FishNetSocketManager.active; }
  get isConnected() { return !!(this.session && this.state.connected); }
  get connectionId() { return this.state.connectionId; }

  _need() {
    if (!this.session) throw new Error('No active FishNet connection');
    return this.session;
  }

  /** New writer for building RPC arguments / broadcast bodies. */
  writer() { const w = new FishWriter(); w.packedFormat = activeProfile().packedFormat; return w; }
  reader(bytes) { const r = new FishReader(bytes); r.packedFormat = activeProfile().packedFormat; return r; }

  /** Raw packets to the server. */
  send(packets, opts) { return this._need().sendToServer(packets, opts); }
  /** Raw packets to the local game client, as if from the server. */
  inject(packets, opts) { return this._need().injectToClient(packets, opts); }

  /**
   * Sends a broadcast. `type` is either the C# type FullName (hashed like
   * FishNet does) or the numeric 16-bit key.
   */
  broadcast(type, data, channel = Channel.Reliable) {
    const key = typeof type === 'number' ? type : broadcastKey(type);
    return this.send(Packets.broadcast(key, data instanceof FishWriter ? data.toBytes() : data), { channel });
  }

  serverRpc({ objectId, componentIndex = 0, hash, args = new Uint8Array(0), channel = Channel.Reliable }) {
    const a = args instanceof FishWriter ? args.toBytes() : args;
    return this.send(Packets.serverRpc({ objectId, componentIndex, hash, args: a }), { channel });
  }

  /** Sends a PingPong with the current client tick (the server echoes it back). */
  ping() { return this.send(Packets.pingPong(this.state.lastClientTick)); }

  /** Builds NetworkTransform RPC args from { position, rotation, scale }. */
  networkTransformArgs(fields, opts) { return encodeTransformRpcArgs(fields, opts); }

  // ------------------------------------------------------------- legacy shims
  // The Photon-era API had no direct FishNet equivalent; these log instead of
  // sending made-up data that the server would kick us for.

  OpRaiseEvent() {
    console.warn('[FishNet] OpRaiseEvent is a Photon API. Use FishNetClient.serverRpc(...) or .broadcast(...) instead.');
    return false;
  }

  TransferOwnership() {
    console.warn('[FishNet] Ownership is server authoritative in FishNet; there is no client request packet. Use the game RPC that asks for it.');
    return false;
  }

  setConnected() { /* state is tracked by NetworkState */ }
}

export const FishNetClientInstance = new FishNetClient();
export { Channel, PacketId };
export default FishNetClient;
