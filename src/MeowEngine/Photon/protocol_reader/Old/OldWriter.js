export class Writer {
    constructor(packet) {
        this.packet = packet;
        this.buffer = [];
    }

    /* Helpers */

    pushBytes(bytes) {
        this.buffer.push(...bytes);
    }

    /* Primitives */
    // this code uses lots of performance hacks

    #primView = new DataView(new ArrayBuffer(8));
    writeUint8(value) {
        this.pushBytes([value]);
    }
    writeUint16(value) {
        this.#primView.setUint16(0, value, false);
        this.pushBytes(new Uint8Array(this.#primView.buffer.slice(0, 2)));
    }
    writeUint32(value) {
        this.#primView.setUint32(0, value, false);
        this.pushBytes(new Uint8Array(this.#primView.buffer.slice(0, 4)));
    }
    writeUint64(value) {
        this.#primView.setBigUint64(0, value, false);
        this.pushBytes(new Uint8Array(this.#primView.buffer.slice(0, 8)));
    }
    writeFloat(value) {
        this.#primView.setFloat32(0, value, false);
        this.pushBytes(new Uint8Array(this.#primView.buffer.slice(0, 4)));
    }
    writeDouble(value) {
        this.#primView.setFloat64(0, value, false);
        this.pushBytes(new Uint8Array(this.#primView.buffer.slice(0, 8)));
    }

    /* Photon Types */

    // 0x44 (Dictionary)
    serializeDictionary(value) {
        this.writeUint8(value.keyType);
        this.writeUint8(value.valType);
        this.writeUint16(value.map.size);
        let writeKey = value.keyType === 0 || value.keyType === 0x2a;
        let writeVal = value.valType === 0 || value.valType === 0x2a;
        for (const [key, val] of value.map.entries()) {
            this.serializePhotonType(key, writeKey);
            this.serializePhotonType(val, writeVal);
        }
    }

    // 0x61 (StringArray)
    serializeStringArray(value) {
        this.writeUint16(value.length);
        for (const str of value) {
            this.serializeString(str);
        }
    }

    // 0x62 (Byte)
    serializeByte(value) {
        this.writeUint8(value);
    }

    // 0x63 (CustomData)
    serializeCustomData(value) {
        this.writeUint8(value.variant.charCodeAt(0));
        switch (value.variant) {
            case 'W':
                return this.serializeVec2(value.data);
            case 'V':
                return this.serializeVec3(value.data);
            case 'Q':
                return this.serializeQuat(value.data);
            case 'P':
                return this.serializePhotonPlayer(value.data);
            default:
                return this.serializeUnknownCustom(value.data);
        }
    }

    // 0x63 (CustomData), "W" (Vec2)
    serializeVec2(value) {
        this.writeUint16(8);
        this.writeFloat(value.x);
        this.writeFloat(value.y);
    }

    // 0x63 (CustomData), "V" (Vec3)
    serializeVec3(value) {
        this.writeUint16(12);
        this.writeFloat(value.x);
        this.writeFloat(value.y);
        this.writeFloat(value.z);
    }

    // 0x63 (CustomData), "Q" (Quat)
    serializeQuat(value) {
        this.writeUint16(16);
        this.writeFloat(value.w);
        this.writeFloat(value.x);
        this.writeFloat(value.y);
        this.writeFloat(value.z);
    }

    // 0x63 (CustomData), "P" (PhotonPlayer)
    serializePhotonPlayer(value) {
        this.writeUint16(4);
        this.writeUint32(value.player_id);
    }

    // 0x63 (CustomData), unknown
    serializeUnknownCustom(value) {
        this.writeUint16(value.data.length);
        this.pushBytes(...value.data);
    }

    // 0x64 (Double)
    serializeDouble(value) {
        this.writeDouble(value);
    }

    // 0x65 (EventData)

    // 0x66 (Float)
    serializeFloat(value) {
        this.writeFloat(value);
    }

    // 0x68 (HashTable)
    serializeHashTable(value) {
        this.writeUint16(value.size);
        for (const [key, val] of value.entries()) {
            this.serializePhotonType(key);
            this.serializePhotonType(val);
        }
    }

    // 0x69 (Integer)
    serializeInteger(value) {
        this.writeUint32(value);
    }

    // 0x6B (Short)
    serializeShort(value) {
        this.writeUint16(value);
    }

    // 0x6C (Long)
    serializeLong(value) {
        this.writeUint64(value);
    }

    // 0x6E (IntArray)
    serializeIntArray(value) {
        this.writeUint32(value.length);
        for (const entry of value) {
            this.writeUint32(entry);
        }
    }

    // 0x6F (Boolean)
    serializeBool(value) {
        this.writeUint8(value ? 1 : 0);
    }

    // 0x70 (OpResponse)

    // 0x71 (OpRequest)

    // 0x73 (String)
    serializeString(value) {
        let encoder = new TextEncoder();
        let bytes = encoder.encode(value);
        this.writeUint16(bytes.length);
        this.pushBytes(bytes);
    }

    // 0x78 (ByteArray)
    serializeByteArray(value) {
        this.writeUint32(value.length);
        this.pushBytes(value);
    }

    // 0x79 (Array)
    serializeArray(value) {
        this.writeUint16(value.arr.length);
        this.writeUint8(value.type);
        for (const entry of value.arr) {
            this.serializePhotonType(entry, false);
        }
    }

    // 0x7A (ObjectArray)
    serializeObjectArray(value) {
        this.writeUint16(value.length);
        for (const entry of value) {
            this.serializePhotonType(entry);
        }
    }

    /* Logic */

    serializePhotonType(object, writeType = true) {
        if (writeType) this.writeUint8(object.type);
        switch (object.type) {
            case 0x2a:
                break;
            case 0x44:
                this.serializeDictionary(object.data);
                break;
            case 0x61:
                this.serializeStringArray(object.data);
                break;
            case 0x62:
                this.serializeByte(object.data);
                break;
            case 0x63:
                this.serializeCustomData(object.data);
                break;
            case 0x64:
                this.serializeDouble(object.data);
                break;
            case 0x66:
                this.serializeFloat(object.data);
                break;
            case 0x68:
                this.serializeHashTable(object.data);
                break;
            case 0x69:
                this.serializeInteger(object.data);
                break;
            case 0x6b:
                this.serializeShort(object.data);
                break;
            case 0x6c:
                this.serializeLong(object.data);
                break;
            case 0x6e:
                this.serializeIntArray(object.data);
                break;
            case 0x6f:
                this.serializeBool(object.data);
                break;
            case 0x73:
                this.serializeString(object.data);
                break;
            case 0x78:
                this.serializeByteArray(object.data);
                break;
            case 0x79:
                this.serializeArray(object.data);
                break;
            case 0x7a:
                this.serializeObjectArray(object.data);
                break;
        }
    }
    serialize() {
        this.writeUint8(this.packet.magic);
        switch (this.packet.magic) {
            case 0xf3: {
                this.writeUint8(this.packet.type);
                switch (this.packet.type) {
                    case 2:
                        this.writeUint8(this.packet.op_code);
                        if (this.packet.type === 2) break;
                        // fall-through if 3
                    case 3:
                        this.writeUint16(this.packet.return_code);
                        this.serializePhotonType(this.packet.debug_message);
                        break;
                    case 4:
                        this.writeUint8(this.packet.event_id);
                        break;
                }
                this.writeUint16(Object.keys(this.packet.sections).length);
                for (const section of this.packet.sections) {
                    this.writeUint8(section[0]);
                    this.serializePhotonType(section[1]);
                }
                break;
            }
            case 0xf0:
                this.writeUint32(this.packet.server_time);
                this.writeUint32(this.packet.client_time);
                break;
            default:
                throw "I don't know how to serialize this";
        }
        return new Uint8Array(this.buffer).buffer;
    }
}

export default Writer;