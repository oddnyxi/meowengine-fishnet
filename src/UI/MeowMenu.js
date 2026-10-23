import { UI } from '../OdiumUI/core/UI.js';
import { Icons } from './icons.js';
import { LOGO } from './logo.js';
import MeowEngine from '../Browser/GlobalTypeDefs';
import { FishNetSocketManager, FishNetConfig, activeProfile } from '../FishNet/FishNetSocketManager.js';
import { FishNetClientInstance } from '../FishNet/FishNetClient.js';
import { channelName } from '../FishNet/Enums/Channel.js';
import { packetIdName } from '../FishNet/Enums/PacketId.js';
import { AutoPackType } from '../FishNet/Enums/Spawning.js';
import { Packets } from '../FishNet/Protocol/PacketCodec.js';
import { broadcastKey } from '../FishNet/Protocol/Hashing.js';
import { describePacket, packetToJSON, hexDump, summarizePacket, toHex } from '../FishNet/Inspect.js';

const PACKET_NAMES = [
  'Authenticated', 'Split', 'ObjectSpawn', 'ObjectDespawn', 'PredictedSpawnResult', 'SyncType', 'ServerRpc', 'ObserversRpc',
  'TargetRpc', 'OwnershipChange', 'Broadcast', 'PingPong', 'Replicate', 'Reconcile', 'Disconnect', 'TimingUpdate',
  'StateUpdate', 'Version', 'RpcLink', 'Opaque', 'BayouKeepAlive',
];

const fmtVec = (v) => (v ? `${(+v.x).toFixed(1)}, ${(+v.y).toFixed(1)}, ${(+v.z).toFixed(1)}` : '—');
const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);
const ago = (t) => (t ? `${Math.max(0, Math.round((Date.now() - t) / 1000))}s` : '—');
const parseHex = (s) => {
  const clean = String(s || '').replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
  if (clean.length % 2) throw new Error('Odd number of hex digits');
  return Uint8Array.from(clean.match(/../g) || [], (h) => parseInt(h, 16));
};
const download = (name, text) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const jsonReplacer = (_k, v) => (typeof v === 'bigint' ? v.toString() : v instanceof Uint8Array ? toHex(v) : v);

/**
 * MeowEngine menu built on Odium UI.
 */
export function createMeowMenu() {
  const m = FishNetSocketManager;
  const st = m.state;
  const ui = new UI();
  // The MeowEngine logo is the default window icon; a custom one can be set under Interface.
  const setWindowIcon = ui.setWindowIcon.bind(ui);
  ui.setWindowIcon = (icon) => {
    setWindowIcon(icon || LOGO);
    if (!icon) ui._icon = null; // keep the default out of saved configs
    return ui;
  };
  ui.createWindow('MEOWENGINE', { subtitle: 'v2.0 · FishNet', width: 740, height: 540, toggleKey: 'Insert', icon: null });
  ui.setWindowIcon(null);
  ui.bindKey('V', () => ui.toggle());

  const timers = [];
  const every = (ms, fn) => timers.push(setInterval(() => { try { fn(); } catch (e) { console.warn('[MeowEngine UI]', e); } }, ms));

  // ======================================================== Dashboard
  const dash = ui.addTab('Dashboard', { group: 'General', icon: Icons.dashboard });
  dash.createSection('Connection');
  const badge = dash.createBadge('Waiting for FishNet connection', 'gray');
  const [c1, c2] = dash.createColumns(2);
  const sServer = c1.createStat('Server', '—');
  const sVersion = c1.createStat('FishNet', '—');
  const sFraming = c1.createStat('Framing', '—');
  const sClient = c2.createStat('Client Id', '—');
  const sTicks = c2.createStat('Tick (server / client)', '—');
  const sPing = c2.createStat('Ping', '—');
  dash.createSection('Traffic');
  const pingChart = dash.createChart('Ping', { points: 40, suffix: ' ms', height: 48 });
  const [t1, t2] = dash.createColumns(2);
  const inChart = t1.createChart('Incoming packets/s', { type: 'bar', points: 30, height: 48 });
  const outChart = t2.createChart('Outgoing packets/s', { type: 'bar', points: 30, height: 48 });
  const [t3, t4] = dash.createColumns(2);
  const sIn = t3.createStat('Received', '—');
  const sOut = t4.createStat('Sent', '—');
  const sMods = dash.createStat('Modified / dropped / injected / errors', '—');

  let lastIn = 0, lastOut = 0;
  every(1000, () => {
    const s = st.stats;
    inChart.push(s.in.packets - lastIn);
    outChart.push(s.out.packets - lastOut);
    lastIn = s.in.packets; lastOut = s.out.packets;
    if (st.pingMs != null && st.connected) pingChart.push(st.pingMs);
  });
  every(500, () => {
    const s = st.stats;
    const prof = activeProfile();
    const passthrough = m.active && m.active.decodeDisabled;
    if (st.connected && passthrough) badge.setText(`Connected · FishNet ${st.fishnetVersion} not decodable (pass-through)`).setType('warn');
    else if (st.connected) badge.setText(`Connected · ${st.objects.size} objects · ${st.rpcLinks.size} rpc links`).setType('success');
    else if (st.confirmed) badge.setText('Disconnected').setType('warn');
    else badge.setText('Waiting for FishNet connection').setType('gray');
    sServer.setValue(st.url ? new URL(st.url, location.href).host : '—');
    sVersion.setValue(st.fishnetVersion || prof.version ? `${st.fishnetVersion || '?'}${FishNetConfig.assumeVersion ? ` (as ${prof.version})` : ''}${st.isServerDevelopment ? ' · dev server' : ''}` : '—');
    sFraming.setValue(st.framing ? `${st.framing}, MTU ${FishNetConfig.mtu}` : '—');
    sClient.setValue(st.connectionId ?? '—');
    sTicks.setValue(st.connected ? `${st.lastServerTick} / ${st.lastClientTick}` : '—');
    sPing.setValue(st.pingMs != null ? `${st.pingMs} ms` : '—');
    sIn.setValue(`${s.in.packets} pk · ${fmtBytes(s.in.bytes)}`);
    sOut.setValue(`${s.out.packets} pk · ${fmtBytes(s.out.bytes)}`);
    sMods.setValue(`${s.modified} / ${s.dropped} / ${s.injected} / ${s.errors}`);
  });

  // ======================================================== Players
  const players = ui.addTab('Players', { group: 'General', icon: Icons.players });
  players.createLabel('Players are the owning connections of spawned NetworkObjects. Positions come from NetworkTransform updates when the game uses it.');
  const playersTable = players.createTable(['Client', '', 'Objects', 'Prefabs', 'Position', 'Updated'], [], {
    height: 360,
    onRowClick: (row) => {
      objFilter = `owner ${row[0]}`;
      objList.setFilter(objFilter);
      ui.selectTab(objects);
    },
  });
  every(500, () => {
    if (ui.active !== players) return;
    playersTable.setRows(st.getClients().map((c) => [
      String(c.clientId), c.isLocal ? 'you' : '', String(c.objects.length),
      [...new Set(c.objects.map((o) => (o.prefabId != null ? o.prefabId : 'scene')))].join(', '),
      fmtVec(c.position), ago(c.lastUpdate),
    ]));
  });

  // ======================================================== Objects
  const objects = ui.addTab('Objects', { group: 'Network', icon: Icons.objects });
  let objFilter = '';
  const objList = objects.createListBox('Spawned NetworkObjects', [], (v) => showObject(v), { height: 190, search: true, save: false });
  const objCode = objects.createCodeBlock('Select an object.', { title: 'Details' });
  const showObject = (id) => {
    const o = st.objects.get(id);
    if (!o) { objCode.setCode('Object no longer spawned.'); return; }
    const rpcs = [...st.rpcStats.values()].filter((r) => r.objectId === id).map((r) => ({ key: r.key, count: r.count, lastSize: r.lastSize, name: st.registry.rpcs[r.key] || undefined }));
    objCode.setCode(JSON.stringify({ ...o, rpcActivity: rpcs }, jsonReplacer, 2));
  };
  every(1000, () => {
    if (ui.active !== objects) return;
    const sel = objList.getValue();
    const items = [...st.objects.values()].sort((a, b) => a.objectId - b.objectId).map((o) => ({
      text: `#${o.objectId} ${o.prefabId != null ? `prefab ${o.prefabId}` : `scene ${o.sceneId}`}${o.objectName ? ` ${o.objectName}` : ''} · owner ${o.ownerId}`,
      hint: o.position ? fmtVec(o.position) : '',
      value: o.objectId,
    }));
    const prevItems = objList.getItems();
    if (prevItems.length !== items.length || prevItems.some((v, i) => v !== items[i].value)) {
      objList.setItems(items);
      if (objFilter) objList.setFilter(objFilter);
      if (sel !== undefined) objList.setValue(sel, true);
    }
    if (sel !== undefined) showObject(sel);
  });

  // ======================================================== Packets
  const packets = ui.addTab('Packets', { group: 'Network', icon: Icons.packets });
  const [p1, p2] = packets.createColumns(2);
  p1.createToggle('Capture traffic', (v) => { FishNetConfig.capture = v; }, FishNetConfig.capture, { save: false });
  const pause = p2.createToggle('Freeze list', () => {}, false, { save: false });
  const [p3, p4] = packets.createColumns(2);
  const dirSel = p3.createDropdown(['Both', 'Incoming', 'Outgoing'], () => refreshPackets(true), { label: 'Direction', selected: 0, save: false });
  const typeSel = p4.createMultiSelect(PACKET_NAMES, () => refreshPackets(true), { label: 'Types', selected: [], save: false });
  const hideNoise = packets.createToggle('Hide PingPong / TimingUpdate / keep-alive', () => refreshPackets(true), true, { save: false });
  const pktList = packets.createListBox('Captured packets (newest last)', [], (seq) => showPacket(seq), { height: 210, search: true, save: false });
  const pktCode = packets.createCodeBlock('Select a packet.', { title: 'Decoded' });
  const pktHex = packets.createCodeBlock('', { title: 'Bytes' });
  const [b1, b2, b3] = packets.createColumns(3);
  b1.createButton('Clear', () => { m.clearCapture(); refreshPackets(true); });
  b2.createButton('Export capture', () => download(`fishnet-capture-${Date.now()}.json`, JSON.stringify(m.capture.map(summarizePacket), jsonReplacer, 2)));
  b3.createButton('Export room cache', () => {
    const r = MeowEngine.RoomInstance;
    download(`packet-cache-${Date.now()}.json`, JSON.stringify({ incoming: r.CachedIncomingPackets, outgoing: r.CachedOutgoingPackets }, jsonReplacer, 2));
  });

  const NOISE = new Set(['PingPong', 'TimingUpdate', 'BayouKeepAlive']);
  const showPacket = (seq) => {
    const e = m.capture.find((x) => x.seq === seq);
    if (!e) return;
    const p = e.packet;
    pktCode.setCode(JSON.stringify({
      seq: e.seq, direction: e.direction === 'in' ? 'server -> client' : 'client -> server', tick: e.tick, channel: channelName(e.channel),
      flag: e.flag || undefined, rpcKey: p.hash !== undefined || p.linkIndex !== undefined ? st.rpcKey(p) : undefined, ...packetToJSON(p),
    }, null, 2));
    pktHex.setCode(hexDump(p.raw || (p.args ?? p.data)));
  };
  let shownSeq = -1;
  const refreshPackets = (force) => {
    if (!force && (pause.getValue() || ui.active !== packets)) return;
    const last = m.capture.length ? m.capture[m.capture.length - 1].seq : 0;
    if (!force && last === shownSeq) return;
    shownSeq = last;
    const dir = dirSel.getValue();
    const types = new Set(typeSel.getValue());
    const items = [];
    for (let i = m.capture.length - 1; i >= 0 && items.length < 400; i--) {
      const e = m.capture[i];
      const n = e.packet.name;
      if (dir === 'Incoming' && e.direction !== 'in') continue;
      if (dir === 'Outgoing' && e.direction !== 'out') continue;
      if (types.size && !types.has(n)) continue;
      if (!types.size && hideNoise.getValue() && NOISE.has(n)) continue;
      items.push({
        text: `${n}${e.flag ? ` [${e.flag}]` : ''}`,
        icon: e.direction === 'in' ? Icons.incoming : Icons.outgoing,
        hint: `${describePacket(e.packet)}`.slice(0, 90),
        value: e.seq,
      });
    }
    items.reverse();
    const sel = pktList.getValue();
    pktList.setItems(items);
    if (sel !== undefined) pktList.setValue(sel, true);
  };
  every(500, () => refreshPackets(false));

  // ======================================================== RPC explorer
  const rpcTab = ui.addTab('RPC Explorer', { group: 'Network', icon: Icons.explorer });
  rpcTab.createLabel('Every RPC / RpcLink / SyncType / Broadcast seen, grouped by object prefab + component + hash. Click a row to name it; names are saved and shown in the packet list.');
  const rpcTable = rpcTab.createTable(['Dir', 'Kind', 'Target', 'Hash', 'Count', 'Last', 'Name'], [], {
    height: 300,
    onRowClick: async (row) => {
      const entry = rpcRows[row.__i];
      if (!entry) return;
      const current = entry.kind === 'Broadcast' ? st.broadcastName(entry.broadcastKey) : st.registry.rpcs[entry.key];
      const v = await ui.prompt(`Name for ${entry.key}`, { title: 'Name RPC', value: current || '' });
      if (v === null) return;
      if (entry.kind === 'Broadcast') st.nameBroadcastKey(entry.broadcastKey, v.trim() || undefined);
      else st.nameRpc(entry.key, v.trim());
      ui.notify('Saved', 'success');
    },
  });
  let rpcRows = [];
  const refreshRpc = () => {
    rpcRows = [...st.rpcStats.values()].sort((a, b) => b.count - a.count).slice(0, 200);
    rpcTable.setRows(rpcRows.map((r, i) => {
      const o = r.objectId != null ? st.objects.get(r.objectId) : null;
      const target = r.kind === 'Broadcast'
        ? `key 0x${r.broadcastKey.toString(16).padStart(4, '0')}`
        : `${o ? (o.prefabId != null ? `prefab ${o.prefabId}` : 'scene') : `obj ${r.objectId}`} c${r.componentIndex ?? '?'}`;
      const name = r.kind === 'Broadcast' ? st.broadcastName(r.broadcastKey) : st.registry.rpcs[r.key];
      const row = [r.direction === 'in' ? 'In' : 'Out', r.kind + (r.looksLikeNetworkTransform ? ' (NT)' : ''), target, r.hash ?? '', String(r.count), `${r.lastSize}b`, name || ''];
      row.__i = i;
      return row;
    }));
  };
  every(1000, () => { if (ui.active === rpcTab) refreshRpc(); });
  const [r1, r2, r3] = rpcTab.createColumns(3);
  r1.createButton('Name broadcast type', async () => {
    const t = await ui.prompt('C# type FullName of the broadcast struct (e.g. Game.Net.ChatBroadcast)', { title: 'Broadcast' });
    if (t) { const k = st.registerBroadcast(t.trim(), t.trim().split(/[.+]/).pop()); ui.notify(`key 0x${k.toString(16)}`, 'success'); }
  });
  r2.createButton('Export names', () => download('fishnet-names.json', JSON.stringify(st.registry, null, 2)));
  r3.createButton('Import names', async () => {
    const v = await ui.prompt('Paste names JSON', { multiline: true, title: 'Import' });
    if (!v) return;
    try {
      const d = JSON.parse(v);
      Object.assign(st.registry.rpcs, d.rpcs || {});
      Object.assign(st.registry.broadcasts, d.broadcasts || {});
      st.saveRegistry();
      ui.notify('Imported', 'success');
    } catch { ui.notify('Invalid JSON', 'error'); }
  });

  // ======================================================== Composer
  const comp = ui.addTab('Composer', { group: 'Network', icon: Icons.composer });
  comp.createLabel('Build and send a FishNet packet to the server. Arguments are hex in FishNet\'s serialisation format (use the Packets tab to copy real ones).');
  const kind = comp.createDropdown(['ServerRpc', 'Broadcast', 'Raw packet bytes'], () => {}, { label: 'Kind', selected: 0, save: false });
  const [k1, k2] = comp.createColumns(2);
  const k3 = comp;
  const cObj = k1.createNumberInput('Object Id', () => {}, { min: 0, max: 65535, value: 0, save: false });
  const cComp = k2.createNumberInput('Component', () => {}, { min: 0, max: 255, value: 0, save: false });
  const cHash = k3.createNumberInput('RPC hash', () => {}, { min: 0, max: 65535, value: 0, save: false });
  const cType = comp.createTextInput('Broadcast type FullName or key (0x…)', () => {}, { placeholder: 'Game.Net.ChatBroadcast', save: false });
  const cArgs = comp.createTextInput('Arguments / body (hex)', () => {}, { placeholder: '04 68 69', save: false });
  const cChan = comp.createRadioGroup('Channel', ['Reliable', 'Unreliable'], () => {}, { selected: 0, save: false });
  const showWhenKind = (h, kinds) => h.showWhen(kind, (v) => kinds.includes(v));
  [cObj, cComp, cHash].forEach((h) => showWhenKind(h, ['ServerRpc']));
  showWhenKind(cType, ['Broadcast']);
  comp.createButton('Send to server', () => {
    try {
      const channel = cChan.getValue() === 'Unreliable' ? 1 : 0;
      const body = parseHex(cArgs.getValue());
      const k = kind.getValue();
      let n;
      if (k === 'ServerRpc') n = FishNetClientInstance.serverRpc({ objectId: cObj.getValue(), componentIndex: cComp.getValue(), hash: cHash.getValue(), args: body, channel });
      else if (k === 'Broadcast') {
        const t = cType.getValue().trim();
        const key = /^0x[0-9a-f]+$/i.test(t) ? parseInt(t, 16) : /^\d+$/.test(t) ? +t : broadcastKey(t);
        n = FishNetClientInstance.broadcast(key, body, channel);
      } else {
        const id = body[0] | (body[1] << 8);
        n = FishNetClientInstance.send({ raw: body, opaque: true, id, name: 'Opaque', claimedName: packetIdName(id) }, { channel });
      }
      ui.notify(`Sent (${n} frame${n === 1 ? '' : 's'})`, 'success');
    } catch (e) {
      ui.notify(e.message, 'error');
    }
  });
  comp.createButton('Send PingPong', () => {
    try { FishNetClientInstance.ping(); ui.notify('Ping sent', 'info'); } catch (e) { ui.notify(e.message, 'error'); }
  });

  // ======================================================== Console
  const consoleTab = ui.addTab('Console', { group: 'System', icon: Icons.console });
  const log = consoleTab.createLog('MeowEngine', { max: 400, height: 380 });
  const hookLogger = () => {
    const L = MeowEngine.Log.Instance;
    if (!L || L.__odium) return;
    L.__odium = true;
    const map = { info: 'info', success: 'success', warn: 'warn', error: 'error', debug: 'info' };
    for (const [fn, type] of Object.entries(map)) {
      const orig = L[fn] && L[fn].bind(L);
      if (!orig) continue;
      L[fn] = (...a) => {
        try { log.log(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x, jsonReplacer))).join(' '), type); } catch { /* ignore */ }
        return orig(...a);
      };
    }
  };
  hookLogger();
  m.addListener('connected', (s) => log.log(`FishNet connected: ${s.url}`, 'success'));
  m.addListener('disconnected', (d) => log.log(`FishNet disconnected (${d.code})`, 'warn'));
  m.addListener('error', (d) => log.log(`${d.where}: ${d.error && d.error.message}`, 'error'));
  m.addListener('packet:Disconnect', () => log.log('Server sent Disconnect (kick)', 'error'));

  // ======================================================== Settings
  const set = ui.addTab('FishNet', { group: 'System', icon: Icons.sliders });
  set.createSection('Protocol');
  set.createLabel('Wire format is picked from the FishNet version the game announces (4.4.3 – 4.7.x supported) over the Bayou WebGL transport. Change these only if decoding shows errors.');
  set.createTextInput('Assume FishNet version', (v) => { FishNetConfig.assumeVersion = v.trim(); }, { placeholder: 'blank = from handshake, e.g. 4.6.5', value: FishNetConfig.assumeVersion, id: 'fn/assume' });
  set.createDropdown(['auto', 'bayou', 'raw'], (v) => { FishNetConfig.framing = v; }, { label: 'Framing (next connection)', selected: ['auto', 'bayou', 'raw'].indexOf(FishNetConfig.framing), id: 'fn/framing' });
  set.createNumberInput('MTU', (v) => { FishNetConfig.mtu = v; }, { min: 576, max: 65535, value: FishNetConfig.mtu, id: 'fn/mtu' });
  set.createDropdown(['1', '2'], (v) => { FishNetConfig.rpcHashSize = +v; }, { label: 'RPC hash size (bytes)', selected: FishNetConfig.rpcHashSize - 1, id: 'fn/hash' });
  const packNames = ['Unpacked', 'Packed', 'PackedLess'];
  set.createDropdown(packNames, (v) => { FishNetConfig.spawnRotationPacking = AutoPackType[v]; }, { label: 'Spawn rotation packing', selected: FishNetConfig.spawnRotationPacking, id: 'fn/rotpack' });
  set.createDropdown(['auto', 'yes', 'no'], (v) => { FishNetConfig.predictedSpawning = v === 'auto' ? 'auto' : v === 'yes'; }, { label: 'Predicted spawning ids', selected: 0, id: 'fn/predicted' });
  set.createToggle('Scene object details (dev server)', (v) => { FishNetConfig.sceneObjectDetails = v; }, FishNetConfig.sceneObjectDetails, { id: 'fn/scenedetails' });
  set.createToggle('Validate RPC lengths (dev build)', (v) => { FishNetConfig.validateRpcLengths = v; }, FishNetConfig.validateRpcLengths, { id: 'fn/validate' });
  set.createSection('Interception');
  set.createToggle('Decode traffic', (v) => { FishNetConfig.decode = v; }, FishNetConfig.decode, { id: 'fn/decode' })
    .setTooltip('Off = every frame is passed through without parsing (hooks stop running).');
  set.createToggle('Log incoming packets to console', (v) => { FishNetConfig.debugIncomingPackets = v; }, FishNetConfig.debugIncomingPackets, { id: 'fn/dbgin' });
  set.createToggle('Log outgoing packets to console', (v) => { FishNetConfig.debugOutgoingPackets = v; }, FishNetConfig.debugOutgoingPackets, { id: 'fn/dbgout' });
  set.createToggle('Cache incoming packets per room', (v) => { MeowEngine.Config.cacheIncomingPackets = v; }, MeowEngine.Config.cacheIncomingPackets, { id: 'fn/cachein' });
  set.createToggle('Cache outgoing packets per room', (v) => { MeowEngine.Config.cacheOutgoingPackets = v; }, MeowEngine.Config.cacheOutgoingPackets, { id: 'fn/cacheout' });
  set.createSection('Menu');
  const blocker = createInputBlocker();
  const blockToggle = set.createToggle('Block game input while menu is open', (v) => blocker.setEnabled(v), true, { id: 'menu/block' });
  set.createButton('Reset FishNet state', () => { st.reset(); ui.notify('State cleared', 'info'); });

  ui.addSettingsTab('Interface', { group: 'System', icon: Icons.monitor });

  // keep the input blocker in sync with window visibility
  const show = ui.show.bind(ui);
  const hide = ui.hide.bind(ui);
  ui.show = () => { show(); blocker.setActive(true); };
  ui.hide = () => { hide(); blocker.setActive(false); };
  blocker.setEnabled(blockToggle.getValue());
  blocker.setActive(true);

  ui.loadConfig('meowengine');
  if (ui._icon === 'M') ui.setWindowIcon(null); // placeholder logo saved by an earlier build
  ui.saveConfig = ((orig) => (name = 'meowengine') => orig.call(ui, name))(ui.saveConfig);
  ui.loadConfig = ((orig) => (name = 'meowengine') => orig.call(ui, name))(ui.loadConfig);
  window.addEventListener('beforeunload', () => ui.saveConfig());

  ui.selectTab(dash);
  ui.notify('MeowEngine loaded · Insert / V toggles the menu', 'info', 4000);
  return { ui, log, views: { objList, pktList, playersTable, rpcTable }, destroy: () => { timers.forEach(clearInterval); ui.destroy(); blocker.remove(); } };
}

/**
 * Transparent overlay that keeps clicks from reaching (and pointer-locking) the
 * game canvas while the menu is visible.
 */
function createInputBlocker() {
  const el = document.createElement('div');
  el.id = 'meowengine-input-blocker';
  el.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:transparent;display:none;';
  (document.body || document.documentElement).appendChild(el);
  let enabled = true, active = false;
  const paint = () => { el.style.display = enabled && active ? 'block' : 'none'; };
  return {
    setEnabled(v) { enabled = !!v; paint(); },
    setActive(v) {
      active = !!v;
      if (active && document.pointerLockElement) document.exitPointerLock?.();
      paint();
    },
    remove() { el.remove(); },
  };
}

export default createMeowMenu;
