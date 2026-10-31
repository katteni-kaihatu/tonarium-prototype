# アイテム一覧の列配置の検証

## 変更内容

アイテム行だけを、可変幅の名前欄・72px の操作欄・56px の距離欄・30px のメニュー欄に分ける。near/mid で列幅と左右の余白を共通にし、「開く」「表示中」は操作欄の幅いっぱいに配置する。操作がない行も同じ欄を残す。

名前は省略表示し、所持者の文言は名前欄の下段で折り返す。LIVE も名前欄の下段に配置する。距離区分の判定、遠距離の farchip、参加者行、ウィンドウとメニューの操作処理は変更しない。

## 設計レビュー後の再検証（2026-10-31、HEAD 8e2e910 と作業ツリー差分）

**検証は未完了。** スクリプト本体の型チェック・ビルドと125件のテストは成功したが、指定の npm コマンドと実画面確認は完了していない。以下の成功結果から画面上の整列や操作の成功を判断しない。

### 指定コマンド

| コマンド | 終了コード | 結果 |
| --- | --- | --- |
| `npm run typecheck` | 1 | Volta の保存先作成権限エラー。検証本体は未起動 |
| `npm run build` | 1 | 同上 |
| `npm run test:client` | 1 | 同上 |
| `npm run test:i18n` | 1 | 同上 |
| `npm run test:image-list` | 1 | 同上 |
| `npm run check:completion` | 1 | 同上。CLAUDE.md の完了条件は未達 |

共通の出力は `Volta update error: Could not create directory`。コードの失敗とは区別する。

### スクリプト本体の直接実行

別のローカル worktree にある既存の `node_modules` を、この worktree の無視対象 `node_modules/` にコピーした。起動可能な Node.js v24.19.0 で、現在の `package.json` に定義されたスクリプト本体を実行した。依存宣言・ロックファイルは変更していない。ロックファイルから新規インストールした環境での検証ではない。

| 対応するスクリプト | 終了コード | 結果 |
| --- | --- | --- |
| `typecheck` | 0 | 型エラーなし |
| `build` | 0 | Vite 8.3.4、1194 modules。500 kB 超の chunk 警告あり |
| `test:client` | 0 | 99件成功、失敗・スキップ0件 |
| `test:i18n` | 0 | 21件成功、失敗・スキップ0件 |
| `test:image-list` | 0 | 5件成功、失敗・スキップ0件 |
| `check:changelog` | 0 | 既定の比較元で変更履歴の変更なし |
| `check:content-locales` | 0 | 登録文書38件が有効 |
| `git diff --check` | 0 | 空白エラーなし |

直接実行の再現手順（テスト対象は `package.json` の全対象ファイルを使う）：

```powershell
$nodePath = 'C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe'
& $nodePath node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
& $nodePath node_modules/vite/bin/vite.js build
$scripts = (Get-Content -Raw -Encoding UTF8 package.json | ConvertFrom-Json).scripts
foreach ($name in @('test:client', 'test:i18n', 'test:image-list')) {
  $testArgs = $scripts.$name.Split(' ') | Select-Object -Skip 1
  & $nodePath node_modules/tsx/dist/cli.mjs @testArgs
  if ($LASTEXITCODE -ne 0) { throw "$name failed" }
}
& $nodePath scripts/check-changelog.mjs
& $nodePath node_modules/tsx/dist/cli.mjs scripts/content-translations.ts validate
```

### 実画面確認を止めた理由

ブラウザー接続は `The browser access host is unavailable` で利用できなかった。実際の `NearList` と既存 CSS を読み込む一時的なローカル確認ページを用意し、Vite の起動までは成功した。既存の空タブを持つ Chrome を操作する代替経路も試したが、ツールが `Computer Use was not approved to use Google Chrome` を返し、ページの表示・撮影・操作には進めなかった。未実行の確認ページは削除し、サーバーも停止した。

ボタンの左右端の実測値、スクリーンショット、混在時の重なり・はみ出しの確認結果はない。参加者行の CSS とハンドラーに変更がないことは差分で確認したが、画面の回帰確認を代替しない。

### 未確認の画面条件

以下は確認に使う寸法であり、実測結果ではない。通常は `world.css` の320px、スマホは `responsive.css`、幅900px以下の一覧は `view3d.css` の指定を使う。スマホ横向きは720px以下のため、ポインター種別によらずスマホ用メディア条件に入る。

| 条件 | ビューポート | CSS上の一覧幅 | 日本語 | 英語 | 韓国語 |
| --- | --- | --- | --- | --- | --- |
| 通常2D | 1280 × 900 | 320px | 未確認 | 未確認 | 未確認 |
| スマホ縦 | 390 × 844 | 374px（左右8px、safe-area 0） | 未確認 | 未確認 | 未確認 |
| スマホ横 | 720 × 390 | 616px（左8px、右96px、safe-area 0） | 未確認 | 未確認 | 未確認 |
| 3D一覧幅 | 800 × 900 | 370px（50% − 30px） | 未確認 | 未確認 | 未確認 |

各条件で near/mid の左右端と、同一アイテムの3.0m → 3.1m → 11mでの左右端を採寸する必要がある。下記の混在・操作・参加者行の確認も各言語・幅で残る。通常環境で指定の5コマンドと `check:completion` を通し、実画面の結果を記録するまで受け入れ条件を達成した扱いにしない。

## 初回の検証結果（再検証前の記録）

- `git diff --check`：成功。
- `scripts/check-changelog.mjs`：既存の Node.js 24 実体で実行し成功。変更履歴ファイルの変更なし。
- `npm run typecheck`、`npm run build`、`npm run test:client`、`npm run test:i18n`、`npm run test:image-list`、`npm run check:completion`：すべて npm 起動時の Volta 権限エラーで終了し、検証本体は未実行。
- worktree に依存パッケージがなく、オフラインでの復元はキャッシュ不足、レジストリからの取得は接続エラーで失敗。
- 実画面：ブラウザー接続ホストが利用できず未確認。以下の受け入れ確認は未完了であり、整列や操作の成功を保証する結果はまだない。

## 実画面で残っている確認

日本語・英語・韓国語のそれぞれで、通常の 320px パネル、スマホ縦向き・横向き、3D 表示時の一覧を確認する。幅は `client/src/styles/responsive.css` と `client/src/styles/view3d.css` の既存指定を使う。

| 対象 | 確認内容 | 結果 |
| --- | --- | --- |
| near/mid | 同じパネル幅で「開く」の左右端が一致する | 未確認 |
| 距離の変化 | 同一アイテムを 3.0m → 3.1m → 11m に移し、ボタン位置が変わらない | 未確認 |
| 行の混在 | 長い名前、自分・他人の所持、LIVE、表示中、操作なしを混在させ、重なり・横方向のはみ出しがない | 未確認 |
| 開く操作 | 名前と「開く」から開ける。スマホでは画面タブに移る | 未確認 |
| 表示中 | 表示が更新され、ボタンから既存の確認処理に進む | 未確認 |
| メニュー | 名前側とメニューボタンのアンカー、開閉、各操作を維持する | 未確認 |
| キーボード | Tab で名前・操作・メニューへ移り、Enter/Space で実行できる。Escape でメニューが閉じる | 未確認 |
| 2D/3D | 切り替え後も開いている状態と操作を維持する | 未確認 |
| 参加者行 | near/mid の配信ボタン・距離・メニュー、追従者行の配置に変化がない | 未確認 |
| far | farchip の表示と開く操作を維持する | 未確認 |

`nearby.test.ts` は距離区分と丸めの検証であり、この実画面確認を代替しない。
