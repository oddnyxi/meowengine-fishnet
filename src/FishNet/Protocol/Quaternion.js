/**
 * Ports of FishNet's smallest-three quaternion compression
 * (Serializing/Helping/Quaternion32Compression.cs and Quaternion64Compression.cs).
 * float32 arithmetic is emulated with Math.fround so results match Unity bit-for-bit
 * in the common cases, and Mathf.RoundToInt's banker's rounding is reproduced.
 */
const f = Math.fround;
const MAXIMUM = f(f(1.0) / f(1.414214));

/** Mathf.RoundToInt -> (int)Math.Round(double) with MidpointRounding.ToEven. */
export function roundToEven(x) {
  const r = Math.round(x);
  // Math.round rounds .5 up; correct exact halves to even.
  if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2);
  return r;
}

function largest(q) {
  const ax = Math.abs(q.x), ay = Math.abs(q.y), az = Math.abs(q.z), aw = Math.abs(q.w);
  let comp = 0, la = ax, lv = q.x;
  if (ay > la) { la = ay; comp = 1; lv = q.y; }
  if (az > la) { la = az; comp = 2; lv = q.z; }
  if (aw > la) { comp = 3; lv = q.w; }
  return { comp, lv };
}

function others(q, comp) {
  switch (comp) {
    case 0: return [q.y, q.z, q.w];
    case 1: return [q.x, q.z, q.w];
    case 2: return [q.x, q.y, q.w];
    default: return [q.x, q.y, q.z];
  }
}

function rebuild(comp, a, b, c, negative = false) {
  const q = { x: 0, y: 0, z: 0, w: 0 };
  const sq = (v) => f(v * v);
  const rest = f(f(f(1 - sq(a)) - sq(b)) - sq(c));
  let big = f(Math.sqrt(rest)); // NaN when rest < 0, like Mathf.Sqrt
  if (negative) big = -big;
  switch (comp) {
    case 0: q.x = big; q.y = a; q.z = b; q.w = c; break;
    case 1: q.y = big; q.x = a; q.z = b; q.w = c; break;
    case 2: q.z = big; q.x = a; q.y = b; q.w = c; break;
    default: q.w = big; q.x = a; q.y = b; q.z = c; break;
  }
  return q;
}

export const Quaternion32 = {
  BITS: 10,
  /** Returns the uint32 FishNet writes (axesFlippingEnabled = true, the default). */
  compress(q) {
    const INT_SCALE = (1 << 9) - 1; // 511
    const MASK = (1 << 10) - 1;
    const { comp, lv } = largest(q);
    let [a, b, c] = others(q, comp).map(f);
    if (lv < 0) { a = -a; b = -b; c = -c; }
    const s = (v) => roundToEven(f(f(v / MAXIMUM) * INT_SCALE)) & MASK;
    return ((comp << 30) | (s(a) << 20) | (s(b) << 10) | s(c)) >>> 0;
  },
  decompress(u) {
    const INT_SCALE = 511;
    const MASK = 1023;
    u >>>= 0;
    const comp = u >>> 30;
    const sf = (v) => f(f((v > INT_SCALE ? v - (MASK + 1) : v) * MAXIMUM) / INT_SCALE);
    return rebuild(comp, sf((u >>> 20) & MASK), sf((u >>> 10) & MASK), sf(u & MASK));
  },
};

export const Quaternion64 = {
  /** Returns the uint64 (BigInt) FishNet writes. */
  compress(q) {
    const SH = (1 << 20) - 1, MH = (1 << 21) - 1; // 21-bit axes
    const SL = (1 << 19) - 1, ML = (1 << 20) - 1; // 20-bit axis
    const { comp, lv } = largest(q);
    let [a, b, c] = others(q, comp).map(f);
    if (lv < 0) { a = -a; b = -b; c = -c; }
    const sh = (v) => BigInt(roundToEven(f(f(v / MAXIMUM) * SH))) & BigInt(MH);
    const sl = (v) => BigInt(roundToEven(f(f(v / MAXIMUM) * SL))) & BigInt(ML);
    return (BigInt(comp) << 62n) | (sh(a) << 41n) | (sh(b) << 20n) | sl(c);
  },
  decompress(u) {
    u = BigInt.asUintN(64, BigInt(u));
    const SH = (1 << 20) - 1, MH = (1 << 21) - 1;
    const SL = (1 << 19) - 1, ML = (1 << 20) - 1;
    const comp = Number(u >> 62n);
    const a = Number((u >> 41n) & BigInt(MH));
    const b = Number((u >> 20n) & BigInt(MH));
    const c = Number(u & BigInt(ML));
    const fh = (v) => f(f((v > SH ? v - (MH + 1) : v) * MAXIMUM) / SH);
    const fl = (v) => f(f((v > SL ? v - (ML + 1) : v) * MAXIMUM) / SL);
    return rebuild(comp, fh(a), fh(b), fl(c));
  },
};

/** Quaternion (x,y,z,w) -> Euler degrees (Unity convention: ZXY, y = yaw, x = pitch). */
export function quaternionToEuler(q) {
  const { x, y, z, w } = q;
  const sinp = 2 * (w * x - y * z);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * 90 : (Math.asin(sinp) * 180) / Math.PI;
  const yaw = (Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y)) * 180) / Math.PI;
  const roll = (Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z)) * 180) / Math.PI;
  return { pitch, yaw, roll };
}
