# AD研究所の言語切替検証

開発用ページは `node node_modules/vite/bin/vite.js --host 127.0.0.1` で起動し、`http://127.0.0.1:5173/ad-localization-test.html` を開く。通常のビルドの入口には含まれず、サーバーにも接続しない。本体のReactコンポーネントとThreeのCanvasを使い、日→英→韓→日を切り替える。

ページでは、全タブ・選択レイヤー・入力の保持、通知の再翻訳と期限、数値が停止したCanvasの更新、照準案内、テクスチャの解放、所有者の操作条件を検査する。ただし、一部アクションを差し替えている。このページのPASSだけで、主要操作の実動作を確認済みとは扱わない。

本体では別途、全タブ・関連設定・通知中の表示更新、入力保持、長文の欠け・重なり・スクロール・ボタン到達性、停止中Canvas、照準中の案内を目視確認する。購入・Tickspeed・Boost・Galaxy・Sacrifice・Big Crunchの状態変化、確認の承認・取消、非所有者の操作制限、保存後の再読み込みは、アクションを差し替えずに検証する。

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
