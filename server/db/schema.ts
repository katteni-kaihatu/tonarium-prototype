import { sql } from 'drizzle-orm';
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true });

/** ログインした人（misskey）・端末ごとのゲスト・開発用（dev、ログイン扱い） */
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: ['misskey', 'guest', 'dev'] }).notNull(),
  misskeyId: text('misskey_id').unique(),
  username: text('username'),
  displayName: text('display_name').notNull(),
  createdAt: at('created_at').notNull().defaultNow(),
  lastSeenAt: at('last_seen_at').notNull().defaultNow(),
});

/** Cookie のセッション。漏れても使えないようトークンはハッシュで持つ */
export const authSessions = pgTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  expiresAt: at('expires_at').notNull(),
}, (t) => [index('auth_sessions_account_idx').on(t.accountId)]);

/**
 * Misskey でのログイン（OAuth 2.0）の途中。session は OAuth の state。ログインを始めた端末だけが結果を受け取れるよう、ポーリング用の秘密をハッシュで持つ。
 * 別のブラウザで許可したときは、始めた画面に出した確認コードが入力されるまでアカウントを結び付けない
 */
export const loginPending = pgTable('login_pending', {
  session: uuid('session').primaryKey(),
  pollHash: text('poll_hash').notNull(),
  // 導入前から残っている途中のログインは空になり、どのコードとも一致しない（確認できずに期限で消える）
  codeHash: text('code_hash').notNull().default(''),
  codeAttempts: integer('code_attempts').notNull().default(0),
  /** Misskey で許可された人。確認が済むまでは accountId に結び付けない */
  misskeyUser: jsonb('misskey_user').$type<{ id: string; username: string; name: string | null }>(),
  /** Misskey から最初に戻ってきたブラウザに渡した確認用 Cookie のハッシュ。確認コードはこのブラウザからしか受けない */
  callbackHash: text('callback_hash'),
  /** PKCE の code_verifier。認可コードをトークンに替えるときにだけ使う（数分で消える途中の手続きなので平文で持つ） */
  verifier: text('verifier').notNull().default(''),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  expiresAt: at('expires_at').notNull(),
});

const ms = (name: string) => bigint(name, { mode: 'number' });
const ids = (name: string) => uuid(name).array().notNull().default(sql`'{}'::uuid[]`);

/** 人ごとの自己紹介とステータス。アイコンとアバターはファイル（あとでストレージへ） */
export const profiles = pgTable('profiles', {
  accountId: uuid('account_id').primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  bio: text('bio').notNull().default(''),
  status: text('status').notNull().default('online'),
  statusText: text('status_text').notNull().default(''),
  recent: jsonb('recent').$type<string[]>().notNull().default([]),
  lastSeen: ms('last_seen'),
  /** 本人が「ボットです」と申告しているか（AI エージェント等の表示用） */
  bot: boolean('bot').notNull().default(false),
});

/** 「来たら知らせる」。target が来たら watcher に知らせて消える */
export const watches = pgTable('watches', {
  watcher: uuid('watcher').notNull(),
  target: uuid('target').notNull(),
}, (t) => [primaryKey({ columns: [t.watcher, t.target] })]);

/** フォロー（向き付き）。お互いにフォローしているとフレンド */
export const follows = pgTable('follows', {
  follower: uuid('follower').notNull(),
  followee: uuid('followee').notNull(),
}, (t) => [primaryKey({ columns: [t.follower, t.followee] })]);

/** 画面から作ったセッション。sessions.json のものは入らない。ord は並び順 */
export const userSessions = pgTable('user_sessions', {
  id: text('id').primaryKey(),
  ord: integer('ord').notNull(),
  name: text('name').notNull(),
  topic: text('topic'),
  world: text('world'),
  visibility: text('visibility'),
  owner: uuid('owner'),
  groupId: text('group_id'),
  invited: ids('invited'),
});

/** sessions.json のセッションを画面から改名したときの名前（sessions.json は書き換えない） */
export const sessionRenames = pgTable('session_renames', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
});

export const groups = pgTable('groups', {
  id: text('id').primaryKey(),
  ord: integer('ord').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  owner: uuid('owner').notNull(),
  imageVersion: integer('image_version'),
  editors: ids('editors'),
  members: ids('members'),
  channels: jsonb('channels').$type<{ id: string; name: string }[]>().notNull(),
});

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  at: ms('at').notNull(),
  groupId: text('group_id'),
  sessionId: text('session_id'),
  owner: uuid('owner').notNull(),
  attendees: ids('attendees'),
  maybe: ids('maybe'),
  declined: ids('declined'),
});

/** DM とグループのチャンネルのメッセージ。中身（Message）は形が多いので jsonb のまま持つ */
export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  conv: text('conv').notNull(),
  at: ms('at').notNull(),
  data: jsonb('data').notNull(),
}, (t) => [index('messages_conv_at_idx').on(t.conv, t.at)]);

export const messageReads = pgTable('message_reads', {
  accountId: uuid('account_id').notNull(),
  conv: text('conv').notNull(),
  at: ms('at').notNull(),
}, (t) => [primaryKey({ columns: [t.accountId, t.conv] })]);

/** タイムラインのポスト。中身（Post）は jsonb のまま持つ */
export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  at: ms('at').notNull(),
  data: jsonb('data').notNull(),
});

/** セッションに置いたアイテム。中身（Item）は種類ごとに形が違うので jsonb のまま持つ */
export const sessionItems = pgTable('session_items', {
  sessionId: text('session_id').notNull(),
  itemId: text('item_id').notNull(),
  data: jsonb('data').notNull(),
}, (t) => [primaryKey({ columns: [t.sessionId, t.itemId] })]);

export const marketLikes = pgTable('market_likes', {
  product: text('product').notNull(),
  accountId: uuid('account_id').notNull(),
}, (t) => [primaryKey({ columns: [t.product, t.accountId] })]);

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  at: at('at').notNull().defaultNow(),
  fromAccount: uuid('from_account').notNull(),
  fromName: text('from_name').notNull(),
  target: text('target').notNull(),
  reason: text('reason').notNull(),
});

/**
 * 機能ごとに形が違い、今後も増えるデータ（ゲームの進み具合など。UGC を想定）を、機能ごとに表を作らずに入れる汎用の表。
 * scope は「機能.種類」（ad.save など）。人に結び付くものは account_id を入れ、アカウントを消したら一緒に消す
 */
export const appData = pgTable('app_data', {
  scope: text('scope').notNull(),
  key: text('key').notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull(),
  updatedAt: at('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.scope, t.key] })]);

/**
 * アカウントのアイコンとアバター（ゲストも持てる）。画像の中身はストレージにあり、ここにはそのキーを持つ。
 * キーは差し替えるたびに新しくし、古いキーのオブジェクトは消す
 */
export const accountImages = pgTable('account_images', {
  accountId: uuid('account_id').primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  icon: text('icon'),
  avatarImage: text('avatar_image'),
  avatarParams: jsonb('avatar_params'),
  /** 画像か調整値のどちらかが変わると新しくなる。画面はこれで読み直す */
  avatarVersion: text('avatar_version'),
});

/** ストレージの media/ に置いた添付画像。合計の大きさを見て、上限を超えたら古いものから消すために持つ */
export const mediaFiles = pgTable('media_files', {
  name: text('name').primaryKey(),
  size: integer('size').notNull(),
  at: at('at').notNull().defaultNow(),
});
