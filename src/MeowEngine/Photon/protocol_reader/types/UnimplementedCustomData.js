import { CustomData } from './CustomData.js';

export class UnimplementedCustomData extends CustomData {
  constructor(typeCode, data) {
    super();
    this._typeCode = typeCode;
    this.data = data;
  }

  get typeCode() {
    return this._typeCode;
  }

  write(writer) {
    writer.write(this.data);
  }
}

export default UnimplementedCustomData;