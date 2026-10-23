import { DataType } from '../constants';
import Serializable from './Serializable';

export class ProtocolArray extends Serializable {
  constructor(innerDataType, data) {
    super();
    this.innerDataType = innerDataType;
    this.data = data;
  }

  static read(reader) {
    const len = reader.readUint16();
    const innerDataType = reader.readUint8();
    const data = new Array(len);
    for (let i = 0; i < len; i++) {
      data[i] = reader.readValue(innerDataType);
    }
    return new ProtocolArray(innerDataType, data);
  }

  writeType(writer) {
    writer.writeUint8(DataType.Array);
  }

  writeValue(writer) {
    writer.writeUint16(this.data.length);
    writer.writeUint8(this.innerDataType);
    for (const obj of this.data) {
      writer.writeValue(obj, false);
    }
  }

  toString() {
    return `ProtocolArray ${this.innerDataType}: ${JSON.stringify(this.data)}`;
  }
}

export default ProtocolArray;