# 保存の仕組み

データは PostgreSQL、アップロードされた画像は S3 互換のストレージ（本番は Cloudflare R2）に置く。`data/` の JSON とファイルからは、次の段取りで移した（`feature/storage-auth` にまとめてから `develop` へ入れた）。

1. DB とストレージの土台（この文書の内容。入っている）
2. Misskey（misskey.resonite.love）でのログインとゲスト（[login.md](login.md)。入っている）
3. 人を名前ではなくアカウント ID で持つ（3a）。人とホームのデータを DB へ移す（3b）。残り（タイムライン・アイテム・ゲームの進み具合・いいね・通報）を DB へ移す（3c）。どれも入っている
4. 動画のアップロードと声のメッセージをなくす（4a）。画像をストレージへ移す（4b）。どちらも入っている

## 人はアカウント ID で持つ

- フォロー・DM の会話キー（`dm:<ID>:<ID>`）・既読・グループ（作った人・編集者・メンバー）・イベント（主催・参加表明）・作ったセッション（作った人・誘われた人）・タイムライン（作者・リアクション・リポスト）・ステータスと「来たら知らせる」・セッションのまとめ（いた人）・アイコン/アバター/自己紹介は、すべてアカウント ID で持つ（画像はストレージのキーに ID を入れる。下の「置いている画像」）
- 表示名とアイコンの版は、サーバーが送る名簿（`directory`。ログインした人の全員）とオンラインの `users` から引く。画面の `nameOf(id)`（`client/src/store.ts`）と `PersonFace` / `PersonName`（`client/src/home/common.tsx`）を使う。名前やアイコンが変わると、名簿の 1 人分が全員へ届く
- アイコン・アバター・自己紹介の取得は `/icon?id=`・`/avatar?id=`・`/avatar/params?id=`・`/profile?id=`
- 手元に覚えるブロック・個別の音量とミュートも ID（localStorage の `tonarium.blockedIds`・`tonarium.peerVolumeById`・`tonarium.peerMutedIds`。名前で覚えていた頃のものは読まない）
- 通信の約束事が変わったので `COMPAT_VERSION` を 8 に上げた
- 名前で持っていた頃のデータは引き継がない。最初の起動で、人に結び付く `data/*.json` とアイコンなどのフォルダを `data/archive-<日時>/` へ移し、印のファイル `data/.ids-v1` を置く（`server/index.ts` の `archiveNameKeyedData`）。共有アセット/システム・翻訳・ファンタジー RPG・AD のデータはそのまま（`media/` などディスクの画像は、画像をストレージへ移したときに消す。下の「置いている画像」）。サーバーを立てる前に ID 入りのデータを置くテストは、`server/test-db.ts` の `seedDevAccounts` でアカウントを作り、`markIdData` で印を置く

## DB に入っているもの

ファンタジー RPG のデータ（`fantasy*.json`）は、まだ `DATA_DIR` の JSON のまま（[fantasy-accounts.md](fantasy-accounts.md)）。AD 研究所のセーブとランキングも DB に入れず、`DATA_DIR/ad-access.json`（`server/ad-store.ts`。端末ごとのトークンと引き継ぎコードで、ログインのアカウントには結び付けない。[items.md](items.md)）。


| 表 | 中身 |
|---|---|
| `accounts`・`auth_sessions`・`login_pending` | ログイン（[login.md](login.md)） |
| `profiles` | アカウント ID ごとの自己紹介・ステータス・ひとこと・最近のひとこと・最後にいなくなった時刻 |
| `watches` | 来たら知らせる（待つ人 → 待たれる人） |
| `follows` | フォロー（向き付き） |
| `user_sessions`・`session_renames` | 画面から作ったセッションと、`sessions.json` のセッションの名前の変更 |
| `groups`・`events` | グループ（チャンネルは jsonb）とイベント |
| `messages`・`message_reads` | DM とチャンネルのメッセージ（中身は jsonb）と既読 |
| `posts` | タイムラインのポスト（中身は jsonb） |
| `session_items` | セッションに置いたアイテム（中身は jsonb） |
| `market_likes` | マーケットのいいね（商品 → アカウント ID） |
| `reports` | 通報 |
| `media_files` | ストレージの `media/` に置いた添付画像の名前・大きさ・時刻（合計の上限のため） |
| `account_images` | アカウントごとのアイコンとアバター画像のストレージのキー、アバターの調整値と版（ゲストも持つ） |
| `app_data` | 機能ごとに形が違うデータの汎用の表（下） |

## 汎用の表（app_data）

ゲームの進み具合のように、機能ごとに中身の形が違い、今後も増えるもの（UGC を想定）は、機能ごとに表を作らず `app_data(scope, key, account_id, data jsonb, updated_at)` に入れる。主キーは `(scope, key)`。人に結び付くものは `account_id` を入れ、アカウントを消すと一緒に消える。口は `server/db/app-data.ts`（`getAppData`・`listAppData`・`putAppData`・`removeAppData`）。新しいゲームやアイテムが自分のデータを持つときは、表を足さずにここへ scope を足し、下の一覧に書く。

| scope | key | data |
|---|---|---|
| `survivors.profile` | アカウント ID | サバイバーズのプロフィール（ポイント・強化・成績）。ゲストは書かない |

## 書き方

- サーバーは今までどおり、起動時に全部読んでメモリに持ち、メモリ側を正とする（`server/db/home-store.ts` の `loadPeopleAndHome`）。ハンドラーはメモリだけを読み書きする
- 変わったら DB へ書く。作ったセッション・グループ・イベント・プロフィール・フォロー・サバイバーズは、続けて変わっても 800 ミリ秒に 1 回へまとめ、その表を丸ごと 1 つのトランザクションで書き直す（行数は人数ぶん程度なので差分を追わない）。メッセージと既読は変わった会話・人の分、ポストは変わったものだけ書き直す。アイテムは 5 秒ごとに、変わったセッションの分を入れ替える。いいね・通報は、その場で 1 行ずつ書く
- 書き込みは `server/db/persist.ts` の 1 本の列に並べて順に流す。失敗はログに出して次へ進む。まとめて書くもの（アイテムも）は、成功するまで間をおいて同じ分を書き直す。その場で 1 行書くいいね・通報は書き直さない。終了時（SIGINT/SIGTERM）は、まとめ待ちの分も積んでから、列が空になるのを待って閉じる。強制終了されると、まとめ待ちの 800 ミリ秒分は失われることがある（書き終えた分はトランザクションで守られる）
- PostgreSQL の文字列と jsonb は NUL を入れられないので、書く前に取り除く（1 つでも混ざると同じトランザクションの書き込みが全部失敗するため）。DM の会話キーも NUL ではなく `:` で区切る

## PostgreSQL

- 接続先は `DATABASE_URL`。サーバーは起動時につなぎ、`drizzle/` のマイグレーションのうちまだ流していないものを流してから待ち受けを始める。つながらない・流せないときは理由を出して止まる（`server/index.ts` の末尾、`server/db/index.ts`）
- テーブルは `server/db/schema.ts`（Drizzle ORM）。中身は上の「DB に入っているもの」
- テーブルを変えるときは `schema.ts` を直し、`npm run db:generate` で `drizzle/` に SQL を作って一緒にコミットする。作った SQL とメタデータは手で直さない
- 手元：`npm run services` で `docker-compose.dev.yml` の PostgreSQL が立つ（ユーザー・パスワードとも `tonarium`、ポート 5432）。DB は `tonarium` と、dev-isolated 用の `tonarium_isolated`。中を見るときは `docker compose -f docker-compose.dev.yml exec postgres psql -U tonarium -d tonarium`。消して作り直すときは `npm run services:stop` のあと、ボリューム `tonarium-prototype_tonarium-dev-db` を消す
- 本番：`docker-compose.yml` の `postgres` サービス（ボリューム `tonarium-db`）。`db-backup` が 1 日 1 回 R2 へ `pg_dump` を送る。準備と戻し方は [deploy.md](deploy.md)

## ストレージ（S3 互換）

- `server/storage.ts` の `openStorage` が環境変数で置き場を決める。`S3_ENDPOINT` があれば S3（本番は Cloudflare R2、手元は `npm run services` の SeaweedFS）、無ければ `DATA_DIR/objects` に書く（テスト用）
- 口は `put(キー, 中身, 種類)`・`delete(キー)`・`url(キー)` の 3 つ。キーは推測できない ID で作る前提で、英小文字・数字・`-` と `/` 区切り、拡張子付きのものだけ受け付ける（ストレージの外を指すキーを作らせないため）
- 中身ごとにキーを変えるので、書くときに `Cache-Control: public, max-age=31536000, immutable` を付ける
- 手元の SeaweedFS は認証の設定を置いていないので、だれでも読み書きできる。`S3_CREATE_BUCKET=1` のとき起動時にバケットを作る。本番の R2 はバケットを先に作っておく
- S3 の設定が無いとき（テスト）は、`DATA_DIR/objects` のファイルをサーバーの `/objects/<キー>` が配る

### 置いている画像

| 画像 | キー | 読む URL |
|---|---|---|
| チャット・メッセージの添付とアイテムの画像 | `media/<UUID>.<拡張子>` | `/media/<UUID>.<拡張子>` |
| アイコン | `icons/<アカウント ID>/<版>.jpg` | `/icon?id=<アカウント ID>&v=<版>` |
| アバターの画像 | `avatars/<アカウント ID>/<版>.png`（か `.jpg`） | `/avatar?id=<アカウント ID>&v=<版>` |
| グループの画像 | `groups/<グループ ID>/<imageVersion>.jpg` | `/group-image/<グループ ID>?v=<imageVersion>` |
| タイムラインの写真 | `timeline/<画像 ID>.jpg` | `/timeline-image/<画像 ID>` |

- アイテムやメッセージに残すのは右の列の URL で、ストレージの URL（R2 の公開ドメイン）は残さない。サーバーはこれらの URL に 302 でストレージの URL を返し、ブラウザは中身をストレージから直接読む（ドメインを変えても保存したデータを直さずに済む）。版や ID が入った URL は中身が変わらないので、転送ごと長くキャッシュさせる
- 3D の板やアバターの画像は WebGL のテクスチャにするので、ストレージ側の CORS でアプリのオリジンからの GET を許す（[deploy.md](deploy.md) の「R2 の準備」）
- アイコン・アバター・グループの画像は、差し替えると新しいキーで置き、古いキーは消す。アバターの調整値は DB（`account_images.avatar_params`）にあり、`/avatar/params?id=` が返す
- タイムラインの写真は、ポストが消えると消す。上げたまま 1 時間ポストに使われなかったものも消す（サーバーを再起動するとこの追跡は消えるので、そのとき上げたばかりの分は残る）
- チャット・メッセージの添付とアイテムの画像（`media/`）は、大きさを DB の `media_files` に記録し、合計が 1GB を超えたら古いものから消す（記録とオブジェクトの両方。消えた画像を使うアイテムやメッセージは表示されなくなる）
- ディスク（`data/`）に置いていた頃の画像と動画は引き継がず、起動時に `media`・`icons`・`avatars`・`group-images`・`timeline-images` を消す

## テスト

- サーバーを起動する integration test は、`server/test-db.ts` の `testServerEnv(t)` でテストごとに `tonarium_test_<乱数>` という DB を作り、終わったら消す。`.env` の `DATABASE_URL` と `S3_*` は引き継がない（開発用のデータに書き込まないため）
- 使い捨ての DB を作る管理用の接続先は `TEST_DATABASE_URL`（既定は開発用の PostgreSQL）。CI（Web checks）は `services` で PostgreSQL を立ててそこを使う
- `npm run test:integration`（ログイン・ID・再起動しても DB から戻るか（アイコン・アバター・画像、添付画像の合計の上限を含む）・空のセッションの片付け・グループ・セッションのリンク・翻訳）と `npm run test:storage`（`S3_TEST_ENDPOINT=http://localhost:8333` を付けると SeaweedFS でも試す）
