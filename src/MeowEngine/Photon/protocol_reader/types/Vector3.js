import { CustomData } from './CustomData';

export class Vector3 extends CustomData {
  static TypeCode = 86;

  constructor(f1, f2, f3) {
    super();
    this.f1 = f1;
    this.f2 = f2;
    this.f3 = f3;
  }

  get typeCode() {
    return Vector3.TypeCode;
  }

  static read(reader) {
    const f1 = reader.readFloat32();
    const f2 = reader.readFloat32();
    const f3 = reader.readFloat32();
    return new Vector3(f1, f2, f3);
  }

  write(writer) {
    writer.writeFloat32(this.f1);
    writer.writeFloat32(this.f2);
    writer.writeFloat32(this.f3);
  }

  toString() {
    return `Vector3(${this.f1},${this.f2},${this.f3})`;
  }
}

export default Vector3;