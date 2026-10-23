export class PacketType {
    static Init = 0;
    static InitResponse = 1;
    static Operation = 2;
    static OperationResponse = 3;
    static Event = 4;
    static InternalOperationRequest = 6;
    static InternalOperationResponse = 7;
    static Message = 8;
    static RawMessage = 9;
    static Disconnect = 5;
}

export default PacketType;