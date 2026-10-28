import type { Group, SessionDef, User } from './protocol.ts';

export const GROUP_COLORS = ['#2F5FC4', '#C2662F', '#2E8A5A', '#8A3C9C', '#C23E6B', '#3E8FA8'];

/** セッションの公開範囲から、id の人に見えるか（人はすべてアカウント ID）。users はオンラインの全員 */
export function canSeeSession(s: SessionDef, id: string, friends: string[], groups: Group[], users: User[]) {
  const v = s.visibility ?? 'public';
  if (v === 'public' || s.owner === id || s.invited?.includes(id)) return true;
  if (v === 'invite') return false;
  if (v === 'group' || v === 'groupPlus') {
    const members = groups.find((g) => g.id === s.group)?.members ?? [];
    return members.includes(id) || (v === 'groupPlus' && members.some((m) => friends.includes(m)));
  }
  if (s.owner && friends.includes(s.owner)) return true;
  return users.some((u) => u.session === s.id && friends.includes(u.id));
}

/** フレンドの多い順、同じなら人数の多い順 */
export function sortByFriends(sessions: SessionDef[], friends: string[], users: User[]) {
  const count = (sid: string, f: (u: User) => boolean) => users.filter((u) => u.session === sid && f(u)).length;
  return [...sessions].sort((a, b) =>
    count(b.id, (u) => friends.includes(u.id)) - count(a.id, (u) => friends.includes(u.id)) || count(b.id, () => true) - count(a.id, () => true));
}

/** 「参加 OK」のフレンドがいるセッションを先に、次にフレンドの多い順 */
export function sortForHome(sessions: SessionDef[], friends: string[], users: User[]) {
  const joinMe = (sid: string) => users.some((u) => u.session === sid && friends.includes(u.id) && u.status === 'joinMe');
  return sortByFriends(sessions, friends, users).sort((a, b) => Number(joinMe(b.id)) - Number(joinMe(a.id)));
}
