---
name: add-world
description: Tonarium に新しいワールド（セッションが読み込む 3D 空間の種類。今はホールとカフェ）を追加する、または既存ワールドの家具や見た目を変えるときの手順と、触るファイルの一覧。
---

# ワールドを追加する

先に CLAUDE.md のルールに従う（特に、仕様が曖昧なら実装前に質問する）。よく聞くこと：どんな場所か、家具に当たり判定を付けるか、どのセッションの最初のワールドにするか。

用語：セッション（`sessions.json` の 1 件。通話・チャット・アイテムを持つ）が、ワールド（3D 空間の種類）を 1 つ読み込む。ワールドは設定メニューから誰でも切り替えられる。

## 部屋の決まった形

- 床は x, z とも -10〜10（`ROOM_HALF`）、壁の高さ 4m。ふつうは形を変えず、色と中身だけ変える（`Shell` が床と壁を描く）
- 階や高い所があるワールド（街のマンションや駅など）は、当たり判定に `y0`〜`y1`（その高さの間だけ効く）を付け、歩ける面（床・坂）と動く物（電車・エレベーター）は `shared/city.ts` と `client/src/view3d/cityPhysics.ts` のやり方に倣う
- 部屋の外にも行ける場所が要るとき（ゲームワールドの塔など）は、`WORLDS` の `extent` で 3D の人がいられる範囲を広げ、床と壁は自前で描く（`game3d.tsx` の `GameWorld` を参照）。部屋の外での移動・高さ・落下は `client/src/view3d/Player.tsx` の `groundAt` と `clampTo` に足す
- 南寄りの丸いスポーンエリア（`shared/protocol.ts` の `SPAWN`：中心 (0, 6.5)、半径 1.6）には家具を置かない。入ってきた人と 2D の人がここに立つ
- yaw 0 は -Z（北）向き

## 触るファイル

1. `shared/worlds.ts`（必須）
   - `WorldKind` に種類を足し、`WORLDS` に名前・説明（設定メニューに出る）・`solids`（通り抜けられない物）を足す
   - `solids` は円 `{ x, z, r }` か箱 `{ x, z, w, d }`（x, z が中心）。3D の人・2D の人・アイテムがここから押し出される
   - 家具の配置は `CAFE` のように定数にまとめ、見た目と当たり判定の両方から使う（ずれないように）
2. `client/src/view3d/worlds3d.tsx`（必須）
   - `PALETTES` に床・壁・スポーンエリアの色、`WORLD_BG` に背景色を足す
   - 家具などの中身をコンポーネントで書き（`Cafe` を参考に、`Box`・`Cyl` を使う）、`WorldMesh` の分岐に足す。床と壁は `Shell` が描く
   - 光源もワールドごとに置く（`Hall` と `Cafe` の先頭を参照）。照準の当たり判定が要らない飾りは `userData={{ noRay: true }}`
3. `sessions.json`：あるセッションの最初のワールドにするなら `"world": "<種類>"`
4. ドキュメント：`docs/3d.md` の「ワールド」の節と、README の「セッション構成の変更」の `world` の候補を更新する

## 確認

- `shared/changelog.ts` の先頭に今回の変更を追記し、`npm run check:completion`（履歴チェック・型チェック・ビルド）を通す。失敗したら完了にしない
- 見た目はブラウザで確かめる効果が高い。`npm run dev`（`.claude/launch.json` の `dev`）で入って 3D にし、`window.__t3d.pos(x, z)` と `look(yaw, pitch)` で見たい所へ動かして撮る。前面のパネルは `document.querySelectorAll('.panel, .worldbadge').forEach((e) => (e.style.visibility = 'hidden'))` で隠せる
- 当たり判定は `pos` で家具の中に入れてから `state().selfAvatar` を読み、外へ出されているかを見る
- ワールドの切り替えは設定メニューの「ワールド」から（全員に反映され、ログに出る）
