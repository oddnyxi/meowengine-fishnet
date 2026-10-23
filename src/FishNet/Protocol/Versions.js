/**
 * Wire-format differences between FishNet 4.x releases, found by diffing the
 * FishNet sources release by release. The client sends its FishNet version in
 * the very first packet (PacketId.Version, 4.3.0+), so the right profile is
 * picked automatically.
 *
 *  < 4.3.7  integers used the older "PackedWhole" scheme (and UInt16 was packed);
 *           4.3.6 also ZigZag-encoded UInt32.
 *  < MIN_SUPPORTED  spawn messages, SyncType lengths and RpcLinks had a different
 *           layout (4.3.7/4.3.8). Not supported: traffic is passed through untouched.
 *  < 4.6.3  spawn RpcLinks store the linked RPC kind as a 1-byte RpcType flag
 *           (Server=1, Observers=2, Target=4, Replicate=8, Reconcile=16) instead
 *           of a 2-byte PacketId.
 *  < 4.6.6  spawn initialize order is an unpacked sbyte instead of a packed int32.
 *  < 4.6.9  Authenticated's predicted object id count is a byte instead of a packed int32,
 *           and packed integers >= 2^32 (64-bit values) used a nibble + byte-count tag
 *           after the 4th byte instead of plain LEB128 (identical below 2^32).
 *  < PREDICTED_RESULT_LINKS_REMOVED  a successful PredictedSpawnResult is followed by
 *           RpcLinks (uint16 length + data).
 */
export const PREDICTED_RESULT_LINKS_REMOVED = '4.5.6';
/** Oldest FishNet version whose wire format this codec matches (4.4.3 and 4.4.7 sources compared). */
export const MIN_SUPPORTED = '4.4.3';

export function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
  return m ? [+m[1], +m[2], +m[3]] : null;
}

export function compareVersions(a, b) {
  const x = typeof a === 'string' ? parseVersion(a) : a;
  const y = typeof b === 'string' ? parseVersion(b) : b;
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

const lt = (v, ref) => compareVersions(v, ref) < 0;

/** Codec options for a FishNet version string (null/unknown -> latest). */
export function profileForVersion(version) {
  const v = parseVersion(version);
  if (!v) {
    return { version: null, supported: true, initializeOrderFormat: 'int32', rpcLinkTypeFormat: 'packetId16', predictedIdCountFormat: 'packed', predictedSpawnResultLinks: false, packedFormat: 'leb128' };
  }
  return {
    version: v.join('.'),
    supported: v[0] === 4 && !lt(v, parseVersion(MIN_SUPPORTED)),
    initializeOrderFormat: lt(v, [4, 6, 6]) ? 'int8' : 'int32',
    rpcLinkTypeFormat: lt(v, [4, 6, 3]) ? 'rpcType8' : 'packetId16',
    predictedIdCountFormat: lt(v, [4, 6, 9]) ? 'uint8' : 'packed',
    predictedSpawnResultLinks: lt(v, parseVersion(PREDICTED_RESULT_LINKS_REMOVED)),
    packedFormat: lt(v, [4, 6, 9]) ? 'legacy' : 'leb128',
  };
}

/** RpcType flags used by < 4.6.3 RpcLinks, mapped to PacketIds. */
export const RPC_TYPE_TO_PACKET_ID = Object.freeze({ 1: 8, 2: 9, 4: 10, 8: 15, 16: 16 });
export const PACKET_ID_TO_RPC_TYPE = Object.freeze({ 8: 1, 9: 2, 10: 4, 15: 8, 16: 16 });
