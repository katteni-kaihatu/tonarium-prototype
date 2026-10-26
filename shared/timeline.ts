import type { Mode } from './protocol.ts';
import { WORLD_KINDS, type WorldKind } from './worlds.ts';

export const POST_MAX_CHARS = 500;
export const POST_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
export const POST_MAX_COUNT = 1000;
export const POST_IMAGE_MAX_BYTES = 600_000;
/** 端末側で縮める長辺。サーバーの上限に収まる大きさにしておく */
export const POST_IMAGE_EDGE = 1280;
export const REACTIONS = ['👍', '❤️', '😂', '😍', '👀', '🎉', '👋', '☕', '✨', '📷', '🎮', '💯'] as const;

/** name は公開セッションのときだけ持つ。非公開のセッション名を全員へ配らないため */
export interface PostPlace { sid: string; name: string | null; mode: Mode }
export type PostAttach =
  | { kind: 'session'; id: string; name: string | null }
  | { kind: 'world'; id: WorldKind }
  | { kind: 'item'; id: string };
export interface Post {
  id: string;
  author: string;
  text: string;
  at: number;
  place?: PostPlace;
  image?: string;
  attach?: PostAttach;
  quote?: string;
  replyTo?: string;
  reactions: Record<string, string[]>;
  reposts: { name: string; at: number }[];
}

export type TimelineTab = 'home' | 'session' | 'social' | 'global';
export const TIMELINE_TABS: TimelineTab[] = ['home', 'session', 'social', 'global'];

/** タイムラインの 1 行。repostBy があればその人のリポストとして出す */
export interface TimelineEntry { post: Post; at: number; repostBy?: string }

export interface TimelineAudience { self: string; following: string[]; friends: string[]; fof: string[]; here: string[]; blocked: string[] }

export function audienceOf(tab: TimelineTab, a: TimelineAudience): ((name: string) => boolean) {
  if (tab === 'global') return () => true;
  const set = new Set<string>(tab === 'home' ? [a.self, ...a.following] : tab === 'social' ? [a.self, ...a.friends, ...a.fof] : a.here);
  return (name) => set.has(name);
}

/** 返信を除いたポストと、対象の人のリポストを新しい順に並べる。同じポストは一番新しい行だけ残す */
export function timelineEntries(posts: readonly Post[], tab: TimelineTab, a: TimelineAudience): TimelineEntry[] {
  const shown = audienceOf(tab, a);
  const blocked = new Set(a.blocked);
  const out = new Map<string, TimelineEntry>();
  const put = (e: TimelineEntry) => { const cur = out.get(e.post.id); if (!cur || cur.at < e.at) out.set(e.post.id, e); };
  for (const p of posts) {
    if (p.replyTo || blocked.has(p.author)) continue;
    if (shown(p.author)) put({ post: p, at: p.at });
    for (const r of p.reposts) if (r.name !== p.author && shown(r.name) && !blocked.has(r.name)) put({ post: p, at: r.at, repostBy: r.name });
  }
  return [...out.values()].sort((x, y) => y.at - x.at);
}

/** 返信の木を時系列で平らにする。depth は根への直接の返信が 0 */
export function threadOf(posts: readonly Post[], root: string): { post: Post; depth: number }[] {
  const children = new Map<string, Post[]>();
  for (const p of posts) if (p.replyTo) { const l = children.get(p.replyTo); if (l) l.push(p); else children.set(p.replyTo, [p]); }
  const out: { post: Post; depth: number }[] = [];
  const walk = (id: string, depth: number) => {
    for (const c of (children.get(id) ?? []).sort((x, y) => x.at - y.at)) { out.push({ post: c, depth }); walk(c.id, depth + 1); }
  };
  walk(root, 0);
  return out;
}

export const isReaction = (v: unknown): v is string => (REACTIONS as readonly string[]).includes(v as string);
export const isImageId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9-]{8,40}$/.test(v);

/** クライアントから来た添付を形だけ整える。セッションの可視性は呼び出し側で確かめる */
export function cleanAttach(v: unknown): PostAttach | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const a = v as Record<string, unknown>;
  if (typeof a.id !== 'string' || !a.id || a.id.length > 60) return undefined;
  if (a.kind === 'world') return (WORLD_KINDS as readonly string[]).includes(a.id) ? { kind: 'world', id: a.id as WorldKind } : undefined;
  if (a.kind === 'item') return /^[\w-]+$/.test(a.id) ? { kind: 'item', id: a.id } : undefined;
  if (a.kind === 'session') return { kind: 'session', id: a.id, name: null };
  return undefined;
}

/** 古すぎるもの・多すぎるものを落とす。残すポストに返信している先が消えたら返信も落とす */
export function prunePosts(posts: readonly Post[], now: number): Post[] {
  const fresh = posts.filter((p) => !(p.at < now - POST_KEEP_MS)).sort((x, y) => x.at - y.at).slice(-POST_MAX_COUNT);
  return withoutOrphans(fresh);
}

export function withoutOrphans(posts: readonly Post[]): Post[] {
  let list = [...posts];
  for (;;) {
    const ids = new Set(list.map((p) => p.id));
    const next = list.filter((p) => !p.replyTo || ids.has(p.replyTo));
    if (next.length === list.length) return next;
    list = next;
  }
}
