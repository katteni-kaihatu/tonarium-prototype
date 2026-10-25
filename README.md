<p align="center"><img src="client/public/brand/logo.png" alt="Tonarium" width="360"></p>

# Tonarium Prototype

2D（リスト・ウィンドウ・チャット・通話・配信視聴）と 3D（空間）を同じワールドのまま行き来できる体験検証用プロトタイプ。本番では捨てる前提。

## 構成
- `client/` Vite + React + TypeScript。3D は React Three Fiber。状態は zustand
  - `client/src/world/` ワールド画面（左のプレイヤー・アイテム、上の顔、右の通知・ログ、下のドック、背面のウィンドウ）
  - `client/src/home/` ホーム画面（セッション外。セッション・フレンド・イベント・グループ・ワールド・アイテムの一覧と作成）
- `server/` Node + ws + kokosync。オンラインのユーザーと、セッションごとの状態（チャット・アイテム・アバター位置）を保持する。セッション内のデータ同期は kokosync、フレンド・DM・ホームは従来の WebSocket（[docs/sync.md](docs/sync.md)）。LiveKit の通話トークンも発行。画面から作ったセッション・グループ・イベントは `data/home.json` に保存
- `shared/protocol.ts` アプリのメッセージ型、`shared/session-wire.ts` MessagePack と同期パケット、`shared/session-position.ts` 位置配送、`shared/session-events.ts` P2Pでの本文配送とサーバー確定後の適用、`shared/places.ts` 位置と距離（クライアントとサーバーで共用）
- `sessions.json` 最初からあるセッションの構成（各セッションが最初に読み込むワールド＝ 3D 空間も指定）。ホームの「セッションを作る」で増やしたものは `data/home.json`
- `shared/worlds.ts` ワールドの種類（ホール・カフェ・ゲーム・宵闇サバイバーズ・街・ガーデン）と家具の当たり判定。見た目は `client/src/view3d/worlds3d.tsx`。街の配置と電車・エレベーターは `shared/city.ts`
- `client/public/brand/` ロゴ・ファビコン・OGP 画像。OGP の絶対 URL は、サーバーが `index.html` を返すときにアクセスされたドメインで埋める（`__ORIGIN__`）
- 音声・画面共有は LiveKit。本番は Coolify で自前の `livekit-server` を一緒に動かし、手元では Docker で開発用の LiveKit を動かす。データ同期は独立した kokosync 接続を使う

詳しい仕組みと使い方は [docs/](docs/) にある。

## Electron 版

Web 版と同じ 2D・3D・ゲームを専用ウィンドウで利用する別アプリ。サーバーに配信された Web 版の更新に追従する。Linux / Windows のビルドとインストールは [Electron 版](docs/electron.md) を参照。

## Linux ネイティブ版

Linux x86_64版のビルド・インストール・AUR用PKGBUILDは [Linux ネイティブ版](docs/native-linux.md) を参照。2DはAvalonia、3DはUnity Linuxプレイヤーを使用する。

## Windows ネイティブ版

`native/` に Avalonia の 2D クライアントと Unity の 3D クライアントがある。同じサーバーとセッションに接続する。2DはWeb版と共通の画像・アイコン・フォントを使用し、お絵描きアバターもネイティブでアニメーション表示する。起動は `powershell -ExecutionPolicy Bypass -File native/run-desktop.ps1`。初回は .NET 10 SDK が必要。3D のビルド、配布、確認状況は [Windows ネイティブ版](docs/native-windows.md) を参照。

Windows版はローカルでビルドしたZIPをGit LFSでコミットし、`v0.0.1` のようなタグのpushでGitHub ActionsからReleaseへ添付する。[ビルドとリリース手順](docs/native-release.md)。

## セットアップ
```bash
npm install
cp .env.example .env   # 手元の LiveKit（devkey / secret）を使う設定になっている
npm run livekit        # 開発用の LiveKit を Docker で起動（Docker Desktop が必要。止めるときは npm run livekit:stop）
```
接続先 `https://45.77.130.146` とプロトタイプ用の Basic 認証情報はサーバー側に同梱している。変更する場合は `.env` の `KOKOSYNC_URL` と `KOKOSYNC_USERNAME` / `KOKOSYNC_PASSWORD` を設定する。ブラウザには認証情報を配らず、Tonarium サーバーを経由して接続する。ローカルの認証ファイルを指定する方法と通信の上限は [docs/sync.md](docs/sync.md) を参照。

LiveKit が動いていなくても、kokosync につながればチャット・アイテム・位置は同期する。通話・映像の接続状態はドックの上に別表示する。
LiveKit Cloud を使う場合は `.env` の `LIVEKIT_*` をそのプロジェクトの値にする。

## 開発
```bash
npm run dev
```
修正・文書更新・保守を含む全タスクで、`shared/changelog.ts` の `CHANGELOG` 配列の先頭に、今回実際に行った変更の日付・見出し・本文を持つ新規項目を追記する。既存項目は残し、新しい順に保つ。過去履歴の補完は不要。記載内容と実際の差分が一致することをレビューの受け入れ条件とする。

タスク完了前に `npm run check:completion` を実行する。履歴チェック、型チェック、ビルドの順で実行し、失敗したら完了にしない。履歴チェックだけなら `npm run check:changelog`、チェックの回帰テストは `npm run test:changelog`。比較元は既定で `git merge-base HEAD origin/main` とし、コミット済み・ステージ済み・未ステージの変更を含む現在のファイルと比較する。別のブランチから始めたタスクなどは、開始時に記録した比較元コミットを `CHANGELOG_BASE` に設定して完了チェックを実行するか、`npm run check:changelog -- --base <比較元コミット>` で確認してから型チェックとビルドを実行する。比較元が取得できない場合も失敗するため、必要な Git 履歴を取得する。

既存項目の編集・削除・並べ替え・書式変更・複製だけでは履歴チェックは成功しない。新規項目は先頭に置き、既存項目の内容と順序を保つ。追記漏れの場合は表示された案内に従い、`shared/changelog.ts` の先頭に今回の実施内容を追加して再実行する。既存項目の編集・削除・並べ替えがあれば元に戻す。内容の一致は自動判定しないため、レビューで差分と照合する。

`main` 宛ての全 PR はファイル種別による除外なしで GitHub Actions の Web checks を実行する。PR の比較元コミットからの新規履歴、型チェック、ビルド、クライアント・同期テストを確認する。手動実行では対象コミットの親を比較元にする。Discord のフィードバックから作った PR も同じチェックを通してからマージする。
http://localhost:5173 を開く。同じブラウザで別人として入るには `?as=b` のように付ける（名前はブラウザ共通で覚えるので、入る前に変える）。
動作確認で作ったセッション・グループ・イベントを消したいときは `data/home.json` を消してサーバーを再起動する。

別のワークツリーと同時に動かすときは、`.env` の `SERVER_PORT` と `CLIENT_PORT` をずらし（例: 3011 と 5183）、`LIVEKIT_ROOM_PREFIX` も変える（同じ LiveKit を共有するので、部屋が混ざらないように）。

## セッション構成の変更
`sessions.json` を編集する。
```json
{ "id": "lounge", "name": "ラウンジ", "topic": "ゆっくり話そう", "world": "cafe" }
```
- `id` は英数字で一意に。セッションごとに別の LiveKit ルーム（`tonarium-<id>`）・3D空間・アイテム・チャットになる
- `world` は最初に読み込むワールド（`room` ＝ホール、`cafe` ＝カフェ、`game` ＝ゲーム（板わたり）、`survivors` ＝宵闇サバイバーズ、`city` ＝街、`garden` ＝ガーデン。省略時は `room`）
- 既存セッションの初期ワールドはそのまま。ガーデンは設定の「ワールド」から選べる。新しいセッションの初期ワールドにする場合だけ `"world": "garden"` を指定する
- ここに書いたセッションはパブリック（だれでも見える）。公開範囲を絞ったセッションはホームの「セッションを作る」で作る
- `npm run dev` 中は保存するとサーバーが再起動する（セッション内のチャットは消える。アイテムは `data/items.json` から戻る）。`npm start` の場合は再起動が必要

## 主な機能

- 変更履歴（主な更新の一覧・検索・未読の赤い点）→ [docs/home.md の変更履歴](docs/home.md#変更履歴)
- Web 版をそのまま使う Electron クライアント → [docs/electron.md](docs/electron.md)
- ホーム（セッション外の画面。セッション・フレンド・イベント・グループの一覧と作成、公開範囲、招待）→ [docs/home.md](docs/home.md)
- ステータス、DM とグループのチャンネル、日程の相談、セッションのまとめ → [docs/messages.md](docs/messages.md)
- 2D の画面（距離ごとのプレイヤー・アイテムのリスト、顔、通知・チャット、ウィンドウ、試験中のマップ、スマホ・PWA）→ [docs/screens.md](docs/screens.md)
- 3D 空間（FPS 風の操作、ワールドの切り替え、ガーデン、街（マンション・電車・エレベーター）、お絵描きアバター、配信ディスプレイ）→ [docs/3d.md](docs/3d.md)
- 距離で変わる声、ブロードキャストモード、ついていく → [docs/audio.md](docs/audio.md)
- アイテム（付箋・ハンマー・チェス・サイコロ・キャンバス・カメラ・2048）と画像・動画・YouTube の共有 → [docs/items.md](docs/items.md)
- 外から試す（cloudflared）・Coolify へのデプロイ → [docs/deploy.md](docs/deploy.md)
- 同期の仕組み（kokosync、位置・チャット・キャンバス・サイコロのP2P配送、初回同期、大きいデータ、通信状態）→ [docs/sync.md](docs/sync.md)
- セッション同期を汎用P2P通信へ広げる設計方針と段階的な実装 → [docs/peer-sync-plan.md](docs/peer-sync-plan.md)
- 実装の設計 → [docs/architecture.md](docs/architecture.md)

## 参加者への注意
- デスクトップ版 Chrome / Edge 推奨（スマホは 2D だけで、最低限の対応）
- 配信の音声: タブ共有ならタブ音声、Windows で画面全体を共有すると PC の音声も流れる（ウィンドウ単位の共有では音声なし）
- サーバーを再起動するとセッション内のチャットは消える（アイテム・DM・チャンネルのメッセージは残る）
