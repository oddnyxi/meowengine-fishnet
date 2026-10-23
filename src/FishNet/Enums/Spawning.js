/** Managing/Object/ObjectSpawnType.cs — [Flags] byte. */
export const SpawnType = Object.freeze({
  Unset: 0,
  Nested: 1,
  Scene: 2,
  Instantiated: 4,
  InstantiatedGlobal: 8,
  IsPredictedSpawner: 16,
  SceneRoot: 32,
});

export const spawnTypeNames = (st) =>
  Object.entries(SpawnType)
    .filter(([, v]) => v && (st & v) === v)
    .map(([k]) => k);

/** Object/NetworkObject/NetworkObjectData.cs */
export const DespawnType = Object.freeze({ Destroy: 0, Pool: 1 });

/** Object/TransformPropertiesFlag.cs (written as a single byte in spawn messages). */
export const TransformPropertiesFlag = Object.freeze({
  Unset: 0,
  Position: 1,
  Rotation: 2,
  Scale: 4,
});

/** Serializing/AutoPackType.cs */
export const AutoPackType = Object.freeze({ Unpacked: 0, Packed: 1, PackedLess: 2 });

/** NetworkObject.UNSET_OBJECTID_VALUE */
export const UNSET_OBJECTID_VALUE = 65535;
/** NetworkConnection.UNSET_CLIENTID_VALUE */
export const UNSET_CLIENTID_VALUE = -1;
/** NetworkBehaviour.UNSET_NETWORKBEHAVIOUR_ID */
export const UNSET_NETWORKBEHAVIOUR_ID = 255;
/** Writer.UNSET_COLLECTION_SIZE_VALUE */
export const UNSET_COLLECTION_SIZE_VALUE = -1;

/** Reserved length sizes (NetworkBehaviour.*_RESERVE_BYTES / ManagedObjects.PREDICTED_SPAWN_BYTES). */
export const RESERVE = Object.freeze({
  SYNCTYPE: 4,
  PAYLOAD: 4,
  RPCLINK: 2,
  PREDICTED_SPAWN: 2,
});
