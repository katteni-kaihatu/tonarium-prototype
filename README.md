<p align="center"><img src="client/public/brand/logo.png" alt="Tonarium" width="360"></p>

# Tonarium Prototype

2D（リスト・ウィンドウ・チャット・通話・配信視聴）と 3D（空間）を同じワールドのまま行き来できる体験検証用プロトタイプ。本番では捨てる前提。

## 構成
- `client/` Vite + React + TypeScript。3D は React Three Fiber。状態は zustand
  - `client/src/world/` ワールド画面（左のプレイヤー・アイテム、上の顔、右の通知・ログ、下のドック、背面のウィンドウ）
  - `client/src/home/` ホーム画面（セッション外。タイムライン・セッション・フレンド・イベント・グループ・ワールド・アイテムの一覧と作成）
- `server/` Node + ws + kokosync。オンラインのユーザーと、セッションごとの状態（チャット・アイテム・アバター位置）を保持する。セッション内のデータ同期は kokosync、フレンド・DM・ホームは従来の WebSocket（[docs/sync.md](docs/sync.md)）。LiveKit の通話トークンも発行。画面から作ったセッション・グループ・イベントは `data/home.json`、フォローは `data/follows.json`、タイムラインのポストは `data/timeline.json` に保存
- `shared/protocol.ts` アプリのメッセージ型、`shared/session-wire.ts` MessagePack と同期パケット、`shared/session-position.ts` 位置配送、`shared/session-events.ts` P2Pでの本文配送とサーバー確定後の適用、`shared/places.ts` 位置と距離（クライアントとサーバーで共用）
- `sessions.json` 最初からあるセッションの構成（各セッションが最初に読み込むワールド＝ 3D 空間も指定）。ホームの「セッションを作る」で増やしたものは `data/home.json`
- `shared/worlds.ts` ワールドの種類（ホール・カフェ・ゲーム・宵闇サバイバーズ・街・ガーデン・AD 研究所・悠久の旅路）と家具の当たり判定。見た目は `client/src/view3d/worlds3d.tsx`。街の配置と電車・エレベーターは `shared/city.ts`。AD 研究所の配置は `shared/antimatterLayout.ts`、進行は `client/src/ad/`（engine そのまま＋ zustand スライス）。悠久の旅路は専用の平面地図 RPG（[docs/fantasy.md](docs/fantasy.md)）
- `client/public/brand/` ロゴ・ファビコン・OGP 画像。OGP の絶対 URL は、サーバーが `index.html` を返すときにアクセスされたドメインで埋める（`__ORIGIN__`）
- 音声・画面共有は LiveKit。本番は Coolify で自前の `livekit-server` を一緒に動かし、手元では Docker で開発用の LiveKit を動かす。データ同期は独立した kokosync 接続を使う

詳しい仕組みと使い方は [docs/](docs/) にある。

## Electron 版

Web 版と同じ 2D・3D・ゲームを専用ウィンドウで利用する別アプリ。サーバーに配信された Web 版の更新に追従する。Linux / Windows のビルドとインストールは [Electron 版](docs/electron.md) を参照。

## ネイティブ版の廃止

Avalonia／Unity による Windows／Linux ネイティブ版は廃止しました。今後は Web 版または [Electron 版](docs/electron.md) を利用してください。ネイティブ版のコード・専用設定・自動配布処理は削除しました。公開済みの配布物は削除していません。

## セットアップ
開発・検証には Node.js 24 を使う。既存環境の Node.js 18 では現在の依存関係を実行できない。

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
変更履歴（`changelog/` と `shared/changelog.ts`）は作業では追加・編集しない。PR 本文の「利用者向けの変更」に変更内容を書き（[PR テンプレート](.github/pull_request_template.md)）、`main` への反映時にリリース担当が PR と差分から機能ごとの `changelog/*.json` を作る。PR 本文に情報が少ない場合も差分から作る。形式・識別と並び順・ビルド時の集約は [変更履歴の開発ガイド](docs/changelog.md) を参照。

タスク完了前に `npm run check:completion` を実行する。変更履歴に触れていないことの確認、型チェック、ビルドの順で実行し、失敗したら完了にしない。履歴チェックだけなら `npm run check:changelog`、回帰テストは `npm run test:changelog`。比較元は既定で `git merge-base HEAD origin/develop`（`origin/develop` が無ければ `origin/main`）。別の比較元は `CHANGELOG_BASE`、または `npm run check:changelog -- --base <タスク開始時のコミット>` で指定できる。

作業ブランチは `develop` から切って `develop` 宛てに PR を出す。`main` へはリリース担当（Tonarium Agent）が15分ごとに `develop` をまとめて反映する（差分がなければ何もしない）。`main` と `develop` 宛ての全 PR はファイル種別による除外なしで GitHub Actions の Web checks を実行する。Electron checks と Nightly configuration checks は、どの宛て先の PR でも、`main`・`develop` への push でも動く（対象のファイルが変わったときだけ）。Electron の nightly ビルド・配布（`electron/` と配布処理が変わったときだけ）と、共有アセット・共有システムの投稿の検査と配布の準備は `main` だけ。`develop` 宛てでは変更履歴に触れていないこと、`main` 宛てでは既存履歴の保持と形式、型チェック、ビルド、クライアント・同期テストを確認する。手動実行では対象コミットの親を比較元にする。Discord のフィードバックから作った PR も同じチェックを通してからマージする。
http://localhost:5173 を開く。同じブラウザで別人として入るには `?as=b` のように付ける（名前はブラウザ共通で覚えるので、入る前に変える）。
動作確認で作ったセッション・グループ・イベントを消したいときは `data/home.json` を消してサーバーを再起動する。

別のワークツリーと同時に動かすときは、`.env` の `SERVER_PORT` と `CLIENT_PORT` をずらし（例: 3011 と 5183）、`LIVEKIT_ROOM_PREFIX` も変える（同じ LiveKit を共有するので、部屋が混ざらないように）。

## セッション構成の変更
`sessions.json` を編集する。
```json
{ "id": "lounge", "name": "ラウンジ", "topic": "ゆっくり話そう", "world": "cafe" }
```
- `id` は英数字で一意に。セッションごとに別の LiveKit ルーム（`tonarium-<id>`）・3D空間・アイテム・チャットになる
- `world` は最初に読み込むワールド（`room` ＝ホール、`cafe` ＝カフェ、`game` ＝ゲーム（板わたり）、`survivors` ＝宵闇サバイバーズ、`city` ＝街、`garden` ＝ガーデン、`antimatter` ＝ AD 研究所、`fantasy` ＝悠久の旅路。省略時は `room`）
- 既存セッションの初期ワールドはそのまま。ガーデンは設定の「ワールド」から選べる。新しいセッションの初期ワールドにする場合だけ `"world": "garden"` を指定する
- ここに書いたセッションはパブリック（だれでも見える）。公開範囲を絞ったセッションはホームの「セッションを作る」で作る
- `npm run dev` 中は保存するとサーバーが再起動する（セッション内のチャットは消える。アイテムは `data/items.json` から戻る）。`npm start` の場合は再起動が必要

## 主な機能

- 開発の方向性（目的・大事にする体験・依頼の受け止め方）→ [docs/direction.md](docs/direction.md)
- 개발용 공유 시스템·아이템 ID 카탈로그 → [공유 시스템 문서 폴더](docs/shared-systems/README.md)
- 코드로 맵을 만드는 순서와 복사 가능한 연결 예제 → [add-world 사용법](.claude/skills/add-world/SKILL.md)
- 새 시스템 PR 등록·배포와 로컬 시험 → [등록 가이드](docs/shared-systems/registration.md) · [시험 가이드](docs/shared-systems/playtest.md)
- 아이템 메뉴에서 꺼내는 5초 딜레이 카메라·초 표시·효과음·삭제와 타이머 연결 예제 → [타이머 카메라 사용법](docs/shared-systems/camera-timer-test.md)

- 共有アセット・非空間システムの提出契約、原本保全、配置編集と実装途中の範囲 → [docs/shared-assets.md](docs/shared-assets.md)・[検証記録](docs/shared-assets-verification.md)
- 単体ブラウザのWebXR初期実装（VR操作・仮想端末・対応表・検証範囲）→ [docs/webxr.md](docs/webxr.md)。座標変換・吹き出し全種別・今回の修正と確認手順は [docs/webxr-coordinates.md](docs/webxr-coordinates.md)。Quest 3／Steam Frame実機は未検証、Electron版はVR非対応
- 日本語・英語・韓国語の表示切り替え（端末保存・ブラウザ言語判定）→ [docs/languages.md](docs/languages.md)
- チャットの自動翻訳・小さな原文と発言言語の表示（サーバーのOpenAI連携・ローカルモック）→ [docs/chat-translation.md](docs/chat-translation.md)
- 아이템·월드·공유 시스템의 등록 시 자동 번역과 수동 교정 → [원문·번역 저장 및 등록 안내](docs/content-translations.md)
- 変更履歴（主な更新の一覧・検索・未読の赤い点）→ [docs/home.md の変更履歴](docs/home.md#変更履歴)・[開発ガイド](docs/changelog.md)
- Web 版をそのまま使う Electron クライアント → [docs/electron.md](docs/electron.md)
- 自動更新の設定、カウントダウン、更新後の状態復元と検証結果 → [docs/updates.md](docs/updates.md)
- ホーム（セッション外の画面。セッション・フレンド・イベント・グループの一覧と作成、公開範囲、招待）→ [docs/home.md](docs/home.md)
- タイムライン（ポスト・写真や場所の添付・リアクション・返信・リポスト・引用）とフォロー（相互フォローでフレンド）→ [docs/timeline.md](docs/timeline.md)
- ステータス、DM とグループのチャンネル、日程の相談、セッションのまとめ → [docs/messages.md](docs/messages.md)
- 2D の画面（距離ごとのプレイヤー・アイテムのリスト、顔、通知・チャット、ウィンドウ、試験中のマップ、スマホ・PWA）→ [docs/screens.md](docs/screens.md)
- 3D 空間（FPS 風の操作、ワールドの切り替え、ガーデン、街（マンション・電車・エレベーター）、お絵描きアバター、配信ディスプレイ）→ [docs/3d.md](docs/3d.md)
- 悠久の旅路（45地域、51種族、38職業、個人メイン18章と48の連続調査、共有依頼、熟練・制作・狩猟、共通の季節時計、ローカルAIのNPC・GM）→ [docs/fantasy.md](docs/fantasy.md)
- 悠久の旅路の専用アカウント・別端末への復帰・復旧コード → [docs/fantasy-accounts.md](docs/fantasy-accounts.md)。世界・アカウントの定期バックアップ、復元と旧人物の所有者移行 → [docs/fantasy-backups.md](docs/fantasy-backups.md)
- RPG のブラウザ・認証済み多人数・復元障害・外部同期・戦闘の追加検証と範囲 → [docs/fantasy-feasible-validation.md](docs/fantasy-feasible-validation.md)
- RPG の行動・AI 診断ログと運営用の会話検索・書き出し → [docs/fantasy-diagnostics.md](docs/fantasy-diagnostics.md)
- RPG 診断・AI 品質・TLS/WSS・非公開ファイルの追加検証 → [docs/fantasy-predeploy-diagnostics-validation.md](docs/fantasy-predeploy-diagnostics-validation.md)
- 새벽너머의 항로 전체 시나리오（全18章・48場面の依頼人の事情、証拠、失敗と再調査、次の手掛かり。結末を含む）→ [docs/fantasy-voyage-scenario.md](docs/fantasy-voyage-scenario.md)
- 판타지 파티（最大6人・個別同意の共同移動と調査、専用チャット、承認付き共有品、戦闘への途中参加）→ [docs/fantasy-party.md](docs/fantasy-party.md)。人数別補正は [戦闘バランス](docs/fantasy-party-combat-plan.md)
- 판타지 전투（1〜6人のターン戦闘、10×8マス・遮蔽・射程、自分の部下と召喚体の個別指示、物語8戦、明示挑戦の最上位4種）→ [docs/fantasy-combat.md](docs/fantasy-combat.md)、[63種の相手と基礎能力](docs/fantasy-combat-monsters.md)
- 悠久の旅路の公式設定・種族と文化 → [docs/world-bible.md](docs/world-bible.md)、実装済み内容と残る範囲 → [docs/fantasy-expansion-plan.md](docs/fantasy-expansion-plan.md)、農地・商業・居住48区画の取引と利用 → [docs/fantasy-property-plan.md](docs/fantasy-property-plan.md)
- 悠久の旅路のモンスター58種 → [docs/fantasy-monster-list.md](docs/fantasy-monster-list.md)、司祭独自の信仰成長と四つの道 → [docs/priest-growth-plan.md](docs/priest-growth-plan.md)
- 職業の専門分野（一般145・司祭4、取得条件は非公開）→ [専門分野の規則](docs/fantasy-job-paths.md)、[全149分野の一覧](docs/fantasy-job-advancement-candidates.md)
- 悠久の旅路の直接交換・有限共有在庫・中古品 → [交易の規則](docs/fantasy-economy.md)。住民の日課・関係・勢力・同意制の略奪・裁判と拘禁 → [住民と役所](docs/fantasy-civics.md)
- 悠久の旅路の賃貸・共有名義・設計改築・税・有限の雇用営業・遺産競売 → [不動産](docs/fantasy-property-plan.md)。独立した荷車を守る戦場 → [護衛戦術](docs/fantasy-escort-tactics.md)
- ローカル NPC・GM 会話（モデルの起動、容量、待ち行列、測定値）→ [docs/local-npc.md](docs/local-npc.md)
- 悠久の旅路の祈り・状態別の売却価格 → [docs/fantasy-prayer-sales.md](docs/fantasy-prayer-sales.md)、仕事中の判定と途中経過 → [docs/fantasy-work-progress.md](docs/fantasy-work-progress.md)
- 悠久の旅路のスキル説明・行動制限・操作案内 → [docs/fantasy-interface.md](docs/fantasy-interface.md)、非公開の検証用操作 → [docs/fantasy-test-tools.md](docs/fantasy-test-tools.md)
- 距離で変わる声、ブロードキャストモード、ついていく → [docs/audio.md](docs/audio.md)
- アイテム（付箋・ハンマー・チェス・サイコロ・キャンバス・お絵描き伝言・カメラ・鏡・ジャンプ台・2048・AD ポータル・バイク）と画像・動画・YouTube の共有 → [docs/items.md](docs/items.md)。バイクの未完了項目は [検証記録](docs/bike-verification.md)、効果音の出典と取得状況は [素材記録](docs/assets.md)
- 外から試す（cloudflared）・Coolify へのデプロイ → [docs/deploy.md](docs/deploy.md)
- 同期の仕組み（kokosync、位置・チャット・キャンバス・サイコロのP2P配送、初回同期、大きいデータ、通信状態）→ [docs/sync.md](docs/sync.md)
- セッション同期を汎用P2P通信へ広げる設計方針と段階的な実装 → [docs/peer-sync-plan.md](docs/peer-sync-plan.md)
- 実装の設計 → [docs/architecture.md](docs/architecture.md)

## 参加者への注意
- デスクトップ版 Chrome / Edge 推奨（スマホは 2D だけで、最低限の対応）
- 配信の音声: タブ共有ならタブ音声、Windows で画面全体を共有すると PC の音声も流れる（ウィンドウ単位の共有では音声なし）
- サーバーを再起動するとセッション内のチャットは消える（アイテム・DM・チャンネルのメッセージは残る）

- ファンタジーワールド専用の言語選択・ブラウザAI支援（新しい共有同意・Qwen3 1.7B・余裕のある参加者の支援・サーバー復帰）: [docs/browser-ai-support.md](docs/browser-ai-support.md)
- NPC別の上半身イラストと制作記録: [docs/npc-portraits.md](docs/npc-portraits.md)
