# 共有アセットの作業・検証記録

## 着手時の保全

- HEAD: `acaf512de657d850cdf82af43a7e3ab9901bac3b`。
- 最初に通常の `git status --short` と `git diff --stat` を実行したが、Git LFSが主リポジトリの `.git/lfs/tmp` に書き込めず失敗した。
- `git -c filter.lfs.process= -c filter.lfs.clean= -c filter.lfs.required=false status --short` と同設定のdiffで、既存差分は `releases/windows/v0.0.2/Tonarium-v0.0.2-win-x64.zip` だけと確認した。未完了のコード差分はなかった。
- ZIPの実体は170629254 bytes、SHA-256は `57795735f6499bd1d70e78a8a3b6229fe82fec6f96a416fde0b11efb81a22580`。HEADのLFS pointerのsize・oidと一致した。ZIPを変更、削除、再圧縮、ステージしていない。LFSフィルターなしのdiffではpointer対実体の差分として残る。
- CLAUDE.md、DESIGN.md、既存設計・同期・履歴の文書を確認した。既存の指針、既存履歴、配布ZIPを保持し、依頼に従ってshared/changelog.tsの先頭と作業別JSONの両方へ今回分を追加した。

## 資料の調査

会話に取得可能な添付参照はない。worktreeのspec名・ZIP・画像を列挙し、添付キャッシュのファイル一覧も調べたが、今回の仕様添付やtonarium_spec_markdownは見つからなかった。ZIPは既存のWindows配布物で、原文仕様の添付と見なしていない。仕様画像は取得できていないため目視確認も転記もできていない。`docs/shared-assets-pr-spec.md` はその取得不能記録であり、原文を保存できたことを意味しない。

## 実装した検証

`server/shared-assets.test.ts` に次の試験を追加した。下記は試験コードの対象であり、この環境での合格結果ではない。

- 提出manifestだけにあるadvance動作を二つのマップで実行し、二配置・二部屋・参加者別状態を隔離する。
- 非空間システムへの接続と、同一操作内の複数システム更新を確認する。
- 共有・専用状態を受信者別に射影し、deltaの重複・欠落・順序逆転からsnapshot取得へ戻す。
- 命令ID再送、異なる本文でのID使い回し、古いrevision、保存失敗、再起動、バッチ途中失敗を確認する。
- 接続ループのイベント予算超過で、部分更新を保存しない。
- 状態に対応する3Dプリミティブ用の衝突Solid生成を確認する。
- 原文hash、原本永続化、release切替失敗、公開済み版の変更・削除、実ファイル未列挙、LFS pointer、Linux上のsymlinkを検査する。

`client/src/shared-assets/loader.test.ts` にはhash cache、破損応答の再試行、古い応答の取消、部分失敗、返却bytesの外部変更、dispose後のcache消去を追加した。`npm run test:shared-assets` は既存のTypeScriptテストと同じく、開発依存の `tsx --test` でサーバーとローダーのテストを実行する。Nodeの `--experimental-transform-types` は不要。

## この環境での実行結果

### 2026-10-26 不変性検査の修正

公開済みアセットの不変性検査を、依存関係とマップ参照の検査より前へ移した。manifestの改行変更や削除を、マップの `asset unavailable` ではなく `published asset immutable` として検出する。変更のない提出物は引き続き受理し、基準カタログを指定しない場合はマップの参照不一致を拒否する。

Volta経由のnpm起動は権限エラーで失敗したが、利用可能なNode v24.19.0から既存のtsxを直接起動し、共有アセットの全10テストが成功した。Windowsのため、既存テストのsymlink作成を伴う検証は対象外。

`npm run check:completion` も同じVolta権限エラーで起動できなかった。構成するチェックをNode実体から個別実行し、`scripts/check-changelog.mjs --base HEAD`、`tsc --noEmit -p tsconfig.json`、`vite build` は成功した。ビルドにはチャンクサイズの警告がある。`git diff --check` も成功した。必須のnpmコマンド自体は成功していないため、完了条件は未達。

| 確認 | 結果 |
| --- | --- |
| HEAD・既存差分・LFS pointer・ZIPの実サイズ/hash | 読取り確認済み。通常Git LFSの状態確認には権限エラーあり |
| JSONと固定hashの静的確認 | PowerShellでpackage・履歴・2manifest・2mapを読み取り、全配置のintegrityと原文hashの一致を確認 |
| `git diff --check` | LFSフィルターを無効化した読取りで成功 |
| Nodeバージョン | `node --version` がVoltaのディレクトリ権限エラーで起動失敗。Node 24と確認できない |
| 依存 | worktreeにnode_modulesなし |
| Node 24取得 | 公式nodejs.orgのSHASUMS取得を試したが、ネットワーク接続不可 |
| `npm run check:completion` | npm起動時のVolta権限エラーで失敗。履歴検査・型検査・ビルドには到達していない |
| `npm run test:shared-assets` | 同じ起動エラーで失敗。試験結果を取得できていない |
| 型検査・ビルド・既存回帰・統合 | Node起動不可により未実施 |
| ブラウザ複数クライアント・Electron・スマホ | 未実施 |
| GitHubのPR検証・確定commit再検証・試験配布 | workflowを追加。外部実行は未実施 |

完了チェックが通っていないため、CLAUDE.mdに従い完了とは扱わない。

## 残る実装と受け入れ上の不足

- 添付原文の取得、実形式・メタデータ・画像の確認、指定順の原文転記。
- 同じinstanceIdを維持した原本更新のtrial・migration・選択適用。現在は暗黙更新を拒否し、新配置としてのみ新版を試せる。
- 音声、画像・モデルの安全な形式検査と展開量制限、実bytesの表示・再生への接続。現在の描画はmanifestに基づく立方体とラベルのみ。
- OSプロセス／workerごとのCPU・メモリ上限と部屋の遅延隔離。現在は有界ルールの権限制限・命令予算であり、同期ファイル保存も他の部屋のイベントループを占有し得る。
- 新原本を参照する状態を維持したまま旧カタログへ戻す復旧。現在は原本カタログと同時点の状態をセットで復元する。
- LFSの上限付き自動取得。現専用CIは未解決pointerを拒否する。
- 既存公開履歴に対する全release横断の不変性検査。現publishは選択中releaseとの比較と同一commit記録の不変性を検査する。過去へロールバックしてから新配布する運用では、最新の正常releaseも比較元として検証する必要がある。
- PR提出の自動化（共有用JSONの生成まで実装）。Git push・PR作成・release公開は依頼により実行していない。
- 新しい編集UIの英語・韓国語表示。現段階は日本語で、既存UIの翻訳契約への統合は未実装。
- 外部配布先への自動搬送、本番インストールの切替、配布失敗の実環境試験。現workflowはmain確定commitの再検査と試験artifact作成まで。
- 多人数・多部屋の負荷、実通信の再接続・配送隔離、表示と衝突のブラウザ確認、資源解放の実測、電源断を含むfsync/renameの検証。

## 再開時の手順

1. Node 24の起動とnpm依存の配置を可能にする。秘密を含む環境変数一覧や認証設定は出力しない。
2. `CHANGELOG_BASE` に上記の着手時HEADを指定して `npm run check:completion`、`npm run test:shared-assets`、既存のsync/client/changelog/movement等を実行し、失敗を修正する。
3. 信頼できる実装側スクリプトで例の提出物を検証し、一時DATA_DIRへpublishする。本番releaseは作らない。
4. 二部屋にgate-lobby/gate-gardenを適用し、各二クライアントでadvance・reset、再接続、途中参加、秘密のvisits、3D衝突、削除時の資源解放を確認する。
5. 保存不可・破損object・hash違反・依存不足・不変性違反・LFS pointerで旧正常currentが変わらないことを実測する。
6. 残る機能を実装して受け入れ試験を完了し、この記録を実測結果へ更新する。提出・運用・復旧の現行手順は [shared-assets.md](shared-assets.md) を参照する。
