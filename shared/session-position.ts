import type { AvatarState } from './protocol.ts';
import { validAvatarXR } from './xr-pose.ts';
import type { KokosyncClient, Frame, RouteEntry, Value } from '../vendor/kokosync/index.js';
import { importKey, open, seal, type PositionPeer, type SyncConfig } from './session-wire.ts';

export const POSITION_TOPIC = 'tonarium.position.v1';
export const POSITION_DIRECT_PEERS = 5;
export interface PositionRoute extends RouteEntry { user: string }

export class SessionPositions {
  private members = new Map<string, { peer: PositionPeer; key: CryptoKey | null; seq: number }>();
  private key: Promise<CryptoKey>;
  private sequence = 0;
  private revision = 0;
  private closed = false;

  constructor(private client: KokosyncClient, private config: SyncConfig,
    private apply: (id: string, state: AvatarState) => void) {
    if (!config.positionKey) throw new Error('Peer positions were not negotiated');
    this.key = importKey(config.positionKey);
  }

  async update(peers: PositionPeer[]) {
    const revision = ++this.revision;
    if (!Array.isArray(peers) || peers.length > 31) throw new Error('Invalid position membership');
    const entries = await Promise.all(peers.filter((p) => p.peer !== this.config.peer).map(async (peer) => {
      if (typeof peer.peer !== 'string' || typeof peer.user !== 'string' || typeof peer.grant !== 'string' ||
        !Number.isInteger(peer.slot) || peer.slot < 0 || peer.slot > 30 || peer.peer === this.config.server)
        throw new Error('Invalid position peer');
      const old = this.members.get(peer.peer);
      return [peer.peer, old?.peer.grant === peer.grant && old.peer.key === peer.key
        ? old : { peer, key: peer.key ? await importKey(peer.key) : null, seq: 0 }] as const;
    }));
    if (this.closed || revision !== this.revision) return;
    this.members = new Map(entries);
    this.client.setRouting({ enabled: true, maxPeers: POSITION_DIRECT_PEERS, peers: entries.filter(([, member]) => member.key).map(([peer]) => peer) });
  }

  async send(state: AvatarState) {
    const seq = ++this.sequence;
    const packet = await seal(await this.key, this.config.token, 'position', seq, { t: 'avatar', s: state });
    if (this.closed || seq !== this.sequence) return;
    const sendTo = (peer: string, key: string) => this.client.send('latest', {
      key, value: packet as unknown as Value, seq: BigInt(seq), to: [peer],
    });
    // サーバーは途中参加向けに覚え、旧クライアントへの変換だけを担当する。
    sendTo(this.config.server, `${POSITION_TOPIC}:server`);
    const present = new Set(this.client.routes().map((route) => route.peer));
    for (const member of this.members.values()) if (member.key && present.has(member.peer.peer))
      sendTo(member.peer.peer, `${POSITION_TOPIC}:${member.peer.slot}`);
  }

  async receive(frame: Frame) {
    if (this.closed || frame.key !== `${POSITION_TOPIC}:${this.config.slot}`) return;
    const member = this.members.get(frame.peer);
    if (!member?.key) return;
    const result = await open(member.key, member.peer.grant, 'position', frame.value);
    if (this.closed || this.members.get(frame.peer) !== member || result.seq <= member.seq || BigInt(result.seq) !== frame.seq) return;
    const s = result.value?.s;
    if (result.value?.t !== 'avatar' || !s || ![s.x, s.z, s.ry].every(Number.isFinite) ||
      (s.xr !== undefined && !validAvatarXR(s.xr)) ||
      (s.y !== undefined && !Number.isFinite(s.y)) || (s.pitch !== undefined && !Number.isFinite(s.pitch)) ||
      (s.lean !== undefined && !Number.isFinite(s.lean)) ||
      (s.crouching !== undefined && typeof s.crouching !== 'boolean') ||
      (s.jump !== undefined && (!Number.isSafeInteger(s.jump) || s.jump < 0)) ||
      (s.walking !== undefined && typeof s.walking !== 'boolean')) return;
    member.seq = result.seq;
    this.apply(member.peer.user, s);
  }

  routes(): PositionRoute[] {
    return this.client.routes().flatMap((route) => {
      const member = this.members.get(route.peer);
      return member ? [{ ...route, user: member.peer.user }] : [];
    });
  }

  close() { this.closed = true; this.members.clear(); }
}
