// Run with: bun test tests/
import { describe, expect, test } from 'bun:test';
import {
  FishReader, FishWriter, PacketId, Channel, Packets, parseFrame, encodeFrame, buildFrames, wrapFrame,
  encodePackets, parseMessage, Quaternion32, Quaternion64, stableHashU16, stableHashU32, NetworkState,
  encodeTransformRpcArgs, tryDecodeTransformRpcArgs, decodeTransformData, encodePacket, AutoPackType,
} from '../src/FishNet/index.js';
import { SplitAssembler } from '../src/FishNet/Protocol/Framing.js';

const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join(' ');
const bytes = (s) => Uint8Array.from(s.trim().split(/\s+/).map((x) => parseInt(x, 16)));

describe('packed integers (Writer.WriteSignedPackedWhole / ZigZag + LEB128)', () => {
  const cases = [
    [0, '00'], [1, '02'], [-1, '01'], [63, '7e'], [-64, '7f'], [64, '80 01'], [-65, '81 01'],
    [65535, 'fe ff 07'], [2147483647, 'fe ff ff ff 0f'], [-2147483648, 'ff ff ff ff 0f'],
  ];
  for (const [v, h] of cases) {
    test(`int32 ${v}`, () => {
      const w = new FishWriter().writeInt32(v);
      expect(hex(w.toBytes())).toBe(h);
      expect(new FishReader(w.toBytes()).readInt32()).toBe(v);
    });
  }
  test('uint64 / int64 beyond 2^53 use BigInt', () => {
    const big = 0xffffffffffffffffn;
    const w = new FishWriter().writeUInt64(big);
    expect(w.length).toBe(10);
    expect(new FishReader(w.toBytes()).readUInt64()).toBe(big);
    const neg = -(2n ** 60n);
    expect(new FishReader(new FishWriter().writeInt64(neg).toBytes()).readInt64()).toBe(neg);
  });
  test('int16 / uint16 default writers are unpacked', () => {
    expect(hex(new FishWriter().writeUInt16(0x1234).toBytes())).toBe('34 12');
    expect(hex(new FishWriter().writeInt16(-2).toBytes())).toBe('fe ff');
  });
});

describe('strings and byte arrays', () => {
  test('string', () => {
    expect(hex(new FishWriter().writeString('hi').toBytes())).toBe('04 68 69');
    expect(hex(new FishWriter().writeString(null).toBytes())).toBe('01');
    expect(hex(new FishWriter().writeString('').toBytes())).toBe('00');
    const u = new FishWriter().writeString('héllo ✓').toBytes();
    expect(new FishReader(u).readString()).toBe('héllo ✓');
    expect(new FishReader(bytes('01')).readString()).toBe(null);
  });
  test('bytes and size', () => {
    expect(hex(new FishWriter().writeBytesAndSize(Uint8Array.of(9, 8)).toBytes())).toBe('04 09 08');
  });
});

describe('hashing (GameKit Hashing.GetStableHashU16)', () => {
  const ref32 = (s) => {
    let h = 2166136261n;
    for (const ch of s) { h = (h * 16777619n) & 0xffffffffn; h ^= BigInt(ch.charCodeAt(0)); }
    return Number(h);
  };
  test('matches a BigInt reference FNV-1', () => {
    for (const s of ['', 'a', 'FishNet.Managing.Server.ClientConnectionChangeBroadcast', 'MyGame.Net.Chat+Message']) {
      expect(stableHashU32(s)).toBe(ref32(s));
      const h = ref32(s);
      expect(stableHashU16(s)).toBe(((h >>> 16) ^ h) & 0xffff);
    }
  });
});

describe('quaternion compression', () => {
  const close = (a, b, eps) => ['x', 'y', 'z', 'w'].forEach((k) => expect(Math.abs(a[k] - b[k])).toBeLessThan(eps));
  test('identity packs to largest=W, zero axes', () => {
    expect(Quaternion32.compress({ x: 0, y: 0, z: 0, w: 1 })).toBe(0xc0000000);
    close(Quaternion32.decompress(0xc0000000), { x: 0, y: 0, z: 0, w: 1 }, 1e-6);
  });
  test('negative largest component is flipped (same rotation)', () => {
    expect(Quaternion32.compress({ x: 0, y: 0, z: 0, w: -1 })).toBe(0xc0000000);
  });
  test('(0.5,0.5,0.5,0.5) bit layout', () => {
    const v = Quaternion32.compress({ x: 0.5, y: 0.5, z: 0.5, w: 0.5 });
    expect(v >>> 30).toBe(0);
    expect((v >>> 20) & 1023).toBe(361);
    expect((v >>> 10) & 1023).toBe(361);
    expect(v & 1023).toBe(361);
  });
  test('round trips within precision', () => {
    for (let i = 0; i < 200; i++) {
      let q = { x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5, w: Math.random() - 0.5 };
      const n = Math.hypot(q.x, q.y, q.z, q.w);
      q = { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
      const big = ['x', 'y', 'z', 'w'].reduce((a, k) => (Math.abs(q[k]) > Math.abs(q[a]) ? k : a), 'x');
      const sign = Math.sign(q[big]);
      const flip = (r) => ({ x: r.x * sign, y: r.y * sign, z: r.z * sign, w: r.w * sign });
      close(flip(Quaternion32.decompress(Quaternion32.compress(q))), q, 3e-3);
      close(flip(Quaternion64.decompress(Quaternion64.compress(q))), q, 2e-6);
    }
  });
  test('negative axis values use two-complement masks', () => {
    const v = Quaternion32.compress({ x: -0.5, y: 0.5, z: 0.5, w: 0.5 });
    // largest is y (0.5 > |-0.5| is false, so x stays largest? x is first with abs 0.5)
    expect(v >>> 30).toBe(0); // x is largest and negative -> others negated
    expect((v >>> 20) & 1023).toBe((-361) & 1023);
  });
});

/** Builds a server->client bundle in Bayou framing by hand. */
function frameOf(body, { tick = 100, channel = 0 } = {}) {
  return wrapFrame(body, { tick, channel });
}

describe('client handshake', () => {
  test('Version frame bytes', () => {
    const body = encodePacket(Packets.version('4.7.4'), { direction: 'out' });
    const f = frameOf(body, { tick: 0x01020304 });
    expect(hex(f)).toBe('04 03 02 01 15 00 0a 34 2e 37 2e 34 00');
    const parsed = parseFrame(f, { direction: 'out' });
    expect(parsed.tick).toBe(0x01020304);
    expect(parsed.channel).toBe(0);
    expect(parsed.packets[0].name).toBe('Version');
    expect(parsed.packets[0].version).toBe('4.7.4');
  });
  test('Bayou keep-alive is recognised', () => {
    const k = Uint8Array.of(14, 1, 2, 3, 4);
    expect(parseFrame(k, { direction: 'out' }).keepAlive).toBe(true);
  });
});

function spawnPacketBytes() {
  // Hand-written ObjectSpawn following ManagedObjects.WriteSpawn.
  const w = new FishWriter();
  w.writePacketId(PacketId.ObjectSpawn);
  w.writeUInt8(4); // SpawnType.Instantiated
  w.writeInt32(57); // objectId
  w.writeUInt16(0); // collectionId
  w.writeInt32(3); // initializeOrder
  w.writeInt32(2); // owner
  w.writeUInt8(1 | 2); // position + rotation changed
  w.writeSingle(1.5).writeSingle(-2).writeSingle(10);
  w.writeUInt64Unpacked(Quaternion64.compress({ x: 0, y: 0, z: 0, w: 1 }));
  w.writeInt32(12); // prefabId
  w.writeUInt32Unpacked(3).writeBytes(Uint8Array.of(7, 7, 7)); // payload
  // rpc links: component 1, two links
  const links = new FishWriter();
  links.writeUInt8(1).writeUInt16(2);
  links.writeUInt16Unpacked(22).writeUInt16Unpacked(0).writeUInt16Unpacked(PacketId.ObserversRpc);
  links.writeUInt16Unpacked(23).writeUInt16Unpacked(4).writeUInt16Unpacked(PacketId.TargetRpc);
  w.writeUInt16Unpacked(links.length).writeBytes(links.toBytes());
  w.writeUInt32Unpacked(2).writeBytes(Uint8Array.of(1, 2)); // synctypes
  return w.toBytes();
}

describe('server bundle parsing', () => {
  const state = new NetworkState();

  const body = new FishWriter();
  body.writePacketId(PacketId.Version).writeBoolean(false);
  body.writePacketId(PacketId.Authenticated).writeInt32(7);
  body.writeBytes(spawnPacketBytes());
  // ObserversRpc on reliable: nb(57 spawned, comp 1) + length(hash+args) + hash + args
  body.writePacketId(PacketId.ObserversRpc).writeInt32(57).writeBoolean(true).writeUInt8(1).writeInt32(4).writeUInt8(5).writeBytes(Uint8Array.of(1, 2, 3));
  body.writePacketId(PacketId.Broadcast).writeUInt16(stableHashU16('Game.Chat')).writeInt32(3).writeBytes(Uint8Array.of(0x04, 0x68, 0x69));
  // RpcLink 22 (ObserversRpc on obj 57 comp 1 hash 0) with length
  const nt = encodeTransformRpcArgs({ position: { x: 1.25, y: 2, z: -3.5 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
  body.writePacketId(22).writeInt32(nt.length).writeBytes(nt);
  body.writePacketId(PacketId.TimingUpdate).writeTick(999);
  const frame = frameOf(body.toBytes(), { tick: 4242 });

  state.registerBroadcast('Game.Chat', 'Chat');
  const parsed = parseFrame(frame, { direction: 'in', state, track: true });

  test('every packet decodes with no errors', () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.packets.map((p) => p.name)).toEqual(['Version', 'Authenticated', 'ObjectSpawn', 'ObserversRpc', 'Broadcast', 'RpcLink', 'TimingUpdate']);
  });
  test('Authenticated without predicted ids', () => {
    expect(parsed.packets[1].connectionId).toBe(7);
    expect(parsed.packets[1].predictedObjectIds).toBe(null);
    expect(state.connectionId).toBe(7);
  });
  test('spawn fields', () => {
    const s = parsed.packets[2];
    expect(s.objectId).toBe(57);
    expect(s.prefabId).toBe(12);
    expect(s.ownerId).toBe(2);
    expect(s.localPosition).toEqual({ x: 1.5, y: -2, z: 10 });
    expect(s.localRotation.w).toBeCloseTo(1, 5);
    expect(s.rpcLinks[0].links.length).toBe(2);
    expect([...s.payload]).toEqual([7, 7, 7]);
    expect(state.objects.get(57).prefabId).toBe(12);
    expect(state.rpcLinks.get(23).rpcPacketId).toBe(PacketId.TargetRpc);
  });
  test('rpc + broadcast + link', () => {
    const r = parsed.packets[3];
    expect([r.objectId, r.componentIndex, r.hash, [...r.args]]).toEqual([57, 1, 5, [1, 2, 3]]);
    expect(parsed.packets[4].broadcastName).toBe('Chat');
    const l = parsed.packets[5];
    expect(l.link.objectId).toBe(57);
    expect(l.linkedTo).toBe('ObserversRpc');
  });
  test('NetworkTransform update moves the tracked object', () => {
    const o = state.objects.get(57);
    expect(o.position).toEqual({ x: 1.25, y: 2, z: -3.5 });
    expect(state.getClients()[0].clientId).toBe(2);
  });
  test('untouched frame re-encodes byte-for-byte', () => {
    const out = encodeFrame(parsed);
    expect(out.length).toBe(1);
    expect(out[0]).toBe(parsed.bytes);
  });
  test('editing a packet re-serialises only that packet', () => {
    const p2 = parseFrame(frame, { direction: 'in', state });
    const rpc = p2.packets[3];
    rpc.args = Uint8Array.of(9, 9, 9, 9, 9);
    rpc.dirty = true;
    p2.packets[6].drop = true;
    const out = encodeFrame(p2);
    expect(out.length).toBe(1);
    const re = parseFrame(out[0], { direction: 'in', state });
    expect(re.errors).toEqual([]);
    expect([...re.packets[3].args]).toEqual([9, 9, 9, 9, 9]);
    expect(re.packets.length).toBe(6);
    expect(re.tick).toBe(4242);
    // spawn untouched -> identical bytes
    expect(hex(re.packets[2].raw)).toBe(hex(p2.packets[2].raw));
  });
  test('re-encoding a spawn from its fields reproduces the original bytes', () => {
    const s = { ...parsed.packets[2], dirty: true };
    expect(hex(encodePacket(s, { direction: 'in' }))).toBe(hex(parsed.packets[2].raw));
  });
});

describe('predicted spawning ids in Authenticated', () => {
  test('auto-detected when followed by a packet boundary', () => {
    const b = new FishWriter().writePacketId(1).writeInt32(3).writeInt32(2).writeInt32(100).writeInt32(101).writePacketId(PacketId.PingPong).writeTick(5);
    const f = parseFrame(frameOf(b.toBytes()), { direction: 'in' });
    expect(f.errors).toEqual([]);
    expect(f.packets[0].predictedObjectIds).toEqual([100, 101]);
    expect(f.packets[1].tick).toBe(5);
  });
  test('not confused by a following PingPong', () => {
    const b = new FishWriter().writePacketId(1).writeInt32(3).writePacketId(PacketId.PingPong).writeTick(5);
    const f = parseFrame(frameOf(b.toBytes()), { direction: 'in' });
    expect(f.packets[0].predictedObjectIds).toBe(null);
    expect(f.packets[1].name).toBe('PingPong');
  });
});

describe('unreliable channel', () => {
  test('RPC without length swallows the remainder', () => {
    const b = new FishWriter().writePacketId(PacketId.ServerRpc).writeInt32(5).writeBoolean(true).writeUInt8(0).writeUInt8(3).writeBytes(Uint8Array.of(1, 2, 3, 4));
    const f = parseFrame(frameOf(b.toBytes(), { channel: Channel.Unreliable }), { direction: 'out' });
    expect(f.channel).toBe(1);
    expect(f.packets[0].hasLength).toBe(false);
    expect(f.packets[0].unboundedArgs).toBe(true);
    expect([...f.packets[0].args]).toEqual([1, 2, 3, 4]);
    // re-encode after edit keeps "no length"
    f.packets[0].hash = 4; f.packets[0].dirty = true;
    const re = parseFrame(encodeFrame(f)[0], { direction: 'out' });
    expect(re.packets[0].hash).toBe(4);
    expect([...re.packets[0].args]).toEqual([1, 2, 3, 4]);
  });
  test('Broadcast on unreliable still has a length', () => {
    const b = new FishWriter().writePacketId(PacketId.Broadcast).writeUInt16(1).writeInt32(1).writeUInt8(9).writePacketId(PacketId.PingPong).writeTick(1);
    const f = parseFrame(frameOf(b.toBytes(), { channel: 1 }), { direction: 'out' });
    expect(f.packets.map((p) => p.name)).toEqual(['Broadcast', 'PingPong']);
  });
});

describe('MTU handling and split messages', () => {
  test('oversized packet is split and reassembles exactly', () => {
    const args = new Uint8Array(5000).map((_, i) => i & 0xff);
    const pkt = Packets.serverRpc({ objectId: 3, componentIndex: 2, hash: 1, args });
    const frames = buildFrames([pkt], { tick: 77, mtu: 1023 });
    expect(frames.length).toBeGreaterThan(4);
    frames.forEach((f) => expect(f.length - 1).toBeLessThanOrEqual(1021));
    const asm = new SplitAssembler();
    let full = null;
    for (const f of frames) {
      const pf = parseFrame(f, { direction: 'out' });
      expect(pf.split).toBeTruthy();
      expect(pf.channel).toBe(0);
      full = asm.add(pf);
    }
    const { packets, errors } = parseMessage(full, { direction: 'out' });
    expect(errors).toEqual([]);
    expect(packets[0].name).toBe('ServerRpc');
    expect(packets[0].args.length).toBe(5000);
    expect(packets[0].args[4999]).toBe(4999 & 0xff);
  });
  test('many small packets are batched over several frames', () => {
    const list = Array.from({ length: 300 }, (_, i) => Packets.pingPong(i));
    const frames = buildFrames(list, { mtu: 600 });
    frames.forEach((f) => expect(f.length - 1).toBeLessThanOrEqual(598));
    const total = frames.reduce((n, f) => n + parseFrame(f, { direction: 'out' }).packets.length, 0);
    expect(total).toBe(300);
  });
});

describe('NetworkTransform data', () => {
  test('round trip incl. extended/teleport', () => {
    const args = encodeTransformRpcArgs({ position: { x: 400, y: -1.23, z: 0.5 }, rotation: { x: 0, y: 0.7071068, z: 0, w: 0.7071068 }, scale: { x: 2, y: 2, z: 2 }, teleport: true });
    const d = tryDecodeTransformRpcArgs(args);
    expect(d.position.x).toBeCloseTo(400, 2); // float (out of int16*100 range)
    expect(d.position.y).toBeCloseTo(-1.23, 2);
    expect(d.rotation.y).toBeCloseTo(0.7071, 3);
    expect(d.scale).toEqual({ x: 2, y: 2, z: 2 });
    expect(d.teleport).toBe(true);
  });
  test('rejects non-transform args', () => {
    expect(tryDecodeTransformRpcArgs(Uint8Array.of(1, 2, 3))).toBe(null);
    expect(tryDecodeTransformRpcArgs(new FishWriter().writeString('hello').toBytes())).toBe(null);
  });
});

describe('version profiles', () => {
  const { profileForVersion } = require('../src/FishNet/Protocol/Versions.js');
  test('thresholds', () => {
    expect(profileForVersion('4.3.8').supported).toBe(false);
    expect(profileForVersion('4.4.3').supported).toBe(true);
    expect(profileForVersion('4.5.5').predictedSpawnResultLinks).toBe(true);
    expect(profileForVersion('4.5.6').predictedSpawnResultLinks).toBe(false);
    expect(profileForVersion('4.6.2').rpcLinkTypeFormat).toBe('rpcType8');
    expect(profileForVersion('4.6.3').rpcLinkTypeFormat).toBe('packetId16');
    expect(profileForVersion('4.6.5').initializeOrderFormat).toBe('int8');
    expect(profileForVersion('4.6.6').initializeOrderFormat).toBe('int32');
    expect(profileForVersion('4.6.8').predictedIdCountFormat).toBe('uint8');
    expect(profileForVersion('4.7.4')).toMatchObject({ supported: true, initializeOrderFormat: 'int32', rpcLinkTypeFormat: 'packetId16', predictedIdCountFormat: 'packed' });
  });
  test('4.5.x style spawn (sbyte init order, RpcType links) round trips', () => {
    const options = { ...profileForVersion('4.5.8') };
    const w = new FishWriter();
    w.writePacketId(PacketId.ObjectSpawn).writeUInt8(4).writeInt32(9).writeUInt16(0).writeInt8(-2).writeInt32(1).writeUInt8(0).writeInt32(3);
    w.writeUInt32Unpacked(0);
    const l = new FishWriter().writeUInt8(0).writeUInt16(1).writeUInt16Unpacked(30).writeUInt16Unpacked(1).writeUInt8(4 /* Target */);
    w.writeUInt16Unpacked(l.length).writeBytes(l.toBytes()).writeUInt32Unpacked(0);
    const st = new NetworkState();
    const f = parseFrame(wrapFrame(w.toBytes()), { direction: 'in', options, state: st, track: true });
    expect(f.errors).toEqual([]);
    expect(f.packets[0].initializeOrder).toBe(-2);
    expect(f.packets[0].rpcLinks[0].links[0]).toEqual({ linkIndex: 30, hash: 1, rpcPacketId: PacketId.TargetRpc });
    expect(st.rpcLinks.get(30).rpcPacketId).toBe(PacketId.TargetRpc);
    const re = encodePacket({ ...f.packets[0], dirty: true }, { direction: 'in', options });
    expect(hex(re)).toBe(hex(f.packets[0].raw));
  });
  test('pre-4.6.9 Authenticated uses a byte count', () => {
    const options = { ...profileForVersion('4.6.6'), predictedSpawning: true };
    const b = new FishWriter().writePacketId(1).writeInt32(4).writeUInt8(2).writeInt32(50).writeInt32(51);
    const f = parseFrame(wrapFrame(b.toBytes()), { direction: 'in', options });
    expect(f.packets[0].predictedObjectIds).toEqual([50, 51]);
  });
});

describe('legacy (pre-4.6.9) packed integers', () => {
  const ref = (v) => {
    // straight port of 4.6.6 Writer.WriteUnsignedPackedWhole
    v = BigInt.asUintN(64, BigInt(v));
    const out = [];
    const b = (x) => out.push(Number(x & 0xffn));
    if (v < 0x80n) b(v & 0x7fn);
    else if (v < 0x4000n) { b(0x80n | (v & 0x7fn)); b((v >> 7n) & 0x7fn); }
    else if (v < 0x200000n) { b(0x80n | (v & 0x7fn)); b(0x80n | ((v >> 7n) & 0x7fn)); b((v >> 14n) & 0x7fn); }
    else if (v < 0x10000000n) { b(0x80n | (v & 0x7fn)); b(0x80n | ((v >> 7n) & 0x7fn)); b(0x80n | ((v >> 14n) & 0x7fn)); b((v >> 21n) & 0x7fn); }
    else {
      b(0x80n | (v & 0x7fn)); b(0x80n | ((v >> 7n) & 0x7fn)); b(0x80n | ((v >> 14n) & 0x7fn)); b(0x80n | ((v >> 21n) & 0x7fn));
      const extra = v < 0x100000000n ? 0n : v < 0x10000000000n ? 1n : v < 0x1000000000000n ? 2n : v < 0x100000000000000n ? 3n : 4n;
      b((extra << 4n) | ((v >> 28n) & 0x0fn));
      for (let i = 0n; i < extra; i++) b(v >> (32n + 8n * i));
    }
    return out;
  };
  for (const v of [0n, 127n, 300n, 2n ** 28n, 2n ** 32n - 1n, 2n ** 32n, 2n ** 40n + 5n, 2n ** 56n + 7n, 2n ** 64n - 1n]) {
    test(`value ${v}`, () => {
      const w = new FishWriter(); w.packedFormat = 'legacy';
      w.writeUnsignedPacked(v);
      expect([...w.toBytes()]).toEqual(ref(v));
      const r = new FishReader(w.toBytes()); r.packedFormat = 'legacy';
      expect(BigInt(r.readUnsignedPacked())).toBe(v);
      if (v < 2n ** 32n) expect(hex(w.toBytes())).toBe(hex(new FishWriter().writeUnsignedPacked(v).toBytes()));
    });
  }
});
