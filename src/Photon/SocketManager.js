import MeowEngine from "../Browser/GlobalTypeDefs";
import ProtocolReader from "../MeowEngine/Photon/protocol_reader/ProtocolReader";
import OnEventHandler from "../Patches/OnEvent";
import OpRaiseEventHandler from "../Patches/OpRaiseEvent";
import OperationCode from "./Enums/OperationCode";
import OpCode201 from "./Handlers/OpCode201";
import PlayerList from "./Handlers/PlayerList";
import { PhotonClient } from "./PhotonClient";

export class SocketManager {
    static packetCount = 0;
    static firstPacket = true;

    static overrideSocket() {
        const originalSend = WebSocket.prototype.send;
        const OriginalWebSocket = WebSocket;

        window.WebSocket = function(url, protocols) {
            const socket = new OriginalWebSocket(url, protocols);

            var photonClient = new PhotonClient({ originalSend, socket });
            MeowEngine.PhotonClient.Instance = photonClient;
            MeowEngine.Networking.Instantiate = photonClient.Instantiate;
            MeowEngine.Networking.TransferOwnership = photonClient.TransferOwnership;
            MeowEngine.LoadBalancingClient.OpRaiseEvent = photonClient.OpRaiseEvent;
            MeowEngine.PhotonClient.gameSocket = socket;

            socket.send = function(...args) {
                OpRaiseEventHandler.handleEvent(socket, originalSend, args);
            };
            
            socket.addEventListener('message', e => {
                OnEventHandler.handleEvent(e);
            });
            
            return socket;
        };
    }
}

export default SocketManager;