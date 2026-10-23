/**
 * FishNet PacketId (FishNet 4.x, Runtime/Transporting/PacketId.cs).
 * Written on the wire as an unpacked little-endian uint16.
 */
export const PacketId = Object.freeze({
  Unset: 0,
  Authenticated: 1,
  Split: 2,
  ObjectSpawn: 3,
  ObjectDespawn: 4,
  PredictedSpawnResult: 5,
  SyncType: 7,
  ServerRpc: 8,
  ObserversRpc: 9,
  TargetRpc: 10,
  OwnershipChange: 11,
  Broadcast: 12,
  /** Statistics only, never transmitted. */
  BulkSpawnOrDespawn: 13,
  PingPong: 14,
  Replicate: 15,
  Reconcile: 16,
  Disconnect: 17,
  TimingUpdate: 18,
  UNUSED2: 19,
  StateUpdate: 20,
  Version: 21,
});

/**
 * NetworkManager.StartingRpcLinkIndex = highest PacketId + 1.
 * Every packet id >= this value is an RpcLink (a server-assigned short id
 * that replaces the ObjectId/ComponentIndex/hash header of an Observers/Target RPC).
 */
export const STARTING_RPC_LINK_INDEX = 22;

const NAMES = Object.fromEntries(Object.entries(PacketId).map(([k, v]) => [v, k]));

export function packetIdName(id) {
  if (id >= STARTING_RPC_LINK_INDEX) return 'RpcLink';
  return NAMES[id] || `Unknown(${id})`;
}

export default PacketId;
