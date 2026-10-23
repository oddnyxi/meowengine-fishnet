/**
 * GameKit.Dependencies.Utilities.Hashing — FNV-1 over UTF-16 code units.
 * Broadcast keys are typeof(T).FullName.GetStableHashU16(), e.g.
 *   broadcastKey('MyGame.Net.ChatBroadcast')
 * Note: FullName of a nested type uses '+', e.g. 'MyGame.Outer+ChatBroadcast'.
 */
export function stableHashU32(text) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash, 16777619) >>> 0;
    hash = (hash ^ text.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

export function stableHashU16(text) {
  const h = stableHashU32(text);
  return ((h >>> 16) ^ h) & 0xffff;
}

export const broadcastKey = stableHashU16;
