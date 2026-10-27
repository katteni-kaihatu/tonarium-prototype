---
name: add-item
description: Tonarium に新しいアイテム（サイコロ・チェス・付箋のような、ワールドに置いて 2D/3D で使う物）を追加する、または既存アイテムの仕組みを大きく変えるときの手順と、触るファイルの一覧。
---

# アイテムを追加する

先に CLAUDE.md のルールに従う（特に、仕様が曖昧なら実装前に質問する）。よく聞くこと：2D/3D のどちらで使えるか、結果を誰が決めるか、誰に見えるか、チャットに残すか、個数や大きさの上限。

既存の付箋やチェス盤などのモデルにボタン・タイマー・着席の動作をつなぐには、先に[ワールド制作の共有システム例](../add-world/SKILL.md#共有システムを使ってマップを作る)を参照する。新しいアイテムの種類を作らず、コードマップの `.item()` と `bindings` で既存モデルを再利用できる。対応するアイテムと制約は[共有システムの案内](../../../docs/shared-systems/README.md)を参照する。

カタログの保存場所は `docs/shared-systems/`。[全体の目次](../../../docs/shared-systems/README.md)からIDを選ぶか、[アイテム別の `items/`](../../../docs/shared-systems/items/)と[システム別の `systems/`](../../../docs/shared-systems/systems/)を開く。各文書のファイル名は `<itemId>.md` または `<systemId>.md`。

既存モデルのまま別の所持アイテムとして選ばせる場合は、`shared/item-variants.ts` の `camera-timer` を参考にする。通常の `kind: 'camera'` と区別する `variant` を作成要求・保存・メニューに渡し、カメラごとのサーバー処理とクライアント操作を接続する。登録だけでは新しい動作は実装されない。5秒タイマーカメラは `server/timed-camera-items.ts` と `client/src/items/useTimedCamera.ts` で共有タイマーを使い、通常の出現時にそのアイテムだけの実行状態を作る。セッションのコードマップは置き換えない。使い方は[接続例](../../../docs/shared-systems/camera-timer-test.md)を参照する。

## 触るファイル

1. `shared/items.ts`（必須）
   - `ItemKind` に種類を足し、`Item` のユニオンに状態の型を足す
   - 操作があれば `ItemAction` に足す。頻繁な操作（線を描くなど）は `isDeltaAction` に入れると、アイテム全体でなく操作だけが配られる
   - `ITEM_INFO` に名前・1〜4 文字のマーク・色（tint/ink）・説明・ジャンル・`in2d`/`in3d` を足す。ここに足せば「出す」のピッカーに自動で出る
   - 3D 専用なら `ONLY_3D` に足す（サーバーも 2D からの作成を断る）
   - `createItem` に初期状態、`applyItemAction` に操作の適用を書く。クライアントとサーバーの両方で使われる
2. `server/spacing.ts`：`ITEM_R` に床で占める半径（2D の人の押し出しと、出すときの空き場所探しに使う）
3. `server/index.ts`（必要なときだけ）：乱数で結果を決める・秘密がある・遅れて何かする操作は、`case 'itemAction'` の `applyItemAction` より前で受けて専用の関数で処理する（例：`rollDice`、チェスAIの `scheduleChessAiReply`）
4. 3D：`client/src/view3d/items3d.tsx` の `Item3D` の switch に足す。部品は新しいファイル（例：`dice3d.tsx`）に書き、`itemHelpers.ts` の `useFollow`（運んでいる間の追従）と `removable`（右クリックで運ぶ・X で片付ける）を使う。照準の操作は `userData` に `Interactable`（`use`・`hint` など）を置く。キャンバスで描くパネルで足りるなら `client/src/items/panels.ts` の `PANELS` に足すだけで 2D と 3D の両方に出る
5. 2D：`client/src/world/WindowLayer.tsx` の `useResolved` でウィンドウの中身を返す。React で作るなら別ファイル（例：`DiceBody.tsx`）にし、`Kind` に種類を足すとウィンドウに `k-<種類>` のクラスが付く。`compact`（カンタンモードの下の小さい表示）のときは操作部品を出さない
6. チャットに残すなら `shared/protocol.ts` の `ChatMessage` にフィールドを足し、`client/src/world/NoticeLog.tsx` の `LogLine` で表示する。サーバーでは `pushChat` に渡す（`to` を付けると宛先だけに届く）
7. スタイルは `client/src/styles/` の該当する領域のファイル（`client/src/style.css` が元の順序で集約）、手元だけの設定（人ごとの選択など）は `client/src/store.ts` に `load`/`save` で持つ
8. `docs/items.md` の一覧に使い方を足す（長くなるなら節を立てる）。README の「主な機能」のアイテム名の列にも足す

## 決まりごと

- サーバーが正。乱数や勝敗などの結果はサーバーが決めて `sendItem(sid, it)` で配る（内部で `roomSend` を使う。電話は宛先ごとに中身を分ける。ホーム向けの `broadcast` はアイテム配布には使わない）
- 全員に同じ演出を見せるときは、サーバー時刻（`Date.now()` を状態に入れる）と id から作る乱数（`shared/dice.ts` の `seededRng`）で、各クライアントが同じ動きを計算する。クライアントでは `serverNow()` を使う
- 秘密の情報（シークレットの結果など）はアイテムの状態に入れない。アイテムは全員に配られるので、本人宛てのチャット（`to: [本人]`）など別の道で渡す
- 演出の前に結果がチャットに出てしまわないよう、チャットへの記録は演出が終わってから行う
- 3D と 2D で同じ色や定数を使うものは `shared/` に置く

## 確認

- 変更履歴（`changelog/`・`shared/changelog.ts`）には触れず、PR 本文の「利用者向けの変更」に追加内容を書く。`npm run check:completion`（履歴チェック・型チェック・ビルド）を通す。失敗したら完了にしない
- ブラウザで確かめる場合（効果が高いときだけ）：`npm run dev`（`.claude/launch.json` の `dev`）を起動し、`?as=a` と `?as=b` で別人として入る。参加後は次が使える
  - `window.__t3d`（3D のときだけ、開発時のみ）：`pos(x, z)`・`look(yaw, pitch)`（yaw 0 で -Z 向き、π で +Z 向き）・`use()`（照準の先をクリック）・`key('KeyX')`・`state()`（ストアの中身）
  - `globalThis.__tonariumWs.send(JSON.stringify(msg))` でサーバーへ直接送れる
  - 3D の描画は前面のタブでしか進まない。マイク・画面共有はブラウザペインでは使えない
