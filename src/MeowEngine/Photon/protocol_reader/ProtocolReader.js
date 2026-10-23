import { DataType, PacketType } from './constants';
import { ProtocolArray } from './types/Array';
import { SizedFloat } from './types/SizedFloat';
import { SizedInt } from './types/SizedInt';
import {
  InitResponse,
  OperationRequest,
  OperationResponse,
  Event,
  InternalOperationRequest,
  InternalOperationResponse,
  PacketWithPayload
} from './types/packets';

import { Buffer } from "../../../Browser/Utility/Buffer";
import CustomDataReader from './types/CustomDataReader';

export class ProtocolReader {
  constructor(buffer) {
    this.buffer = Buffer.from(buffer);
    this.offset = 0;
  }

  readValue(type = null) {
    type = type ?? this.readUint8();

    switch (type) {
      case DataType.NullValue:
        return null;
      case DataType.Dictionary:
        throw new Error('Unimplemented data type Dictionary');
      case DataType.StringArray:
        return this.readStringArray();
      case DataType.Byte:
        return SizedInt.read(this, 1);
      case DataType.Custom:
        return CustomDataReader.read(this);
      case DataType.Double:
        return SizedFloat.read(this, 8);
      case DataType.EventData:
        throw new Error('Unimplemented data type EventData');
      case DataType.Float:
        return SizedFloat.read(this, 4);
      case DataType.Hashtable:
        return this.readHashTable();
      case DataType.Integer:
        return SizedInt.read(this, 4);
      case DataType.Short:
        return SizedInt.read(this, 2);
      case DataType.Long:
        return SizedInt.read(this, 8);
      case DataType.IntegerArray:
        return this.readIntArray();
      case DataType.Bool:
        return this.readUint8() !== 0;
      case DataType.OperationResponse:
        throw new Error('Unimplemented data type OperationResponse');
      case DataType.OperationRequest:
        throw new Error('Unimplemented data type OperationRequest');
      case DataType.String:
        return this.readString();
      case DataType.ByteArray:
        return this.readByteArray();
      case DataType.Array:
        return ProtocolArray.read(this);
      case DataType.ObjectArray:
        return this.readObjectArray();
      default:
        throw new Error(`Unknown data type ${type}`);
    }
  }

  readPacket() {
    const magic = this.readUint8();
    if (magic !== 0xF3) {
      throw new Error(`Invalid magic byte: ${magic}`);
    }

    const type = this.readUint8();

    switch (type) {
      case PacketType.Init:
        throw new Error('Init packet parsing not implemented');
      case PacketType.InitResponse:
        return InitResponse.read(this);
      case PacketType.Operation:
        return OperationRequest.read(this);
      case PacketType.OperationResponse:
        return OperationResponse.read(this);
      case PacketType.Event:
        return Event.read(this);
      case PacketType.InternalOperationRequest:
        return InternalOperationRequest.read(this);
      case PacketType.InternalOperationResponse:
        return InternalOperationResponse.read(this);
        case PacketType.Disconnect: // Not sure why but this works for ignoring disconnect messages
        console.log('Received Disconnect packet');
        return { type: 'Disconnect' };
        case PacketType.InitResponse: // 7 (no code?) not sure why
        return new InitResponse();
      case PacketType.Message:
      case PacketType.RawMessage:
        throw new Error(`Unimplemented packet type ${type}`);
      default:
        throw new Error(`Unknown packet type ${type}`);
    }
  }

  readString() {
    const len = this.readUint16();
    if (len === 0) return '';
    const str = this.buffer.toString('utf8', this.offset, this.offset + len);
    this.offset += len;
    return str;
  }

  readByteArray() {
    const len = this.readInt32();
    const data = this.buffer.slice(this.offset, this.offset + len);
    this.offset += len;
    return data;
  }

  readIntArray() {
    const len = this.readInt32();
    const list = new Int32Array(len);
    for (let i = 0; i < len; i++) {
      list[i] = this.readInt32();
    }
    return list;
  }

  readStringArray() {
    const len = this.readInt16();
    const list = new Array(len);
    for (let i = 0; i < len; i++) {
      list[i] = this.readString();
    }
    return list;
  }

  readObjectArray() {
    const len = this.readUint16();
    const list = new Array(len);
    for (let i = 0; i < len; i++) {
      list[i] = this.readValue();
    }
    return list;
  }

  readHashTable() {
    const value = {};
    const len = this.readInt16();
    for (let i = 0; i < len; i++) {
      const key = this.readValue();
      const val = this.readValue();
      value[key] = val;
    }
    return value;
  }

  readParameterTable() {
    const value = {};
    const len = this.readInt16();
    for (let i = 0; i < len; i++) {
      const key = this.readUint8();
      const val = this.readValue();
      value[key] = val;
    }
    return value;
  }

  readUint8() {
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readInt8() {
    const value = this.buffer.readInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint16() {
    const value = this.buffer.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  readInt16() {
    const value = this.buffer.readInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  readInt32() {
    const value = this.buffer.readInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  readInt64() {
    const value = this.buffer.readBigInt64BE(this.offset);
    this.offset += 8;
    return Number(value);
  }

  readFloat32() {
    const value = this.buffer.readFloatBE(this.offset);
    this.offset += 4;
    return value;
  }

  readFloat64() {
    const value = this.buffer.readDoubleBE(this.offset);
    this.offset += 8;
    return value;
  }

  read(length) {
    const data = this.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return data;
  }
}

export default ProtocolReader;