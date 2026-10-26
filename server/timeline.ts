import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { POST_MAX_CHARS, cleanAttach, isImageId, isReaction, prunePosts, withoutOrphans, type Post, type PostAttach, type PostPlace } from '../shared/timeline.ts';

export interface PostInput { text?: unknown; image?: unknown; attach?: unknown; quote?: unknown; replyTo?: unknown }
/** セッションの添付や場所を、送った人に見えるものだけに絞って名前を決める（呼び出し側の可視性判定を使う） */
export interface PostContext { place: PostPlace | null; session: (id: string) => { name: string | null } | null }

/** アップロードだけされてポストに使われなかった画像を消すまでの猶予 */
const ORPHAN_IMAGE_MS = 60 * 60 * 1000;
/** 1 人がこの間にできる投稿（返信を含む）とアップロードの数。全体の件数上限で他人のポストを押し出させないため */
export const POST_RATE = { limit: 10, ms: 60 * 1000 };
export const UPLOAD_RATE = { limit: 10, ms: 10 * 60 * 1000 };

export class Timeline {
  posts: Post[];
  private changed: () => void;
  /** 画像 ID → 上げた人。上げた本人が 1 つのポストにだけ使える（他人の画像を付けて消させないため） */
  private uploads = new Map<string, string>();
  private hits = new Map<string, number[]>();

  constructor(private file: string, private imageDir: string, changed: () => void, now = Date.now()) {
    this.changed = changed;
    fs.mkdirSync(imageDir, { recursive: true });
    let raw: unknown = [];
    try { raw = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { /* まだ無い */ }
    this.posts = Array.isArray(raw) ? raw.filter((p): p is Post => !!p && typeof p === 'object' && typeof (p as Post).id === 'string') : [];
    for (const p of this.posts) { p.reactions ??= {}; p.reposts ??= []; }
    this.prune(now);
  }

  serialize() { return JSON.stringify(this.posts); }

  imageFile(id: string) { return path.join(this.imageDir, `${id}.jpg`); }

  newImageId() { return randomUUID(); }

  registerUpload(id: string, name: string) { this.uploads.set(id, name); }

  /** key ごとに直近 ms の回数を数え、limit 未満なら数えて true */
  allow(key: string, rate: { limit: number; ms: number }, now = Date.now()) {
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - rate.ms);
    if (recent.length >= rate.limit) { this.hits.set(key, recent); return false; }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  find(id: unknown) { return typeof id === 'string' ? this.posts.find((p) => p.id === id) : undefined; }

  create(author: string, input: PostInput, ctx: PostContext, now = Date.now()): Post | null {
    const text = String(input.text ?? '').trim().slice(0, POST_MAX_CHARS);
    const image = isImageId(input.image) && this.uploads.get(input.image) === author && fs.existsSync(this.imageFile(input.image)) ? input.image : undefined;
    let attach: PostAttach | undefined = cleanAttach(input.attach);
    if (attach?.kind === 'session') {
      const s = ctx.session(attach.id);
      attach = s ? { ...attach, name: s.name } : undefined;
    }
    const quote = this.find(input.quote)?.id;
    const replyTo = this.find(input.replyTo)?.id;
    if (!text && !image && !attach && !quote) return null;
    const post: Post = { id: randomUUID().slice(0, 12), author, text, at: now, reactions: {}, reposts: [] };
    if (ctx.place) post.place = ctx.place;
    if (image) { post.image = image; this.uploads.delete(image); }
    if (attach) post.attach = attach;
    if (quote) post.quote = quote;
    if (replyTo) post.replyTo = replyTo;
    this.posts.push(post);
    this.changed();
    return post;
  }

  /** 消えたポストの ID（返信も一緒に消える） */
  remove(id: unknown, by: string): string[] {
    const p = this.find(id);
    if (!p || p.author !== by) return [];
    return this.replace(withoutOrphans(this.posts.filter((x) => x !== p)));
  }

  react(id: unknown, name: string, emoji: unknown, on: boolean): Post | null {
    const p = this.find(id);
    if (!p || !isReaction(emoji)) return null;
    const list = p.reactions[emoji] ?? [];
    const has = list.includes(name);
    if (has === on) return null;
    const next = on ? [...list, name] : list.filter((n) => n !== name);
    if (next.length) p.reactions[emoji] = next; else delete p.reactions[emoji];
    this.changed();
    return p;
  }

  repost(id: unknown, name: string, on: boolean, now = Date.now()): Post | null {
    const p = this.find(id);
    if (!p || p.replyTo) return null;
    const has = p.reposts.some((r) => r.name === name);
    if (has === on) return null;
    p.reposts = on ? [...p.reposts, { name, at: now }] : p.reposts.filter((r) => r.name !== name);
    this.changed();
    return p;
  }

  /** 期限切れ・件数超過を落とし、消えた ID を返す */
  prune(now = Date.now()): string[] {
    return this.replace(prunePosts(this.posts, now));
  }

  /** どのポストにも使われていない古い画像を消す */
  sweepImages(now = Date.now()) {
    const used = new Set(this.posts.flatMap((p) => (p.image ? [p.image] : [])));
    let names: string[] = [];
    try { names = fs.readdirSync(this.imageDir); } catch { return; }
    for (const f of names) {
      const id = f.replace(/\.jpg$/, '');
      if (used.has(id)) continue;
      const file = path.join(this.imageDir, f);
      try {
        if (fs.statSync(file).mtimeMs < now - ORPHAN_IMAGE_MS) { fs.rmSync(file, { force: true }); this.uploads.delete(id); }
      } catch { /* 消えていてもよい */ }
    }
  }

  private replace(next: Post[]): string[] {
    if (next.length === this.posts.length) return [];
    const keep = new Set(next.map((p) => p.id));
    const gone = this.posts.filter((p) => !keep.has(p.id));
    this.posts = next;
    for (const p of gone) if (p.image) fs.rmSync(this.imageFile(p.image), { force: true });
    this.changed();
    return gone.map((p) => p.id);
  }
}
