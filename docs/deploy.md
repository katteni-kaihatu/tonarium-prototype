# 公開・デプロイ

## インターネット越しにつなぐ（cloudflared）
cloudflared は `winget install Cloudflare.cloudflared` で入る。表示された `https://*.trycloudflare.com` を参加者に共有する。

テスト本番（ビルド済みを配信。安定）:
```bash
npm start
cloudflared tunnel --url http://localhost:3001
```

開発中にそのまま外から試す（コードの変更がすぐ反映される）:
```bash
npm run dev
cloudflared tunnel --url http://localhost:5173
```
`npm run dev` 中に 3001 をトンネルすると案内メッセージが出るだけなので、5173 に向けること。
手元の LiveKit（`ws://localhost:7880`）にはトンネル越しの人はつながらない（音声・映像は UDP で直接やりとりするため）。外の人と通話まで試すときは Coolify にデプロイするか、`.env` を LiveKit Cloud の値にする。
cloudflared 以外（ngrok など）を使う場合は、`.env` の `ALLOWED_HOSTS` にホストを足す（例: `ALLOWED_HOSTS=.trycloudflare.com,.ngrok-free.app`。保存すると開発サーバーが再起動する）。

## Coolify にデプロイする
リポジトリに `Dockerfile` と `docker-compose.yml` があるので、Coolify でそのまま動く。

アプリ（`tonarium`）と LiveKit（`livekit`）の 2 つのサービスが立つ。

1. サーバーのファイアウォール（VPS のセキュリティグループなど）で **TCP 7881・UDP 7882・UDP 3478** を開ける（LiveKit の音声・映像と TURN。Coolify の外の設定）
2. DNS で LiveKit 用のサブドメイン（例: `livekit.example.com`）をサーバーに向ける
3. Coolify で新しいリソースを作り、このリポジトリ（ブランチ）を選ぶ。ビルドパックは **Docker Compose**（`docker-compose.yml`）
4. 環境変数を設定する
   - `LIVEKIT_DOMAIN`: LiveKit 用のサブドメイン（`livekit.example.com`。`https://` は付けない）
   - `LIVEKIT_API_KEY`: 好きな文字列（例: `tonarium`）
   - `LIVEKIT_API_SECRET`: 32 文字以上のランダムな文字列（例: `openssl rand -base64 32` の結果）
   - `LIVEKIT_RTC_TCP_PORT` / `LIVEKIT_RTC_UDP_PORT` / `LIVEKIT_TURN_UDP_PORT`: 任意。LiveKit がホストに公開し、クライアントへ案内するポート（既定は 7881 / 7882 / 3478）。同じサーバーに 2 つ以上のインスタンスを立てるときだけ、インスタンスごとに別の値（例: 17881 / 17882 / 13478）にして、手順 1 のファイアウォールもその番号を開ける。ドメイン（手順 5）もインスタンスごとに分けること
   - `KOKOSYNC_URL`: データ同期先（既定は `https://45.77.130.146`）
   - `KOKOSYNC_USERNAME` / `KOKOSYNC_PASSWORD`: 同梱のプロトタイプ用認証情報を上書きする場合に設定する。両方とも空なら既定の接続先に限り同梱の値を使う
5. ドメインを設定する
   - `tonarium` サービス: アプリのドメイン（`SERVICE_FQDN_TONARIUM_3001` によりポート 3001 に転送。自動で付かなければ `https://<ドメイン>:3001` の形で指定）
   - `livekit` サービス: `https://<LIVEKIT_DOMAIN>:7880`（シグナリングの wss がここを通る）
6. デプロイ。`/healthz` がヘルスチェックに使われる。通話に入れないときは、ドックの上に出る理由と `livekit` サービスのログを見る

デプロイ中と更新の案内:
- 開いている人は、ホーム用 WebSocket が 5 秒以上切れていて、インターネットにはつながっているのに `/healthz` が通らない間、全面に「メンテナンス中です」が出る。つながり直すと自動で消える（`client/src/world/ServerNotices.tsx`）
- サーバーは `client/dist/index.html` のハッシュを画面の版として、配る `index.html` の `<meta name="tonarium-version">` と `snapshot` の `version` に入れる。つなぎ直した先の版がページの版と違うと、上部に更新通知とカウントダウン・即時更新・キャンセルが出る。画面のファイルが変わらないサーバーだけの変更では出ない。`npm run dev` では出ない。設定と更新後の復元範囲は [updates.md](updates.md) を参照

メモ:
- HTTP・ホーム用 WebSocket（`/ws`）・同期シグナリング（`/sync/offer`）・同期用 WebSocket（`/sync/ws`）・LiveKit トークン（`/token`）は同じポート。HTTPS は Coolify（Traefik）が付ける。`/sync/ws` も WebSocket Upgrade を許可する
- アイコン・3D アバター・自己紹介・フレンド・通報は `tonarium-data` ボリューム（`/app/data`）に保存されるので再デプロイしても残る。作ったセッション・グループ・イベント、アイテム、DM とチャンネルのメッセージ、ステータス、サバイバーズのプロフィール（ポイント・強化・成績、`data/survivors.json`）、マーケットのいいね（`data/market-likes.json`）も同じボリュームに残る。セッション内のチャットはメモリ内だけなので、再デプロイ・再起動で消える。インスタンスは 1 つで動かすこと（複数にすると部屋が分かれる）
- LiveKit の設定は `docker-compose.yml` の `LIVEKIT_CONFIG` にある。サーバーの外向きの IP は自動で調べる（`use_external_ip`）。社内ネットワークなど UDP が通らない人向けには TURN（既定 UDP 3478、`LIVEKIT_TURN_UDP_PORT` で変更可）も動く
- Tonarium サーバーは `KOKOSYNC_URL` の HTTPS/WSS に外向き接続する。ブラウザの WebRTC は kokosync サーバーの公開 UDP ポートにも届く必要がある。UDP が通らなければ同一オリジンの WebSocket 経由に切り替わる
- LiveKit Cloud に戻すときは、`livekit` サービスを消して `tonarium` の `LIVEKIT_URL` を Cloud の URL にする。データ同期には影響しない
- セッション構成を本番だけ変えたいときは、`docker-compose.yml` のコメントにある `SESSIONS_FILE` とボリュームを使う
- Dockerfile だけで使う場合（Coolify の Dockerfile ビルドパックや手元）:
  ```bash
  docker build -t tonarium .
  docker run --rm -p 3001:3001 -e LIVEKIT_URL=... -e LIVEKIT_API_KEY=... -e LIVEKIT_API_SECRET=... tonarium
  ```
  （この場合 LiveKit は別に用意する）

## 変更履歴の集約

Web の Vite ビルド時に、既存の共通履歴と作業別 JSON を自動集約する。Dockerfile の `npx vite build` でも同じ処理が動く。集約結果を入力へ書き戻さないため再デプロイでも重複しない。配置・形式・並び順は [変更履歴の開発ガイド](changelog.md) を参照。
