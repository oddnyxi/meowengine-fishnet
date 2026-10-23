import { UNSET_OBJECTID_VALUE, UNSET_COLLECTION_SIZE_VALUE, AutoPackType } from '../Enums/Spawning.js';
import { Quaternion32, Quaternion64 } from './Quaternion.js';

export class FishReadError extends Error {
  constructor(message, position) {
    super(message);
    this.name = 'FishReadError';
    this.position = position;
  }
}

const utf8 = new TextDecoder('utf-8');

/**
 * JavaScript port of FishNet.Serializing.Reader (FishNet 4.x).
 *
 * Wire rules (from Writer.cs / Reader.cs):
 *  - Everything is little-endian.
 *  - "Unpacked" integers are fixed width.
 *  - Int32/Int64/UInt32/UInt64 default writers are *packed*: unsigned LEB128 varint,
 *    signed values are ZigZag-encoded first.
 *  - Int16/UInt16 default writers are UNPACKED (2 bytes).
 *  - float/double are raw IEEE754.
 *  - strings: packed int32 byte length (-1 = null) + UTF-8 bytes.
 */
export class FishReader {
  /**
   * @param {Uint8Array|ArrayBuffer|ArrayBufferView} data
   * @param {number} [offset] start offset inside data
   * @param {number} [length] number of readable bytes
   */
  constructor(data, offset = 0, length) {
    let u8;
    if (data instanceof Uint8Array) u8 = data;
    else if (data instanceof ArrayBuffer) u8 = new Uint8Array(data);
    else if (ArrayBuffer.isView(data)) u8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    else throw new TypeError('FishReader expects bytes');
    this.buffer = u8;
    this.offset = offset;
    this.position = offset;
    this.end = length == null ? u8.length : offset + length;
    this.view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    /**
     * 'leb128' (FishNet >= 4.6.9) or 'legacy' (4.4.3 - 4.6.8). They only differ
     * for values >= 2^32, i.e. 64-bit integers.
     */
    this.packedFormat = 'leb128';
  }

  get remaining() { return this.end - this.position; }
  get length() { return this.end - this.offset; }

  _need(n) {
    if (this.position + n > this.end) {
      throw new FishReadError(`Read of ${n} byte(s) at ${this.position} exceeds end ${this.end}`, this.position);
    }
  }

  skip(n) { this._need(n); this.position += n; }

  // ---------------------------------------------------------------- unpacked

  readUInt8() { this._need(1); return this.buffer[this.position++]; }
  readInt8() { const v = this.readUInt8(); return v > 127 ? v - 256 : v; }
  readBoolean() { return this.readUInt8() !== 0; }

  readUInt16Unpacked() { this._need(2); const v = this.view.getUint16(this.position, true); this.position += 2; return v; }
  readInt16Unpacked() { this._need(2); const v = this.view.getInt16(this.position, true); this.position += 2; return v; }
  /** Default UInt16/Int16 readers are unpacked in FishNet 4. */
  readUInt16() { return this.readUInt16Unpacked(); }
  readInt16() { return this.readInt16Unpacked(); }
  readChar() { return String.fromCharCode(this.readUInt16Unpacked()); }

  readUInt32Unpacked() { this._need(4); const v = this.view.getUint32(this.position, true); this.position += 4; return v; }
  readInt32Unpacked() { this._need(4); const v = this.view.getInt32(this.position, true); this.position += 4; return v; }
  readUInt64Unpacked() { this._need(8); const v = this.view.getBigUint64(this.position, true); this.position += 8; return v; }
  readInt64Unpacked() { this._need(8); const v = this.view.getBigInt64(this.position, true); this.position += 8; return v; }

  readSingle() { this._need(4); const v = this.view.getFloat32(this.position, true); this.position += 4; return v; }
  readDouble() { this._need(8); const v = this.view.getFloat64(this.position, true); this.position += 8; return v; }

  /** Unpacked uint32 tick. */
  readTick() { return this.readUInt32Unpacked(); }
  readPacketId() { return this.readUInt16Unpacked(); }
  peekPacketId() { const p = this.position; const v = this.readUInt16Unpacked(); this.position = p; return v; }

  // ------------------------------------------------------------------ packed

  /**
   * Reader.ReadUnsignedPackedWhole: LEB128, max 10 bytes.
   * Returns a Number when it is a safe integer, otherwise a BigInt.
   */
  readUnsignedPacked() {
    if (this.packedFormat === 'legacy') return this._readLegacyPacked();
    let result = 0;
    let shift = 0;
    let big = null;
    for (let i = 0; i < 10; i++) {
      const b = this.readUInt8();
      const part = b & 0x7f;
      if (big === null && shift < 49) {
        result += part * 2 ** shift;
      } else {
        if (big === null) big = BigInt(result);
        big |= BigInt(part) << BigInt(shift);
      }
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    if (big !== null) {
      big = BigInt.asUintN(64, big);
      return big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big;
    }
    return result;
  }

  /** Pre-4.6.9 Reader.ReadUnsignedPackedWhole: 4 LEB128 bytes, then a nibble + byte-count tag. */
  _readLegacyPacked() {
    let result = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.readUInt8();
      result += (b & 0x7f) * 2 ** (7 * i);
      if ((b & 0x80) === 0) return result;
    }
    const b5 = this.readUInt8();
    let big = BigInt(result) | (BigInt(b5 & 0x0f) << 28n);
    const extra = b5 >> 4;
    for (let i = 0; i < extra && i < 4; i++) big |= BigInt(this.readUInt8()) << BigInt(32 + 8 * i);
    return big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big;
  }

  /** Reader.ReadSignedPackedWhole: ZigZag decode of the unsigned varint. */
  readSignedPacked() {
    const u = this.readUnsignedPacked();
    if (typeof u === 'bigint') {
      const v = (u >> 1n) ^ -(u & 1n);
      return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
    }
    // (u >>> 1) ^ -(u & 1) without 32-bit truncation
    return u % 2 === 0 ? u / 2 : -(u + 1) / 2;
  }

  /** Default Int32 reader: (int)ReadSignedPackedWhole(). */
  readInt32() { return toInt32(this.readSignedPacked()); }
  /** Default UInt32 reader: (uint)ReadUnsignedPackedWhole(). */
  readUInt32() { const v = this.readUnsignedPacked(); return Number(BigInt.asUintN(32, BigInt(v))); }
  /** Default Int64 reader (BigInt when outside the safe range). */
  readInt64() { return this.readSignedPacked(); }
  readUInt64() { return this.readUnsignedPacked(); }

  // ---------------------------------------------------------------- composite

  readBytes(count) {
    if (count < 0) throw new FishReadError(`Negative byte count ${count}`, this.position);
    this._need(count);
    const out = this.buffer.subarray(this.position, this.position + count);
    this.position += count;
    return out;
  }

  /** WriteUInt8ArrayAndSize / ArraySegmentAndSize: packed int32 size (-1 = null) + bytes. */
  readBytesAndSize() {
    const size = this.readInt32();
    if (size === UNSET_COLLECTION_SIZE_VALUE) return null;
    return this.readBytes(size);
  }

  readString() {
    const size = this.readInt32();
    if (size === UNSET_COLLECTION_SIZE_VALUE) return null;
    if (size === 0) return '';
    return utf8.decode(this.readBytes(size));
  }

  readVector2() { return { x: this.readSingle(), y: this.readSingle() }; }
  readVector3() { return { x: this.readSingle(), y: this.readSingle(), z: this.readSingle() }; }
  readVector4() { return { x: this.readSingle(), y: this.readSingle(), z: this.readSingle(), w: this.readSingle() }; }
  readVector2Int() { return { x: this.readInt32(), y: this.readInt32() }; }
  readVector3Int() { return { x: this.readInt32(), y: this.readInt32(), z: this.readInt32() }; }
  readColor() { return { r: this.readUInt8() / 100, g: this.readUInt8() / 100, b: this.readUInt8() / 100, a: this.readUInt8() / 100 }; }
  readColor32() { return { r: this.readUInt8(), g: this.readUInt8(), b: this.readUInt8(), a: this.readUInt8() }; }
  readQuaternionUnpacked() { return { x: this.readSingle(), y: this.readSingle(), z: this.readSingle(), w: this.readSingle() }; }
  readQuaternion32() { return Quaternion32.decompress(this.readUInt32Unpacked()); }
  readQuaternion64() { return Quaternion64.decompress(this.readUInt64Unpacked()); }
  /** Default Quaternion reader is Quaternion32. */
  readQuaternion(packing = AutoPackType.Packed) {
    if (packing === AutoPackType.Packed) return this.readQuaternion32();
    if (packing === AutoPackType.PackedLess) return this.readQuaternion64();
    return this.readQuaternionUnpacked();
  }

  readGuid() {
    const b = this.readBytes(16);
    const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
    // .NET Guid byte order: first three groups little-endian.
    const g1 = h.slice(0, 4).reverse().join('');
    const g2 = h.slice(4, 6).reverse().join('');
    const g3 = h.slice(6, 8).reverse().join('');
    return `${g1}-${g2}-${g3}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
  }

  /** NetworkObject id is a packed signed int. */
  readNetworkObjectId() { return this.readInt32(); }
  readNetworkConnectionId() { return this.readInt32(); }

  /**
   * Writer.WriteNetworkObject: objectId (packed) then, when not UNSET, a bool "isSpawned"
   * (false means the id is a PrefabId).
   */
  readNetworkObject() {
    const id = this.readNetworkObjectId();
    if (id === UNSET_OBJECTID_VALUE) return { objectId: id, isNull: true };
    const isSpawned = this.readBoolean();
    return { objectId: id, isSpawned, isNull: false };
  }

  /** Writer.WriteNetworkBehaviour: NetworkObject + componentIndex byte (always written). */
  readNetworkBehaviour() {
    const nob = this.readNetworkObject();
    const componentIndex = this.readUInt8();
    return { ...nob, componentIndex };
  }

  /** Writer.WriteGameObject: 0 = null, 1 = NetworkObject, 2 = NetworkBehaviour. */
  readGameObject() {
    const kind = this.readUInt8();
    if (kind === 1) return { kind: 'NetworkObject', ...this.readNetworkObject() };
    if (kind === 2) return { kind: 'NetworkBehaviour', ...this.readNetworkBehaviour() };
    return null;
  }

  readTransformProperties() {
    return { position: this.readVector3(), rotation: this.readQuaternion32(), scale: this.readVector3() };
  }

  /** Generic collection: packed int32 count (-1 = null) followed by count items. */
  readList(readItem) {
    const count = this.readInt32();
    if (count === UNSET_COLLECTION_SIZE_VALUE) return null;
    const out = [];
    for (let i = 0; i < count; i++) out.push(readItem(this));
    return out;
  }

  /** Copy of the remaining bytes (does not advance). */
  peekRemaining() { return this.buffer.subarray(this.position, this.end); }
  readRemaining() { return this.readBytes(this.remaining); }
}

export function toInt32(v) {
  if (typeof v === 'bigint') return Number(BigInt.asIntN(32, v));
  return v | 0;
}

export default FishReader;
