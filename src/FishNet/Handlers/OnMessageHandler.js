import EventEmitter from "../../Browser/Utility/EventEmitter";

/**
 * Legacy-compatible emitter for INCOMING (server -> client) FishNet traffic.
 * Emits 'data' with a HookContext: { frame, packets, state, modify(pkt), dropPacket(pkt), drop(), inject(pkt) }.
 * Prefer FishNetSocketManager.addListener('incoming', fn) in new code.
 */
export const OnMessage = new EventEmitter();

export default OnMessage;
