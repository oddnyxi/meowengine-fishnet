// End-to-end check: a fake Bayou/FishNet server (Bun) + a fake game page in headless
// Chromium with the built userscript injected. Run: bun tests/e2e/run.js
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FishWriter, PacketId, wrapFrame, encodePacket, Packets, parseFrame, buildFrames, encodeTransformRpcArgs,
  stableHashU16,
} from '../../src/FishNet/index.js';

const root = resolve(import.meta.dir, '../..');
const outDir = process.env.SHOT_DIR || resolve(root, 'tests/e2e/out');
mkdirSync(outDir, { recursive: true });
const script = readFileSync(resolve(root, 'dist/meowengine.user.js'), 'utf8');
const GAME = 'https://bullet-force-multiplayer.game-files.crazygames.com/unity/unity2020/bullet-force-multiplayer.html';

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const hex = (u8) => Buffer.from(u8).toString('hex');

// --------------------------------------------------------------- fake server
const sentToClient = [];
const fromClient = [];
let serverTick = 1000;
const frameIn = (packets, channel = 0) => buildFrames(packets, { tick: serverTick++, channel, direction: 'in', mtu: 1023 });

function spawn(objectId, prefabId, owner, pos, links = []) {
  const w = new FishWriter();
  w.writePacketId(PacketId.ObjectSpawn).writeUInt8(4).writeInt32(objectId).writeUInt16(0).writeInt32(0).writeInt32(owner);
  w.writeUInt8(1).writeVector3(pos);
  w.writeInt32(prefabId);
  w.writeUInt32Unpacked(0);
  const l = new FishWriter();
  if (links.length) {
    l.writeUInt8(0).writeUInt16(links.length);
    for (const [idx, hash, pid] of links) l.writeUInt16Unpacked(idx).writeUInt16Unpacked(hash).writeUInt16Unpacked(pid);
  }
  w.writeUInt16Unpacked(l.length).writeBytes(l.toBytes());
  w.writeUInt32Unpacked(0);
  return { raw: w.toBytes(), opaque: true, id: PacketId.ObjectSpawn };
}

const server = Bun.serve({
  port: 0,
  fetch(req, srv) { if (srv.upgrade(req)) return undefined; return new Response('no'); },
  websocket: {
    message(ws, msg) {
      const u8 = new Uint8Array(msg);
      fromClient.push(u8);
      const f = parseFrame(u8, { direction: 'out' });
      if (f.packets.some((p) => p.id === PacketId.ServerRpc)) {
        // reply with a chat-like broadcast so incoming hooks can be exercised
        const b = frameIn([Packets.broadcast(stableHashU16('Game.Chat'), new FishWriter().writeString('pong').toBytes())]);
        b.forEach((x) => { sentToClient.push(x); ws.send(x); });
      }
      if (f.packets[0] && f.packets[0].id === PacketId.Version) {
        const send = (frames) => frames.forEach((b) => { sentToClient.push(b); ws.send(b); });
        const nt = encodeTransformRpcArgs({ position: { x: 12.5, y: 1, z: -40.25 }, rotation: { x: 0, y: 0.3826834, z: 0, w: 0.9238795 } });
        send(frameIn([
          { ...Packets.version('x'), id: PacketId.Version, direction: 'in', isServerDevelopment: false },
          { id: PacketId.Authenticated, direction: 'in', connectionId: 3, dirty: true },
          spawn(10, 4, 3, { x: 0, y: 1, z: 0 }, [[22, 0, PacketId.ObserversRpc]]),
          spawn(11, 4, 5, { x: 5, y: 1, z: 5 }, [[23, 0, PacketId.ObserversRpc]]),
          spawn(12, 9, -1, { x: 0, y: 0, z: 0 }),
        ]));
        send(frameIn([
          Packets.rpcLink({ linkIndex: 23, args: nt }),
          Packets.broadcast(stableHashU16('Game.Chat'), new FishWriter().writeString('hello').toBytes()),
          { ...Packets.pingPong(f.tick) },
        ]));
        // A large TargetRpc that FishNet must split.
        send(frameIn([Packets.targetRpc({ objectId: 10, componentIndex: 1, hash: 2, args: new Uint8Array(3000).fill(7) })]));
        send(frameIn([Packets.observersRpc({ objectId: 11, componentIndex: 2, hash: 6, args: Uint8Array.of(1, 2, 3) })], 1));
      }
    },
  },
});

// --------------------------------------------------------------- fake game page
const page = `<!doctype html><html><head><title>fake game</title><style>body{margin:0;background:#1d2b3a;height:100vh;font:14px sans-serif;color:#9ab}</style></head>
<body><div style="padding:20px">fake Unity canvas</div><script>
window.unityInstance = { SendMessage(){} };
window.received = [];
setTimeout(() => {
  const ws = new WebSocket('ws://127.0.0.1:${server.port}');
  ws.binaryType = 'arraybuffer';
  window.gameSocket = ws;
  ws.onopen = () => {
    // Bayou frame: tick, Version("4.7.4"), channel
    ws.send(new Uint8Array([1,0,0,0, 21,0, 10, 52,46,55,46,52, 0]).buffer);
  };
  ws.onmessage = (e) => { window.received.push(Array.from(new Uint8Array(e.data))); };
}, 300);
window.sendRpc = (args, channel) => {
  // tick 2, ServerRpc obj 10 spawned comp 1, len = args+1, hash 3, args
  const a = [2,0,0,0, 8,0, 20, 1, 1, (args.length + 1) * 2, 3, ...args, channel];
  window.gameSocket.send(new Uint8Array(a).buffer);
};
</script></body></html>`;

const browser = await chromium.launch({ args: ['--allow-running-insecure-content', '--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResults'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.route(GAME + '*', (route) => route.fulfill({ contentType: 'text/html', body: page }));
await ctx.addInitScript({ content: script });
const pg = await ctx.newPage();
const logs = [];
pg.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
pg.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await pg.goto(GAME);
await pg.waitForFunction(() => window.received && window.received.length >= 4, null, { timeout: 10000 }).catch(() => {});
await pg.waitForTimeout(800);
if (process.env.VERBOSE) console.log(logs.join('\n'));

// 1. pass-through is byte exact
const received = await pg.evaluate(() => window.received.slice());
check(received.length > 0 && received.length === sentToClient.length, `game received all ${sentToClient.length} frames (got ${received.length})`);
check(received.every((r, i) => hex(Uint8Array.from(r)) === hex(sentToClient[i])), 'incoming frames are byte-identical when unmodified');
check(fromClient.length >= 1 && hex(fromClient[0]) === hex(Uint8Array.from([1, 0, 0, 0, 21, 0, 10, 52, 46, 55, 46, 52, 0])), 'outgoing Version handshake forwarded untouched');

// 2. state mirror
const snap = await pg.evaluate(() => {
  const st = MeowEngine.FishNet.FishNetSocketManager.state;
  return {
    connected: st.connected, version: st.fishnetVersion, conn: st.connectionId, objects: st.objects.size,
    pos11: st.objects.get(11) && st.objects.get(11).position, links: st.rpcLinks.size,
    players: MeowEngine.RoomInstance.Players.map((p) => ({ id: p.clientId, local: p.isLocal, pos: p.position })),
    errors: st.stats.errors, byName: st.stats.in.byName,
  };
});
check(snap.connected && snap.version === '4.7.4' && snap.conn === 3, `session detected (version ${snap.version}, client ${snap.conn})`);
check(snap.objects === 3 && snap.links === 2, `spawns + rpc links tracked (${snap.objects} objects, ${snap.links} links)`);
check(snap.pos11 && Math.abs(snap.pos11.x - 12.5) < 1e-3 && Math.abs(snap.pos11.z + 40.25) < 1e-3, 'NetworkTransform RpcLink moved object 11');
check(snap.players.length === 2 && snap.players.find((p) => p.id === 3).local, `players derived from owners: ${JSON.stringify(snap.players.map((p) => p.id))}`);
check(snap.errors === 0, `no decode errors (${JSON.stringify(snap.byName)})`);

// 3. outgoing modification
await pg.evaluate(() => {
  MeowEngine.Events.FishNet.addListener('outgoing', (ctx) => {
    for (const p of ctx.packets) if (p.name === 'ServerRpc' && p.hash === 3) { p.args = Uint8Array.of(0xaa, 0xbb, 0xcc, 0xdd); ctx.modify(p); }
  });
});
const before = fromClient.length;
await pg.evaluate(() => window.sendRpc([1, 2], 0));
await pg.waitForTimeout(300);
const got = fromClient.slice(before).map((u8) => parseFrame(u8, { direction: 'out' })).find((f) => f.packets.some((p) => p.name === 'ServerRpc'));
const rpc = got && got.packets.find((p) => p.name === 'ServerRpc');
check(rpc && hex(rpc.args) === 'aabbccdd' && rpc.objectId === 10 && rpc.componentIndex === 1 && got.tick === 2, 'outgoing ServerRpc rewritten by hook and still valid FishNet');

// 4. incoming modification + injection via the API
await pg.evaluate(() => {
  MeowEngine.Events.FishNet.addListener('incoming', (ctx) => {
    for (const p of ctx.packets) if (p.name === 'Broadcast') { p.data = Uint8Array.of(0x0a, 0x68, 0x61, 0x63, 0x6b, 0x65); ctx.modify(p); }
  });
});
const n0 = await pg.evaluate(() => window.received.length);
await pg.evaluate(() => MeowEngine.FishNetClient.Instance.inject(MeowEngine.FishNet.Packets.broadcast(1234, new Uint8Array([2, 0x41]))));
await pg.waitForTimeout(200);
const injected = await pg.evaluate((n) => window.received.slice(n), n0);
const injFrame = injected.length && parseFrame(Uint8Array.from(injected[0]), { direction: 'in' });
check(injFrame && injFrame.packets[0].name === 'Broadcast' && injFrame.packets[0].key === 1234, 'inject() delivers a well-formed server frame to the game');

const n1 = await pg.evaluate(() => window.received.length);
await pg.evaluate(() => window.sendRpc([5], 0));
await pg.waitForTimeout(300);
const reply = (await pg.evaluate((n) => window.received.slice(n), n1)).map((r) => parseFrame(Uint8Array.from(r), { direction: 'in' }));
const bc = reply.length && reply[0].packets.find((p) => p.name === 'Broadcast');
check(bc && new TextDecoder().decode(bc.data.subarray(1)) === 'hacke' && reply[0].tick === sentToClient[sentToClient.length - 1][0] + (sentToClient[sentToClient.length - 1][1] << 8), 'incoming Broadcast rewritten by hook before the game saw it (tick preserved)');

// Bayou keep-alive passes untouched
const k0 = fromClient.length;
await pg.evaluate(() => window.gameSocket.send(new Uint8Array([14, 1, 2, 3, 4]).buffer));
await pg.waitForTimeout(200);
check(fromClient.length === k0 + 1 && hex(fromClient[k0]) === '0e01020304', 'Bayou keep-alive forwarded untouched');

// 5. split message was reassembled for inspection
const splitSeen = await pg.evaluate(() => MeowEngine.FishNet.FishNetSocketManager.capture.some((e) => e.packet.name === 'TargetRpc' && e.packet.args.length === 3000));
check(splitSeen, 'split TargetRpc (3000 bytes) reassembled in the inspector');

// 6. unreliable ObserversRpc decoded
const unrel = await pg.evaluate(() => MeowEngine.FishNet.FishNetSocketManager.capture.find((e) => e.packet.name === 'ObserversRpc'));
check(unrel && unrel.channel === 1 && unrel.packet.hash === 6, 'unreliable ObserversRpc decoded');

// 7. UI renders (screenshots of a few tabs)
const tabs = ['Dashboard', 'Players', 'Packets', 'RPC Explorer', 'Objects', 'FishNet'];
for (const t of tabs) {
  await pg.evaluate((name) => { const ui = MeowEngine.Menu.ui; ui.selectTab(ui.tabs.find((x) => x.name === name)); }, t);
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: `${outDir}/tab-${t.replace(/\s/g, '_')}.png` });
}
const uiOk = await pg.evaluate(() => !!document.getElementById('odium-ui-host') && MeowEngine.Menu.ui.tabs.length);
check(uiOk >= 8, `Odium window mounted with ${uiOk} tabs`);

const errs = logs.filter((l) => l.startsWith('[pageerror]') || l.startsWith('[error]'));
check(errs.length === 0, `no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
if (process.env.VERBOSE) console.log(logs.join('\n'));

await browser.close();
server.stop(true);
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
