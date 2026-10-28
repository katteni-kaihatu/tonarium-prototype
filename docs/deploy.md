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

アプリ（`tonarium`）、LiveKit（`livekit`）、RPG のモデル準備（`fantasy-ai-model`）、CPU 推論（`fantasy-ai`）の 4 サービスを定義する。モデル準備は検証完了後に終了する。必要資源は下の「RPG のサーバー AI」を参照。

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

標準 Compose は NPC・GM の自由会話用 CPU 推論サービスも起動する。ブラウザの AI サポートが使えない場合は、このサービスへ引き継ぐ。Windows 開発用の `scripts/start-local-npc.ps1` を Linux のアプリコンテナで実行する構成ではない。

`fantasy-ai-model` は既存の開発モデルと同じ Qwen3 1.7B Q8_0 を公式 Hugging Face の固定リビジョンから取得し、サイズ 1,834,426,016 バイトと SHA-256 を照合する。約 1.83 GB の初回取得には時間がかかる。検証前のファイルは公開せず、検証後に専用 `fantasy-ai-models` ボリュームへ確定する。再起動時は既存モデルを検証して再利用し、Git やアプリのビルド成果物には含めない。

`fantasy-ai` はダイジェスト固定の公式 llama.cpp CPU イメージ（b11913）で、モデルを読み取り専用で使う。ホストにはポートを公開せず、アプリは同じ Compose ネットワークの `http://fantasy-ai:8080/v1` へ接続する。`127.0.0.1:18081` は Tonarium コンテナ自身を指し、ホストや別コンテナのモデルへは届かない。

標準 Compose は内部移行先の `NPC_LLM_BUNDLED_URL` も固定で渡す。既存の `NPC_LLM_URL` に開発用の HTTP ループバック 18081 番が残っていても、NPC・GM は起動時に同梱サービスのアドレスへ自動移行する。対象は `127.0.0.1`・`localhost`・`[::1]` と既定 API パスだけで、別ホスト・別ポート・独自パスや HTTPS の設定は変更しない。明示的なプログラム側の URL 指定と既存の内部アドレス検証も維持する。サーバーに保存された環境変数を書き換える処理ではない。

アプリはモデル準備・推論完了を待つ依存関係を持たず、準備中も Web サーバーと固定案内を使える。AI 側の失敗時の再試行は 3 回まで。デプロイツールが全サービスの正常性を要求する場合、その判定は別途確認する。

### 資源と設定

GPU は不要だが CPU・メモリ・ディスクの余裕が必要である。推論の既定は CPU 上限 2 コア、メモリ上限 3 GiB、2 スレッド、同時枠 2、各枠 4096 トークン。準備コンテナは CPU 上限 1 コア・メモリ上限 256 MiB でストリーム取得する。空きディスクはモデル全体と 128 MiB の余裕が必要で、破損モデルを置き換える場合は既存分と別に確保する。

Linux では準備開始時の `/proc/meminfo` の `MemAvailable` が既定で 2304 MiB 未満なら中止してログに理由を出す。これは開始時点のホストの目安であり、その後の負荷や cgroup 内の余裕は保証しない。2 GiB 程度の小さな VPS にそのまま追加して動くことは保証しない。Tonarium・LiveKit・OS の分も含め、容量を確認すること。

| 環境変数 | 既定 | 用途 |
| --- | --- | --- |
| `NPC_AI_THREADS` | `2` | 推論・入力処理の CPU スレッド数 |
| `NPC_AI_CPU_LIMIT` | `2.0` | 推論コンテナの CPU 上限 |
| `NPC_AI_MEMORY_LIMIT` | `3g` | 推論コンテナのメモリ上限。小さすぎると起動に失敗する |
| `NPC_AI_MIN_AVAILABLE_MB` | `2304` | 準備開始時の最低 MemAvailable（MiB、256～65536）。下げる前に容量を確認する |
| `NPC_LLM_URL` | `http://fantasy-ai:8080/v1` | アプリが接続する内部 OpenAI 互換 API |
| `NPC_LLM_MODEL` | `qwen3-1.7b` | API のモデル名。同梱サービスでは既定名を使う |
| `NPC_LLM_BUNDLED_URL` | 標準 Compose が固定指定 | 旧開発用 URL の内部移行先。運営側での追加設定は不要 |

Coolify に旧開発用 URL が残っている場合も、標準 Compose の再デプロイで自動移行するため、手で削除・修正する必要はない。別の推論サービスへ上書きすることもできるが、同梱サービスを自動停止する設定ではない。別構成で不要な場合は `fantasy-ai` と `fantasy-ai-model` を起動対象から外す。Dockerfile のみのアプリ起動にはモデルサービスや移行先の目印は自動追加されず、既存の開発用設定を維持する。

### 運営側の確認

```bash
docker compose ps --all
docker compose logs --tail 100 fantasy-ai-model fantasy-ai
docker compose exec -T fantasy-ai curl --fail --silent http://127.0.0.1:8080/health
docker compose exec -T fantasy-ai curl --fail --silent http://127.0.0.1:8080/v1/models
```

モデル検証完了、推論の `/health` の HTTP200、`/v1/models` の `qwen3-1.7b` を確認する。アプリの `/healthz` は Web サーバーだけの確認で、AI の稼働を保証しない。アプリからの到達確認はコンテナ内で行う。次は会話や認証情報を送らず接続先ホスト・ポートと状態だけを表示する。

```bash
docker compose exec -T tonarium node --input-type=module -e '
const {resolveLocalInferenceUrl} = await import("./server/local-inference-config.ts");
const base = new URL(resolveLocalInferenceUrl());
console.log({host: base.hostname, port: base.port});
try {
  const r = await fetch(new URL("/health", base), {signal: AbortSignal.timeout(5000), redirect: "error"});
  console.log({healthStatus: r.status});
  if (!r.ok) process.exitCode = 1;
} catch (e) {
  console.log({error: e.cause?.code ?? e.name});
  process.exitCode = 1;
}'
```

`ECONNREFUSED` は待受なし、`ENOTFOUND` はサービス名・ネットワークの不一致、llama.cpp の HTTP503 はロード中などの未準備状態である。ゲームの検証では **AI サポートと「自分の質問をほかのプレイヤーの端末で処理することを許可」の両方をオフ** にして自由会話を試し、固定案内でなく診断記録の `source: local`（サーバー生成）が成功したことを確認する。サポートをオフにするだけでは支援を受け取る設定が残る。画面の「サーバー AI 使用」は経路の案内であり稼働確認ではない。

`npm run test:fantasy-ai-deploy` は小さな合成データによる取得・検証・中断・検査ランナーのテストで、本物のモデルは取得しない。Docker 対応検証機の `npm run check:fantasy-ai-container` は独立 Compose プロジェクトで AI の 2 サービスだけを起動し、実モデルの正常性・モデル名・三言語の合成プロンプトへの空でない応答を確認して後片付けする。プレイヤーデータは使わず、会話品質の採点ではない。PR の専用 GitHub Actions でも実行する。通常のビルド・合成テスト成功を、実モデルや本番ハードウェアでの成功と混同しないこと。

参考: [llama.cpp の Docker 構成](https://github.com/ggml-org/llama.cpp/blob/b11913/docs/docker.md)、[固定モデル](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/tree/90862c4b9d2787eaed51d12237eafdfe7c5f6077)、[ブラウザ AI](browser-ai-support.md)。

## 変更履歴の集約

Web の Vite ビルド時に、既存の共通履歴と作業別 JSON を自動集約する。Dockerfile の `npx vite build` でも同じ処理が動く。集約結果を入力へ書き戻さないため再デプロイでも重複しない。配置・形式・並び順は [変更履歴の開発ガイド](changelog.md) を参照。
