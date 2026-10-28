# 共有アセットとマップ（実装途中）

この変更は v0.2 の基盤実装です。受け入れ完了ではありません。実行できた確認、未実行の試験、未実装の機能は [検証記録](shared-assets-verification.md) に分けて記載しています。[添付仕様の取得状況](shared-assets-pr-spec.md) も参照してください。

## 保存方式と実装順

Node 24、依存追加なし、SHA-256 の内容アドレス、永続ボリューム上のJSONとbytesを選びました。追加の外部サービスを必要としない構成です。順序は契約・検証、原本保全、制限付きルール実行、確定と同期、編集と表示、検証コードです。

中央原本は `DATA_DIR/shared-originals/objects/sha256-<hex>`、配布元commit・manifest・固定依存・マップ原本hashは `shared-originals/releases/<commit>.json`、選択中カタログは `shared-originals/current.json` に保存します。`DATA_DIR` は既存の設定を使い、既定は `data/`。Dockerの既存 `/app/data` ボリュームを使うため、イメージの差し替えやブラウザキャッシュ消去で原本を失いません。ボリューム自体の削除にはバックアップが必要です。

部屋の設定と実行状態は `shared-state/<sessionIdのSHA-256>.json` の別フィールド `map` と `values` に格納します。revisionと再送判定履歴も同じトランザクションに含め、設定だけ保存される状態を避けます。中央原本を書き換えず、マップは正確な `id/version/integrity` を参照します。配置の複製には新しい `instanceId` を割り当てます。位置・設定変更ではIDを維持します。

## 提出物

```
shared-assets/<id>/<version>/manifest.json
shared-assets/<id>/<version>/<manifest.filesで列挙した相対パス>
shared-maps/<id>/<revision>.json
```

アーカイブ形式での提出とアーカイブの展開実行はサポートしません。提出ルートは実ディレクトリです。実行エンジンはmanifestのルールだけを使い、filesのbytesをコード・画像・音声・モデルとして自動実行・展開しません。メディア形式別の展開量検査と再生は未実装なので、この段階で圧縮メディアの安全性を保証しません。

manifestの必須項目は `schema: 2`、`id`、正確な `version`、`title`、`kind`、`sdk`、`dependencies`、`files`、`fields`、`inputs`、`outputs`、`rules`。任意項目は `presentation` だけです。不明な項目を拒否します。実例は [pulse-gate](../shared-assets/pulse-gate/1.0.0/manifest.json) と [score-board](../shared-assets/score-board/1.0.0/manifest.json)。

| 項目 | 契約 |
| --- | --- |
| id・instanceId・フィールド・ポート | 英小文字で開始、英小文字・数字・ハイフン、64文字以内 |
| version | `1.0.0` のような固定semver。範囲、タグ、先頭ゼロ、URLは禁止 |
| integrity | **原文bytes**の `sha256-` + 小文字hex64桁。整形後のJSONではない |
| dependencies | id・正確なversion・integrityの配列。循環、重複、未解決を拒否 |
| files | 相対path・integrity・実bytes数。列挙外の実ファイルも拒否 |
| sdk | `tonarium-rules/0.2` の完全一致 |
| kind | `spatial` または `system`。非空間システムにも同じ状態・接続契約を適用 |
| fields | 数値のinitial/min/max/scope。有限数、範囲は±10億以内 |
| rules | event・field・op（add/set）・value。入力と対象フィールドは宣言済みに限る |
| presentation | label・field・RGBのhex color・solid。プリミティブの立方体と状態ラベル |

JSONとメディアの改行変換を防ぐため、提出ディレクトリには `.gitattributes` の `-text` を適用します。公開済みversionとrevisionは、空白・改行を含む原文bytesの変更、削除、改名を拒否します。訂正は新しい版として追加してください。`files` のLFS pointerが残っていた場合も失敗します。現在の専用CIはLFSを自動解決しません。LFS利用時はローカルで解決して検証できても専用CIでは拒否されます。

マップは `schema/id/revision/placements/connections` を持ちます。配置は `instanceId`、原本参照、`transform: {x,y,z,ry,scale}`、数値configです。ryはラジアン、scaleは0.05〜100、座標・ryは±10000。接続は `from/output/to/input`。接続先の入力と送信元の出力が宣言済みである必要があります。現SDKのポートは数値payloadを持たないイベントです。処理した入力と同名の出力を宣言した場合に、その接続を配送します。

## SDK、権限、予算

提出物にはJavaScript、Wasm、任意モジュールの実行権限を与えません。ホストの汎用インタープリターが数値のadd/setを実行します。動作名ごとの本体分岐はありません。提出物からファイル、ネットワーク、環境変数、モジュール、時計へアクセスする命令はありません。任意ループ、再帰呼出し、タイマー、動的コード生成もありません。任意コードをworkerで動かすsandboxではありません。

| 予算 | 上限 |
| --- | --- |
| manifest、マップ、操作本文 | 各256 KiB |
| file / 1アセットのfiles総量 | 8 MiB / 32 MiB |
| 検証対象の原文合計 | 128 MiB |
| ディレクトリ探索 | 4096エントリ（各提出ルート） |
| 依存 / files / fields | 16 / 64 / 32 |
| 入出力ポート / rules | 各16 / 64 |
| 配置 / 接続 / マップ | 128 / 128 / 1024 |
| 1確定操作のイベント処理 | 接続による連鎖を含め32件。超過は全体取消 |
| 1イベントの数値命令 | 最大64。1操作で最大2048 |
| 部屋の実行状態values | JSON文字列16 Ki文字以内 |
| 操作頻度 | 認証済み参加者・部屋ごとに毎秒20件 |
| 再送判定 | 部屋の直近128命令。入力本文のhashを保存 |
| ブラウザhashキャッシュ | 32 MiB、1取得8 MiB、同時4取得、各試行10秒、失敗は最大3試行 |

空間的な衝突は共有範囲のfieldが正の場合に有効です。参加者専用状態で共有衝突を変えるmanifestは拒否します。回転した立方体は既存Solid契約に合わせた外接AABBで衝突するため、斜め配置では保守的に広く当たります。R3Fがgeometry/materialを、既存Labelがtextureを解放します。ローダーには取消、世代照合、hash照合、部分失敗、コピーを返すcache、disposeがあります。PNG・音声・モデル再生へのローダー接続はまだありません。

## 状態、確定、配送

`session` は同じ部屋の同じ原本版で共有、`instance` は配置ごと、`participant` は配置と認証済み参加者ごとに分離します。別の部屋は別の永続ファイルと実行オブジェクトです。送信者IDは既存のkokosync参加資格で決定し、操作本文から採用しません。

命令IDは参加者IDとの組で重複を判定します。同じIDと異なる本文は拒否します。revision不一致、存在しない配置・入力、予算超過、保存失敗は全体を取り消します。複数システムのイベントと接続連鎖をcopy上で処理し、設定・状態・revision・履歴をfsyncしてrenameした後に公開します。保存前に通知しません。保存後の通知が失われたら再接続のsnapshotで復元します。保存のrenameに対応する単一サーバーを前提とし、マルチプロセスで同じ部屋を同時更新する構成は未対応です。

初回snapshotの `sharedAssets`、イベントの `sharedDelta`、配置変更・補完の `sharedState` を使います。deltaのfrom/revisionに欠落があれば `sharedResync`、古いdeltaは破棄。同じrevisionの状態全量は再送・エラー応答に使います。参加者別のviewを作って既存kokosyncの個別暗号化経路へ渡すため、参加者専用状態を部屋全員の本文に混ぜません。共有操作をP2Pの未確定経路で適用しません。

原本versionは自動更新しません。同じinstanceIdの原本差し替えを拒否しています。現在は新版を新しい配置として試して追加できますが、状態migrationと既存instanceIdを維持する選択更新は未実装です。

## クライアントと編集

現行はWeb（React/Three）と同じWebを表示するElectronです。旧Avalonia/Unity版はHEADの時点で廃止済み。互換性バージョンを3へ上げました。旧版は既存のバージョン不一致処理で更新が必要になります。Go/C#の専用表示はなく、kokosyncの中継に接続できることと本契約の表示対応は別です。スマホ2Dでは状態・編集UIだけを対象とし、3D描画の実機検証はしていません。

部屋右上の「共有アセット」から検索・種類・対応SDKフィルター、空間／非空間の追加、位置・回転・拡縮・複製・削除、数値設定、ポート接続を編集できます。draftは部屋別のlocalStorageです。JSON入力は原本参照まで検証し、中央カタログを変更しません。「原本を試験」は参照manifestのhashを確認する試験であり、ゲームプレイ試験ではありません。「部屋へ適用」は現在revisionに対する確定操作です。

共有用JSONの保存は `shared-maps/<id>/<revision>.json` に入れるための出力です。ファイル名を所定パスへ配置し、既存revisionを書き換えず新revisionにしてください。PRの自動作成は実装していません。このタスクでもGit push、PR作成、リリースは実行していません。

## 提出と運用

Node 24で、信頼できるチェックアウトのスクリプトを使います。提出ディレクトリ内のスクリプトやnpm lifecycleは実行しません。

```sh
node --experimental-transform-types scripts/shared-assets.ts validate <submission-directory> <exact-40-hex-commit>
node --experimental-transform-types scripts/check-shared-submission.ts <submission-directory> <commit> <baseline-directory> <baseline-commit>
npm run test:shared-assets
npm run check:completion
```

専用PR workflowは `pull_request_target` で基準ブランチのvalidatorを使い、提出側からはデータディレクトリだけを別パスへcheckoutします。全jobはcontents:read、資格の永続化なし。PRのコード・依存インストール・workflow・スクリプトはこのjobで実行しません。標準Web checksは従来どおりPRのコードをread権限で検査します。追加の必須レビューや手動承認は設定しません。初回導入のPRでは、この専用workflowとvalidatorは基準ブランチにまだ存在しないため、以後の提出PRから有効です。

mainの確定commitでは、直前commitに対する不変性を再検査し、全原本をtrial-storeへ投入してhashを再確認します。7日保持の試験artifactを作ります。本番の外部ホストへの自動配布やrelease公開は接続していません。配布CLIは配置先と同じボリュームで実行してください。

```sh
node --experimental-transform-types scripts/shared-assets.ts publish <submission-directory> <merged-commit> <data-directory>/shared-originals
```

publishは排他ディレクトリ `publish.lock` を取り、全bytesの保存・hash確認、manifestとmap原文の一致、過去版の保持を確認した後にrelease記録とcurrentを同一ファイルシステムで原子的に置き換えます。途中失敗ではcurrentを更新しません。孤立した未参照objectは保全のため自動削除しません。同一commitのrelease記録の差し替えも拒否します。OS停止・電源断を含むディレクトリfsyncの耐久性試験は未実施です。

## 復旧

`shared-originals/` と `shared-state/` をセットでバックアップし、サービス停止中に復元します。mediaやブラウザcacheの削除ではこれらを削除しないでください。原本が破損した場合は、hashと一致するbytesをバックアップか同一commitのGit/LFS原本から復元します。hash照合を無効にして読み込ませないでください。旧カタログへ戻す場合は、そのカタログを参照する時点のshared-stateも同時に復元します。新しい原本を参照する状態だけを残して旧カタログへ戻す復旧は未対応です。

異常終了で `publish.lock` が残った場合は、配布プロセスが停止していることを確認してその空ディレクトリだけを削除し、同じ確定commitで再実行します。通常の失敗ではfinallyで解放します。別プロセスが動いている状態でlockを解除してはいけません。
