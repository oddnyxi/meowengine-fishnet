# FishNet 4.x wire protocol (as used over Bayou / WebGL)

Reverse-engineered from the FishNet sources (`Runtime/Serializing`, `Runtime/Managing`,
`Runtime/Object`, `Runtime/Transporting`) and the Bayou WebGL transport, then checked
release by release from 4.3.7 to 4.7.4. Everything below is implemented in
`src/FishNet/Protocol/` and covered by `tests/`.

All multi-byte values are **little-endian**.

## 1. Transport frame (one WebSocket message)

```
+-----------+----------------------------+---------+
| tick u32  | packet | packet | ...        | channel |
+-----------+----------------------------+---------+
  PacketBundle tick     FishNet packets      Bayou: 1 trailing byte (0 = Reliable, 1 = Unreliable)
```

* `tick` is the sender's `TimeManager.LocalTick` (client) or server tick, written by `ByteBuffer.CopySegment`.
* The channel byte is appended by Bayou's `CommonSocket.AddChannel` and stripped by `RemoveChannel`,
  even though WebSockets are always reliable. The channel still matters: it decides whether
  RPCs carry a length prefix (see 4).
* Segments of 4 bytes or less (after removing the channel) are ignored by FishNet.
* Bayou's jslib also sends a raw keep-alive every 10 s: `0E` + `u32 unix seconds` (5 bytes, no channel byte).
* MTU: Bayou defaults to 1023. FishNet keeps `tick + packets <= MTU - 2`; the server kicks clients
  that send more.

## 2. Primitive encodings (`Writer.cs` / `Reader.cs`)

| Type | Encoding |
| --- | --- |
| `byte`, `sbyte`, `bool` | 1 byte |
| `short`, `ushort`, `char` | **unpacked** 2 bytes (the default writer for 16-bit values is unpacked) |
| `int`, `long` | ZigZag, then varint |
| `uint`, `ulong` | varint |
| `float`, `double` | IEEE754 |
| `string` | `int` byte length (`-1` = null) + UTF-8 |
| `byte[]`, `ArraySegment<byte>` | `int` length (`-1` = null) + bytes |
| `List<T>`, `T[]`, `HashSet<T>`, `Dictionary` | `int` count (`-1` = null) + items |
| `Vector2/3/4`, `Quaternion` unpacked | floats |
| `Quaternion` (default) | 32-bit smallest-three: `[2b largest][10b][10b][10b]` (`Quaternion32Compression`) |
| `Quaternion` PackedLess | 64-bit smallest-three: `[2b][21b][21b][20b]` |
| `Color` | 4 bytes (`component * 100`) |
| `NetworkObject` | objectId `int`; if not 65535: `bool isSpawned` (false = it is a PrefabId) |
| `NetworkBehaviour` | `NetworkObject` + `byte componentIndex` (always written) |
| `NetworkConnection` | clientId `int` (`-1` = none) |

Varint: plain LEB128 since **4.6.9**. From 4.4.3 to 4.6.8 the first four bytes are LEB128
but the fifth byte holds 4 value bits plus the number of extra bytes in its high nibble;
the two only differ for values >= 2^32 (64-bit integers).

## 3. Packet ids (`PacketId.cs`, uint16)

| Id | Name | Direction | Body |
| --- | --- | --- | --- |
| 1 | Authenticated | S->C | `int clientId`, then if predicted spawning: count (`int`, `byte` before 4.6.9) + object ids |
| 2 | Split | both | `int pieceCount` + chunk. Always the only packet in its frame, always reliable |
| 3 | ObjectSpawn | S->C (C->S predicted, prefixed by `u16 length`) | see 5 |
| 4 | ObjectDespawn | S->C: `int objectId`, `byte DespawnType`. C->S: `NetworkObject` |
| 5 | PredictedSpawnResult | S->C | `bool`, `int usedId`, `int nextId` (+ RpcLinks before 4.5.6) |
| 7 | SyncType | S->C | `NetworkBehaviour`, `u32 length`, data = repeated `[byte syncIndex][value...]` |
| 8 | ServerRpc | C->S | RPC header (4) |
| 9 | ObserversRpc | S->C | RPC header |
| 10 | TargetRpc | S->C | RPC header |
| 11 | OwnershipChange | S->C | `NetworkObject`, `int newOwner` |
| 12 | Broadcast | both | `u16 key`, `int length`, data. `key = FNV1(typeof(T).FullName)` folded to 16 bits |
| 14 | PingPong | both | `u32 tick` (server echoes the client tick) |
| 15 | Replicate | C->S | RPC header (prediction input) |
| 16 | Reconcile | S->C | RPC header, length always present |
| 17 | Disconnect | S->C | nothing; the rest of the frame is ignored |
| 18 | TimingUpdate | S->C | `u32 tick` |
| 20 | StateUpdate | S->C | `u32 clientTick`, `i32 unpacked length`, nested packets |
| 21 | Version | C->S: `string` FishNet version (first packet sent). S->C: `bool isDevelopmentBuild` |
| >= 22 | RpcLink | S->C | `[int length if reliable]` + args (see 4) |

## 4. RPCs

```
packetId u16 | NetworkBehaviour | [int length] | hash (byte, or u16 when a behaviour has > 255 RPCs) | args
```

* `length` = `hash size + args`. It is present on the **reliable** channel only
  (always for Broadcast, SyncType and Reconcile). On unreliable the RPC runs to the end of the frame
  as far as a generic parser can tell.
* `hash` is the RPC's index inside its NetworkBehaviour type (assigned by the code generator), so it
  is only meaningful together with the object's prefab and the component index.
* `args` are the method parameters in order with the default serializers. A trailing `Channel`
  parameter, and a TargetRpc's leading `NetworkConnection`, are not serialized.
* **RpcLinks**: on spawn the server assigns short packet ids (>= 22) to an object's Observers/Target/
  Reconcile RPCs. A linked RPC is just `u16 linkId`, `[int length]`, args.

## 5. ObjectSpawn

```
byte SpawnType            Nested=1 Scene=2 Instantiated=4 InstantiatedGlobal=8 IsPredictedSpawner=16 SceneRoot=32
if Nested: byte componentIndex, NetworkBehaviour parent
int objectId
u16 collectionId
initializeOrder           int (sbyte before 4.6.6)
int ownerId
byte TransformPropertiesFlag  Position=1 Rotation=2 Scale=4
  [Vector3 localPosition] [Quaternion localRotation (ServerManager.SpawnPacking, default 64-bit)] [Vector3 localScale]
Scene:  u64 sceneId (+ 2 strings on dev servers with WriteSceneObjectDetails)
Else:   int prefabId
u32 payloadLength + payload
u16 rpcLinksLength + per behaviour: byte componentIndex, u16 count,
                                    count x (u16 linkId, u16 hash, u16 PacketId   [byte RpcType flag before 4.6.3])
u32 syncTypesLength + per behaviour: byte componentIndex, byte count, count x (byte syncIndex, value)
```

## 6. NetworkTransform

FishNet's NetworkTransform sends `ArraySegment<byte>` through its RPCs, so the args are
`int size` + data:

```
byte flagsA   X2 X4 Y2 Y4 Z2 Z4 Rotation Extended
position      per axis: short (value*100) when *2, float when *4
rotation      quaternion with NetworkTransform packing (default 32-bit)
if Extended:  byte flagsB  X2 X4 Y2 Y4 Z2 Z4 Child Teleport
              scale axes as above, [NetworkBehaviour parent]
```

## 7. Version differences handled

| Version | Change |
| --- | --- |
| < 4.4.3 | different spawn / SyncType / RpcLink layout and older varint: not decoded (pass-through) |
| < 4.5.6 | PredictedSpawnResult carries RpcLinks |
| < 4.6.3 | RpcLink kind is a 1-byte RpcType flag |
| < 4.6.6 | spawn initializeOrder is an unpacked sbyte |
| < 4.6.9 | Authenticated predicted-id count is a byte; legacy 64-bit varint |

The version comes from the client's first packet (`Version`) and selects the right profile
automatically (`src/FishNet/Protocol/Versions.js`).

## 8. What a generic parser cannot know

Game-specific data — RPC arguments, SyncType values, spawn payloads and broadcast bodies — is
produced by the game's generated serializers. The SDK exposes it as bytes (`args`, `data`,
`payload`, `syncTypes`) together with stable identifiers (prefab, component index, hash, broadcast
key) so it can be named in the RPC Explorer and decoded with `FishReader`.
