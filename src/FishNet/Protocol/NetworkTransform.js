import { FishReader } from './FishReader.js';
import { FishWriter } from './FishWriter.js';
import { AutoPackType } from '../Enums/Spawning.js';

/**
 * FishNet's built-in NetworkTransform component (Generated/Component/NetworkTransform).
 *
 * Its RPCs (ObserversUpdateClientAuthoritativeTransform, TargetUpdateTransform,
 * ServerUpdateTransform, ...) all take (ArraySegment<byte> data, Channel channel).
 * The Channel parameter is not serialised, so the RPC arguments are just
 *     packed int32 size + data
 * and `data` is produced by NetworkTransform.SerializeChanged:
 *
 *   flagsA u8   X2|X4|Y2|Y4|Z2|Z4|Rotation|Extended
 *   pos x/y/z   int16 (value*100) when *2, float32 when *4
 *   rotation    quaternion using _packing.Rotation (default Packed = 4 bytes)
 *   if Extended:
 *     flagsB u8 X2|X4|Y2|Y4|Z2|Z4|Child|Teleport
 *     scale x/y/z (same encoding as position)
 *     if Child: NetworkBehaviour (parent)
 */
export const NTFlagA = Object.freeze({ X2: 1, X4: 2, Y2: 4, Y4: 8, Z2: 16, Z4: 32, Rotation: 64, Extended: 128 });
export const NTFlagB = Object.freeze({ X2: 1, X4: 2, Y2: 4, Y4: 8, Z2: 16, Z4: 32, Child: 64, Teleport: 128 });

function readAxis(r, flags, two, four) {
  if ((flags & two) === two) return r.readInt16() / 100;
  if ((flags & four) === four) return r.readSingle();
  return undefined;
}

/** Decodes the inner NetworkTransform data blob. Throws on malformed input. */
export function decodeTransformData(data, { rotationPacking = AutoPackType.Packed } = {}) {
  const r = data instanceof FishReader ? data : new FishReader(data);
  const out = { flagsA: r.readUInt8() };
  const a = out.flagsA;
  const pos = { x: readAxis(r, a, NTFlagA.X2, NTFlagA.X4), y: readAxis(r, a, NTFlagA.Y2, NTFlagA.Y4), z: readAxis(r, a, NTFlagA.Z2, NTFlagA.Z4) };
  if (pos.x !== undefined || pos.y !== undefined || pos.z !== undefined) out.position = pos;
  if ((a & NTFlagA.Rotation) === NTFlagA.Rotation) out.rotation = r.readQuaternion(rotationPacking);
  if ((a & NTFlagA.Extended) === NTFlagA.Extended) {
    const b = (out.flagsB = r.readUInt8());
    const sc = { x: readAxis(r, b, NTFlagB.X2, NTFlagB.X4), y: readAxis(r, b, NTFlagB.Y2, NTFlagB.Y4), z: readAxis(r, b, NTFlagB.Z2, NTFlagB.Z4) };
    if (sc.x !== undefined || sc.y !== undefined || sc.z !== undefined) out.scale = sc;
    out.teleport = (b & NTFlagB.Teleport) === NTFlagB.Teleport;
    if ((b & NTFlagB.Child) === NTFlagB.Child) out.parent = r.readNetworkBehaviour();
  }
  out.trailing = r.remaining;
  return out;
}

/**
 * Tries to interpret RPC args as a NetworkTransform update. Returns null unless
 * the bytes are exactly `size + data` and the data parses with no leftovers.
 */
export function tryDecodeTransformRpcArgs(args, opts) {
  try {
    const r = new FishReader(args);
    const size = r.readInt32();
    if (size <= 0 || size !== r.remaining) return null;
    const res = decodeTransformData(r.readBytes(size), opts);
    if (res.trailing !== 0) return null;
    if (!res.position && !res.rotation && !res.scale && res.flagsB === undefined) return null;
    return res;
  } catch {
    return null;
  }
}

/** Builds NetworkTransform data (the inverse of decodeTransformData). */
export function encodeTransformData({ position, rotation, scale, teleport = false, parent = null }, { positionPacking = AutoPackType.Packed, rotationPacking = AutoPackType.Packed, scalePacking = AutoPackType.Unpacked } = {}) {
  const w = new FishWriter(32);
  w.skip(1);
  let a = 0;
  const axis = (v, two, four, packing, setFlag) => {
    if (v === undefined || v === null) return;
    const c = Math.fround(Math.fround(v) * 100);
    if (packing !== AutoPackType.Unpacked && Math.abs(c) <= 32766) { setFlag(two); w.writeInt16(Math.trunc(c)); }
    else { setFlag(four); w.writeSingle(v); }
  };
  if (position) {
    axis(position.x, NTFlagA.X2, NTFlagA.X4, positionPacking, (f) => { a |= f; });
    axis(position.y, NTFlagA.Y2, NTFlagA.Y4, positionPacking, (f) => { a |= f; });
    axis(position.z, NTFlagA.Z2, NTFlagA.Z4, positionPacking, (f) => { a |= f; });
  }
  if (rotation) { a |= NTFlagA.Rotation; w.writeQuaternion(rotation, rotationPacking); }
  if (scale || teleport || parent) {
    a |= NTFlagA.Extended;
    const bPos = w.position;
    w.skip(1);
    let b = teleport ? NTFlagB.Teleport : 0;
    if (scale) {
      axis(scale.x, NTFlagB.X2, NTFlagB.X4, scalePacking, (f) => { b |= f; });
      axis(scale.y, NTFlagB.Y2, NTFlagB.Y4, scalePacking, (f) => { b |= f; });
      axis(scale.z, NTFlagB.Z2, NTFlagB.Z4, scalePacking, (f) => { b |= f; });
    }
    if (parent) { b |= NTFlagB.Child; w.writeNetworkBehaviour(parent); }
    w.insertUInt8(b, bPos);
  }
  w.insertUInt8(a, 0);
  return w.toBytes();
}

/** Wraps transform data as RPC args (ArraySegment<byte> = packed size + bytes). */
export function encodeTransformRpcArgs(fields, opts) {
  return new FishWriter(40).writeBytesAndSize(encodeTransformData(fields, opts)).toBytes();
}
