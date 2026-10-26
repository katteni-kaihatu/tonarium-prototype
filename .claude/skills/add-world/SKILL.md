---
name: add-world
description: Tonarium に新しいワールド（セッションが読み込む 3D 空間の種類。現行はホール・カフェ・ゲーム・サバイバーズ・街・ガーデン・星あかりのラウンジ・AD 研究所の8種）を追加する、または既存ワールドの家具や見た目を変えるときの手順と、触るファイルの一覧。共有システムをコードで配置・接続する例も含む。
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
3. `client/src/home/SessionCard.tsx` と `client/src/home/pages.tsx`（必須）
   - `WORLD_TINT`（SessionCard）と `WORLD_FACE`（pages）はどちらも `Record<WorldKind, string>` で、足さないと型チェックが落ちる
   - `Home.tsx` と `messages.tsx` にも同名の色テーブルがあるが、そちらは `Record<string>` で型上は必須ではない（見た目を揃えるなら任意で足す）
4. `sessions.json`：あるセッションの最初のワールドにするなら `"world": "<種類>"`
5. ドキュメント：`docs/3d.md` の「ワールド」の節と、README の「セッション構成の変更」の `world` の候補を更新する

## 共有システムを使ってマップを作る

ワールドの見た目は上の手順で作り、その中で動くオブジェクト・システム・接続を以下の順に追加します。ボタン・タイマー・椅子など、中央に登録済みの機能をまず探して再利用してください。

現在、マップエディターや自作のコードマップを読み込むゲーム内メニューはありません。**共有システムの一覧は、ID・説明・接続例を確認する場所**です。実際に配置するには、下のマップファイルをサーバーに登録し、自分のワールド・セッションに入る処理から読み込みます。アイテムメニューからメモやチェス盤を出すだけでは、共有システムは自動で付きません。

### 1. 必要なIDを確認する

カタログは、このリポジトリの **`docs/shared-systems/`** にあります。まず[カタログの目次](../../../docs/shared-systems/README.md)を開き、使いたいアイテムやシステムのIDを選んでください。GitHubでも、下のリンクから対応する文書を開けます。

| 探したいもの | 保存場所・リンク |
|---|---|
| 対応する基本アイテム・共有システムの一覧 | [`docs/shared-systems/README.md`](../../../docs/shared-systems/README.md) |
| アイテムごとのID・説明・配置例 | [`docs/shared-systems/items/`](../../../docs/shared-systems/items/)内の`<itemId>.md`。例：[付箋 `note`](../../../docs/shared-systems/items/note.md) |
| システムごとの設定・接続先・入出力・使用例 | [`docs/shared-systems/systems/`](../../../docs/shared-systems/systems/)内の`<systemId>.md`。例：[ボタン `button`](../../../docs/shared-systems/systems/button.md)・[タイマー `timer`](../../../docs/shared-systems/systems/timer.md)・[椅子 `chair`](../../../docs/shared-systems/systems/chair.md) |

カタログで確認した`itemId`・`systemId`を、以下のマップコードに使います。配置ごとの`id`・`instanceId`は、制作者がマップ内で重複しない名前を決めます。

| コードのキー | この例 | 意味 |
|---|---|---|
| `itemId` | `note` | 既存アイテムの種類ID。この例ではメモのモデルを再利用します。 |
| `systemId` | `button`, `timer`, `chair` | 中央に登録された動作システムのID。登録済みのIDをそのまま使います。 |
| オブジェクトの `id` | `start-switch`, `clock-note` | このマップ内で制作者が決める配置ID。`bindings`でこの名前を接続します。 |
| `instanceId` | `start-button`, `countdown` | このマップに配置したシステム1個のID。同じ`systemId`を複数回使う場合も、配置ごとに別の値を指定します。 |

IDは接続に使う値なので、翻訳したり実行中に変えたりしません。`pressed`・`start`・`sit`などの入出力名も、そのシステムで定められた名前を使います。

詳しくは[共有システムの入門ガイド](../../../docs/shared-systems/README.md)、[メモアイテム](../../../docs/shared-systems/items/note.md)、[ボタン](../../../docs/shared-systems/systems/button.md)、[タイマー](../../../docs/shared-systems/systems/timer.md)、[椅子](../../../docs/shared-systems/systems/chair.md)を参照してください。

### 2. ボタンを押すと30.5秒のタイマーが始まるマップを作る

**`shared/my-shared-map.ts`**を作り、下の内容を入れます。`shared/`はDockerの配布物にも含まれる場所です。ボタンは基本オブジェクト、時間の表示先は既存のメモアイテムとして配置します。

```ts
import { createSystemMap } from './system-map.ts';

export const myMap = createSystemMap('my-map')
  .object({
    id: 'start-switch',
    capabilities: ['interact'],
    position: [-2, 0.7, -2],
    size: [0.5, 0.3, 0.5],
    color: '#49ad75',
  })
  .item({
    id: 'clock-note',
    itemId: 'note',
    itemMode: 'system',
    capabilities: ['text'],
    position: [0, 0, -2],
    text: '00:30.5',
  })
  .system({
    instanceId: 'start-button',
    systemId: 'button',
    bindings: { target: ['start-switch'] },
    config: {},
  })
  .system({
    instanceId: 'countdown',
    systemId: 'timer',
    bindings: { display: ['clock-note'] },
    config: { duration: 30.5 },
  })
  .connect({
    from: 'start-button',
    output: 'pressed',
    to: 'countdown',
    input: 'start',
  })
  .build();
```

`bindings.target`は押すオブジェクト、`bindings.display`は時間を表示するオブジェクトです。`.connect()`は開始ボタンの`pressed`出力をタイマーの`start`入力へ送ります。`duration`の単位は秒で、`30.5`のような小数も使えます。基本アイテムの`.item()`では、配置の高さにあたる`position`の2番目の値を`0`にします。

まずは、下の値だけを変えて試してください。

| 変えたいもの | 変更する値 |
|---|---|
| タイマーの長さ | `config: { duration: 30.5 }`の数値。単位は秒です。 |
| ボタンの位置・形 | `start-switch`の`position`・`size`・`color` |
| 時間の表示位置 | `clock-note`の`position`。アイテムの高さは`0`にします。 |
| 開始から一時停止・初期化へ変更 | 接続の`input: 'start'`を`'pause'`または`'reset'`へ変更します。別のボタンも同じ方法で追加できます。 |
| 接続するオブジェクト | システムの`bindings`配列内の配置ID。対象オブジェクトの`id`と一致させます。 |

### 3. サーバーから選べるようにマップを登録する

`server/system-maps.ts`の先頭のimportに、次の行を加えます。

```ts
import { myMap } from '../shared/my-shared-map.ts';
```

既存の`systemMaps`宣言の下に、次の行を加えます。他のマップの登録は残します。

```ts
systemMaps.set(myMap.id, myMap);
```

保存したらサーバーを再起動するか、開発サーバーに変更が反映されたことを確認します。未登録のIDを読み込むと、`Unknown registered code map`エラーになります。

### 4. 自分のワールドに入る処理から読み込む

`client/src/my-map-entry.ts`を作り、接続状態を確認してから読み込む関数を用意します。

```ts
import { get } from './store.ts';
import { loadSystemMap } from './systems/api.ts';

export function loadMyMapForCurrentSession() {
  const state = get();
  if (!state.session || state.sync !== 'connected') return false;
  loadSystemMap('my-map');
  return true;
}
```

**関数を定義するだけでは実行されません。** 自作のワールド・セッションに入る処理から、同期接続の完了後に`loadMyMapForCurrentSession()`を1回呼び出します。この関数の`true`は要求を送ったという意味です。実際の配置はサーバーの状態応答で確認します。

Reactのワールドコンポーネントから呼ぶ場合は、同じファイルに下のコードを追加できます。`useMyMapOnEntry()`は、このマップを使う**自分のワールドコンポーネント内だけ**で呼び出します。

```ts
import { useEffect, useRef } from 'react';
import { useStore } from './store.ts';

export function useMyMapOnEntry() {
  const session = useStore(state => state.session);
  const sync = useStore(state => state.sync);
  const loadedSession = useRef<string | null>(null);

  useEffect(() => {
    if (!session || loadedSession.current === session) return;
    if (loadMyMapForCurrentSession()) loadedSession.current = session;
  }, [session, sync]);
}
```

`loadSystemMap()`を毎フレーム呼んだり、描画関数の本体から直接呼んだりしません。全ワールド共通の入口で無条件に呼ぶと他のマップも上書きするため、対象のワールド・セッション内だけで動くようにします。共有システムの配置はセッションに保存され、3Dワールドの種類を変えるだけでは自動で消えません。

### 5. 同じマップに椅子の動作を追加する

手順2のコードの最後にある`.build()`の**前に**、下のチェーンを加えます。この例では、座席オブジェクトを押した参加者が座るように、ボタンと椅子を接続します。

```ts
  .object({
    id: 'seat-target',
    capabilities: ['interact', 'seat'],
    position: [-3, 0.4, -1],
    size: [0.7, 0.8, 0.7],
    rotation: Math.PI,
    seatOffset: [0, 0.4, 0],
  })
  .system({
    instanceId: 'seat-click',
    systemId: 'button',
    bindings: { target: ['seat-target'] },
    config: {},
  })
  .system({
    instanceId: 'my-seat',
    systemId: 'chair',
    bindings: { seat: ['seat-target'] },
    config: {},
  })
  .connect({
    from: 'seat-click',
    output: 'pressed',
    to: 'my-seat',
    input: 'sit',
    mapping: { user: 'user' },
  })
```

`pressed`が送った参加者の`user`を`sit`へ渡します。他のイベントシステムをつなぐ場合も、座らせる参加者の`user`を渡します。自分が座っているときは、スペースキーで立ち上がれます。

`chair`は着席の動作を提供し、椅子のモデルは含みません。上の`.object()`は基本オブジェクトとして表示されます。椅子の形・材質・個別のアニメーションはワールドのコードで作り、モデルと動作の対象・位置・着席の基準点が対応するように設定します。ボタンとタイマーも動作システムなので、見た目は制作者が選びます。

### 6. 配置モードと動作の確認

- `itemMode: 'native'`または省略：既存アイテムのゲーム・編集・運搬・回収の操作を使います。共有システムの接続対象にはしません。
- `itemMode: 'system'`：既存アイテムのモデルを共有システムの対象に使います。元のアイテムの操作・運搬・個別削除は無効になり、接続したシステムが動作を決めます。`text`の表示機能は現在`note`だけが対応しています。
- 現在、共有システムの配置を個別に削除するゲーム内機能はありません。配置を変更する場合は、コードマップ内の対象オブジェクト・システム・接続を一緒に直してから、登録済みのマップを読み直します。中央のシステム原本は削除しません。
- 2人で接続し、ボタン・時間表示・着席を確認します。後から入った人にも、サーバーが確定した現在の状態が届くことを確認します。過去のイベントを最初から実行し直す方式ではありません。
- `.system()`でバージョンやハッシュを固定しません。配置ID・接続・互換性のある設定と状態を保ちながら適用できる新バージョンを使い、互換性がない場合は以前の原本を維持します。
- `npm run dev:systems`の独立した試験画面は、標準の`system-demo`を実行します。上で作った`my-map`を自動で読む試験機能ではありません。自作マップは、通常のTonariumで手順3～4の登録と呼び出しをつないで確認します。

新しいシステム自体を中央へ提出する手順は、[中央システムの登録ガイド](../../../docs/shared-systems/registration.md)を参照してください。マップで既存システムを使う作業と、新しい中央システムをアップロードする作業は分けて進めます。

## 確認

- `changelog/YYYY-MM-DD-<識別子>.json` を新規追加し（共通履歴 `shared/changelog.ts` への手動追記は不要。形式は `docs/changelog.md` を参照）、`npm run check:completion`（履歴チェック・型チェック・ビルド）を通す。失敗したら完了にしない
- 見た目はブラウザで確かめる効果が高い。`npm run dev`（`.claude/launch.json` の `dev`）で入って 3D にし、`window.__t3d.pos(x, z)` と `look(yaw, pitch)` で見たい所へ動かして撮る。前面のパネルは `document.querySelectorAll('.panel, .worldbadge').forEach((e) => (e.style.visibility = 'hidden'))` で隠せる
- 当たり判定は `pos` で家具の中に入れてから `state().selfAvatar` を読み、外へ出されているかを見る
- ワールドの切り替えは設定メニューの「ワールド」から（全員に反映され、ログに出る）
