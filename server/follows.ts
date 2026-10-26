/** フォローの向き付きの関係。お互いにフォローしているとフレンド */
export class Follows {
  private out = new Map<string, Set<string>>();

  constructor(edges: Iterable<readonly [string, string]> = []) {
    for (const [a, b] of edges) this.add(a, b);
  }

  /** 旧 friends.json（フレンドの組）を相互フォローとして読む */
  static fromFriendPairs(pairs: Iterable<readonly [string, string]>) {
    const f = new Follows();
    for (const [a, b] of pairs) { f.add(a, b); f.add(b, a); }
    return f;
  }

  has(a: string, b: string) { return !!this.out.get(a)?.has(b); }

  /** 変わったら true */
  add(a: string, b: string) {
    if (!a || !b || a === b || this.has(a, b)) return false;
    const s = this.out.get(a);
    if (s) s.add(b); else this.out.set(a, new Set([b]));
    return true;
  }

  remove(a: string, b: string) {
    const s = this.out.get(a);
    if (!s?.delete(b)) return false;
    if (!s.size) this.out.delete(a);
    return true;
  }

  following(a: string) { return [...(this.out.get(a) ?? [])]; }

  followers(b: string) {
    const out: string[] = [];
    for (const [a, s] of this.out) if (s.has(b)) out.push(a);
    return out;
  }

  isFriend(a: string, b: string) { return this.has(a, b) && this.has(b, a); }

  friendsOf(a: string) { return this.following(a).filter((b) => this.has(b, a)); }

  /** 配信 1 回ぶんの全員のフレンド */
  friendMap() {
    const map = new Map<string, string[]>();
    for (const [a, s] of this.out) {
      const l = [...s].filter((b) => this.has(b, a));
      if (l.length) map.set(a, l);
    }
    return map;
  }

  /** フレンドのフレンド（自分とフレンドは除く） */
  friendsOfFriends(a: string, friendMap = this.friendMap()) {
    const mine = friendMap.get(a) ?? [];
    const skip = new Set([a, ...mine]);
    const out = new Set<string>();
    for (const f of mine) for (const g of friendMap.get(f) ?? []) if (!skip.has(g)) out.add(g);
    return [...out];
  }

  edges(): [string, string][] {
    const out: [string, string][] = [];
    for (const [a, s] of this.out) for (const b of s) out.push([a, b]);
    return out;
  }
}
