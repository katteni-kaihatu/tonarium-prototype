# AD研究所の言語切替検証

## 一時通知による操作欄の移動を防ぐ検証

一時通知は本文の上に吹き出しとして重ねる。通知と表示用の枠はクリックやホイールを受け取らず、本文の高さや隙間を増やさない。サーバー状態は従来どおり本文の先頭に表示し、同時表示中は一時通知を本文の下端に置いて重なりを避ける。通知の翻訳、最新通知から5秒の表示期限、移行とセーブ選択の表示条件は維持する。

`scripts/test-ad-browser.mjs` は、実際のブーストボタンから通知を出し、日本語・英語・韓国語と幅320・375・390・540・1000pxで次を確認する。ゲームの自動進行は開始せず、次のブーストに必要な次元の量だけをテスト側で用意する。

- 通知前・表示中・更新後・消去後の操作欄と各ボタンの座標・寸法が一致する。ページと本文のスクロール位置も一致し、測定途中では位置を補正しない。
- 吹き出しと重なる有効なブーストボタンを座標クリックし、実際にブースト回数が増える。通知上からのホイールで本文がスクロールする。
- 既存の翻訳文言を表示し、更新前の期限では消えず、最新の通知から5秒で消える。ブラウザーの時計を進めて期限の直前・直後を確認する。
- サーバー状態のみ、通知との併存、通知消去後の表示を確認する。移行時は進行選択、移行中ではないセーブ選択待ちはローカル・サーバーの選択ボタンを表示する。

通知の検証だけを実行する場合は、既存の実行コマンドの末尾に `--notice-only` を付ける。通常時と広告フィルター相当のCSS適用時の両方を実行し、結果を `.local/verification/ad-browser-notice.json` に保存する。既存の全体検証を省略した結果なので、全体の成功とは区別する。

2026-11-10の検証では、既存のNode v24.22.1・Playwright・Chromium 153.0.8010.36を再利用し、通知専用の30組み合わせが成功した。ADのテスト、型チェック、ビルド、履歴検査、翻訳文書検査も各処理の直接実行で成功した。`npm run test:ad`、`npm run typecheck`、`npm run build`、`npm run check:completion` はVoltaの保存先への書込権限で起動できず、正式な完了コマンドの成功は確認できていない。依存はlockfileが一致する既存worktreeからコピーし、依存定義は変更していない。

全体ブラウザー検証は失敗した。数値境界の検査は幅320px・日本語・99999→100000の資源表示幅で140→141.171875pxとなり停止した。その後の操作検査も、現在の画面にない `.adlab-card`・`.adlab-dimension-card` と、横スクロールするタブ列の検査で停止した。今回の通知専用検証はこれらと分けて記録しており、全体検証の条件は緩めていない。発生端末での再現、実際のChrome・Edge・スマホ2Dの読みやすさと画面端の欠けは未確認。

## 既存の検証手順と記録

開発用ページは `node node_modules/vite/bin/vite.js --host 127.0.0.1` で起動し、`http://127.0.0.1:5173/ad-localization-test.html` を開く。通常のビルドの入口には含まれず、サーバーにも接続しない。本体のReactコンポーネントとThreeのCanvasを使い、日→英→韓→日を切り替える。

ページでは、全タブ・選択レイヤー・入力の保持、通知の再翻訳と期限、数値が停止したCanvasの更新、照準案内、テクスチャの解放、所有者の操作条件を検査する。ただし、一部アクションを差し替えている。このページのPASSだけで、主要操作の実動作を確認済みとは扱わない。

本体では別途、全タブ・関連設定・通知中の表示更新、入力保持、長文の欠け・重なり・スクロール・ボタン到達性、停止中Canvas、照準中の案内を目視確認する。購入・Tickspeed・Boost・Galaxy・Sacrifice・Big Crunchの状態変化、確認の承認・取消、非所有者の操作制限、保存後の再読み込みは、アクションを差し替えずに検証する。

## 広告フィルター相当のCSSを使う検証

表示用クラスは `adlab-` に統一する。CSS変数、アニメーション名、`data-ad-core` や `data-xr-surface="ad-confirm"`、翻訳・保存のキーは変更しない。ランキングの独立検証ページとDOM検索も同じクラス名を参照する。

Viteを上記の手順で起動してから、既存のPlaywrightとブラウザーを指定して実行する。依存パッケージやブラウザーをダウンロードする処理はない。既定の接続先は上記URL。別ポートでは `AD_TEST_URL` に検証ページのURLを設定する。

```powershell
node scripts/test-ad-browser.mjs <Playwrightのmodule URL> <ブラウザー実行ファイル>
```

各引数を省略した場合は、既存の `playwright` とその既定ブラウザーを使う。終了コード0はPASS、1はFAIL。ブラウザーのバージョンと検査結果を標準出力と `.local/verification/ad-browser.json` に記録する。

通常時と、次のCSSを注入した場合の両方で、既存の言語・数値境界・3D・所有者の検証を実行する。

```css
.ad-body, .ad-card, .ad-header, .ad-small, .ad-tabs { display: none !important; }
```

さらに `?interactive=1` で独立したテスト用ゲームを描画する。`createAdSlice` と本体の操作処理を使い、サーバー接続や実利用者の保存は開始しない。日本語・英語・韓国語×幅320・375・390・540・1000pxの全組み合わせで、必須要素の件数と非ゼロ寸法、パネルからの横方向のはみ出し、タブの選択状態と本文変更を調べる。意図的に隠す補助表示や、既存のレイヤー切替・ランキング表内の横スクロールは維持する。

Playwrightから表示中のボタンをクリックし、購入数の増加と資源の減少、購入演出の発生と位置、確認ダイアログの承認・取消・Escape・フォーカスの循環と復帰を調べる。各タブ・ダイアログ・購入演出を表示した際に、生成されたクラスに `ad-` がないことも検査する。言語切替中の進行不変を調べる従来の検証と、進行を変える実購入の検証は、別のゲームで行う。検証後は注入したCSSを取り除き、描画とブラウザーのテスト用状態を破棄する。

変更前の記録は、クラス変更前のソースでViteを起動し、同じスクリプトに `--before` を追加する。スクリプトは別途変更後の作業場所から実行できる。旧パネルの初回描画で注入前後の資源・タブ・本文・カードの件数と寸法、注入規則とパネルCSSの読み込みを記録し、`.local/verification/ad-browser-before.json` に保存する。これはCSS注入による再現であり、実際の広告ブロッカーでの再現とは区別する。

### 前回の実行結果（2026-11-07、今回の再検証前）

- `npm run test:ad`、`npm run typecheck`、`npm run build`、`npm run check:completion` はそれぞれ終了コード1。すべてVoltaがユーザーディレクトリを作成できず、スクリプト本体の実行前に停止した。コードの失敗とは判定できない。
- 既存の別Node v24.22.1で、エンジン境界テスト65件はPASS、終了コード0。指定の `npm run test:ad` 全体の成功とは扱わない。
- 同じNodeでブラウザー実行スクリプトの構文検査と、`node scripts/check-changelog.mjs --base HEAD` はPASS、終了コード0。
- このworktreeにはViteを含む依存パッケージがない。Viteの直接起動は `MODULE_NOT_FOUND` で停止した。既存pnpmによるオフライン導入も、対応するロックファイルがないため停止した。依存の追加・ロックファイルの変更はしていない。
- 既存PlaywrightとChrome実行ファイルを再利用し、Chromium 153.0.8010.36で変更前用の実行を試みた。開発サーバーに接続できず `ERR_CONNECTION_REFUSED`、終了コード1。CSS注入前後の測定は実行できていない。変更後の三言語・各幅・実購入・確認操作・3Dの検証も未確認。今回の変更がブラウザーでPASSしたとは扱わない。

案件1568620216349491211との重複確認、最新developへの統合後の旧クラス再混入と検証結果の確認は、オーケストレータへ引き継ぐ。この作業環境には、その確認を依頼する接続先が提示されていない。Git操作、案件状態、マージ可否は確定していない。

報告者のFirefox、広告ブロッカーとフィルター構成、無効化した際の結果、EasyListの該当規則、PR #423との因果関係、添付内容は未確認。報告者の環境でブロッカーを有効にしたまま再読み込みし、FirefoxとChrome／Edgeで三言語・狭い画面・購入演出・確認ダイアログを目視確認する必要がある。

### 設計レビューへの対応と再検証（2026-11-07）

以下が今回の結果。前回の「依存パッケージなし・ブラウザー未実行」という状態から、既存環境を再利用して検証を進めた。[測定値と各組み合わせのPASS／FAIL](./ad-blocker-browser-results.json)も記録した。

Node v24.22.1は `C:/Users/neo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`、Playwrightは同runtimeの `dependencies/node/node_modules/playwright/index.mjs`、ブラウザーは既存の `C:/Users/neo/.cache/puppeteer/chrome/win64-153.0.8010.36/chrome-win64/chrome.exe`。ブラウザーの報告バージョンは **Chromium 153.0.8010.36**。依存パッケージは別worktree `task-1565723054066372708-1793435772071` から本worktreeの `node_modules` へコピーした。両方のpackage-lock.jsonのSHA-256は一致した。依存追加・ダウンロード・ロックファイルの変更はしていない。

変更前は `git archive HEAD`（`4b3fe3ac9edf5c93f33102abb35d9ab5bea8019f`）から `client`・`shared`・`scripts` とVite設定・package.json・tsconfig.jsonを `.local/ad-before` へ展開し、Viteを5174番で起動した。変更後は本worktreeで5173番を使った。Nodeのディレクトリをコマンド内のPATHの先頭に置き、先述のVite起動コマンドとブラウザースクリプトを実行した。変更前のみ `AD_TEST_URL=http://127.0.0.1:5174/ad-localization-test.html` と `--before` を指定した。

変更前のCSS注入による再現は **PASS**（終了コード0）。CSS読み込みと注入した1規則を確認した。注入前後の最初の要素の幅×高さは次のとおり。実際の広告ブロッカーは使っていない。

| 対象 | 件数 | 注入前（px） | 注入後（px） |
| --- | ---: | ---: | ---: |
| 資源表示 | 1 | 81.92×26.39 | 0×0 |
| タブ領域 | 1 | 179×563.61 | 0×0 |
| 本文 | 1 | 515×563.61 | 0×0 |
| カード | 4 | 246×135.13 | 0×0 |

変更後の操作検証は次の全組み合わせで **PASS**。各欄は日本語・英語・韓国語のすべてを含む。

| 画面幅（px） | 通常時 | 同じCSS適用時 |
| ---: | --- | --- |
| 320 | PASS | PASS |
| 375 | PASS | PASS |
| 390 | PASS | PASS |
| 540 | PASS | PASS |
| 1000 | PASS | PASS |

各組み合わせで、資源・タブ・本文の件数と寸法、全タブとサブタブの選択状態・本文変更、必要なカードや入力欄の件数と寸法、横方向のはみ出しを確認した。表示中の購入ボタンをブラウザーからクリックし、実購入による購入数の増加と資源の減少、購入演出の位置も確認した。確認ダイアログは承認・取消・Escape・フォーカスの循環と復帰を確認し、生成クラスに旧接頭辞がないことも検査した。

`panelLayout` はDimensionsの4カード・8次元、Infinity強化16カード、自動化6カード、統計・保存・各レイヤーの必須要素を選択中の画面ごとに検査する。Infinity強化と自動化のカードを追加CSSで意図的に隠し、検査が必ず失敗することも通常時・同じCSS適用時で確認した。追加CSSは直後に除去し、検証終了時には描画とブラウザーコンテキストを破棄した。

既存の所有者条件の検査は、誰でも使える個人用BGMボタンまで操作禁止と判定していた。ゲーム操作ボタンだけを対象に修正し、言語・入力・通知期限・3D・所有者条件の検査を通過した。ただし、その後の数値境界検査は **FAIL**。幅320px・日本語・Infinity前の999→1,000で、資源表示の幅が40.609375pxから62.421875pxへ変わり、寸法差0.6px未満という既存の条件を満たさない。通常時・CSS適用時の両方で同じ失敗があり、ブラウザースクリプト全体は終了コード1となる。失敗を無視せず、操作検証を最後まで実行してから全体をFAILにするようにした。

切り分けとして、変更前の製品コードに今回の検証ページを旧クラスのセレクターで適用して同じ検査を行い、同じ数値・同じ幅の変化でFAILを確認した。CSS全文もクラス名の置換と改行の違い以外は一致する。この数値表示の幅変化は今回のクラス名変更前からある。ゲームの仕様・レイアウトを維持する依頼のため、製品CSSや検査の許容値は変更していない。数値境界の残りの組み合わせは最初の失敗で停止しており、全件成功とは扱わない。

| コマンド | 終了コード | 結果 |
| --- | ---: | --- |
| `npm run test:ad` | 7 | 環境上の失敗：Volta初期化で停止 |
| `npm run typecheck` | 7 | 同上 |
| `npm run build` | 7 | 同上 |
| `npm run check:completion` | 7 | 同上 |
| test:adのスクリプト本体を別Nodeで直接実行 | 0 | PASS：エンジン境界65件＋後半147件、スキップ0 |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | 0 | PASS |
| `node node_modules/vite/bin/vite.js build` | 0 | PASS（チャンクサイズ等の警告あり） |
| `node scripts/check-changelog.mjs --base HEAD` | 0 | PASS：変更履歴への変更なし |
| `node --check scripts/test-ad-browser.mjs` / `git diff --check` | 0 | PASS |

指定のnpmコマンドはすべて `Volta update error: Could not create directory C:\Users\neo\AppData\Local\Volta` でスクリプト本体の実行前に停止した。直接実行の成功をnpm経由の成功とは扱わない。ログは `.local/verification/` に保存した。**指定npmコマンドの成功とブラウザー全体のPASSは未達**であり、完了・マージ可能とは判定しない。実際のFirefox・広告ブロッカー、本番での目視確認、オーケストレータによる重複確認・統合後の確認も引き続き未確認。

### PR本文用の記録

利用者向けの変更：AD研究所の表示用クラスを、広告向けの汎用クラス名と重なりにくい `adlab-` へ変更した。ゲームの仕様とCSSのレイアウト指定は維持する。広告ブロッカーを有効にした実環境での改善は、まだ確認できていない。

変更前後の再現結果、実行環境、検証結果、未確認事項は上記のとおり。必須チェックとブラウザー検証が残っているため、受け入れ条件の達成やマージ可能とは報告しない。push・PR作成・リリースは実行していない。

## 実行結果（2026-10-28、設計レビュー後の再検証）

### 実行環境と失敗の分類

通常のNodeは `C:\Program Files\Volta\node.exe`。`node --version` は終了コード7で停止した。標準エラーは `Volta update error: Could not create directory C:\Users\neo\AppData\Local\Volta`、`Please ensure that you have the correct permissions.`、`Unable to write error log!`。アプリの型・テストの失敗ではなく、Volta初期化時の権限制限に分類する。

`C:\Users\neo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` はv24.19.0、終了コード0。このディレクトリをコマンド内だけPATHの先頭に置き、以下のスクリプト本体を直接実行した。

`npm run test:ad`、`test:ad-server`、`test:i18n`、`typecheck`、`build`、`check:completion` も個別に実行したが、すべてVoltaで終了コード7となった。npm経由の成功とは扱わない。

### 同期テストの修正とdevelopとの照合

HEADは `afd9e45`、取得済み `origin/develop` は `36fc766d7d8ad655667517af7cd15d11c836e267`。

`sync.test.ts` の409を返す場面には、develop側に別端末の更新を再現する修正があった。同じremoteを返す従来の条件では、すでに選択した内容としてreadyへ復帰するため、choiceの期待と一致しない。developと同じく、remoteのgalaxiesを10へ更新してから409を返す条件を取り込んだ。choiceの期待は維持し、同期処理・ゲーム計算は変更していない。

develop側のランキング集約とそのテスト・文言・CSSも作業ファイルへ統合し、通知をUiMessageで保持する本件の変更を残した。翻訳テストではADキーの集合と差し込み引数を三言語で比較する。

### 成功した確認

以下はすべて別のNodeから直接実行し、終了コード0。

- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`。確認文の未指定値は空文字へ正規化済み。Canvas計測と画像参照は `instanceof HTMLCanvasElement` で絞る。
- test:adのスクリプト本体。エンジン境界39件、後半133件が全件成功（計172件、スキップ0）。同期テスト、追加localizationテスト5件、developのランキングテストを含む。
- test:ad-serverとtest:i18nの対象を `node --import tsx --test` で実行し、計27件成功。
- `node --import tsx --test client/src/xr/runtime.test.ts`：2件成功。
- `node node_modules/vite/bin/vite.js build`。チャンクサイズ・動的importの既存警告あり。
- `node scripts/check-changelog.mjs --base HEAD`、`node --import tsx scripts/content-translations.ts validate`、`git diff --check`。

これらはブラウザでの表示や操作を確認した結果ではない。

### 先行XR差分の分離

先行変更は一時領域 `C:\Users\neo\AppData\Local\Temp\ad-develop-vO6OYt\prior.patch` に保存した。XR設定・スライダー配置・runtimeと関連テスト・docs/webxr.mdは取得済みdevelopの内容にそろえた。`git diff origin/develop -- client/src/xr docs/webxr.md` では、XRControls.tsxのAD候補タイトル2か所の翻訳だけが残る。WindowLayer.tsxはADのウィンドウタイトルと入口案内の言語更新に必要。

### 環境上の停止と未確認事項

ブランチ統合は `git merge --no-commit --no-ff origin/develop` で試みたが、Git管理領域が読み取り専用のためORIG_HEAD.lockを作れず停止した。上記は関連作業ファイルを三方向比較して取り込んだ結果であり、ブランチ全体の統合完了とは扱わない。最新リモートの取得、ブランチ統合後の再検証、最終的なPR差分の確定はオーケストレータ側に残る。

実画面検証も再試行した。ブラウザ一覧の取得は `The browser access host is unavailable`、既存Chromeウィンドウへの接続は `Computer Use was not approved to use Google Chrome` で停止した。

開発用ページと本体の双方で、日→英→韓→日、全タブ・関連設定・通知中の更新、入力・レイヤー保持、長文の欠け・重なり・スクロール・ボタン到達性、停止中Canvas、照準中の案内は未確認。購入・Tickspeed・Boost・Galaxy・Sacrifice・Big Crunchの実画面での状態変化、確認の承認・取消、非所有者の操作制限、保存後のブラウザ再読み込みも未確認。

ZIP・変更履歴は変更していない。push・PR作成・リリースも実行していない。実画面検証・ブランチ統合・npm経由の必須チェックが残るため、完了として扱わない。

### PR本文に記載する利用者向けの変更

- AD研究所の説明、操作案内、実績、レイヤー、保存・ランキング案内、確認文、通知が日本語・英語・韓国語の表示言語に対応。
- 3Dのラベル・操作案内・情報ボードも言語切替に追従し、選択中のタブやレイヤー、入力、進行を維持する。
