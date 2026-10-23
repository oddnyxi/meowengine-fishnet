import { PacketType } from '../constants';
import { Serializable } from './Serializable';
import { Buffer } from "../../../../Browser/Utility/Buffer";

export class PacketWithPayload extends Serializable {
  constructor(code, params = {}) {
    super();
    this.code = code;
    this.params = params;
  }

  toString() {
    return `${this.constructor.name} ${this.code}: ${JSON.stringify(this.params)}`;
  }
}

export class InitPacket extends PacketWithPayload {
  static protocolVersion = [1, 6];
  static clientVersion = [4, 1, 2, 16];
  static clientSdkId = 15;
  static clientSdkIdShifted = this.clientSdkId << 1;

  constructor(appID, { isIpv6 = false } = {}) {
    super();
    this.appID = Buffer.from(appID);
    this.isIpv6 = isIpv6;
  }

  writeType(writer) {
    writer.writeUint8(PacketType.Init);
  }

  writeValue(writer) {
    writer.writeUint8(InitPacket.protocolVersion[0]);
    writer.writeUint8(InitPacket.protocolVersion[1]);
    writer.writeUint8(InitPacket.clientSdkIdShifted);

    let versionBitField = (InitPacket.clientVersion[0] << 4) | InitPacket.clientVersion[1];
    versionBitField = this.isIpv6 ? (versionBitField | 0x80) : (versionBitField & 0x7F);

    writer.writeUint8(versionBitField);
    writer.writeUint8(InitPacket.clientVersion[2]);
    writer.writeUint8(InitPacket.clientVersion[3]);
    writer.writeUint8(0);

    const appIDBuffer = Buffer.alloc(32);
    this.appID.copy(appIDBuffer, 0, 0, Math.min(this.appID.length, 32));
    writer.write(appIDBuffer);
  }
}

export class InitResponse extends PacketWithPayload {
  constructor() {
    super(0);
  }

  static read(reader) {
    const code = reader.readInt8();
    if (code !== 0) {
      throw new Error(`Invalid InitResponse code: ${code}`);
    }
    return new InitResponse();
  }

  writeType(writer) {
    writer.writeUint8(PacketType.InitResponse);
  }

  writeValue(writer) {
    writer.writeUint8(this.code);
  }

  toString() {
    return 'InitResponse';
  }
}

export class OperationRequest extends PacketWithPayload {
  constructor(code, params) {
    super(code, params);
  }

  static read(reader) {
    const code = reader.readUint8();
    const params = reader.readParameterTable();
    return new OperationRequest(code, params);
  }

  writeType(writer) {
    writer.writeUint8(PacketType.Operation);
  }

  writeValue(writer) {
    writer.writeUint8(this.code);
    writer.writeParameterTable(this.params);
  }
}

export class OperationResponse extends PacketWithPayload {
  constructor(code, debugMessage, returnCode, params) {
    super(code, params);
    this.debugMessage = debugMessage;
    this.returnCode = returnCode;
  }

  static read(reader) {
    const code = reader.readUint8();
    const returnCode = reader.readInt16();
    const debugMessage = reader.readValue();
    const params = reader.readParameterTable();
    return new OperationResponse(code, debugMessage, returnCode, params);
  }

  writeType(writer) {
    writer.writeUint8(PacketType.OperationResponse);
  }

  writeValue(writer) {
    writer.writeUint8(this.code);
    writer.writeInt16(this.returnCode);
    writer.writeValue(this.debugMessage);
    writer.writeParameterTable(this.params);
  }

  toString() {
    return `OperationResponse ${this.code} (return=${this.returnCode}, msg=${this.debugMessage}): ${JSON.stringify(this.params)}`;
  }
}

export class Event extends PacketWithPayload {
  constructor(code, params) {
    super(code, params);
  }

  static read(reader) {
    const code = reader.readUint8();
    const params = reader.readParameterTable();
    return new Event(code, params);
  }

  writeType(writer) {
    writer.writeUint8(PacketType.Event);
  }

  writeValue(writer) {
    writer.writeUint8(this.code);
    writer.writeParameterTable(this.params);
  }
}

export class InternalOperationRequest extends PacketWithPayload {
  constructor(code, params) {
    super(code, params);
  }

  static read(reader) {
    const code = reader.readUint8();
    const params = reader.readParameterTable();
    return new InternalOperationRequest(code, params);
  }

  writeType(writer) {
    writer.writeUint8(PacketType.InternalOperationRequest);
  }

  writeValue(writer) {
    writer.writeUint8(this.code);
    writer.writeParameterTable(this.params);
  }
}

export class InternalOperationResponse extends PacketWithPayload {
  constructor(code, debugMessage, returnCode, params) {
    super(code, params);
    this.debugMessage = debugMessage;
    this.returnCode = returnCode;
  }

  static read(reader) {
    const code = reader.readUint8();
    const returnCode = reader.readInt16();
    const debugMessage = reader.readValue();
    const params = reader.readParameterTable();
    return new InternalOperationResponse(code, debugMessage, returnCode, params);
  }

  writeType(writer) {
    writer.writeUint8(PacketType.InternalOperationResponse);
  }

  writeValue(writer) {
    writer.writeUint8(this.code);
    writer.writeInt16(this.returnCode);
    writer.writeValue(this.debugMessage);
    writer.writeParameterTable(this.params);
  }

  toString() {
    return `InternalOperationResponse ${this.code} (return=${this.returnCode}, msg=${this.debugMessage}): ${JSON.stringify(this.params)}`;
  }
}

export default {
  PacketWithPayload,
  InitPacket, 
  InitResponse, 
  OperationRequest, 
  OperationResponse, 
  Event, 
  InternalOperationRequest, 
  InternalOperationResponse
};