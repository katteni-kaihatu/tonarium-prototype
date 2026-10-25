import { sourceText as uiSource } from '../i18n/core.ts';
import { msg as uiMsg } from '../i18n/core.ts';
import { KokosyncClient, type Value } from '../../../vendor/kokosync/index.js';
import type { AvatarState, RoomClientMsg, ServerMsg } from '../../../shared/protocol.ts';
import { importKey, MAX_PACKET, open, pack, PACKET_TOPIC, receiveBlob, seal, sealBytes, sendPacket, type Envelope, type SyncConfig } from '../../../shared/session-wire.ts';
import { POSITION_DIRECT_PEERS, POSITION_TOPIC, SessionPositions } from '../../../shared/session-position.ts';
import { SessionEvents } from '../../../shared/session-events.ts';
import { clampAvatar } from '../../../shared/places.ts';
import { get, set, showToast, worldKindOf } from '../store.ts';
import { resendViewing } from '../world/windows.ts';
import { applySessionSnapshot, onMessage, send } from './ws.ts';

let generation = 0;
let requestId = '';
let client: KokosyncClient | null = null;
let config: SyncConfig | null = null;
let key: CryptoKey | null = null;
let peerPositions: SessionPositions | null = null;
let peerEvents: SessionEvents | null = null;
let ready = false;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let deadline: ReturnType<typeof setTimeout> | undefined;
let statsTimer: ReturnType<typeof setInterval> | undefined;
let peerStatsTimer: ReturnType<typeof setInterval> | undefined;
let outgoing = Promise.resolve();
let incoming = Promise.resolve();
let incomingBytes = 0;
let incomingCount = 0;
let sendSeq = 0;
let receivedSeq = 0;
let positionSeq = 0;
let queuedBytes = 0;
let pending: RoomClientMsg[] = [];
const positions = new Map<string, number>();
const initialPositions = new Map<string, AvatarState>();

export function stopSessionSync(warn = false) {
  if (warn && (queuedBytes > 0 || pending.length > 0)) showToast(uiMsg("ui456"));
  generation++;
  clearTimeout(retryTimer); clearTimeout(deadline); clearInterval(statsTimer); clearInterval(peerStatsTimer);
  const old = client;
  peerPositions?.close(); peerPositions = null;
  peerEvents?.close(); peerEvents = null;
  client = null; config = null; key = null; ready = false; requestId = '';
  old?.close();
  pending = []; queuedBytes = 0; positions.clear(); initialPositions.clear();
  outgoing = Promise.resolve(); incoming = Promise.resolve();
  incomingBytes = 0; incomingCount = 0;
  set({ sync: 'off', syncError: null, syncTransport: null, syncRtt: null, syncStats: null, syncRoutes: [], syncPeerDelivery: false });
}

export function startSessionSync() {
  stopSessionSync();
  if (!get().session || !get().wsConnected) return;
  requestId = crypto.randomUUID();
  set({ sync: 'connecting' });
  send({ t: 'prepareSync', requestId, peerPositions: true, peerDelivery: true });
  const gen = generation;
  deadline = setTimeout(() => { if (gen === generation) failed(uiSource('ui457')); }, 60_000);
}

function failed(message: string) {
  const hadPending = queuedBytes > 0 || pending.length > 0;
  stopSessionSync();
  if (!get().session || !get().wsConnected) return;
  set({ sync: 'unavailable', syncError: message });
  if (hadPending) showToast(uiMsg("ui456"));
  retryTimer = setTimeout(startSessionSync, Math.min(8000, 500 * 2 ** Math.min(retry++, 4)));
}
export function syncError(id: string, message: string) { if (id === requestId) failed(message); }
export function resetSessionSync(sid: string) { if (sid === get().session) failed(uiSource('ui458')); }

export async function configureSessionSync(id: string, next: SyncConfig) {
  if (id !== requestId || next.sid !== get().session) return;
  const gen = generation;
  try {
    const encryptionKey = await importKey(next.key);
    let connection: KokosyncClient;
    try {
      connection = await KokosyncClient.connect({
        url: location.origin, room: next.room, peer: next.peer, timeout: 45_000, connectTimeout: 8000,
        offerUrl: '/sync/offer', offerHeaders: { 'X-Tonarium-Sync': next.token },
        routing: { enabled: true, maxPeers: POSITION_DIRECT_PEERS, peers: [] },
      });
    } catch {
      if (gen !== generation) return;
      connection = await KokosyncClient.connect({
        url: location.origin, room: next.room, peer: next.peer, timeout: 45_000, transport: 'websocket',
        websocketUrl: `/sync/ws?token=${encodeURIComponent(next.token)}`,
        routing: { enabled: true, maxPeers: POSITION_DIRECT_PEERS, peers: [] },
      });
    }
    if (gen !== generation) { connection.close(); return; }
    client = connection; config = next; key = encryptionKey;
    const peerTransport = next.positionKey ? new SessionPositions(connection, next, (id, state) => {
      if (gen !== generation) return;
      const s = clampAvatar(worldKindOf(get()), state);
      if (ready) onMessage({ t: 'avatar', sid: next.sid, id, s });
      else initialPositions.set(id, s);
    }) : null;
    peerPositions = peerTransport;
    const events = next.peerDelivery ? new SessionEvents(connection, next) : null;
    peerEvents = events;
    let routeStatus = '';
    const updateRoutes = (force = false) => {
      if (gen !== generation) return;
      const routes = peerTransport?.routes() ?? [];
      const status = routes.map((r) => `${r.peer}:${r.route}:${r.reason}`).join('|');
      if (force || status !== routeStatus) { routeStatus = status; set({ syncRoutes: routes }); }
    };
    sendSeq = 0; receivedSeq = 0; positionSeq = 0;
    set({ syncTransport: connection.transport, syncPeerDelivery: !!events });
    const receive = async (raw: unknown, from: string, latest = false) => {
      const p = raw as Envelope;
      if (gen !== generation || from !== next.server || p?.grant !== next.token) return;
      const apply = async () => {
        const result = await open(encryptionKey, next.token, latest ? 'server-position' : 'server', p);
        if (gen !== generation) return;
        if (latest) {
          const msg = result.value;
          if (msg?.t !== 'avatar' || msg.sid !== next.sid || typeof msg.id !== 'string') return;
          if ((positions.get(msg.id) ?? 0) >= result.seq) return;
          positions.set(msg.id, result.seq);
          if (ready) onMessage(msg);
          else initialPositions.set(msg.id, msg.s);
          return;
        }
        if (result.seq <= receivedSeq) return;
        receivedSeq = result.seq;
        if (result.value.kind === 'peers') {
          await peerTransport?.update(result.value.peers);
          events?.update(result.value.peers);
          updateRoutes(true);
        } else if (result.value.kind === 'peerCommit' && events) {
          const payload = await events.resolve(result.value);
          if (gen === generation && ready) onMessage(payload.message);
        } else if (result.value.kind === 'snapshot' && result.value.snapshot?.sid === next.sid) {
          applySessionSnapshot(result.value.snapshot);
          for (const [id, s] of initialPositions) onMessage({ t: 'avatar', sid: next.sid, id, s });
          initialPositions.clear();
          if (!ready) {
            ready = true; retry = 0; clearTimeout(deadline);
            set({ sync: 'connected', syncError: null });
            const s = get();
            roomSend({ t: 'mode', mode: s.mode });
            roomSend({ t: 'status', micOn: !!s.micOn[s.selfId], sharing: s.sharer === s.selfId });
            if (s.mode === '3d') roomSend({ t: 'avatar', s: s.selfAvatar });
            resendViewing();
            const buffered = pending; pending = [];
            for (const msg of buffered) roomSend(msg);
          }
        } else if (ready && result.value.kind === 'message') onMessage(result.value.message as ServerMsg);
      };
      if (latest) await apply();
      else {
        const size = pack(raw).length;
        if (incomingCount >= 256 || incomingBytes + size > MAX_PACKET * 2) {
          if (gen === generation) failed(uiSource('ui459'));
          return;
        }
        incomingBytes += size; incomingCount++;
        const task = incoming.then(apply); incoming = task.catch(() => {});
        try { await task; }
        finally { if (gen === generation) { incomingBytes -= size; incomingCount--; } }
      }
    };
    connection.on('message', (f) => { if (f.topic === PACKET_TOPIC) return receive(f.value, f.peer).catch(() => { if (gen === generation) failed(uiSource('ui460')); }); });
    connection.on('latest', (f) => {
      if (f.key?.startsWith(POSITION_TOPIC)) return peerTransport?.receive(f).catch(() => {});
      if (f.key?.startsWith(`${PACKET_TOPIC}:${next.slot}:`)) return receive(f.value, f.peer, true).catch(() => {});
    });
    connection.on('route', () => updateRoutes());
    connection.on('peer_message', (f) => events?.receive(f));
    connection.on('blob_open', (f) => receiveBlob(connection, f, (peer) => peer === next.server, receive).catch(() => { if (gen === generation) failed(uiSource('ui461')); }));
    connection.on('close', () => { if (gen === generation) failed(uiSource('ui462')); });
    connection.on('error', (error) => {
      // 退出通知より先に相手が中継から消えた場合、この位置更新だけを捨てる。
      if (!error.id && error.code === 'InvalidMessage' && error.message === 'duplicate or unknown recipient') return;
      if (gen === generation) failed(uiSource('ui463'));
    });
    roomSend({ t: 'sync' });
    statsTimer = setInterval(() => {
      const start = performance.now();
      void Promise.all([
        connection.ping().then(() => { if (gen === generation) set({ syncRtt: Math.round(performance.now() - start) }); }),
        connection.stats().then((stats) => { if (gen === generation) { set({ syncStats: stats }); updateRoutes(true); } }),
      ]).catch(() => { if (gen === generation) failed(uiSource('ui464')); });
    }, 5000);
    let previousRoutes = new Map((peerTransport?.routes() ?? []).map((r) => [`${r.peer}:${r.publisherEpoch}`, r]));
    let previousTime = performance.now();
    peerStatsTimer = setInterval(() => {
      if (gen !== generation) return;
      const now = performance.now();
      const seconds = (now - previousTime) / 1000;
      const routes = peerTransport?.routes() ?? [];
      const users = get().users;
      const rows = routes.map((r) => {
        const previous = previousRoutes.get(`${r.peer}:${r.publisherEpoch}`);
        const rate = (field: 'sentDirect' | 'receivedDirect' | 'sentRelay' | 'receivedRelay') =>
          seconds > 0 ? Math.round(Math.max(0, r[field] - (previous?.[field] ?? 0)) / seconds * 10) / 10 : 0;
        return {
          name: users.find((u) => u.id === r.user)?.name ?? r.user,
          peer: r.peer, route: r.route, reason: r.reason, directRttMs: r.rttMs,
          'p2pSend/s': rate('sentDirect'), 'p2pReceive/s': rate('receivedDirect'),
          'relaySend/s': rate('sentRelay'), 'relayReceive/s': rate('receivedRelay'),
          p2pSent: r.sentDirect, p2pReceived: r.receivedDirect,
          relaySent: r.sentRelay, relayReceived: r.receivedRelay,
        };
      });
      const delivery = connection.deliveryStats();
      const total = (route: 'direct' | 'relay', field: 'sentMessages' | 'receivedMessages') =>
        delivery.filter((r) => r.route === route && (r.kind === 'peer_message' || r.kind === 'peer_bulk')).reduce((sum, r) => sum + r[field], 0);
      console.groupCollapsed(`[kokosync:peers] ${new Date().toISOString()} · ${routes.length} peers · core=${connection.transport} · data P2P ${total('direct', 'sentMessages')}/${total('direct', 'receivedMessages')} · relay ${total('relay', 'sentMessages')}/${total('relay', 'receivedMessages')}`);
      console.table(rows);
      console.table(delivery.map((r) => ({
        name: users.find((u) => u.id === peerTransport?.routes().find((p) => p.peer === r.peer)?.user)?.name ?? (r.peer === next.server ? 'server' : r.peer),
        peer: r.peer, route: r.route, kind: r.kind, rttMs: r.rttMs, sentBytes: r.sentBytes, receivedBytes: r.receivedBytes,
        sentMessages: r.sentMessages, receivedMessages: r.receivedMessages, retries: r.retries,
        queuedMessages: r.queuedMessages, queuedBytes: r.queuedBytes, unackedMessages: r.unackedMessages, reason: r.reason,
      })));
      console.groupEnd();
      previousRoutes = new Map(routes.map((r) => [`${r.peer}:${r.publisherEpoch}`, r]));
      previousTime = now;
    }, 1000);
  } catch (e) { if (gen === generation) failed((e as Error).message); }
}

export function roomSend(msg: RoomClientMsg) {
  if (!get().session) return;
  if (!ready && msg.t !== 'sync') {
    if (['avatar', 'mode', 'status', 'viewing', 'emote'].includes(msg.t)) return;
    if (!requestId) { showToast(uiMsg("ui465")); return; }
    if (pending.length < 128 && pack(pending).length + pack(msg).length < 2 * 1024 * 1024) pending.push(msg);
    else showToast(uiMsg("ui465"));
    return;
  }
  const c = client, cfg = config, k = key, gen = generation;
  if (!c || !cfg || !k) return;
  if (msg.t === 'avatar') {
    if (peerPositions) { void peerPositions.send(msg.s).catch(() => {}); return; }
    const seq = ++positionSeq;
    void seal(k, cfg.token, 'client-position', seq, msg).then((p) => {
      if (gen === generation && seq === positionSeq) c.latest(PACKET_TOPIC, p as unknown as Value, BigInt(seq));
    }).catch(() => {});
    return;
  }
  const bytes = pack(msg);
  if (bytes.length > MAX_PACKET - 1024 || queuedBytes + bytes.length > MAX_PACKET * 2) {
    showToast(uiMsg("ui466")); return;
  }
  queuedBytes += bytes.length;
  outgoing = outgoing.then(async () => {
    if (gen !== generation) return;
    const state = get();
    const event = await peerEvents?.prepare(msg, { sid: cfg.sid, user: state.selfId, name: state.selfName,
      at: Date.now() + state.serverOffset, item: msg.t === 'itemAction' ? state.itemsBy[cfg.sid]?.[msg.id] : undefined });
    if (gen !== generation) return;
    const value = event ? pack({ t: 'peerOperation', event }) : bytes;
    await sendPacket(c, cfg.server, await sealBytes(k, cfg.token, 'client', ++sendSeq, value));
  }).catch(() => { if (gen === generation) failed(uiSource('ui467')); })
    .finally(() => { if (gen === generation) queuedBytes -= bytes.length; });
}

if (import.meta.hot) import.meta.hot.dispose(stopSessionSync);
