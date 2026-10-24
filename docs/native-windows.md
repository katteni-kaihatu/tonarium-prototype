# Windows ネイティブクライアント

Avalonia 12 / .NET 10 の2Dクライアントと、Unity 6.6のWindows Player。ホーム・チャット・アイテム・プロフィールはネイティブUIで、Unityは3Dを開いたときだけ別プロセスで起動する。WindowsではUnityをウィンドウ全体の背景へ埋め込み、左右の一覧・顔・チャット・下のドックをネイティブの透明レイヤーで重ねる。

既存のNodeサーバー、kokosync、LiveKitを使用する。ブラウザ版と同じセッションに参加でき、2D/3D切り替えでユーザーID・同期接続・通話接続は変わらない。2Dに戻るとUnityプロセスを終了する。

## 起動

リポジトリのルートで実行する。ローカルサーバーが未起動ならスクリプトが起動する。

```powershell
powershell -ExecutionPolicy Bypass -File native/run-desktop.ps1
powershell -ExecutionPolicy Bypass -File native/run-desktop.ps1 -Server https://example.com -Name なまえ
```

既定の接続先は http://localhost:3001。開発ビルドには.NET 10 SDKが必要。この作業では `%LOCALAPPDATA%/Tonarium/dotnet` に導入済みで、スクリプトはこのSDKを優先する。通常のdotnetにSDKがあればそちらも使える。通話は既存の.envと `npm run livekit` を使用する。

```powershell
powershell -ExecutionPolicy Bypass -File native/build-unity.ps1
powershell -ExecutionPolicy Bypass -File native/publish-desktop.ps1
```

Unity EditorとWindows Build Supportが必要。ビルドはProjectVersion.txtで指定されたEditorを使い、`native/build/unity/Tonarium3D.exe` を生成する。ビルドがなければ3Dボタンからもビルドを試みる。`TONARIUM_UNITY_EDITOR` / `TONARIUM_UNITY_PLAYER` で実行ファイルを指定できる。

配布用フォルダーは `native/artifacts/Tonarium-win-x64/`。全体をコピーして `Tonarium.exe` を起動する。.NETランタイムとUnityを含むため配布先にSDKは不要。接続先のTonariumサーバーは別途必要。YouTubeを開く場合だけWebView2 Runtimeを使用する。Unityビルド済みならpublishに `-SkipUnity` を指定できる。独立した3Dウィンドウで比較する場合はアプリに `--separate-3d` を付ける。

同じ `Tonarium.exe` を複数回起動できる。最初のウィンドウは従来の保存データを使い、2つ目以降は別のユーザーID・名前・表示設定・音声設定を使用する。追加ウィンドウのタイトルは「クライアント 2」のように表示する。初回の追加ウィンドウは接続先だけ引き継ぐので、別の表示名を入力して参加する。各ウィンドウで3Dも個別に起動できる。

保存先は1つ目が `%LOCALAPPDATA%/Tonarium/`、2つ目以降がその `instances/2/`、`instances/3/`。終了した番号は次の起動で再利用し、その番号の名前と設定を復元する。実行中の番号はファイルロックで確保し、クラッシュ後にも再利用できる。UnityログとYouTubeのデータも分離する。`run-desktop.ps1` が起動したローカルサーバーは、他のTonariumクライアントが開いている間は停止しない。

検証用に保存先を分ける場合は `Tonarium.exe --data-dir C:/path/to/test-profile` を指定できる。同じ保存先での複数起動も上記と同様に分離される。

## 実装・確認範囲

| 分野 | 実装 | 通常操作の確認 |
| --- | --- | --- |
| ホーム | ホーム、フレンド、セッション、イベント、グループ、ワールド、アイテム | 全ページ描画・移動 |
| ソーシャル | セッション作成・参加、フレンド申請・承認、グループ・チャンネル、イベント・RSVP | 実サーバーで往復 |
| メッセージ | 範囲別チャット、アナウンス、DM、既読、日程、添付、音声 | 入力イベント、送信、AAC保存・配送 |
| 2Dルーム | 距離別一覧、動くお絵描きアバター、通知、折りたたみ、ドック | 描画・操作・最小サイズ |
| アイテム | 付箋、共同キャンバス、チェス・AI、サイコロ、2048、画像、動画、YouTube、ハンマー、カメラ表示 | 編集・描画・駒移動・ロール・再生・同期時計 |
| プロフィール | 自己紹介、アイコン、アバター・調整値、フレンド、接近、追従、ブロック、通報 | 自他画面描画、自己紹介保存 |
| 同期 | C# kokosync SDK、暗号化MessagePack、再接続、初期同期・差分・大きい本文 | ネイティブ2台と既存JS SDKの相互接続 |
| 音声 | LiveKit、WASAPI、距離・左右音声、ミュート、機器選択 | 別参加者との実際の送受信、ミュート後再入室 |
| 共有 | 画面・ウィンドウ、PC音声、映像受信 | 実際の送受信、覆われたウィンドウの取得 |
| 3D | ホール・カフェ・板わたり、アバター、移動・ジャンプ・衝突、アイテム、写真 | Windows Player起動・描画、位置送信、テレポート、共有画像 |
| 切り替え | Unity埋め込み、リサイズ、2D復帰 | 実際のHWND・プロセス・接続状態 |

「実装」と「確認」は区別している。全操作を全端末で確認した意味ではなく、Web版とのピクセル単位の同一性も保証しない。

## 通常操作の再確認

テスト用のサーバーを指定する。dotnetがSDKを見つけられなければ `%LOCALAPPDATA%/Tonarium/dotnet/dotnet.exe` を使う。

```powershell
# ネイティブ2台と既存JS SDKとの相互接続
 dotnet run --project native/Tonarium.Smoke -- http://localhost:3015
# 配布版の複数起動・ID分離・片方の終了・設定の再利用
 node native/Tonarium.Smoke/multi-instance.cjs native/artifacts/Tonarium-win-x64/Tonarium.exe http://localhost:3015
# 実際のネイティブコントロールの操作・描画
 dotnet run --project native/Tonarium.UiSmoke -- http://localhost:3015 native/Tonarium.UiSmoke/results
# Unity Playerの描画とIPC
 node native/Tonarium.Unity/Tools/smoke-bridge.cjs
# Windows親子ウィンドウ・リサイズ・2D復帰
 native/Tonarium.Desktop/bin/Debug/net10.0-windows/Tonarium.exe --server http://localhost:3015 --name NativeCheck --smoke native/artifacts/embedded --smoke-3d
# マイク・画面を約3秒取得する明示的な実機確認
 native/Tonarium.Desktop/bin/Debug/net10.0-windows/Tonarium.exe --media-smoke --output native/artifacts/media-smoke.json
```

UIスモークは日本語入力イベントとEnter送信を確認するが、実機IMEの候補選択は自動確認していない。画像は `native/verification/unity/`、通常の実行結果は `native/artifacts/` と `native/Tonarium.UiSmoke/results/` に保存する。後者はGit管理外。

配布用Release版の実機計測では、通話接続中・マイクミュート・アバター2体の2Dルームで、10秒間のCPU時間増分891ms（1コア換算8.9%）、ワーキングセット約285MiB、Unity起動なしだった。背景と固定パネルは描画をキャッシュしている。端末・通話・共有・データ量によって変わる参考値。

`--smoke 保存先 --measure-idle 10` で、操作確認用の外部UI Automationから独立して同じ待機計測を実行できる。秒数は省略時5秒。

## Web版の見た目とお絵描きアバター

ホーム・ルーム・プロフィール・アイテムは、Web版の配置と色を基準にしたネイティブコントロール。元のブランド画像、`Icon.tsx` のベクター図形、Zen Kaku Gothic New / Zen Maru Gothicを使用する。フォントとOFLライセンスは `native/Tonarium.Desktop/Assets/fonts/` に同梱する。セッションカード、週のイベント欄、320px / 300pxのルームパネル、下部ドック、顔のグリッドと上部ストリップもWeb版に合わせている。

2Dのお絵描きアバターは元のGLBから取り出した14メッシュ・28三角形と14アニメーションチャンネルをC#で描画する。テクスチャを切り抜いた静止画像ではなく、待機アニメーション、瞬き、マイクに反応する口パク、3D参加者の顔の上下、アップロードした画像とmanifestの体型変更に対応する。顔カードはWeb版と同じカメラで胸から上を表示し、プロフィール編集では全身を確認できる。

モデルと画像は共有キャッシュを使い、表示中の大きい顔は約15fps、小さい顔は約8fpsで更新する。非表示・画面外・最小化中は更新を止める。2Dの顔のためにUnityやWebViewを起動しない。元のGLBを変更した場合は `node native/Tonarium.Unity/Tools/convert-avatar.cjs` で共通データを作り直す。

UIスモークにはアバターのフレーム差分、独立した瞬き・口パク・視線の描画、実サーバーへの画像アップロードと体型更新を含む。アバター検証画像は `native/verification/avatar/`、画面比較用の画像は `native/verification/ui/` に保存する。

## セッション中のハンバーガーメニュー

左上にポインターを合わせると、ホームと共通のサイドバーを表示する。ホーム、フレンド、セッション、イベント、グループ、ワールド、アイテムの7ページ、所属グループ、2D / 3D 切り替え、ステータス、プロフィール設定、セッションからの離脱に対応する。フレンドの未読DM数（未読がなければオンライン人数）、近日のイベント数、グループの未読印も表示する。VRはWeb版同様、準備中の案内を表示する。

ボタンをクリックすると最後に開いたページを同じウィンドウのシートで開く。ページを移動してもセッションと通話は維持する。Esc、背景、右上の閉じるボタン、またはハンバーガーを再度押すとルームに戻る。3D表示中も背景にUnityを残してホームを操作でき、閉じると同じUnity Playerに戻る。

UIスモークでホバー後のマウスクリック、全7ページ、所属グループ、ステータス保存、DM送信、プロフィール保存、最後のページの復元、Esc、最小サイズ、離脱を確認する。メニュー中心の再確認は `dotnet run --project native/Tonarium.UiSmoke -c Release -- http://localhost:3015 native/artifacts/menu-ui --menu`（アバターの個別描画検証を省略）。`--smoke-3d` はホームの開閉後にも同じUnityウィンドウが表示され、セッションが維持されることを確認する。

検証画像と結果は `native/verification/ui/menu-*.png` と `menu-*.json` に保存している。

## Web 3Dとの表示・操作の統一

Unityは中央の小窓ではなく、Web版と同じ全画面・垂直視野角70度、眼高1.6mで描画する。ネイティブUIは2Dと同じコントロールを再利用する。透明な所有ウィンドウの領域を各パネル部分だけに切り抜き、空間のクリックは直接Unityへ届ける。移動・リサイズ・DPI・最小化に追従し、3D終了時は元のUIツリーをメインウィンドウへ戻す。映像をCPUで連続コピーする方式は使わない。

操作開始は空間をクリック。WASD／矢印で移動、Spaceでジャンプ、マウスで視点、クリックで操作、右クリックで運ぶ／置く、Xで片付ける、Qで手放す。Escはカーソルを出し、Enterは共通チャットへフォーカスする。操作中のUIはWebと同じ薄表示にする。キャンバスは面へ直接描画し、約50msの点をまとめて同期する。付箋は小さい編集パネルから自動保存する。

3DではTabで左のプレイヤー／アイテム一覧と右の通知／ログを左右へスライド退避し、もう一度Tabで元に戻す。マウス固定中も使える。端の小さいボタンからも戻せる。チャットなどの文字入力中とホーム表示中は通常のTab操作を優先する。退避は一時的で、2Dへ戻ると元のパネル表示に復帰する。

3D操作中の共通UIは表示だけを残してマウス入力を透過し、Unityの描画領域内にカーソルを制限する。Esc、ホーム表示、別ウィンドウへの切り替え、最小化、終了では制限を解除する。フォーカスが他のアプリへ移った後に奪い返すことはしない。

埋め込み時の相対マウス入力は、親が特定した実際のUnity描画ウィンドウをIPCで渡して初期化する。Unityには同じクラス名の非表示ウィンドウもあるため、最初に見つかったウィンドウへは接続しない。Windows Raw Inputの移動量を1フレームずつ合算し、有効になった場合だけカーソルを中央1pxへ固定する。従来のUnity入力と二重適用せず、終了時に元のRaw Input登録を復元する。

`TONARIUM_INPUT_DIAGNOSTICS` にJSONLファイルの絶対パスを指定すると、マウス固定の確認回数・書き換え回数、使用した入力経路、Unityのフレーム時間を記録する。入力中はメモリーへ蓄え、解除時または終了時に書く。相対入力の判定は `.unity.json` の `relativeFrames` と `packets`、中央固定の判定はJSONLの `CenterPointer` で行う。起動しただけでは経路が有効になった証拠にならない。

ワールドの家具・床・照明・ゲームの塔は `worlds3d.tsx` と `shared/worlds.ts`、アイテム形状・パネル比率は `items3d.tsx` などを基準に移植した。付箋は1.6×1.2m、キャンバス／2048は高さ1.8m、画像・動画は縦横比を維持する。お絵描きアバターは元GLBのアニメーションチャンネルを再生し、名前・吹き出し・発話リング・2D参加者の追従配置もWebの寸法に合わせている。

`build-unity.ps1` は `Tools/sync-web-assets.cjs` でブランド画像とフォントを元ファイルからコピーする。対応表・SHA256は `Resources/Web/WebAssetSources.json`、ライセンスは同じResources内へ同梱する。カフェのメニューボードは `Tools/Export-CafeMenu.ps1` がWebの文言から生成する。元モデルの由来は `OekakiSource.md`、環境は `WorldArtSource.md` に記録する。

3Dの専用検証は `--tonarium-avatar-parity` と `--tonarium-item-parity` をUnity Playerへ渡して実行できる。`--tonarium-output` にPNGと結果JSONを出力する。親クライアントの `--connect --session <ID> --3d` は検証用に指定セッションで3Dまで開く。

## 残る差分

- マイクのエコーキャンセルは未実装。現在の通話はヘッドホンを推奨する。
- カメラアイテムはUnityの視点から撮影・LiveKit配信する。視点共有（他の参加者からの視点リクエストに応じる機能）の送信は未実装。
- Unityへの共有映像は最大960px・5fpsのJPEG転送。2DはネイティブSDKのフレームを直接表示する。
- YouTubeだけはアイテムを開いたときにWebView2を起動する。通常のホーム・2D画面にはWebViewを使わない。
- Unity上のYouTubeはサムネイル表示。動画の閲覧・操作は共通のネイティブパネルで行う。
- ネイティブ同期は既存サーバーへ接続できるWebSocket経路を使う。LNL/QUICエンドポイントと直接P2P接続は今回未実装。
- カンタン表示は他のアイテムウィンドウを最小化する。Web版の小さい内部ウィンドウ列とは異なる。フリー表示はOSウィンドウを自由に動かせる。
- macOSの実装・配布確認は未実施。一部のGPU描画ウィンドウはPrintWindow取得に対応しないため、画面全体の共有が必要な場合がある。

## 音声デバイスの選択

ホーム／ハンバーガーメニューの「音声設定」、自分のプロフィール設定の「マイク・スピーカーの設定」、またはセッション設定から開く。マイクとスピーカー／ヘッドホンを名前で選び、「適用」でこのクライアントに保存する。「Windows の既定」も選択できる。接続した機器がまだ一覧にない場合は「機器を再読み込み」で更新する。

セッション参加前にも選べ、次回起動でも選択を復元する。通話中は同じセッションを維持して入出力を切り替え、ミュート状態は変えない。3D中は前面のネイティブ画面に設定を開く。`Tonarium.UiSmoke <server> <output> --audio-settings` は実際のWindowsデバイス一覧で選択・保存・再表示・キャンセル・所有ウィンドウを確認する。このチェックはマイクの録音や通話を開始しない。

音声送信だけを確認する `--audio-transmit` は、生成したテスト音を実際のPCM変換・送信キュー・LiveKitへ通し、16秒間の受信音量を検証する。マイクを録音せず、序盤と12秒以降の両方に無音ではないデータが届くことを確認する。

WindowsとWebは同じTonariumサーバーの同じセッションへ接続すること。異なる開発サーバーで同じLiveKitと既定のルーム接頭辞を共有すると、音声ルームだけが重複し得る。相手が参加者一覧に存在しない場合、Webの距離判定はその音声の音量を0にする。別の環境には異なる `LIVEKIT_ROOM_PREFIX` を設定する。

## チャットの画像と添付（2026-10-21）

ルーム・DM・グループのチャット画像は、Web版と同じ高さ180px以内で縦横比を保って表示する。クリックまたはEnterで暗い背景の拡大ビューを開き、保存ボタンで元の画像ファイルを書き出す。Esc・背景・閉じるボタンで戻れる。カメラ写真などのインライン画像にも対応する。読み込んだ画像は件数・容量を制限してキャッシュし、会話更新のたびにダウンロードし直さない。

添付ボタン、画像・動画ファイルのドラッグ＆ドロップ、Ctrl+Vによるファイル／クリップボード画像の貼り付けを共通処理にした。画像はJPEG/PNG/GIF/WebPで10MiB、動画はMP4/WebMで50MiB、1回に最大5ファイルまで。元ファイルの形式・縦横サイズを添えて送信する。通常テキストの貼り付けと日本語入力は維持する。

2DルームのD&D・画像貼り付けは全体チャットへの投稿、3Dでは投稿に加えて目の前に画像・動画アイテムを配置する。YouTubeリンクのD&D、入力欄以外でのリンク貼り付けも同じ動作。Unityにフォーカスがある場合のCtrl+VとWindowsファイルD&Dもネイティブ側へ渡す。DM選択中はその相手だけに送り、空間には配置しない。添付ボタンでは現在の文面・送信範囲を使用する。

通常操作の検証は `Tonarium.UiSmoke <server> <output> --chat-media`。実サーバーに接続した2クライアントで画像・動画のアップロード、画像の送受信、クリップボード、2D／3Dの配置、DM、プレビューと拡大表示を確認する。入力イベントはAvalonia Headlessで検証し、Explorerからの実ドラッグ、OSの保存ダイアログ、Unityへ直接落とすOLE入力は別途実機確認の対象になる。

チャットの余白はスクロール内容側に含め、最終行までホイールで到達できるようにしている。通知・ログ・入力欄のスクロールバーは非表示で、長文は折り返す。末尾を見ている間は画像の読み込み・ウィンドウのサイズ変更・入力欄の伸縮後も末尾を維持し、過去ログを読んでいる場合は位置を動かさない。`Tonarium.UiSmoke <server> <output> --chat-scroll` でこの通常操作を確認できる（サーバー接続不要）。

## アイテムの動作照合（2026-10-21）

`shared/items.ts`、Webのアイテム操作、ネイティブ2D・Unityの送受信を照合した。チェスが動かない原因は、普通の移動にも2Dが `promotion: null`、Unityが `promotion: "Q"` を付け、サーバーの合法手に一致しないことだった。通常の移動では省略し、昇格時だけ選択した小文字 `q/r/b/n` を送る。Unityも昇格先の4択を表示し、盤が更新されたら古い選択を取り消す。

| アイテム | 今回そろえた動作・確認点 |
| --- | --- |
| 付箋 | 2Dのフォーカス移動後も未反映の文字を保持。Unityも編集ロック・保存・解除を送信 |
| キャンバス | 保存は1240×900 JPEG、座標の丸めと小数のペン幅をWebに統一。全消去で古いローカルプレビューも破棄 |
| チェス／チェスAI | 2Dの駒移動・AI応手・リセット、Unityの送信と昇格先選択 |
| 2048 | ボタンにフォーカスがあっても矢印・WASDで操作可能。移動結果を双方へ同期 |
| サイコロ | 利用者ごとの種類・個数・シークレット設定を保持。3Dから共通設定画面を開き、秘密の出目は本人宛ての結果からだけ復元 |
| ハンマー | 2Dでは相手を叩いて0.8m手前へ近づく。3Dでは手持ちと現在位置からの操作 |
| カメラ | Cキーは手持ち・三脚の両方で撮影。1280×720写真、640×360・最大15fpsの仮想カメラを `camera:<id>` で配信。停止・担当変更・3D終了で配信解除 |
| 画像 | Unityでは位置更新で同じ画像を読み直さず保持 |
| 動画 | 移動・時計更新でプレイヤーを再生成しない。短い明示的シークと終了後の再生を反映。ネイティブ画面と3D面の二重音声を抑止 |
| YouTube | 短いシークと連続操作の時計反映を修正。3Dから共通プレイヤーを開いて再生・操作する |

アイテムが他の利用者に片付けられた場合は、そのネイティブウィンドウも閉じる。3Dで送った自分の位置を2D側の距離表示・音量・操作位置にも反映する。

通常操作の検証は `Tonarium.UiSmoke --items` と `--chess --unity-chess <Unity結果JSON>`、Unityの `--tonarium-item-behavior` と `--tonarium-chess-probe` で行う。カメラ配信だけを確認する場合は本体に `--camera-smoke --output <JSON>` を渡す。この確認ではマイク・デスクトップ取得を使わず、仮想画像を実LiveKitの別参加者へ配信して受信と停止を確認する。結果は `native/verification/item-behavior/` に保存する。

YouTubeの3D面は引き続きサムネイルで、動画自体は共通プレイヤーで再生する。YouTubeの埋め込み可否や対応動画コーデックは配信元・Windows環境の制約を受ける。

## キャンバス同期遅延の調査（2026-10-21）

修正前の `SharedDrawingCanvas` はポインター移動1回につき1点の `strokeAdd` を送っていた。`TonariumClient.SendRoomAsync` は共通のセマフォを保持したまま `MessageAsync` を待ち、SDKの `RequestAsync` はサーバーの応答まで完了しない。このため送信能力がほぼ「1往復につき1点」に制限され、入力が速いと、描き終わった後も未送信の点が順番に送られていた。書いている側はローカルプレビューで直ちに表示するので、相手だけ線がゆっくり伸びて見えていた。

Web版の `client/src/items/panels.ts` は約50msの点をまとめて送っている。同じ方式を比較する再現プローブを追加した。入力部を100Hz・100点で模擬し、それ以外は実際のC#クライアントとNodeサーバーを通した。送信側WebSocketの両方向に20msずつ遅延を加えた結果：

| 点の送り方 | 送信数 | 入力時間 | 相手に全点が届くまで | 描き終わってからの遅れ |
| --- | ---: | ---: | ---: | ---: |
| 修正前のWindows版相当・1点ずつ | 100 | 1.04秒 | 5.31秒 | 4.27秒 |
| Web版相当・50ms単位のまとめ送り | 20 | 1.04秒 | 1.10秒 | 0.061秒 |

両方とも全101点（始点を含む）の受信を確認した。これは送信方式を比較したローカル再現試験で、公開サーバーの実測値やブラウザUI自体の計測ではない。結果は `native/verification/ui/canvas-latency.json`。

Windows版もWeb版と同じく、ポインター移動時に約50ms分の点をまとめて送るよう修正した。ペンを離した時、キャプチャを失った時、キャンバスを閉じた時には残りを送る。全消去では未送信のプレビューも消す。手元のプレビューは入力ごとに更新し、送信点の順序と全データを維持する。

実際の `SharedDrawingCanvas` にマウス入力を与え、同じ片道20ms遅延の接続で確認した。104点を約1.29秒で入力し、22回の `strokeAdd` で全点が順序どおり届き、入力完了からの遅れは約45msだった。クリック1回の点描画と、50ms未満でペンを離した時の最後の点の送信も確認する。結果は `native/verification/ui/canvas-batched.json`。

今回の修正はWeb版との送信粒度の統一。送信キューや確認応答の方式は共通のままなので、1往復が50msを大きく超える接続での適応的な一括化は別の改善になる。

### Unityで自分の線が表示されない問題

サーバーの既存互換経路はキャンバス差分を送信者以外へ配信する。Windows側は送信者の状態へ差分を適用していなかったため、Webの相手には線が届いても、手元のUnityには描画が戻らなかった。送信時に `strokeStart` / `strokeAdd` / `canvasClear` を自分の状態にも一度適用し、その更新を通常のIPCでUnityへ渡す。2Dのキャンバスと保存用の状態も同じ経路で更新する。

Unityの描画確認は、既存の板に開始・点追加・全消去の差分を渡し、同じテクスチャのピクセルが更新されることまで確認する。通信は2クライアント間の往復と再参加後のスナップショットを別途確認する。

### Unityで描画中に重くなる問題

Unityは差分を受けるたびに640×520の画素配列を確保し、過去の全ストロークとツールバーを描き直していた。修正後は画素配列とテクスチャを維持し、新しい線の部分だけを更新する。同じフレームの差分はまとめて一度GPUへ反映する。複数人が同時に描く場合は、更新範囲に重なる後続の線・消しゴムを重ね直し、従来の重なり順を保つ。ツールバー変更では絵を描き直さない。

自分の入力はそのフレームに手元へ反映し、通信は従来どおり約50msのまとめ送りにする。デスクトップから戻る自分の差分は二重に適用しない。描画中のアイテム移動や全体更新でも未反映のプレビューを保持する。2Dのアイテムウィンドウも、キャンバスの更新判定のために全履歴をJSON化する処理を削除した。

実機Unity Playerで、32本×80点の履歴に3点ずつ120回追加する同一条件を比較した。差分受信からテクスチャ反映までのCPU処理は平均約97.9msから約0.08msになった。描画画像は修正前後で一致した。これは描画処理の比較であり、ネットワーク遅延や画面全体のFPSの測定ではない。結果・再現手順は `native/verification/unity/canvas-performance/`。点描画・消しゴム・交互更新・ローカルプレビュー・二重適用防止を検証し、同期と2D描画の通常フローも別途確認する。

再現手順（別々のターミナル）：

```powershell
node native/Tonarium.Smoke/canvas-delay-proxy.cjs 3020 http://localhost:3015 20
dotnet run --project native/Tonarium.Smoke -c Release -- http://localhost:3020 --canvas-latency http://localhost:3015 native/artifacts/canvas-latency.json
dotnet run --project native/Tonarium.UiSmoke -c Release -- http://localhost:3020 native/artifacts/canvas-batched --canvas-sync http://localhost:3015
```

終了後、プロキシ側のターミナルでCtrl+Cを押す。既存のローカルサーバーを使用し、作成した検証セッションはプローブ終了時に削除する。

## ファイルと責務

- `native/Tonarium.Desktop/Core/`: 接続、状態、kokosync SDK、設定
- `native/Tonarium.Desktop/Views/`: ネイティブ画面・アイテム
- `native/Tonarium.Desktop/Media/`: LiveKit、音声・映像、実機スモーク
- `native/Tonarium.Desktop/ThreeD/`: Unity起動、埋め込み、IPC
- `native/Tonarium.Unity/`: Unityプロジェクト、確認スクリプト
- `native/Tonarium.Smoke/` と `native/Tonarium.UiSmoke/`: 通常の同期・UI操作確認

ログは各クライアントの保存先にある `desktop.log` と `unity-player.log`。接続先・名前・ユーザーIDは `desktop.json`、表示と音声の設定は `preferences.json` に保存する。
