import { DataType } from '../constants';
import { Serializable } from './Serializable';

export class SizedInt extends Serializable {
  constructor(value, size) {
    super();
    this.value = value;
    this.size = size;
    this._checkSize();
  }

  static byte(value) {
    return new SizedInt(value, 1);
  }

  static short(value) {
    return new SizedInt(value, 2);
  }

  static int(value) {
    return new SizedInt(value, 4);
  }

  static long(value) {
    return new SizedInt(value, 8);
  }

  static read(reader, size) {
    let value;
    switch (size) {
      case 1:
        value = reader.readUint8();
        break;
      case 2:
        value = reader.readInt16();
        break;
      case 4:
        value = reader.readInt32();
        break;
      case 8:
        value = reader.readInt64();
        break;
    }
    return new SizedInt(value, size);
  }

  writeType(writer) {
    switch (this.size) {
      case 1:
        writer.writeUint8(DataType.Byte);
        break;
      case 2:
        writer.writeUint8(DataType.Short);
        break;
      case 4:
        writer.writeUint8(DataType.Integer);
        break;
      case 8:
        writer.writeUint8(DataType.Long);
        break;
      default:
        throw new Error(`Invalid SizedInt size ${this.size}`);
    }
  }

  writeValue(writer) {
    switch (this.size) {
      case 1:
        writer.writeUint8(this.value);
        break;
      case 2:
        writer.writeInt16(this.value);
        break;
      case 4:
        writer.writeInt32(this.value);
        break;
      case 8:
        writer.writeInt64(this.value);
        break;
      default:
        throw new Error(`Invalid SizedInt size ${this.size}`);
    }
  }

  _checkSize() {
    if (this.value == null) {
      throw new Error('Null value not allowed');
    }
    if (this.size > 8) {
      throw new Error('Size is greater than 8');
    }
    if (![1, 2, 4, 8].includes(this.size)) {
      throw new Error(`Size ${this.size} is not a power of 2`);
    }
    if (this.size === 1 && (this.value > 0xFF || this.value < 0)) {
      throw new Error(`Value ${this.value} is out of range for a byte`);
    }
    if (this.size === 2 && (this.value > 0x7FFF || this.value < -0x8000)) {
      throw new Error(`Value ${this.value} is out of range for a short`);
    }
    if (this.size === 4 && (this.value > 0x7FFFFFFF || this.value < -0x80000000)) {
      throw new Error(`Value ${this.value} is out of range for an int`);
    }
  }

  toString() {
    return `int${this.size * 8} ${this.value}`;
  }
}

export default SizedInt;