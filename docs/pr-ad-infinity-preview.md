# ADポータルの無限タブを到達前から閲覧する

Infinity 到達前から、既存の無限タブで強化16種と自動化6種の説明を確認できるようにした。購入・解放・切り替え・強化は Infinity 回数が1以上の場合に限り、従来の費用・前提条件に従って実行する。到達前は操作ボタンを無効にし、初めての Big Crunch 後に使えることを日本語・英語・韓国語で案内する。

## 変更内容

- 一覧は既存の InfinityPanel・InfinityUpgradesPanel・AutomationPanel を使う。強化の列ごとの前提条件と説明は維持する。
- エンジンで操作を拒否してから IP や状態を変更する。表示側の自動化の判定も到達履歴・解放状態・費用・最大段階に合わせた。
- 呼び出し元を再検索し、操作経路がパネル → adapter → slice → engine であることを確認した。3D は labView の進行情報で展示と自動化の印を表示し、今回の購入・自動化設定操作を直接呼ぶ別経路は見つからなかった。
- slice の凍結中の拒否、成功時だけの更新と購入演出、レイヤーの表示・解放条件、セーブ形式は変更していない。

## 検証結果

### 設計レビュー後の再確認（2026-11-09）

- `npm run test:ad`、`npm run typecheck`、`npm run check:completion` を再実行した。すべて Volta のディレクトリ作成権限エラーで起動前に終了した（終了コード7）。テスト失敗の有無を判断できる段階には進んでいない。
- `node scripts/verify-ranking-browser.mjs` と `node scripts/test-ranking-browser.mjs` も同じエラーで終了した（終了コード7）。追加したタブクリック検証は未実行。
- worktree に依存パッケージはない。別の既存配置にある `tsx` も読み取りが拒否された。Node の公式配布先から検証用の実行環境を取得しようとしたが、接続できなかった。WSL もアクセス拒否で利用できなかった。
- `git diff --check` は成功した。`git diff HEAD --name-only -- changelog/ shared/changelog.ts` の出力は空で、変更履歴に差分がないことを再確認した。
- 今回は実装・テストコードを変更していない。画面・slice・三言語・3D回帰テスト、型検査、ビルド、Playwright の成功は引き続き未確認。push・PR作成は禁止されているため、変更をCIへ送って実行することも行っていない。レビュー指摘への対応は未完了。

依存パッケージとブラウザを利用できる環境では、次の順に再実行し、成功した件数と結果をこの本文に追記する。

1. `npm ci`
2. `npm run test:ad`（画面・slice・三言語・既存3D回帰を含む）
3. `npm run typecheck`
4. `npm run check:completion`（変更履歴チェックの比較元を指定する場合は README の手順に従う）
5. `node scripts/verify-ranking-browser.mjs` で fixture を起動し、別の端末から `node scripts/test-ranking-browser.mjs <Playwrightのmodule URL> <ブラウザー実行ファイル>` を実行する。

### 引き継ぎ時点の記録（今回の実行結果ではない）

- `npm run test:ad`、`npm run typecheck`、`npm run check:completion` を実行したが、Volta が自身のディレクトリを作成できず、起動前に終了した。
- 既存の Node v22.22.0 を直接使った `node --test client/src/ad/engine-boundaries.test.mjs` は70件すべて成功した。全定義について到達前の拒否と状態保持、到達後の成功・残高不足・前提不足・重複購入・未解放・重複解放・最大段階での拒否を確認した。
- `node scripts/check-changelog.mjs --base HEAD`、`node --check scripts/test-ranking-browser.mjs`、`git diff --check` は成功した。
- 画面・slice・翻訳のテスト、型検査、ビルド、ブラウザ検証は未実行。worktree に依存パッケージがなく、他の配置済みパッケージも権限エラーで読み取れなかった。

## 追加した自動検証

- `boundaries.test.tsx`：実パネルのタブのクリック処理を呼び、選択状態と次の描画を検査する。到達前の初期状態、十分な IP がある未解放状態、解放済みの OFF・ON 状態で全一覧と操作無効を確認する。到達後の IP 0 での閲覧・切り替え、レイヤー条件も対象にした。
- 同ファイルの既存 slice 用ハーネスで、全操作の拒否時に進行・更新番号・購入演出が変わらないこと、到達後の各条件と凍結中の拒否を検査する。
- `localization.test.ts`：案内のキーと対応文言を三言語で取得する。
- 既存の Playwright 検証も更新した。`node scripts/verify-ranking-browser.mjs` で起動し、`node scripts/test-ranking-browser.mjs <Playwrightのmodule URL> <ブラウザー実行ファイル>` で実際にタブをクリックする。到達前の全一覧・操作無効と、到達後の IP 0 での切り替えを検査する。

## 未確認事項とテスト上の前提

- 追加した画面・slice・翻訳のテストは、この環境で実行できていない。型検査とビルドも通過を確認できていないため、完了判定は保留する。
- DOM を使わないタブ操作テストでは、React 19 の内部のフック接続先を一時的に差し替えている。React の更新で内部構造が変わると、このテスト用の処理を修正する必要がある（`boundaries.test.tsx` の `interactivePanel`）。実際のブラウザでのクリック検証は別途 Playwright で行う。
- 3D の展示・自動化の印について既存の回帰テストを残しているが、今回は実行できていない（`boundaries.test.tsx`）。

## 本番で確認

- デスクトップとスマホの2D表示で、説明と案内が読め、到達前に操作できない理由が分かること。見切れ・重なり・スクロール・ボタンへの到達を確認する。
- 2D・3D の既存の入口から開き、到達後の展示・自動化表示・操作が従来どおりであることを確認する。

## 利用者向けの変更

- 初めての Big Crunch 前から、無限タブで強化と自動化の全一覧・説明を読める。
- 到達前は操作できない理由を案内し、購入・解放・切り替え・強化は到達後に使える。

変更履歴には触れていない。push・PR作成・リリースは実行していない。
