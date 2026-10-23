import { UNSET_OBJECTID_VALUE, UNSET_COLLECTION_SIZE_VALUE, AutoPackType } from '../Enums/Spawning.js';
import { Quaternion32, Quaternion64 } from './Quaternion.js';

const utf8 = new TextEncoder();

/**
 * JavaScript port of FishNet.Serializing.Writer (FishNet 4.x).
 * See FishReader for the wire rules. Every method returns `this` for chaining.
 */
export class FishWriter {
  constructor(capacity = 64) {
    this.buffer = new Uint8Array(capacity);
    this.view = new DataView(this.buffer.buffer);
    this.position = 0;
    this.length = 0;
    /** 'leb128' (FishNet >= 4.6.9) or 'legacy' (4.4.3 - 4.6.8); differs only for values >= 2^32. */
    this.packedFormat = 'leb128';
  }

  _ensure(n) {
    if (this.position + n <= this.buffer.length) return;
    const next = new Uint8Array(Math.max(this.buffer.length * 2 + n, 64));
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
    this.view = new DataView(next.buffer);
  }

  _advance(n) {
    this.position += n;
    if (this.position > this.length) this.length = this.position;
  }

  /** Bytes written so far (a copy). */
  toBytes() { return this.buffer.slice(0, this.length); }
  /** Bytes written so far (a view, no copy). */
  subarray() { return this.buffer.subarray(0, this.length); }
  clear() { this.position = 0; this.length = 0; return this; }

  skip(n) { this._ensure(n); this.buffer.fill(0, this.position, this.position + n); this._advance(n); return this; }

  // ---------------------------------------------------------------- unpacked

  writeUInt8(v) { this._ensure(1); this.buffer[this.position] = v & 0xff; this._advance(1); return this; }
  writeInt8(v) { return this.writeUInt8(v); }
  writeBoolean(v) { return this.writeUInt8(v ? 1 : 0); }

  writeUInt16Unpacked(v) { this._ensure(2); this.view.setUint16(this.position, v & 0xffff, true); this._advance(2); return this; }
  writeInt16Unpacked(v) { this._ensure(2); this.view.setInt16(this.position, v, true); this._advance(2); return this; }
  writeUInt16(v) { return this.writeUInt16Unpacked(v); }
  writeInt16(v) { return this.writeInt16Unpacked(v); }
  writeChar(c) { return this.writeUInt16Unpacked(typeof c === 'string' ? c.charCodeAt(0) : c); }

  writeUInt32Unpacked(v) { this._ensure(4); this.view.setUint32(this.position, v >>> 0, true); this._advance(4); return this; }
  writeInt32Unpacked(v) { this._ensure(4); this.view.setInt32(this.position, v | 0, true); this._advance(4); return this; }
  writeUInt64Unpacked(v) { this._ensure(8); this.view.setBigUint64(this.position, BigInt.asUintN(64, BigInt(v)), true); this._advance(8); return this; }
  writeInt64Unpacked(v) { this._ensure(8); this.view.setBigInt64(this.position, BigInt.asIntN(64, BigInt(v)), true); this._advance(8); return this; }

  writeSingle(v) { this._ensure(4); this.view.setFloat32(this.position, v, true); this._advance(4); return this; }
  writeDouble(v) { this._ensure(8); this.view.setFloat64(this.position, v, true); this._advance(8); return this; }

  writeTick(v) { return this.writeUInt32Unpacked(v); }
  writePacketId(id) { return this.writeUInt16Unpacked(id); }

  /** Overwrite bytes at an absolute index without moving position (Writer.Insert*). */
  insertUInt8(v, index) { this.buffer[index] = v & 0xff; return this; }
  insertUInt16(v, index) { this.view.setUint16(index, v & 0xffff, true); return this; }
  insertUInt32(v, index) { this.view.setUint32(index, v >>> 0, true); return this; }

  // ------------------------------------------------------------------ packed

  /** Writer.WriteUnsignedPackedWhole (LEB128). Accepts Number or BigInt. */
  writeUnsignedPacked(value) {
    this._ensure(10);
    if (this.packedFormat === 'legacy' && (typeof value === 'bigint' ? value >= 2n ** 32n || value < 0n : value >= 2 ** 32 || value < 0)) {
      return this._writeLegacyPackedLarge(BigInt.asUintN(64, BigInt(value)));
    }
    if (typeof value === 'bigint' || value > Number.MAX_SAFE_INTEGER) {
      let v = BigInt.asUintN(64, BigInt(value));
      while (v > 127n) {
        this.buffer[this.position] = Number((v & 0x7fn) | 0x80n);
        this._advance(1);
        v >>= 7n;
      }
      this.buffer[this.position] = Number(v);
      this._advance(1);
      return this;
    }
    if (value < 0) return this.writeUnsignedPacked(BigInt.asUintN(64, BigInt(value)));
    let v = value;
    while (v > 127) {
      this.buffer[this.position] = (v % 128) | 0x80;
      this._advance(1);
      v = Math.floor(v / 128);
    }
    this.buffer[this.position] = v;
    this._advance(1);
    return this;
  }

  /** Pre-4.6.9 Writer.WriteUnsignedPackedWhole for values >= 2^32. */
  _writeLegacyPackedLarge(v) {
    for (let i = 0; i < 4; i++) {
      this.buffer[this.position] = Number((v >> BigInt(7 * i)) & 0x7fn) | 0x80;
      this._advance(1);
    }
    const extra = v < 2n ** 40n ? 1 : v < 2n ** 48n ? 2 : v < 2n ** 56n ? 3 : 4;
    this.buffer[this.position] = (extra << 4) | Number((v >> 28n) & 0x0fn);
    this._advance(1);
    for (let i = 0; i < extra; i++) {
      this.buffer[this.position] = Number((v >> BigInt(32 + 8 * i)) & 0xffn);
      this._advance(1);
    }
    return this;
  }

  /** Writer.WriteSignedPackedWhole: ZigZag then LEB128. */
  writeSignedPacked(value) {
    if (typeof value === 'bigint' || Math.abs(value) > Number.MAX_SAFE_INTEGER / 2) {
      const v = BigInt.asIntN(64, BigInt(value));
      return this.writeUnsignedPacked(BigInt.asUintN(64, (v << 1n) ^ (v >> 63n)));
    }
    return this.writeUnsignedPacked(value >= 0 ? value * 2 : -value * 2 - 1);
  }

  writeInt32(v) { return this.writeSignedPacked(typeof v === 'bigint' ? Number(BigInt.asIntN(32, v)) : v | 0); }
  writeUInt32(v) { return this.writeUnsignedPacked(typeof v === 'bigint' ? Number(BigInt.asUintN(32, v)) : v >>> 0); }
  writeInt64(v) { return this.writeSignedPacked(v); }
  writeUInt64(v) { return this.writeUnsignedPacked(v); }

  // ---------------------------------------------------------------- composite

  writeBytes(bytes) {
    const u8 = toU8(bytes);
    this._ensure(u8.length);
    this.buffer.set(u8, this.position);
    this._advance(u8.length);
    return this;
  }

  /** WriteUInt8ArrayAndSize / ArraySegmentAndSize. null writes -1. */
  writeBytesAndSize(bytes) {
    if (bytes == null) return this.writeInt32(UNSET_COLLECTION_SIZE_VALUE);
    const u8 = toU8(bytes);
    this.writeInt32(u8.length);
    return this.writeBytes(u8);
  }

  writeString(s) {
    if (s == null) return this.writeInt32(UNSET_COLLECTION_SIZE_VALUE);
    const b = utf8.encode(String(s));
    this.writeInt32(b.length);
    if (b.length) this.writeBytes(b);
    return this;
  }

  writeVector2(v) { return this.writeSingle(v.x).writeSingle(v.y); }
  writeVector3(v) { return this.writeSingle(v.x).writeSingle(v.y).writeSingle(v.z); }
  writeVector4(v) { return this.writeSingle(v.x).writeSingle(v.y).writeSingle(v.z).writeSingle(v.w); }
  writeVector2Int(v) { return this.writeInt32(v.x).writeInt32(v.y); }
  writeVector3Int(v) { return this.writeInt32(v.x).writeInt32(v.y).writeInt32(v.z); }
  writeColor(c) {
    // (byte)(value * 100f)
    for (const k of ['r', 'g', 'b', 'a']) this.writeUInt8(Math.trunc(Math.fround(Math.fround(c[k]) * 100)) & 0xff);
    return this;
  }
  writeColor32(c) { return this.writeUInt8(c.r).writeUInt8(c.g).writeUInt8(c.b).writeUInt8(c.a); }
  writeQuaternionUnpacked(q) { return this.writeSingle(q.x).writeSingle(q.y).writeSingle(q.z).writeSingle(q.w); }
  writeQuaternion32(q) { return this.writeUInt32Unpacked(Quaternion32.compress(q)); }
  writeQuaternion64(q) { return this.writeUInt64Unpacked(Quaternion64.compress(q)); }
  writeQuaternion(q, packing = AutoPackType.Packed) {
    if (packing === AutoPackType.Packed) return this.writeQuaternion32(q);
    if (packing === AutoPackType.PackedLess) return this.writeQuaternion64(q);
    return this.writeQuaternionUnpacked(q);
  }

  writeNetworkObjectId(id) { return this.writeInt32(id); }
  writeNetworkConnectionId(id) { return this.writeInt32(id); }

  /** { objectId, isSpawned } or null. */
  writeNetworkObject(nob) {
    if (!nob || nob.isNull || nob.objectId === UNSET_OBJECTID_VALUE) return this.writeNetworkObjectId(UNSET_OBJECTID_VALUE);
    this.writeNetworkObjectId(nob.objectId);
    return this.writeBoolean(nob.isSpawned !== false);
  }

  /** { objectId, isSpawned, componentIndex } or null. */
  writeNetworkBehaviour(nb) {
    if (!nb || nb.isNull || nb.objectId === UNSET_OBJECTID_VALUE) {
      this.writeNetworkObject(null);
      return this.writeUInt8(0);
    }
    this.writeNetworkObject(nb);
    return this.writeUInt8(nb.componentIndex ?? 0);
  }

  writeTransformProperties(t) {
    return this.writeVector3(t.position).writeQuaternion32(t.rotation).writeVector3(t.scale);
  }

  writeList(items, writeItem) {
    if (items == null) return this.writeInt32(UNSET_COLLECTION_SIZE_VALUE);
    this.writeInt32(items.length);
    items.forEach((it) => writeItem(this, it));
    return this;
  }
}

export function toU8(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (Array.isArray(bytes)) return Uint8Array.from(bytes);
  throw new TypeError('Expected bytes');
}

export default FishWriter;
