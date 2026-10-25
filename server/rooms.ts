import fs from 'node:fs';
import { WebSocket, WebSocketServer } from 'ws';
import { decode } from '@msgpack/msgpack';
import { PROTOTYPE_KOKOSYNC } from './kokosync-config.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { KokosyncClient, type Value } from '../vendor/kokosync/index.js';
import { isRoomClientMsg, type RoomClientMsg, type RoomServerMsg, type SessionSnapshot } from '../shared/protocol.ts';
import { base64, importKey, MAX_PACKET, open, pack, unpack, PACKET_TOPIC, receiveBlob, seal, sealBytes, sendPacket, type Envelope, type PositionPeer, type SyncConfig } from '../shared/session-wire.ts';
import { POSITION_TOPIC } from '../shared/session-position.ts';
import { eventHash, MISSING_TOPIC, RECOVERY_TOPIC, validPeerOperation, type PeerOperation } from '../shared/session-events.ts';

export const livekitRoom = (sid: string) => `${process.env.LIVEKIT_ROOM_PREFIX || 'tonarium'}-${sid}`;
export interface RoomHandlers { onMessage(sid: string, from: string, msg: RoomClientMsg, peerPositions: boolean, event?: PeerOperation): void }
interface Grant {
  config: SyncConfig; user: string; owner: WebSocket; key: CryptoKey; active: boolean; revoked: boolean;
  positionKey?: CryptoKey;
  sendSeq: number; received: number; positions: number;
  queued: number; output: Promise<void>; input: Promise<void>; reset(): void; sockets: Set<WebSocket>;
  recoveries: Map<string, { source: string; bytes: Uint8Array; at: number }>;
  recoveryBytes: number;
}
interface SendCommit { id: string; source: string; bytes: Uint8Array }
interface SessionRoom {
  client: KokosyncClient; room: string; peer: string; grants: Map<string, Grant>;
  blobQueue: Promise<void>; closed: boolean; latestSequence: number;
  operation?: { event: PeerOperation; source: string };
  operations: Set<string>;
}
const rooms = new Map<string, SessionRoom>();
const connecting = new Map<string, Promise<SessionRoom>>();
const grants = new Map<string, Grant>();
const instance = crypto.randomUUID();
const url = () => process.env.KOKOSYNC_URL || PROTOTYPE_KOKOSYNC.url;
function headers(): Record<string, string> {
  let username = process.env.KOKOSYNC_USERNAME, password = process.env.KOKOSYNC_PASSWORD;
  const file = process.env.KOKOSYNC_CREDENTIALS_FILE;
  if (file && (!username || !password)) {
    const text = fs.readFileSync(file, 'utf8');
    username = text.match(/^Username:\s*(.+)$/m)?.[1].trim();
    password = text.match(/^Password:\s*(.+)$/m)?.[1].trim();
  }
  if (!username && !password && new URL(url()).origin === PROTOTYPE_KOKOSYNC.url) {
    ({ username, password } = PROTOTYPE_KOKOSYNC);
  }
  return username && password ? { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` } : {};
}
function invalidate(g: Grant, notify = false) {
  if (g.revoked) return;
  g.revoked = true;
  grants.delete(g.config.token);
  for (const ws of g.sockets) ws.close(1000, 'Session ended');
  g.sockets.clear();
  g.recoveries.clear();
  g.recoveryBytes = 0;
  publishPeers(rooms.get(g.config.sid));
  if (notify) g.reset();
}
export function revokeSync(owner: WebSocket) {
  for (const g of grants.values()) if (g.owner === owner) invalidate(g);
}
export function revokeUserSync(id: string) {
  for (const g of grants.values()) if (g.user === id) invalidate(g);
}

export function ensureRoom(sid: string, handlers: RoomHandlers): Promise<SessionRoom> {
  const existing = rooms.get(sid);
  if (existing && !existing.closed) return Promise.resolve(existing);
  const pending = connecting.get(sid);
  if (pending) return pending;
  const task = connect(sid, handlers).finally(() => connecting.delete(sid));
  connecting.set(sid, task);
  return task;
}
async function connect(sid: string, handlers: RoomHandlers) {
  const name = `tonarium-${instance}-${sid}`;
  const peer = crypto.randomUUID();
  const client = await KokosyncClient.connect({
    url: url(), room: name, peer, transport: 'websocket', timeout: 45_000, routing: { enabled: false },
    peerDelivery: { lanes: 256 },
    websocketFactory: (u) => new WebSocket(u, { headers: headers(), maxPayload: 65536 }) as unknown as globalThis.WebSocket,
  });
  const r: SessionRoom = { client, room: name, peer, grants: new Map(), blobQueue: Promise.resolve(), closed: false, latestSequence: 0, operations: new Set() };
  const receive = async (packet: unknown, from: string, latest = false) => {
    const p = packet as Envelope;
    const g = r.grants.get(p?.grant);
    if (!g || g.revoked || g.config.peer !== from || g.owner.readyState !== WebSocket.OPEN) return;
    const apply = async () => {
      const peerPosition = latest && p.lane === 'position' && !!g.positionKey;
      const decoded = await open(peerPosition ? g.positionKey! : g.key, g.config.token,
        peerPosition ? 'position' : latest ? 'client-position' : 'client', p);
      if (g.revoked || decoded.seq <= (latest ? g.positions : g.received)) return;
      const msg = decoded.value;
      if (!msg || typeof msg.t !== 'string' || !isRoomClientMsg(msg) || (latest && msg.t !== 'avatar')) return;
      if (latest) g.positions = decoded.seq;
      else g.received = decoded.seq;
      if (msg.t === 'sync') { g.active = true; publishPeers(r); }
      if (!g.active) return;
      if (msg.t === 'peerOperation') {
        if (!g.config.peerDelivery || !validPeerOperation(msg.event) || msg.event.roll && msg.event.roll.by !== g.user) return;
        const id = `${g.user}:${msg.event.id}`;
        if (r.operations.has(id)) return;
        r.operations.add(id);
        if (r.operations.size > 4096) r.operations.delete(r.operations.values().next().value!);
        r.operation = { event: msg.event, source: g.config.peer };
        try { handlers.onMessage(sid, g.user, msg.event.command, false, msg.event); }
        finally { r.operation = undefined; }
      } else handlers.onMessage(sid, g.user, msg, peerPosition);
    };
    if (latest) await apply();
    else { const task = g.input.then(apply); g.input = task.catch(() => {}); await task; }
  };
  client.on('message', (f) => { if (f.topic === PACKET_TOPIC) return receive(f.value, f.peer).catch(() => {}); });
  client.on('latest', (f) => { if (f.key === PACKET_TOPIC || f.key === `${POSITION_TOPIC}:server`) return receive(f.value, f.peer, true).catch(() => {}); });
  client.on('blob_open', (f) => receiveBlob(client, f, (p) => [...r.grants.values()].some((g) => !g.revoked && g.config.peer === p), receive).catch(() => {}));
  client.on('peer_message', async (f) => {
    if (f.topic !== MISSING_TOPIC || typeof f.value?.id !== 'string' || typeof f.value?.source !== 'string') return;
    const g = [...r.grants.values()].find((g) => g.config.peer === f.peer && g.active && !g.revoked && g.config.peerDelivery);
    const recovery = g?.recoveries.get(`${f.value.source}:${f.value.id}`);
    if (!g || !recovery || Date.now() - recovery.at > 60_000) return;
    const packet = await seal(g.key, g.config.token, 'recovery', 1, { id: f.value.id, source: recovery.source, payload: unpack(recovery.bytes) });
    await client.sendTo(g.config.peer, RECOVERY_TOPIC, packet as unknown as Value).catch(() => invalidate(g, true));
  });
  client.on('error', () => client.close());
  client.on('close', () => {
    r.closed = true;
    if (rooms.get(sid) === r) rooms.delete(sid);
    for (const g of r.grants.values()) invalidate(g, true);
  });
  rooms.set(sid, r);
  return r;
}

export async function createSyncGrant(sid: string, user: string, owner: WebSocket, handlers: RoomHandlers, reset: () => void, current: () => boolean = () => true, peerPositions = false, peerDelivery = false): Promise<SyncConfig> {
  const r = await ensureRoom(sid, handlers);
  const token = crypto.randomUUID();
  const raw = base64(crypto.getRandomValues(new Uint8Array(32)));
  const key = await importKey(raw);
  const positionKey = peerPositions && r.client.capabilities.routeSignaling
    ? base64(crypto.getRandomValues(new Uint8Array(32))) : undefined;
  const importedPositionKey = positionKey ? await importKey(positionKey) : undefined;
  const usedSlots = new Set([...r.grants.values()].filter((g) => !g.revoked && g.owner !== owner).map((g) => g.config.slot));
  const slot = Array.from({ length: 31 }, (_, i) => i).find((i) => !usedSlots.has(i));
  if (slot === undefined) throw new Error('セッションが満員です');
  const config = { sid, room: r.room, peer: crypto.randomUUID(), server: r.peer, token, key: raw, slot, positionKey,
    peerDelivery: peerDelivery && !!r.client.capabilities.peerDelivery };
  const g: Grant = { config, user, owner, key, positionKey: importedPositionKey, reset, active: false, revoked: false,
    sendSeq: 0, received: 0, positions: 0, queued: 0, output: Promise.resolve(), input: Promise.resolve(), sockets: new Set(), recoveries: new Map(), recoveryBytes: 0 };
  if (owner.readyState !== WebSocket.OPEN || r.closed || !current()) throw new Error('セッション接続が閉じました');
  revokeSync(owner);
  for (const [key, old] of r.grants) if (old.revoked) r.grants.delete(key);
  r.grants.set(token, g);
  grants.set(token, g);
  return config;
}

function publishPeers(r: SessionRoom | undefined) {
  if (!r || r.closed) return;
  const active = [...r.grants.values()].filter((g) => !g.revoked && g.active);
  const peers: PositionPeer[] = active.map((g) => ({ peer: g.config.peer, user: g.user,
    grant: g.config.token, slot: g.config.slot, key: g.config.positionKey, delivery: g.config.peerDelivery }));
  const bytes = pack({ kind: 'peers', peers });
  for (const g of active) if (g.positionKey || g.config.peerDelivery) queue(r, g, bytes);
}

function queue(r: SessionRoom, g: Grant, bytes: Uint8Array, commit?: Promise<SendCommit | undefined>) {
  if (g.revoked || !g.active) return;
  if (g.queued + bytes.length > MAX_PACKET * 2) { invalidate(g, true); return; }
  g.queued += bytes.length;
  g.output = g.output.then(async () => {
    if (g.revoked) return;
    let wireBytes = bytes;
    // commit 判定は宛先によらないため、roomSend で一度だけ計算した結果を使い回す。
    const matched = commit && g.config.peerDelivery ? await commit : undefined;
    if (matched) {
      const old = g.recoveries.get(matched.id);
      if (old) g.recoveryBytes -= old.bytes.length;
      g.recoveries.set(matched.id, { source: matched.source, bytes, at: Date.now() });
      g.recoveryBytes += bytes.length;
      for (const [key, entry] of g.recoveries) {
        if (g.recoveryBytes <= MAX_PACKET && g.recoveries.size <= 128 && Date.now() - entry.at < 60_000) break;
        g.recoveries.delete(key); g.recoveryBytes -= entry.bytes.length;
      }
      wireBytes = matched.bytes;
    }
    const packet = await sealBytes(g.key, g.config.token, 'server', ++g.sendSeq, wireBytes);
    if (wireBytes.length > 48 * 1024) {
      // 部屋あたりの同時 Blob 数に余裕を残し、初回同期の集中を順番に処理する。
      const task = r.blobQueue.then(() => { if (!g.revoked) return sendPacket(r.client, g.config.peer, packet); });
      r.blobQueue = task.catch(() => {});
      await task;
    } else await sendPacket(r.client, g.config.peer, packet);
  }).catch(() => invalidate(g, true)).finally(() => { g.queued -= bytes.length; });
}

export function roomSend(sid: string, msg: RoomServerMsg, to?: string[], legacyPositionsOnly = false) {
  const r = rooms.get(sid);
  if (!r) return;
  const toSet = to ? new Set(to) : undefined;
  const recipients = [...r.grants.values()].filter((g) => !g.revoked && g.active && (!toSet || toSet.has(g.user)) &&
    (!legacyPositionsOnly || !g.positionKey));
  if (msg.t === 'avatar') {
    const source = [...r.grants.values()].find((g) => !g.revoked && g.user === msg.id);
    if (!source) return;
    // 平文の pack は宛先によらないため一度だけ行い、受信者ごとの処理は各自の鍵での暗号化だけにする。
    const bytes = pack(msg);
    for (const g of recipients) {
      const seq = ++r.latestSequence;
      void sealBytes(g.key, g.config.token, 'server-position', seq, bytes).then((packet) => {
        if (!g.revoked) r.client.latest(`${PACKET_TOPIC}:${g.config.slot}:${source.config.slot}`, packet as unknown as Value, BigInt(seq));
      }).catch(() => {});
    }
  } else {
    // この同期 pack には、呼び出し側 (survivors.ts の間引き送信など) が「呼び出し後に状態を変更しても
    // 送信内容に混ざらない」前提で複製を省略して依存している。pack を非同期化すると前提が崩れるので注意
    const bytes = pack({ kind: 'message', message: msg });
    const operation = r.operation;
    let commit: Promise<SendCommit | undefined> | undefined;
    if (operation && recipients.some((g) => g.config.peerDelivery)) {
      const { event, source } = operation;
      commit = eventHash(unpack(bytes)).then((hash) => hash === event.hash
        ? { id: `${source}:${event.id}`, source, bytes: pack({ kind: 'peerCommit', id: event.id, hash: event.hash, key: event.key, source }) }
        : undefined);
      // 宛先全員が失効して誰も結果を待たない場合に、未処理の rejection にしない。
      void commit.catch(() => {});
    }
    for (const g of recipients) queue(r, g, bytes, commit);
  }
}
export function roomSendSnapshot(sid: string, id: string, snapshot: SessionSnapshot) {
  const r = rooms.get(sid);
  if (!r) return;
  const bytes = pack({ kind: 'snapshot', snapshot });
  for (const g of r.grants.values()) if (g.user === id) queue(r, g, bytes);
}
export async function leaveRoom(sid: string) {
  const pending = connecting.get(sid);
  const r = rooms.get(sid) ?? (pending ? await pending.catch(() => undefined) : undefined);
  if (!r) return;
  for (const g of r.grants.values()) invalidate(g);
  r.client.close();
}
export async function shutdownRooms() { await Promise.all([...new Set([...rooms.keys(), ...connecting.keys()])].map(leaveRoom)); }

function authorized(token: string | undefined) {
  const g = token ? grants.get(token) : undefined;
  return g && !g.revoked && g.owner.readyState === WebSocket.OPEN ? g : undefined;
}
function sameOrigin(req: IncomingMessage) {
  if (!req.headers.origin) return false;
  try {
    const host = String(req.headers['x-forwarded-host'] ?? req.headers.host).split(',')[0].trim();
    return new URL(req.headers.origin).host === host;
  } catch { return false; }
}
export async function handleSyncOffer(req: IncomingMessage, res: ServerResponse) {
  const g = authorized(req.headers['x-tonarium-sync'] as string | undefined);
  if (req.method !== 'POST' || !sameOrigin(req) || !g) { res.writeHead(403).end(); return; }
  try {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 128 * 1024) { res.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    const response = await fetch(new URL('/offer', url()), {
      method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
      body: Buffer.concat(chunks), signal: AbortSignal.timeout(15_000),
    });
    res.writeHead(response.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(await response.text());
  } catch { res.writeHead(502).end('kokosync に接続できません'); }
}

const proxy = new WebSocketServer({ noServer: true, maxPayload: 65536 });
export function upgradeSync(req: IncomingMessage, socket: Duplex, head: Buffer) {
  const token = new URL(req.url!, 'http://local').searchParams.get('token') ?? undefined;
  const g = authorized(token);
  if (!g || !sameOrigin(req)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  proxy.handleUpgrade(req, socket, head, (downstream) => {
    const upstreamUrl = new URL('/ws', url());
    upstreamUrl.protocol = upstreamUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const upstream = new WebSocket(upstreamUrl, { headers: headers(), maxPayload: 65536 });
    g.sockets.add(downstream);
    g.sockets.add(upstream);
    let joined = false;
    downstream.pause();
    upstream.on('open', () => downstream.resume());
    downstream.on('message', (data, binary) => {
      if (!binary || g.revoked || upstream.readyState !== WebSocket.OPEN || upstream.bufferedAmount > 1024 * 1024) { downstream.close(1008); return; }
      if (!joined) {
        try {
          const frame = decode(data as Buffer) as Record<string, unknown>;
          if (frame.type !== 'join' || frame.room !== g.config.room || frame.peer !== g.config.peer) throw new Error();
          joined = true;
        } catch { downstream.close(1008); return; }
      }
      upstream.send(data, { binary: true });
    });
    upstream.on('message', (data) => {
      if (downstream.readyState !== WebSocket.OPEN) return;
      if (downstream.bufferedAmount > 1024 * 1024) { downstream.close(1013); return; }
      downstream.send(data, { binary: true });
    });
    const close = () => { g.sockets.delete(upstream); g.sockets.delete(downstream); upstream.close(); downstream.close(); };
    downstream.on('close', close); upstream.on('close', close);
    downstream.on('error', close); upstream.on('error', close);
  });
}
