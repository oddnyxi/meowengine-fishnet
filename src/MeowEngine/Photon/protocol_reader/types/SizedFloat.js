import { DataType } from '../constants';
import { Serializable } from './Serializable';

export class SizedFloat extends Serializable {
  constructor(value, size) {
    super();
    this.value = value;
    this.size = size;
    this._checkSize();
  }

  static float(value) {
    return new SizedFloat(value, 4);
  }

  static double(value) {
    return new SizedFloat(value, 8);
  }

  static read(reader, size) {
    const value = size === 4 ? reader.readFloat32() : reader.readFloat64();
    return new SizedFloat(value, size);
  }

  writeType(writer) {
    switch (this.size) {
      case 4:
        writer.writeUint8(DataType.Float);
        break;
      case 8:
        writer.writeUint8(DataType.Double);
        break;
      default:
        throw new Error(`Invalid SizedFloat size ${this.size}`);
    }
  }

  writeValue(writer) {
    switch (this.size) {
      case 4:
        writer.writeFloat32(this.value);
        break;
      case 8:
        writer.writeFloat64(this.value);
        break;
      default:
        throw new Error(`Invalid SizedFloat size ${this.size}`);
    }
  }

  _checkSize() {
    if (this.value == null) {
      throw new Error('Null value not allowed');
    }
    if (this.size > 8) {
      throw new Error('Size is greater than 8');
    }
    if (this.size !== 4 && this.size !== 8) {
      throw new Error(`Size ${this.size} is not 4 or 8`);
    }
  }

  toString() {
    return `float${this.size * 8} ${this.value}`;
  }
}

export default SizedFloat;