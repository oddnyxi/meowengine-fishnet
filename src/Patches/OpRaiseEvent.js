import ProtocolReader from "../MeowEngine/Photon/protocol_reader/ProtocolReader";
import { OpRaiseEvent } from "../Photon/Handlers/OpRaiseEventHandler";

class OpRaiseEventHandler {
    static handleEvent(socket, originalSend, args) {
        const message = args[0];

        if (message instanceof ArrayBuffer) {
            const uint8Array = new Uint8Array(message);
            let reader = new ProtocolReader(uint8Array.buffer);
            const packet = reader.readPacket();

            OpRaiseEvent.emit("data", {
                args,
                data: packet,
                socket,
                originalSend
            });
        }
    }
}

export default OpRaiseEventHandler;
