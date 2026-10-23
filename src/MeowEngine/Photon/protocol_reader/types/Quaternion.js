import { CustomData } from './CustomData';

export class Quaternion extends CustomData {
  static TypeCode = 81;

  constructor(w, x, y, z) {
    super();
    this.w = w;
    this.x = x;
    this.y = y;
    this.z = z;
  }

  get typeCode() {
    return Quaternion.TypeCode;
  }

  static read(reader) {
    const w = reader.readFloat32();
    const x = reader.readFloat32();
    const y = reader.readFloat32();
    const z = reader.readFloat32();
    return new Quaternion(w, x, y, z);
  }

  write(writer) {
    writer.writeFloat32(this.w);
    writer.writeFloat32(this.x);
    writer.writeFloat32(this.y);
    writer.writeFloat32(this.z);
  }

  toString() {
    return `Quaternion(w=${this.w}, x=${this.x}, y=${this.y}, z=${this.z})`;
  }
}

export default Quaternion;