# ADランキングで銀河数を含む進行を比較する

反物質量を優先していたランキングを、Infinity 回数 → 銀河数 → Boost 数 → 送信時点の反物質量の順に改めた。サーバーで保存する上位50記録、同名の代表、代表同士の順位に同じ比較関数を使う。全項目が同じ記録の順序は保つ。未整列の既存保存や旧ランキングも、追加送信なしで初回取得から新しい基準で返す。

銀河数は手動・自動の共通経路で送信し、指定された値が非負の安全な整数でなければ保存前に400で拒否する。旧形式の省略はそのまま保存し、比較時だけ0相当とする。公開応答は許可した項目だけを返す。本人表示、認証、同じプレイヤーの記録の置換、保存方法、送信と更新のタイミングは維持した。新しい依存パッケージと変更履歴は追加していない。

## 利用者向けの変更

- 代表行と展開した各記録に、その記録の銀河数が表示される。実測の0と未取得を区別できる。
- Infinity 回数、銀河数、Boost 数、送信時点の反物質量の順で順位が決まる。同名の代表と保存する上位50記録もこの基準で変わる。
- 日本語・英語・韓国語で、順位基準、旧記録の扱い、購入やリセット後の順位低下、保存対象から外れた過去記録を復元できないことを案内する。

## 検証結果

2026-11-10、Windows の制限付き作業環境で実施した。通常の `node` / `npm` は Volta の管理フォルダーへアクセスできず起動しなかった。同梱の Node 24.22.1 では次のテストを実行できた。下記の `node` はこの同梱実行ファイルを指す。

| コマンド | 結果 |
| --- | --- |
| `node --experimental-transform-types --test shared/ad-ranking.test.ts server/ad-store.test.ts client/src/world/antimatter/leaderboard.test.ts client/src/ad/sync.test.ts` | 63件成功。比較の優先順、欠損と0、保存・再起動、上位50件、同値順、不正値による状態不変、同名集約、購入・銀河・Infinity・全初期化後の送信を確認 |
| `node client/src/ad/engine-boundaries.test.mjs` | 70件成功 |
| `node --experimental-transform-types client/src/ad/feedback.test.ts` | 7件成功 |
| `node --experimental-transform-types client/src/i18n/locale.test.ts` | 4件成功 |
| `node --experimental-transform-types client/src/i18n/core.test.ts` | 13件成功。三言語のキーと引数の一致を含む |
| `node scripts/check-changelog.mjs` | 成功。変更履歴は未変更 |
| `git diff --check` | 成功 |

次の指定コマンドはすべて試行したが、Volta のアクセス制限で起動できなかった。`npm run test:ad`、`npm run test:ad-server`、`npm run test:ad-ranking`、`npm run test:i18n`、`npm run check:content-locales`、`npm run typecheck`、`npm run build`、`npm run check:completion`。必須の完了チェックは未完了。

同梱 Node での代替実行にも制約がある。`localization.test.ts` と `labView.test.ts` は JSX の読み込み環境がなく実行できず、`bgmSettings.test.ts` は必要なパッケージがなく完走していない。型チェックとビルドに必要な開発パッケージもこの作業フォルダーにない。追加した HTTP 経路の400・保存不変の検証（`server/auth.integration.test.ts`）は `postgres` がなく起動できなかった。

`node scripts/verify-ranking-browser.mjs` は `vite`、`node scripts/test-ranking-browser.mjs` は `playwright` がなく起動できなかった。fixture と検証スクリプトには銀河列、三言語、0・未取得、案内と列の対応を追加したが、画面検証は未実施。

## 設計レビュー後の再検証（2026-11-10）

必須検証はまだ完了していない。以下は今回実行した結果であり、先の一部テストの成功で受け入れ条件全体を確認したとは扱わない。

- HTTPテストでは、`Infinity` などを `JSON.stringify` に渡すと `null` になる点を修正した。`1e999` と `-1e999` をJSON本文へ直接書き、解析後に非有限数になることを確かめてから、400応答・取得結果・保存ファイルの不変を検証する。
- ブラウザテストでは、日本語・英語・韓国語それぞれの900px・320px幅で、全列の見出しと値への到達、横方向キーによるスクロール、Spaceでの折りたたみ・Enterでの展開を確認する処理を追加した。各言語・幅の画像も保存する。これらの追加した操作検証は、下記の環境制約により実行できていない。

| 実行コマンド | 今回の結果 |
| --- | --- |
| `npm run test:ad` | 終了コード7。Voltaの管理フォルダーへアクセスできず開始前に失敗 |
| `npm run test:ad-server` | 同上 |
| `npm run test:ad-ranking` | 同上 |
| `npm run test:i18n` | 同上 |
| `npm run check:content-locales` | 同上 |
| `npm run typecheck` | 同上 |
| `npm run build` | 同上 |
| `npm run check:completion` | 同上。完了条件を満たしていない |
| `node --experimental-transform-types --test shared/ad-ranking.test.ts server/ad-store.test.ts client/src/world/antimatter/leaderboard.test.ts client/src/ad/sync.test.ts` | 63件成功、失敗・スキップなし |
| `node --test client/src/ad/engine-boundaries.test.mjs` | 70件成功 |
| `node --experimental-transform-types --test client/src/ad/feedback.test.ts client/src/i18n/locale.test.ts client/src/i18n/core.test.ts` | 24件成功、失敗・スキップなし |
| `node --experimental-transform-types --test server/auth.integration.test.ts` | 終了コード1。`server/test-db.ts` の `postgres` 読み込みで失敗。HTTP応答・保存不変の確認には到達していない |
| `node scripts/verify-ranking-browser.mjs` | 終了コード1。`vite` がなくfixtureを起動できない |
| `node scripts/test-ranking-browser.mjs` | 終了コード1。作業フォルダーに `playwright` がない |
| `node scripts/test-ranking-browser.mjs "$playwrightModule" "$chromeExecutable"` | 同梱Playwrightと既存Chromeでブラウザは起動したが、fixtureへの接続が `ERR_CONNECTION_REFUSED` で失敗。三言語の代表行・展開行、幅・スクロール・キーボード操作の検証は未実施 |
| `node --experimental-transform-types --check server/auth.integration.test.ts` | 成功。構文のみの確認 |
| `node --check scripts/test-ranking-browser.mjs` | 成功。構文のみの確認 |
| `node scripts/check-changelog.mjs` | 成功。変更履歴は未変更 |
| `git diff --check` | 成功 |

上表の `node` は、次の同梱実行ファイル（v24.22.1）を使用した。ブラウザ実行時の引数も以下の値を使用した。依存パッケージは追加していない。

```powershell
$taskNode = 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1104-2876-0_26.1104.2876.0_x64__3k8sg7r9htsxt/dependencies/node/bin/node.exe'
$playwrightModule = 'file:///C:/Program%20Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1104-2876-0_26.1104.2876.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/playwright/index.mjs'
$chromeExecutable = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
& $taskNode scripts/test-ranking-browser.mjs $playwrightModule $chromeExecutable
```

既存の依存パッケージを導入するため、同梱pnpm（11.25.0）で `pnpm import` を試したが、パッケージ取得先への通信が `EACCES` で繰り返し失敗したため中断した。`curl.exe -I --connect-timeout 5 --max-time 10 https://registry.npmjs.org` も接続できなかった。Dockerの稼働確認 `docker version --format '{{.Server.Version}}'` は、Dockerエンジンへの接続先がなく失敗した。依存パッケージに加え、HTTPテスト用のPostgreSQLも用意する必要がある。

## 引き継ぐ確認

- 依存パッケージと Node/npm を使える環境で指定コマンドをすべて実行し、画面の三言語テストと HTTP 経路を確認する。
- ブラウザfixtureで通常幅・狭幅の全列、横スクロール、同名記録の展開と折りたたみ、キーボード操作、本人表示を確認する。
- 本番の2D・3D双方からAD研究所を開き、日本語・英語・韓国語で代表行と展開行を確認する。

日本語はローカルの yomiyasu の観点で確認した。Notion版はダウンロードURLを取得できたが、アーカイブの取得が通信制限で失敗した。`python3`・`python`・`py -3` がいずれもなく、自動検査は実行していない（`yomiyasu-check: not_run reason=no_python`）。
