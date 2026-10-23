import { DataType } from '../constants';
import { Serializable } from './Serializable';
import ProtocolWriter from '../ProtocolWriter';

export class CustomData extends Serializable {
  constructor() {
    super();
  }

  writeType(writer) {
    writer.writeUint8(DataType.Custom);
  }

  writeValue(writer) {
    writer.writeUint8(this.typeCode);
    const data = this.getBytes();
    writer.writeUint16(data.length);
    writer.write(data);
  }

  write(writer) {
    throw new Error('write must be implemented');
  }

  getBytes() {
    const writer = new ProtocolWriter();
    this.write(writer);
    return writer.toBytes();
  }

  toString() {
    return `CustomData ${this.typeCode} ${this.getBytes().toString('hex')}`;
  }
}

export default CustomData;