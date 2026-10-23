import EventEmitter from "../../Browser/Utility/EventEmitter";

/**
 * Legacy-compatible emitter for OUTGOING (client -> server) FishNet traffic.
 * Emits 'data' with a HookContext: { frame, packets, state, modify(pkt), dropPacket(pkt), drop(), inject(pkt) }.
 * Prefer FishNetSocketManager.addListener('outgoing', fn) in new code.
 */
export const SendMessage = new EventEmitter();

export default SendMessage;
