import { Vector3 } from './Vector3';
import { Quaternion } from './Quaternion';
import { UnimplementedCustomData } from './UnimplementedCustomData';
import * as ProtocolReaderModule from '../ProtocolReader';

export class CustomDataReader {
  static read(reader) {
    const typeCode = reader.readUint8();
    const len = reader.readUint16();
    const data = reader.read(len);
    const tempReader = new (ProtocolReaderModule.default || ProtocolReaderModule.ProtocolReader)(data);

    switch (typeCode) {
      case 86: // Vector3.TypeCode
        return Vector3.read(tempReader);
      case 81: // Quaternion.TypeCode
        return Quaternion.read(tempReader);
      default:
        return new UnimplementedCustomData(typeCode, data);
    }
  }
}

export default CustomDataReader;