import OnEvent from "../Photon/Handlers/OnEventHandler";

class OnEventHandler {
    static handleEvent(event) {
        OnEvent.emit("data", event);
    }
}

export default OnEventHandler;
