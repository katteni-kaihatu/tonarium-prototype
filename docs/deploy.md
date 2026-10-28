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

アプリ（`tonarium`）と LiveKit（`livekit`）の2サービスを定義する。NPC・GM は外部 KokoaAI に接続し、モデル取得・推論コンテナは起動しない。設定は下の「RPG のサーバー AI」を参照。

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

## RPG アカウントが HTTPS でも「安全な接続」を要求する場合

デスクトップ版も同じ Web サーバーへ接続する。HTTPS のドメインでホーム画面が開いても、TLS を終了したプロキシからアプリまでは HTTP のため、RPG アカウント側で転送元を信頼していないと `secure-connection-required` で拒否する。パスワードやクライアント側の設定で直す問題ではない。

Coolify の Docker Compose では、`tonarium` の環境変数に次を設定して再デプロイする。今回追加した Compose の参照で値をコンテナへ渡す。

- `FANTASY_TRUSTED_PROXY_IPS`: **アプリの接続元として見える実際のプロキシ IP、または CIDR 表記の帯域**。複数ならカンマ区切り。プロキシの IP がコンテナの再作成で変わる環境では、プロキシが接続する Docker ネットワークの帯域（例: `172.18.0.0/16`）を指定すれば、IP が変わっても設定を更新しなくてよい。帯域はプロキシが実際に使うプライベート帯域だけに絞り、`*` は指定しない。`0.0.0.0/0` のような全域指定は無効として扱われる。
- `FANTASY_TRUST_PROXY=1`: プロキシがアプリへループバックで接続する場合だけ使用する。この値だけでは Docker ブリッジを信頼しない。通常の別コンテナ構成では前項を設定する。

プロキシは外部の `Host` を維持し、信頼できる HTTPS 終端からの `X-Forwarded-Proto: https` をアプリへ渡す。任意のクライアントが送った転送ヘッダーをそのまま採用しない。Cloudflare など複数段の経路でも、実際の TLS 終端とアプリ直前のヘッダーを運営側で確認する。

設定後、認証 Cookie を付けずに `GET https://<公開ドメイン>/api/fantasy/account/status` を確認する。正常なら HTTP200 と `{"account":null}` が返る。HTTP403 の `secure-connection-required` が続くなら、実接続元 IP・コンテナに届いた環境変数・転送プロトコルを再確認する。`origin-denied` なら公開 Origin とアプリに届く Host/HTTPS の組合せを確認する。パスワード・Cookie・復旧コードを診断ログへ貼らない。

この変更は設定値を渡すだけで、実際のプロキシ IP を推測して自動許可しない。未設定のままマージ・再デプロイしても登録エラーは解消しない。詳細は [RPG アカウントの通信条件](fantasy-accounts.md) を参照。

参考: [Coolify の Compose 環境変数](https://coolify.io/docs/applications/configuration/environment-variables)、[Docker のコンテナ環境変数](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/)。

## RPG のサーバー AI

NPC・GM の自由会話は外部の OpenAI 互換 KokoaAI へ送る。標準 Compose は自前の推論・モデル取得サービスを起動せず、モデル用ボリュームも作らない。ブラウザ AI の同意画面・設定・モデル取得・端末間支援は利用しない。ゲームの言語選択は残す。

| 環境変数 | 値 | 用途 |
| --- | --- | --- |
| `KOKOAAI_BASEURL` | `https://chat.kokoa.dev/v1` | HTTPS の API ベース URL |
| `KOKOAAI_MODEL` | `lfm3-1.7b` | サーバーで公開されるモデル ID |
| `KOKOAAI_APIKEY` | 運営が保存する秘密値 | サーバーからの Bearer 認証。既定値なし |

すでに Coolify に保存済みなら再入力は不要。ただし、変数名を正確に合わせて再ビルド・再デプロイし、アプリコンテナに渡す。Dockerfile のみで配備する場合も同じ三変数をアプリへ渡す。API キーを Git、ブラウザ、VITE_ 変数、プレイヤーへの返信に含めない。旧 `NPC_LLM_*` の接続・移行設定は削除した。

リクエストは `/chat/completions` に送り、`model/messages/stream/max_tokens/temperature` に加えて `chat_template_kwargs: { enable_thinking: true }` を明示する。NPC・GM と運営の生成検査に同じ指定が入る。`cache_prompt` は送らない。KokoaAI がこの拡張をモデルに反映するかと実際の応答品質・速度は、マージ・再配備後のゲーム内試験で確認する。思考を使うモデルの余地を含めて出力上限を1536トークンとし、要求全体の45秒期限は維持する。SSE と JSON の両方を受信し、思考本文は表示しない。HTTPS の URL 内認証・クエリ・フラグメントを拒否し、リダイレクトには追従しない。

KokoaAI に接続できない場合は失敗を明示し、ブラウザ・他プレイヤー・旧ローカルモデルへ引き継がない。価格・現在値・秘密の公開範囲・行動承認・報酬などの権限はゲームサーバーが保持する。既存の確定案内を AI 生成したものと表示しない。診断記録の `source: local` は互換性上残した「サーバー生成」の識別子であり、コンテナ内でモデルを実行する意味ではない。

### 旧 AI コンテナの整理

Compose からサービスを削除しても、すでに動作中の旧コンテナやモデル保存ボリュームが自動削除されるとは限らない。運営側で対象プロジェクトの `fantasy-ai` と `fantasy-ai-model` だけを停止・削除する。不要な `fantasy-ai-models` ボリュームも、接続元がないことと正確な名前を確認してから削除できる。`tonarium-data` はプレイヤーの保存先なので削除しない。`docker compose down --volumes` を一括実行しない。

### 検証

`npm run test:kokoa-ai` は三言語の NPC・GM、認証ヘッダー、JSON/SSE、設定不備、401/429/503、期限と資格情報の非公開を合成応答で確認する。`npm run test:npc` は WebSocket からテスト用 HTTPS サーバーへ認証付きで到達する経路も検証する。テスト用自己署名証明書だけを子プロセスの追加 CA とし、TLS 検証自体は無効化しない。

運営コンテナで `npm run check:kokoa-ai` を実行すると設定と認証済みモデル一覧を検査し、`npm run check:kokoa-ai -- --generate` では三言語の合成会話も生成する。キーや生の上流エラーは表示しない。実サーバーの API キーはこの作業環境にないため、認証済みの本番生成確認とは別である。`https://chat.kokoa.dev/v1/models` への未認証の確認は401だった。配備後、実際の自由質問で応答・モデル名・診断ログを確認する。Web の `/healthz` 成功だけでは AI 生成成功にならない。

旧ローカルモデルの取得・推論・比較用 Dockerfile/Compose/起動スクリプトと CPU 実モデル CI は削除した。PR の検証ではモデルや運営キーを取得しない。過去の比較結果は [KokoaAI 会話の記録](local-npc.md#過去の比較記録) に整理する。

## 変更履歴の集約

Web の Vite ビルド時に、既存の共通履歴と作業別 JSON を自動集約する。Dockerfile の `npx vite build` でも同じ処理が動く。集約結果を入力へ書き戻さないため再デプロイでも重複しない。配置・形式・並び順は [変更履歴の開発ガイド](changelog.md) を参照。
