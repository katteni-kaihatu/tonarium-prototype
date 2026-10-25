# 過去の利用者向け変更履歴を補完

`shared/changelog.ts` に36件を追加。ワールド、交流、共有、端末対応、操作改善、安定性・性能改善を、新しい日付から表示する。既存5件の内容と順序は維持する。

## 調査範囲と採用方針

`git log --date=short --reverse --first-parent main` の全期間（2026-10-17〜2026-10-25、first-parent 79件、うちマージ57件）を調査。調査時の main は `c17e394`。各マージの first-parent 差分・取り込まれたコミットの件名を確認し、下表の現存する実装・docsと照合した。作業ブランチのみにある機能は採用していない。

日付は first-parent のマージコミットの `%ad`（`--date=short`）。同一機能の後続変更は初回マージ日の項目にまとめ、後続の調整を別の新機能として数えていない。既存5件はすべて2026-10-25のため、その後ろに同日分から過去分を追加した。

型は `date`（YYYY-MM-DD）・`title`・`items`（説明の配列）・任意の `tag`。`client/src/home/pages.tsx` の `ChangelogPage` は全件を `filter` して `map` し、見出しと本文の大文字小文字を区別しない部分一致で検索する。件数上限や別登録はない。`Home.tsx` はこのページに検索欄の値を渡す。

## 追加項目と根拠

ハッシュはすべて main の first-parent マージ。日付が異なる後続マージは補足として記載する。

|日付|見出し|マージと現在の裏付け|
|---|---|---|
|2026-10-25|アイテムの移動を軽量化|`c17e394`：`docs/items.md`、`docs/sync.md`、`client/src/world/ServerNotices.tsx`（旧版の再読み込み案内）|
|2026-10-25|チェスAIの考慮中も操作を快適に|`6120975`：`server/chess-ai.ts`（探索中にほかの処理へ実行を譲る）|
|2026-10-25|保存と接続の安定性を改善|`b75905a`、`60a16bd`、`f3a0c5a`、`83c8ca5`、`d37bda5`、`c943dfa`：`docs/home.md`、`server/index.ts`、`server/game.ts`、`shared/items.ts`、`shared/worlds.ts`（終了時保存、入力検証、切断時の片付け、通話への参加確認）|
|2026-10-25|画面表示と読み込みを軽量化|`ee40701`、`6858eaf`、`9587870`、`591432f`、`8cafcc6`、`7dc6c08`：`docs/screens.md`、`client/src/world/Portraits.tsx`、`client/src/world/WorldScreen.tsx`、`client/src/placesMemo.ts`、`server/index.ts`、`server/spacing.ts`、`server/rooms.ts`|
|2026-10-25|古いイベントを自動整理|`cd17e68`：`docs/home.md`、`server/index.ts`（30日を過ぎたイベントの整理）|
|2026-10-25|マップに声の湯気を追加|`b528ada`：`docs/screens.md`、`client/src/voiceHeat.ts`、`client/src/world/MapLayer.tsx`|
|2026-10-25|Electron版の更新設定を追加|`ed57f09`：`docs/electron.md`、`electron/app/updater.cjs`、`electron/app/updates.js`（配布形式ごとの自動適用制約も反映）|
|2026-10-25|Linux版とElectron版を追加|`6a1ca37`：`docs/native-linux.md`、`docs/electron.md`、`native/Tonarium.Desktop/Linux/`、`electron/app/main.cjs`|
|2026-10-25|更新とメンテナンスをお知らせ|`94aefc6`：`docs/screens.md`、`client/public/sw.js`、`client/src/world/ServerNotices.tsx`|
|2026-10-25|ガーデンワールドを追加|`489ea48`：`docs/3d.md`、`shared/worlds.ts`、`client/src/view3d/garden3d.tsx`|
|2026-10-25|アバターのエモートを追加|`ac1c433`：`docs/screens.md`、`shared/emotes.ts`、`client/src/world/Emotes.tsx`、`client/src/view3d/Emote3D.tsx`|
|2026-10-24|宵闇サバイバーズを追加|初回 `487b08d`。10/25の `0953927`、`39709ed`、`f45eb80`、`1333a36` の敵・装備・成長・結果調整、`7b00930` の通信改善も同機能に集約。`shared/survivor.ts`、`server/survivors.ts`、`client/src/world/SurvivorPanel.tsx`、`client/src/view3d/survivors3d.tsx`|
|2026-10-24|音量を細かく調整|`487b08d`：`docs/audio.md`、`client/src/volume.ts`、`client/src/world/VolumeMenus.tsx`|
|2026-10-24|Tabで左右のパネルを開閉|`487b08d`：`docs/screens.md`、`client/src/world/WorldScreen.tsx`|
|2026-10-24|セッション名を変更可能に|`6e9316e`：`docs/home.md`、`docs/screens.md`、`server/index.ts`|
|2026-10-24|街ワールドを追加|`249d4f3`：`docs/3d.md`、`shared/city.ts`、`client/src/view3d/city3d.tsx`、`server/city.ts`|
|2026-10-24|2D画面に試験用マップを追加|初回 `fd01ca8`、同日の徒歩移動 `f6ee270`：`docs/screens.md`、`client/src/world/MapLayer.tsx`、`client/src/walk.ts`|
|2026-10-22|参加中の画面更新を軽量化|`c023264`：`docs/architecture.md`、`client/src/sessionView.ts`、`client/src/nearby.ts`|
|2026-10-22|フィードバックへのリンクを追加|`cf8a59c`：`docs/home.md`、`client/src/feedback.ts`、`client/src/home/Home.tsx`|
|2026-10-22|ホームの一覧を見やすく整理|`57eff23`：`docs/home.md`、`client/src/home/Home.tsx`|
|2026-10-22|ホーム画面へのインストールに対応|`ecff87d`：`docs/screens.md`、`client/public/manifest.webmanifest`、`client/public/sw.js`|
|2026-10-22|3Dの軽量設定を追加|`ecff87d`：`docs/3d.md`、`client/src/Profile.tsx`、`client/src/view3d/worlds3d.tsx`|
|2026-10-22|スマートフォンの操作に対応|`e5218c5`：`docs/screens.md`、`client/src/phone.ts`、`client/src/world/WorldScreen.tsx`。タッチ端末の3Dは未対応のため記載しない|
|2026-10-21|ログを読み返しやすく改善|`1a5936b`：`client/src/world/NoticeLog.tsx`（最下部を見ているときだけ追従）|
|2026-10-21|Windows専用アプリを追加|`caa5ea5`：`docs/native-windows.md`、`native/Tonarium.Desktop/`、`native/Tonarium.Unity/`|
|2026-10-20|ホームと交流機能を追加|`0aad014`：`docs/home.md`、`docs/messages.md`、`client/src/home/`、`shared/home.ts`|
|2026-10-20|セッション中もホームを利用可能に|`046d6b2`、`0aad014`：`docs/screens.md`、`client/src/home/Home.tsx`、`client/src/world/WorldScreen.tsx`|
|2026-10-20|3Dの持ち運びと会話表示を改善|`929dda8`：`docs/3d.md`、`client/src/view3d/interact.ts`、`client/src/view3d/Label.tsx`|
|2026-10-20|板わたりのゲームワールドを追加|`c15be07`：`docs/3d.md`、`server/game.ts`、`client/src/view3d/game3d.tsx`|
|2026-10-20|画面共有を3D空間にも表示|`c15be07`：`docs/3d.md`、`client/src/view3d/shareDisplay.tsx`|
|2026-10-20|TRPG向けサイコロを追加|`a6800c8`：`docs/items.md`、`shared/dice.ts`、`client/src/world/DiceBody.tsx`。同マージのジャンプ同期・追従表示も既存の操作項目に集約|
|2026-10-20|再接続後の状態表示を修正|`86da1f1`：マージ差分は `client/src/net/ws.ts`。現在は `client/src/net/session.ts` の接続復帰処理でミュート・共有状態を送信|
|2026-10-20|カフェとワールド切り替えを追加|`02683ba`：`docs/3d.md`、`shared/worlds.ts`、`client/src/view3d/Player.tsx`、`client/src/view3d/worlds3d.tsx`|
|2026-10-19|画像・動画・YouTubeを共有|`e684f06`：`docs/items.md`、`docs/audio.md`、`client/src/media.ts`、`client/src/mediaSync.tsx`、`client/src/spatial.ts`|
|2026-10-19|参加者とウィンドウの画面を刷新|`621dc60`：`docs/screens.md`、`client/src/world/NearList.tsx`、`client/src/world/WindowLayer.tsx`、`client/src/world/ProfileCard.tsx`|
|2026-10-18|アイコンとお絵描きアバターを追加|`7e551fa`：`docs/screens.md`、`docs/3d.md`、`client/src/Profile.tsx`、`client/src/view3d/OekakiAvatar.tsx`|

## 除外したもの

- マージ前の main への直接コミット22件は確認したが、「マージされたコミットのみ」の指定に従い、初期プロトタイプ、カメラ、キャンバス、チェス追加などの独立した項目は作らない。
- `e3fa359`、`dcce5e5`：Docker・LiveKitの構築とコメント整理。`c22e949`：同期方式の変更は後に置き換えられており、現行機能として記載しない。
- `0ef7e22`、`15a5228`、`21e2f74`、`db148db`、`cbb0fbf`：ignore、依存関係、CI、配布ビルドの運用変更のみ。
- `ad6298e`：ロゴ・プロトタイプの告知・OGP。主要機能・改善に絞り、独立項目を作らない。`c15be07` のマスコット等も装飾だけの独立項目にしない。
- `1a5936b` の主催者表示はホーム・イベントの項目に含め、別項目を作らない。
- 既存5件（変更履歴、サムネイル、空セッション削除、作成時の自動参加、モックマーケット）は重複させない。main より後の作業ブランチにあるグループ編集等も追加しない。
- tonarium-agent の自動化、PR運用、ダッシュボード、Discord内部連携は採用しない。

## 検証

- 静的確認：全41件（追加36件）、既存5件の完全一致、日付形式、降順、タイトル重複なし、根拠57ハッシュの main 到達性を確認済み。表の初回マージ日と項目の日付も照合済み。
- `npm run typecheck` / `npm run build`：いずれも Volta 管理ディレクトリへのアクセス拒否で起動できず、未実行。worktreeに依存関係もない。
- ローカル画面・検索確認：Vite が同じ理由で起動できず未確認。書き込み可能な worktree 内を Volta の保存先として Node.js の取得も試したが、ダウンロードできなかった。
- PR作成・push・リリースは行わない。
- コミット：対象2ファイルの `git add` を試したが、worktreeのGit管理領域に `index.lock` を作成する権限がなく失敗。未ステージ・未コミットの変更として残している。

## コミットメッセージ

```text
docs: 変更履歴に過去の利用者向け更新36件を追加

ワールド、交流・共有機能、Windows/Linux/Electron対応、
マップ、音量・エモート、安定性・性能改善を補完。
既存5件を保ち、mainのマージ日と現存実装の対応表を添付。
```
