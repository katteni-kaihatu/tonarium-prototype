# Tonarium の現行 UI

開発・レビュー時に参照する、2026-10-25 時点の実装記録。新しいデザインルールを定める文書ではない。以下の「確認済み」はコードと既存 docs の静的な確認を指し、画面の実操作・描画結果の検証は含まない。数値は特記しない限り Web の CSS px。全画面の個別装飾を列挙するのではなく、共通定義と主要な例外を記録する。プロトタイプという位置付けは [CLAUDE.md](CLAUDE.md)、構成は [architecture.md](docs/architecture.md) を参照。

## 共通定義は Web の CSS に集まっている

Web の基底値は [style.css](client/src/style.css) の `:root` と要素セレクターにある。React の汎用 Button/Input コンポーネントを経由する構成ではなく、HTML 要素に既存クラスを組み合わせる。以下の色・形状は該当する変数・クラスから再利用できる。用途別の React 部品は [home/common.tsx](client/src/home/common.tsx)、[world/common.tsx](client/src/world/common.tsx) にある。

### 配色：紙色の面、濃い文字、青の操作色

表の変数・値はすべて [style.css の `:root`](client/src/style.css) で確認済み。用途は同ファイルの `.home`、`.panel`、`.win`、`.dock`、`.tab`、`.livechip` などに対応する。

| 既存定義 | 値 | 実装上の用途・再利用 |
| --- | --- | --- |
| `--ground` / `--dots` | `#EAE5DB` / `#D6CFC1` | 参加・ホーム・ワールドの地色とドット。ドットは半径 1px、22×22px 間隔 |
| `--paper` / `--glass` | `#FFFDF9` / `rgba(255,253,249,.86)` | カード・モーダル・窓の不透明面 / 前面パネルの半透明面 |
| `--sand` / `--sand2` | `#F3EEE4` / `#F1ECE3` | 窓のヘッダーや小さな面 / `.tags span` の背景 |
| `--ink` / `--ink2` | `#26262E` / `#3A3942` | 基本文字・濃色ボタン / ナビなどの文字 |
| `--muted` / `--muted2` | `#5E5C64` / `#4A4852` | 補足・ラベル / チップや操作の補助文字 |
| `--line` / `--line2` | `#DCD5C8` / `#EEE8DD` | 入力・ボタンの線 / セパレーター・補助枠 |
| `--hover` | `rgba(38,38,46,.07)` | 透明ボタン `.ib` のホバー背景 |
| `--dock` / `--dock2` / `--dock3` | `#26262E` / `#3A3B44` / `#44454F` | ドックの面 / 操作ボタン / そのホバー |
| `--accent` / `--accentbg` | `#2F5FC4` / `#EEF3FC` | 主操作・入力フォーカス・選択枠 / 選択やフレンドの淡い面 |
| `--live` / `--danger` | `#D9483B` / `#C2402F` | 共有中表示 / 未読バッジ・離脱・再接続表示 |
| `--speak` | `#2E9A64` | 音声関連の有効表示、成功補足 `.sub.ok` |
| `--global` / `--globalbg` | `#5B47A8` / `#EEEAF8` | 招待の文字・チップ |
| `--hi` | `#FDEBD9` | `.logevent.hi` の強調背景 |

公開範囲チップには独自の組がある。`.hchip.public` は背景 `#E3F2E8`・文字 `#2E6E4E`、`.group` は `#FBE9D7`・`#A24A16`、`.friends` は accent 系、`.invite` は global 系。セッションのワールド別の色は CSS 変数ではなく `SessionCard` の `WORLD_TINT` にあり、room `#DCE6F3`、cafe `#F3E6C6`、game `#E7DDF2`、survivors `#F2D5E2`、city `#D7EAD3`、garden `#DDEBCF`、starlounge `#DBE1F4`、antimatter `#D9D6F5`。サムネイルがない場合の代替画像にも使う。根拠：[style.css](client/src/style.css)、[SessionCard.tsx](client/src/home/SessionCard.tsx)。

### 書体・文字サイズは役割ごとの指定

| 対象 | 確認済みの指定 | 再利用元 |
| --- | --- | --- |
| 本文・入力・ボタン | `"Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`、基底 14px。ボタン・入力は `font: inherit` | [style.css](client/src/style.css) の `:root`、要素定義 |
| 見出し | h1/h2/h3 は `"Zen Maru Gothic", sans-serif`、太さ 700。ホーム h1 26px（720px 以下は22px）、参加 h1 24px、モーダル h2 20px、ホーム節 h2 17px、パネル h2・セッション名 15px | [style.css](client/src/style.css) の各見出し |
| 補足・操作 | `.sub` 12px、`.menuitem` 13px、`.small` ボタン 12px、`.tab` 11px、`.pill` 10px、`.b3d` 9px | [style.css](client/src/style.css) |
| 行間 | 変更履歴一覧 1.7、マーケット詳細本文 1.9、AD パネル 1.5。全体に共通の line-height 指定はない | [style.css](client/src/style.css)、[market.css](client/src/market/market.css)、[AD styles.ts](client/src/world/antimatter/styles.ts) |
| 読み込む Web フォント | Zen Maru Gothic 500/700、Zen Kaku Gothic New 400/500/700 を Google Fonts から読み込む。CSS 側には 600・800・900 などの指定もあるため、すべてが専用フォントファイルに対応するとは限らない | [index.html](client/index.html)、[style.css](client/src/style.css) |

### 余白・角丸・境界線・影は既存の面ごとに再利用する

共通の spacing/radius 変数や倍率体系は定義されていない。以下は既存セレクターの値であり、新規の標準値ではない。根拠は全行 [style.css](client/src/style.css)。

| 面・操作 | 余白・間隔・寸法 | 角丸・線・影 |
| --- | --- | --- |
| 通常ボタン | 高さ36、左右padding 14、gap 6 | radius 10、`1px solid var(--line)`、背景 `#fff` |
| 通常入力 / textarea | input 高さ44・左右padding 12 / textarea padding `10px 12px` | radius 12、line の1px線、背景 `#fff` |
| 参加カード `.join` | 幅 `min(420px,100%)`、padding 32、gap 10 | radius 24、paper、shadow |
| ホーム | 外周padding 16・列gap 16、main gap 22、節gap 12 | 左右の面はradius 20・padding 16・shadow |
| セッションカード | ヘッダーpadding `10px 12px`、本文 `12px 14px 14px`・gap 6 | radius 18、paper、shadow。カード全体に共通の枠線・hover指定はない |
| 前面パネル `.panel` | ヘッダーpadding `12px 10px 6px 14px`・gap 8 | radius 20、glass、blur 16px、白70%の1px線、shadow |
| 窓 `.win` | バー高さ40・padding `0 8px 0 12px`・gap 8 | radius 14、paper、`0 14px 40px rgba(40,30,10,.18)` |
| メニュー `.popover` | padding 6・gap 2、menu 幅196、行高さ40 | radius 14、背景白、pop |
| モーダル `.modal` | padding `20px 24px`・gap 10、幅 `min(560px,100%)`、最大高さ90vh・縦スクロール | radius 20、paper、`0 24px 60px rgba(20,15,5,.3)` |
| ドック | padding 10・gap 8、下端22、ボタン52×52 | 外枠radius 24・ボタン16、`0 10px 30px rgba(20,15,5,.25)` |

影の共通変数は `--shadow: 0 8px 30px rgba(60,40,10,.12)` と `--pop: 0 12px 32px rgba(40,30,10,.18)`。通常の面と浮くメニューで使い分けられているが、上表の窓・モーダル・ドックは個別値を持つ。`.menusep` は line2 の高さ1px、`.wpick.on` と `.hchoice.on` は accent の枠と `inset 0 0 0 1px`、`.pill` と `.badge` はradius 999px、顔は50%。線の太さや角丸が全要素で同じという規則はない。根拠：[style.css](client/src/style.css)。

## 部品の状態は用途ごとに実装されている

以下は実装にある状態のみ。すべての部品が hover・pressed・focus・error を共通に備えるという意味ではない。

| 部品・用途 | 実装済みの状態・操作 | 根拠・再利用箇所 |
| --- | --- | --- |
| ボタン | 全体の disabled はopacity .45・cursor default。`.primary` は青・白文字・700、hover は `#2752AB`。`.ib` は枠なし透明で有効時hover。`.dark` はink背景・白文字。`.danger` は文字 `#A8321F` | [style.css](client/src/style.css)。既存 className を組み合わせる |
| サイズ違い | `.small` 高さ30・左右padding 10・文字12・radius 9、`.big` 高さ40、`.square` 44×44・radius 12、`.swatch` 18×18の丸 | [style.css](client/src/style.css) |
| ドック操作 | `.dk` hover はdock3、`.muted` は `#F06A5A`（hover `#E25646`）、`.active` はspeak、`.leave` はdanger（hover `#A8321F`）。active は押下中を表す共通疑似クラスではなく機能状態 | [style.css](client/src/style.css)、[WorldScreen.tsx](client/src/world/WorldScreen.tsx) |
| 入力・選択欄 | input/textarea はfocusでaccent枠、outlineなし。textarea は縦リサイズ。ホーム `.hfield` 内は高さ40、select は別指定。名前変更は空欄・変更なしで保存をdisabled | [style.css](client/src/style.css)、[WorldScreen.tsx](client/src/world/WorldScreen.tsx) の SessionRename |
| 言語選択 | `LanguageSelect` はラベルとネイティブselectを使い、日本語・英語・韓国語を選ぶと即時保存する。専用の装飾クラスはなく、参加画面とプロフィールではブラウザのselect表示に依存する。`.hfield select` の指定を全select共通の値として扱わない | [LanguageSelect.tsx](client/src/i18n/LanguageSelect.tsx)、[locale.ts](client/src/i18n/locale.ts)、[App.tsx](client/src/App.tsx)、[Profile.tsx](client/src/Profile.tsx)、[style.css](client/src/style.css) |
| タブ・選択 | `.tab.on` はink背景・白文字、`.htabs button.on` はpaper背景・accent文字・shadow、`.hnavbtn.on` はaccentbg。`Tabs` はtablist/tab と aria-selected、イベント返事はaria-pressedを持ち再押下で取消 | [home/common.tsx](client/src/home/common.tsx)、[style.css](client/src/style.css) |
| セッションカード | 人数・共有・公開範囲・参加者・残置アイテムを表示。未参加は「参加する」、別セッション中は「移動する」、現在地は `.hhere`。所有者の削除操作は在室者がいるとdisabled。カード自体はarticle | [SessionCard.tsx](client/src/home/SessionCard.tsx)、[home.md](docs/home.md) |
| 顔・アイテム印・チップ | `Face` は画像、なければ頭文字。サイズ既定32、文字はサイズ×.44。`ItemMark` は既存ITEM_INFOのtint/inkを使用。`Chip` は公開範囲等のkindをクラスへ渡す。未読は `.badge` / `.hdot` | [world/common.tsx](client/src/world/common.tsx)、[home/common.tsx](client/src/home/common.tsx)、[style.css](client/src/style.css) |
| 左右パネル | 人・アイテムと通知・ログを表示。折りたたむと `.foldedpanel`。人の行は `.menuon`、窓を開いている `.winon`、叩ける `.hittable:hover` などを別表示 | [NearList.tsx](client/src/world/NearList.tsx)、[NoticeLog.tsx](client/src/world/NoticeLog.tsx)、[style.css](client/src/style.css) |
| 窓 | 共有・顔・付箋・盤面・メディア等を表示。自由配置と簡易表示があり、移動・前面化・最大化・閉じる操作を持つ。内容によりnoMax/noClose。`.compact` は縮小し本体操作を抑え、hoverでaccent輪郭。`.dark` は面 `#2C2D35`・バー `#36373F` | [WindowLayer.tsx](client/src/world/WindowLayer.tsx)、[windows.ts](client/src/world/windows.ts)、[style.css](client/src/style.css) |
| ポップオーバー・モーダル | `Popover` はbodyへportalし、画面端を補正、外側mousedown・Escで閉じる。ホームのローカル `Modal` は背景クリックで閉じ、内部クリックの伝播を止める。この部品に共通Esc処理はない | [world/common.tsx](client/src/world/common.tsx)、[home/dialogs.tsx](client/src/home/dialogs.tsx) |

## 主要画面はホームとセッションを行き来する

| 画面 | 確認済みの構成 | 根拠 |
| --- | --- | --- |
| 参加 | ドット背景の中央カード、ロゴ・プロフィールアイコン・名前・言語選択・開始操作。横からマスコット、下に工事中の案内 | [App.tsx](client/src/App.tsx)、[style.css](client/src/style.css)、[screens.md](docs/screens.md) |
| ホーム・一覧 | 左ナビ228px、中央の検索・見出し・各ページ、右ウィジェット300pxの3列。ホームの各セクションは横スクロール1段、一覧 `.scards` は最小260pxの自動列。フレンド/DM、セッション、イベント/カレンダー、グループ、ワールド、アイテム、履歴等を切り替える | [Home.tsx](client/src/home/Home.tsx)、[pages.tsx](client/src/home/pages.tsx)、[home.md](docs/home.md)、[style.css](client/src/style.css) |
| セッション | 背景マップまたは3D空間、窓と顔描画、前面にワールド表示・左の人/アイテム・上部の顔・右の通知/ログ・下のドック。通常の左パネル幅320・左20・上74・下20、右幅300・右20・上下20 | [WorldScreen.tsx](client/src/world/WorldScreen.tsx)、[style.css](client/src/style.css)、[screens.md](docs/screens.md) |
| セッション中のホーム | 左上メニューから同じホームをシートで表示。背面は `rgba(30,28,24,.42)` とblur 8px、シートは上72・右24・下88・左12、radius 20 | [SessionMenu.tsx](client/src/home/SessionMenu.tsx)、[style.css](client/src/style.css)、[screens.md](docs/screens.md) |
| マーケット・所有アイテム | ナビと一覧、フィルター、商品カード、共通の詳細・3Dプレビュー、購入確認。カード最小255px・gap18・radius15・line枠、hoverはaccent枠。詳細は2列・gap32・padding26。キーボードfocusは3px accent輪郭・offset3。いいね済みdisabledは金色の独自表示 | [Market.tsx](client/src/market/Market.tsx)、[ItemDetail.tsx](client/src/market/ItemDetail.tsx)、[market.css](client/src/market/market.css)、[home.md](docs/home.md) |

レスポンシブは単一の境界値ではない。ホームは1100px以下で2列、720px以下では下ナビと「もっと見る」に変わり右ウィジェットを非表示にする。セッションは900px以下で左右パネルの幅・顔の配置を調整し、720px以下の `.world.phone` は下タブで前面パネルを切り替える。マーケット詳細は1000px以下で1列。根拠：[style.css](client/src/style.css)、[phone.ts](client/src/phone.ts)、[market.css](client/src/market/market.css)。

## 2D・3D は前面 UI を共有し、空間操作が異なる

`WorldScreen` は両モードに同じ `WindowLayer`・`NearList`・`FaceStrip`・`NoticeLog`・`Dock` を載せる。モードは利用者ごとで、同じセッションの位置と人・アイテムを扱い、切り替えてもその場所にとどまる。距離による近くの人・声の範囲という考え方も共通。根拠：[WorldScreen.tsx](client/src/world/WorldScreen.tsx)、[spatial.ts](client/src/spatial.ts)、[screens.md](docs/screens.md)、[3d.md](docs/3d.md)。

| 観点 | 2D | 3D | 根拠 |
| --- | --- | --- | --- |
| 顔の配置 | 窓がなくマップも非表示なら中央の大きいグリッド。それ以外は上の帯 | 上の帯。ロック中の前面表示の制約も受ける | [FaceStrip.tsx](client/src/world/FaceStrip.tsx)、[screens.md](docs/screens.md)、[style.css](client/src/style.css) |
| 背景・移動 | `MapLayer` の設定は「なし / 2D / 3D」。2Dマップはクリックで移動先、ホイールで拡縮、中ボタンドラッグで平行移動。背景に3Dマップを使ってもクライアントの3Dモードとは別 | `View3D` と `Player` による空間移動。クリックでマウスロック、WASD/矢印、歩行時Spaceジャンプ。Escで解除 | [MapLayer.tsx](client/src/world/MapLayer.tsx)、[Map3D.tsx](client/src/world/Map3D.tsx)、[View3D.tsx](client/src/view3d/View3D.tsx)、[Player.tsx](client/src/view3d/Player.tsx) |
| UIへの入力 | カーソルで前面パネル・窓を操作 | ロック中は前面子要素opacity .4・pointer-events none。中央照準で操作し、Esc後に前面UIへ戻る。Tabで左右パネルをまとめて開閉 | [WorldScreen.tsx](client/src/world/WorldScreen.tsx)、[style.css](client/src/style.css)、[3d.md](docs/3d.md) |
| 視点・操作案内 | マップの俯瞰と位置印・声の範囲を表示 | 初期一人称、F5で三人称、三人称ホイールで距離変更。歩行/フライ/ノークリップを設定。照準8px、対象ありは14px・黄の輪郭、照準下のヒント13px、下部キー案内12px | [Player.tsx](client/src/view3d/Player.tsx)、[playerCamera.ts](client/src/view3d/playerCamera.ts)、[style.css](client/src/style.css)、[3d.md](docs/3d.md) |
| 空間内の文字 | DOM の `.mname` は11px・700、半透明の紙色 | `Label` はcanvas文字をスプライト化。Segoe UI/Hiragino Sans/Noto Sans JP/sans-serif、生成時48px・600・padding20、既定の表示高0.2m。白文字と黒75%の面。Web本文の14pxとは別単位 | [style.css](client/src/style.css)、[Label.tsx](client/src/view3d/Label.tsx) |
| 機能の差 | 宵闇サバイバーズ等は窓で操作 | 板わたり参加、カメラ・バイクなど空間専用操作がある。AD研究所は装置から共通の操作パネルを開く | [items.md](docs/items.md)、[3d.md](docs/3d.md)、[AD windowBodies.tsx](client/src/world/antimatter/windowBodies.tsx) |

タッチ専用端末の判定は幅とは別で、`(hover: none) and (pointer: coarse)` を使う。この端末では3D選択を無効にし、2Dで参加する。小画面でもマウスがあれば同じ制約になるとは限らない。根拠：[phone.ts](client/src/phone.ts)、[Home.tsx](client/src/home/Home.tsx)、[SessionMenu.tsx](client/src/home/SessionMenu.tsx)、[screens.md](docs/screens.md)。

## 個別テーマ・別クライアントは共通 CSS と区別する

- **AD研究所**：`s` オブジェクトのrootは背景 `#10122c`・文字 `#f2eef5`・13px・padding/gap10・radius10。選択タブは枠 `#7fffe3`・背景 `rgba(84,244,221,.18)`。入力はradius8・白22%の1px線・黒25%背景、ボタン文字12px。専用CSSが紫/青緑の背景グラデーション、hoverの発光、focusの黄 `#fff188` 2px輪郭、disabledのopacity .45・not-allowed、次元カードのlocked/affordable状態を加える。共通のsと `.ad-lab-panel` のCSSを併用する実装。根拠：[styles.ts](client/src/world/antimatter/styles.ts)、[antimatter-panel.css](client/src/world/antimatter/antimatter-panel.css)、[AntimatterPanel.tsx](client/src/world/antimatter/AntimatterPanel.tsx)。
- **宵闇サバイバーズ**：窓本体は `#1b1520`・文字 `#f6eaf1`、バーは `#3b2639`。選択のfocus-visibleは `#fff0bf` の3px輪郭・offset3。通常のpaper/accentとは異なるゲーム固有のテーマ。根拠：[style.css](client/src/style.css)、[SurvivorPanel.tsx](client/src/world/SurvivorPanel.tsx)。
- **Avalonia ネイティブ**：`Ui.BodyFont` / `HeadingFont` は同名の同梱フォント、基底14、タイトル26。Ink/Muted/Background/PaperはWebと同じ値。`Ui.Button` はpadding `14,9`・radius10、`Ui.Card` はpaper・radius18・padding20・枠 `#e5e0d8` 1、Row spacing10 / Column12、`Ui.Input` は最小高40・radius9。Appの基底TextBoxはradius10なので、ヘルパー適用後と区別する。FluentThemeのLightを使い、CSSは直接再利用しない。根拠：[Ui.cs](native/Tonarium.Desktop/Views/Ui.cs)、[App.cs](native/Tonarium.Desktop/App.cs)、[native-windows.md](docs/native-windows.md)、[native-linux.md](docs/native-linux.md)。
- **Electron のローカル画面**：system-ui、light/dark配色、ボタンradius8・padding `10px 18px`、focus-visibleは `#8572d5` 3px輪郭。通常Web画面のstyle.cssとは別定義。根拠：[local.css](electron/app/local.css)、[electron.md](docs/electron.md)。

## 未統一・未定義の事項

ここからは全体規則として確認できない事項。個別に実装されている値を、全クライアント共通の仕様に広げない。

| 状況 | 確認できる範囲と限界 | 根拠 |
| --- | --- | --- |
| 未統一：サイズ体系 | 余白・角丸・文字サイズは各セレクターやインライン値。間隔を4px倍数に限定する規則や、統一した見出し倍率はない | [style.css](client/src/style.css)、[AD styles.ts](client/src/world/antimatter/styles.ts)、[Ui.cs](native/Tonarium.Desktop/Views/Ui.cs) |
| 未統一：操作状態 | inputのfocus、マーケット・エモート・ゲームのfocus-visibleは個別定義。全ボタン共通のpressed/loading/validation-errorスタイルや、統一したフォーカス表示は定義されていない | [style.css](client/src/style.css)、[market.css](client/src/market/market.css)、[AD CSS](client/src/world/antimatter/antimatter-panel.css) |
| 未統一：モーダルの閉じ方 | PopoverのEsc、ホームModalの背景クリック、購入のdialogなど実装が異なる。全モーダルに共通のEsc・フォーカストラップ・復帰処理を保証する部品はない | [world/common.tsx](client/src/world/common.tsx)、[home/dialogs.tsx](client/src/home/dialogs.tsx)、[Market.tsx](client/src/market/Market.tsx) |
| 未統一：テーマと描画経路 | Webの紙色、AD/ゲームの暗色、Electronのlight/dark、AvaloniaのLightが併存。3D文字はcanvasの書体・m単位で別管理。単一テーマ切替の規則ではない | [style.css](client/src/style.css)、[Label.tsx](client/src/view3d/Label.tsx)、[local.css](electron/app/local.css)、[App.cs](native/Tonarium.Desktop/App.cs) |
| 未定義：全画面への動きの削減 | マスコット・エモート・ADにはprefers-reduced-motion対応がある。ただし全アニメーションを一律に停止する規則としては確認できない | [style.css](client/src/style.css)、[AD CSS](client/src/world/antimatter/antimatter-panel.css)、[useAdReducedMotion.ts](client/src/ad/useAdReducedMotion.ts) |
| 未検証：実際の見え方 | 本書は静的調査。フォント取得失敗時の描画、各言語の文字幅、実機の小画面操作、コントラスト・キーボード操作の全画面適合性は、この調査では実測していない | [index.html](client/index.html)、[languages.md](docs/languages.md)、[screens.md](docs/screens.md) |

値や挙動を変更するときは、本書だけで判断せず、表にリンクした実装と機能別docsを確認する。本書にない事項を新しい共通ルールとして扱わない。
