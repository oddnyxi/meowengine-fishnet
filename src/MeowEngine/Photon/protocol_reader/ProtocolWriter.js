import { DataType } from './constants';
import { Buffer } from "../../../Browser/Utility/Buffer";


export class ProtocolWriter {
  constructor() {
    this.buffers = [];
    this.length = 0;
  }

  writePacket(packet) {
    this.writeUint8(0xF3);
    this.writeValue(packet);
  }

  writeValue(value, writeType = true) {
    if (value === null || value === undefined) {
      if (writeType) {
        this.writeUint8(DataType.NullValue);
      }
      return;
    }
    
    // Add handling for number type
    if (typeof value === 'number') {
      // Check if it's an integer
      if (Number.isInteger(value)) {
        if (writeType) {
          this.writeUint8(DataType.Integer);
        }
        this.writeInt32(value);
      } else {
        // Handle floating point numbers
        if (writeType) {
          this.writeUint8(DataType.Double);
        }
        this.writeFloat64(value);
      }
    }
    
    if (value instanceof Array && value.every(item => typeof item === 'string')) {
      if (writeType) {
        this.writeUint8(DataType.StringArray);
      }
      this.writeStringArray(value);
    } else if (value.writeType && value.writeValue) { // Serializable
      if (writeType) {
        value.writeType(this);
      }
      value.writeValue(this);
    } else if (value instanceof Object && !(value instanceof Array)) {
      if (writeType) {
        this.writeUint8(DataType.Hashtable);
      }
      const entries = Object.entries(value);
      this.writeUint16(entries.length);
      for (const [key, val] of entries) {
        this.writeValue(key);
        this.writeValue(val);
      }
    } else if (value instanceof Int32Array) {
      if (writeType) {
        this.writeUint8(DataType.IntegerArray);
      }
      this.writeInt32(value.length);
      for (const num of value) {
        this.writeInt32(num);
      }
    } else if (typeof value === 'boolean') {
      if (writeType) {
        this.writeUint8(DataType.Bool);
      }
      this.writeUint8(value ? 1 : 0);
    } else if (typeof value === 'string') {
      if (writeType) {
        this.writeUint8(DataType.String);
      }
      this.writeString(value);
    } else if (value instanceof Buffer) {
      if (writeType) {
        this.writeUint8(DataType.ByteArray);
      }
      this.writeInt32(value.length);
      this.write(value);
    } else if (value instanceof Array) {
      if (writeType) {
        this.writeUint8(DataType.ObjectArray);
      }
      this.writeInt16(value.length);
      for (const item of value) {
        this.writeValue(item);
      }
    } else {
      throw new Error(`Cannot serialize '${value}' (type: ${typeof value})`);
    }
  }

  writeStringArray(strings) {
    this.writeInt16(strings.length);
    for (const str of strings) {
      this.writeString(str);
    }
  }

  writeString(str) {
    const bytes = Buffer.from(str, 'utf8');
    this.writeUint16(bytes.length);
    this.write(bytes);
  }

  writeParameterTable(params) {
    const entries = Object.entries(params);
    this.writeUint16(entries.length);
    for (const [key, value] of entries) {
      this.writeUint8(Number(key));
      this.writeValue(value);
    }
  }

  writeUint8(value) {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(value);
    this.buffers.push(buf);
    this.length += 1;
  }

  writeInt8(value) {
    const buf = Buffer.alloc(1);
    buf.writeInt8(value);
    this.buffers.push(buf);
    this.length += 1;
  }

  writeUint16(value) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(value);
    this.buffers.push(buf);
    this.length += 2;
  }

  writeInt16(value) {
    const buf = Buffer.alloc(2);
    buf.writeInt16BE(value);
    this.buffers.push(buf);
    this.length += 2;
  }

  writeInt32(value) {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(value);
    this.buffers.push(buf);
    this.length += 4;
  }

  writeInt64(value) {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(value));
    this.buffers.push(buf);
    this.length += 8;
  }

  writeFloat32(value) {
    const buf = Buffer.alloc(4);
    buf.writeFloatBE(value);
    this.buffers.push(buf);
    this.length += 4;
  }

  writeFloat64(value) {
    const buf = Buffer.alloc(8);
    buf.writeDoubleBE(value);
    this.buffers.push(buf);
    this.length += 8;
  }

  write(bytes) {
    this.buffers.push(Buffer.from(bytes));
    this.length += bytes.length;
  }

  toBytes() {
    return Buffer.concat(this.buffers, this.length);
  }
}

export default ProtocolWriter;