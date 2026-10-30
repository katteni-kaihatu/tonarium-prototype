import { and, eq, notInArray } from 'drizzle-orm';
import type { EventDef, Group, Message, SessionDef, StatusKind, Visibility } from '../../shared/protocol.ts';
import type { WorldKind } from '../../shared/worlds.ts';
import { db } from './index.ts';
import { stripNul } from './persist.ts';
import { events, follows, groups, messageReads, messages, profiles, sessionRenames, userSessions, watches } from './schema.ts';

export interface PersonRec { status: StatusKind; statusText: string; recent: string[]; lastSeen: number | null; watchers: string[]; bot: boolean }
export interface HomeData { sessions: SessionDef[]; groups: Group[]; events: EventDef[]; renamed: Record<string, string> }
export interface LoadedPeopleAndHome {
  home: HomeData;
  people: Record<string, PersonRec>;
  bios: Map<string, string>;
  follows: [string, string][];
  convs: Record<string, Message[]>;
  reads: Record<string, Record<string, number>>;
}

const record = <T>() => Object.create(null) as Record<string, T>;

/** 起動時に、人とホームのデータを全部読む（以後はメモリ側が正） */
export async function loadPeopleAndHome(): Promise<LoadedPeopleAndHome> {
  const d = db();
  const [profileRows, watchRows, followRows, sessionRows, renameRows, groupRows, eventRows, messageRows, readRows] = await Promise.all([
    d.select().from(profiles), d.select().from(watches), d.select().from(follows),
    d.select().from(userSessions).orderBy(userSessions.ord), d.select().from(sessionRenames),
    d.select().from(groups).orderBy(groups.ord), d.select().from(events).orderBy(events.at),
    d.select().from(messages).orderBy(messages.at), d.select().from(messageReads),
  ]);
  const people = record<PersonRec>();
  const bios = new Map<string, string>();
  for (const p of profileRows) {
    people[p.accountId] = { status: p.status as StatusKind, statusText: p.statusText, recent: p.recent, lastSeen: p.lastSeen, watchers: [], bot: p.bot };
    if (p.bio) bios.set(p.accountId, p.bio);
  }
  for (const w of watchRows) (people[w.target] ??= { status: 'online', statusText: '', recent: [], lastSeen: null, watchers: [], bot: false }).watchers.push(w.watcher);
  const convs = record<Message[]>();
  for (const m of messageRows) (convs[m.conv] ??= []).push(m.data as Message);
  const reads = record<Record<string, number>>();
  for (const r of readRows) (reads[r.accountId] ??= record<number>())[r.conv] = r.at;
  const renamed = record<string>();
  for (const r of renameRows) renamed[r.id] = r.name;
  return {
    people, bios, convs, reads,
    follows: followRows.map((f) => [f.follower, f.followee]),
    home: {
      renamed,
      sessions: sessionRows.map((s) => ({
        id: s.id, name: s.name,
        ...(s.topic !== null ? { topic: s.topic } : {}),
        ...(s.world !== null ? { world: s.world as WorldKind } : {}),
        ...(s.visibility !== null ? { visibility: s.visibility as Visibility } : {}),
        ...(s.owner !== null ? { owner: s.owner } : {}),
        ...(s.groupId !== null ? { group: s.groupId } : {}),
        invited: s.invited,
      })),
      groups: groupRows.map((g) => ({
        id: g.id, name: g.name, color: g.color, owner: g.owner, editors: g.editors, members: g.members, channels: g.channels,
        ...(g.imageVersion !== null ? { imageVersion: g.imageVersion } : {}),
      })),
      events: eventRows.map((e) => ({
        id: e.id, title: e.title, at: e.at, group: e.groupId, session: e.sessionId, owner: e.owner, attendees: e.attendees, maybe: e.maybe, declined: e.declined,
      })),
    },
  };
}

/** 消えた行を消し、残りを丸ごと書き直す（行数は人数ぶん程度なので差分を追わない）。1 つのトランザクションで行う */
export async function saveHome(input: HomeData) {
  const home = stripNul(input);
  await db().transaction(async (tx) => {
    const sessionIds = home.sessions.map((s) => s.id);
    await tx.delete(userSessions).where(sessionIds.length ? notInArray(userSessions.id, sessionIds) : undefined);
    for (const [ord, s] of home.sessions.entries()) {
      const row = { ord, name: s.name, topic: s.topic ?? null, world: s.world ?? null, visibility: s.visibility ?? null, owner: s.owner ?? null, groupId: s.group ?? null, invited: s.invited ?? [] };
      await tx.insert(userSessions).values({ id: s.id, ...row }).onConflictDoUpdate({ target: userSessions.id, set: row });
    }
    const groupIds = home.groups.map((g) => g.id);
    await tx.delete(groups).where(groupIds.length ? notInArray(groups.id, groupIds) : undefined);
    for (const [ord, g] of home.groups.entries()) {
      const row = { ord, name: g.name, color: g.color, owner: g.owner, imageVersion: g.imageVersion ?? null, editors: g.editors ?? [], members: g.members, channels: g.channels };
      await tx.insert(groups).values({ id: g.id, ...row }).onConflictDoUpdate({ target: groups.id, set: row });
    }
    const eventIds = home.events.map((e) => e.id);
    await tx.delete(events).where(eventIds.length ? notInArray(events.id, eventIds) : undefined);
    for (const e of home.events) {
      const row = { title: e.title, at: e.at, groupId: e.group, sessionId: e.session, owner: e.owner, attendees: e.attendees, maybe: e.maybe, declined: e.declined };
      await tx.insert(events).values({ id: e.id, ...row }).onConflictDoUpdate({ target: events.id, set: row });
    }
    await tx.delete(sessionRenames);
    const renames = Object.entries(home.renamed).map(([id, name]) => ({ id, name }));
    if (renames.length) await tx.insert(sessionRenames).values(renames);
  });
}

/** ステータス・自己紹介・来たら知らせる を書き直す */
export async function savePeople(rawPeople: Record<string, PersonRec>, rawBios: Map<string, string>) {
  const people = stripNul(rawPeople);
  const bios = new Map([...rawBios].map(([id, bio]) => [id, stripNul(bio)]));
  await db().transaction(async (tx) => {
    for (const id of new Set([...Object.keys(people), ...bios.keys()])) {
      const p = people[id];
      const row = { bio: bios.get(id) ?? '', status: p?.status ?? 'online', statusText: p?.statusText ?? '', recent: p?.recent ?? [], lastSeen: p?.lastSeen ?? null, bot: p?.bot ?? false };
      await tx.insert(profiles).values({ accountId: id, ...row }).onConflictDoUpdate({ target: profiles.accountId, set: row });
    }
    await tx.delete(watches);
    const rows = Object.entries(people).flatMap(([target, p]) => p.watchers.map((watcher) => ({ watcher, target })));
    if (rows.length) await tx.insert(watches).values(rows).onConflictDoNothing();
  });
}

export async function saveFollows(edges: [string, string][]) {
  await db().transaction(async (tx) => {
    await tx.delete(follows);
    if (edges.length) await tx.insert(follows).values(edges.map(([follower, followee]) => ({ follower, followee }))).onConflictDoNothing();
  });
}

/** 変わった会話だけ書き直す（会話ごとに最大 300 件なので、その会話の行を入れ替える） */
export async function saveConversations(convs: Record<string, Message[]>, changed: Iterable<string>) {
  await db().transaction(async (tx) => {
    for (const conv of changed) {
      const list = stripNul(convs[conv] ?? []);
      const keep = list.map((m) => m.id);
      await tx.delete(messages).where(keep.length ? and(eq(messages.conv, conv), notInArray(messages.id, keep)) : eq(messages.conv, conv));
      for (const m of list) await tx.insert(messages).values({ id: m.id, conv, at: m.at, data: m }).onConflictDoUpdate({ target: messages.id, set: { at: m.at, data: m } });
    }
  });
}

export async function saveReads(reads: Record<string, Record<string, number>>, changed: Iterable<string>) {
  await db().transaction(async (tx) => {
    for (const id of changed) {
      const mine = Object.entries(reads[id] ?? {});
      await tx.delete(messageReads).where(mine.length ? and(eq(messageReads.accountId, id), notInArray(messageReads.conv, mine.map(([c]) => c))) : eq(messageReads.accountId, id));
      for (const [conv, at] of mine) await tx.insert(messageReads).values({ accountId: id, conv, at }).onConflictDoUpdate({ target: [messageReads.accountId, messageReads.conv], set: { at } });
    }
  });
}

