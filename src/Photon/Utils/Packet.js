import { Serializer } from "./Serializer";
import { Deserializer } from "./Deserializer";

export class PhotonPacket {
    constructor(buffer) {
        this.parser = new Deserializer(buffer);
        this.magic = this.parser.readUint8();
        switch (this.magic) {
            case 0xf3:
                this.type = this.parser.readUint8();
                this.encrypted = this.type & (0x80 > 0);
                this.type &= 0x7f;
                switch (this.type) {
                    case 2:
                    case 3:
                    case 4:
                        this.relay = false;
                        this.#parsePacketInfo(this.type);
                        break;
                    default:
                        // we don't care about these packets, don't bother parsing or serializing them
                        this.relay = true;
                        break;
                }
                break;
            case 0xf0:
                this.server_time = this.parser.readUint32();
                this.client_time = this.parser.readUint32();
                break;
            default:
                throw 'Buffer does not contain a Photon packet';
        }
        if (this.parser.offset !== this.parser.view.byteLength - 1 && !this.relay)
            console.warn('Photon packet was not read to end...', this);
    }
    static fromBase64(str) {
        return new PhotonPacket(
            Uint8Array.from(
                atob(str)
                .split('')
                .map(x => x.charCodeAt(0))
            ).buffer
        );
    }
    #parsePacketInfo(type) {
        switch (type) {
            case 2:
                this.op_code = this.parser.readUint8();
                if (type === 2) break;
                // fall-through if 3
            case 3:
                this.return_code = this.parser.readUint16();
                this.debug_message = this.parser.parsePhotonType();
                break;
            case 4:
                this.event_id = this.parser.readUint8();
                break;
        }
        this.sections = this.#parseSections();
    }
    #parseSections() {
        let len = this.parser.readUint16();
        let sections = [];
        for (let index = 0; index < len; index++) {
            sections.push([this.parser.readUint8(), this.parser.parsePhotonType()]);
        }
        return sections;
    }
    serialize() {
        if (this.relay) {
            console.warn("Tried to serialize a packet we don't support, ignored");
            return this.parser.view.buffer;
        }
        let serializer = new Serializer(this);
        return serializer.serialize();
    }
    verify() {
        let input_b64 = btoa(
            String.fromCharCode(...new Uint8Array(this.parser.view.buffer))
        );
        let serialized_b64 = btoa(
            String.fromCharCode(...new Uint8Array(this.serialize()))
        );
        return input_b64 === serialized_b64;
    }
}

export default PhotonPacket;