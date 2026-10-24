# Native UI normal-flow smoke

Run against an isolated development server with KokoSync enabled:

```powershell
dotnet run --project native/Tonarium.UiSmoke -- http://localhost:3015 native/Tonarium.UiSmoke/results
```

The suite uses the production `MainWindow`, `HomeView`, `RoomView`, item windows and profile windows. It sends real text-input and Enter-key events, raises real button Click events, and verifies resulting operations against a second native network client. Unique session and profile names avoid modifying existing content. Remembered login identity is not changed; generated test sessions are retained for inspection.

It renders Skia screenshots of login, all seven home navigation destinations, group/event creation, the event calendar, session creation, room/chat, inventory, note editing, social DM, profiles, 1000×640 minimum room/home layouts, 150% DPI and the return home. `result.json` lists network/control assertions and persistent controls that extend outside each window. Scrollable content is intentionally excluded from the outer-window bounds assertion.

The portrait probe checks the original Oekaki model/animation channel counts, live idle pixel changes, speaking, a networked look-pitch update, server-backed custom texture upload, and ordinary manifest parameter changes. It exports deterministic normal/blink/speaking/pose images, animation frames and a five-second idle CPU/memory/raster-cost sample. Speaking is stimulated through the portrait's explicit media-state override; microphone transport is covered by the separate media smoke.

To encode the recorded original-model frames as a GIF, install Pillow and run:

```powershell
python -m pip install --target native/Tonarium.UiSmoke/.tools Pillow
python native/Tonarium.UiSmoke/encode_animation.py native/Tonarium.UiSmoke/results
```

The focused offline-profile regression avoids rerunning unrelated flows:

```powershell
dotnet run --project native/Tonarium.UiSmoke -c Release -- http://localhost:3015 native/Tonarium.UiSmoke/offline-results --offline-avatar
```

It persists a custom texture and nondefault manifest for a unique name absent from online users, opens the actual native profile by that name, and verifies the stored texture, parsed parameters and nonblank rendered preview.

The focused chat-media happy path runs against an isolated local server:

```powershell
dotnet run --project native/Tonarium.UiSmoke -c Release -- http://localhost:3016 native/artifacts/chat-media --chat-media
```

It uses real native storage items and synthetic Avalonia file/bitmap transfers, uploads a generated 640×360 image and the small checked-in MP4 fixture, and confirms receipt through a second KokoSync client. It verifies inline image dimensions, pointer and keyboard viewer opening/closing, clipboard image paste, 2D versus 3D item creation, selected DM routing, and ordinary Ctrl+V text through the real MainWindow key handler. It does not open an OS file picker or save dialog, or publish to external services.

The focused canvas check sends actual headless mouse input through `SharedDrawingCanvas`, verifies 50 ms batching, release flushing, single dots, and every received point's order. Start `node native/Tonarium.Smoke/canvas-delay-proxy.cjs 3020 http://localhost:3015 20`, then run:

```powershell
dotnet run --project native/Tonarium.UiSmoke -c Release -- http://localhost:3020 native/artifacts/canvas-batched --canvas-sync http://localhost:3015
```

The offline `--chat-scroll` check verifies wheel scrolling to the final row, late image loading, window/composer resizing, keeping an older reading position and hidden chat/input scrollbars:

```powershell
dotnet run --project native/Tonarium.UiSmoke -c Release -- http://localhost:3016 native/artifacts/chat-scroll --chat-scroll
```

`--audio-settings` checks the real Windows device list, selection/refresh/apply/cancel, stored settings and explicit window ownership without recording microphone audio or joining a call:

```powershell
dotnet run --project native/Tonarium.UiSmoke -c Release -- unused native/artifacts/audio-settings --audio-settings
```

`--audio-transmit` injects a generated 440Hz tone into the production capture conversion and sends it through local LiveKit for 16 seconds. It checks received sample energy at the beginning and after 12 seconds, rather than only counting packets. It queries the default input format but never starts microphone or desktop capture. Local LiveKit must run at `ws://127.0.0.1:7880` with the development credentials.

```powershell
dotnet run --project native/Tonarium.UiSmoke -c Release -- unused native/artifacts/audio-transmit --audio-transmit
```

This is a happy-path integration smoke, not a failure-case unit suite. Headless input does not validate physical Windows IME composition, foreground window switching, GPU surfaces, microphone devices or Unity rendering; those require the separate runtime smoke. Its CPU sample includes the test harness and Skia software rendering, so it is evidence about this run, not a hardware-independent performance guarantee.

## Linux

`--linux-platform` は画像変換、実X11上のWebKitGTK埋め込みと時計同期、専用の仮想PulseAudioデバイスを使う音声入出力を検証する。`--linux-online` は指定サーバーに専用セッションを新規作成し、2クライアント同期・Unity起動終了・LiveKitの合成音声と仮想カメラ映像を検証した後、セッションを削除する。既存のラウンジには参加しない。[手順](../../docs/native-linux.md)。

`--3d-lifecycle` は同期送信失敗後もUnityブリッジが次のコマンドを処理できることを検証する。`--linux-online` は専用テスト部屋で6秒のUI停止中の24メッセージ受信、およびUnity起動中の同期切断・復旧3回も検証する。

## Linux IME

`--linux-ime` は実際のX11/XWaylandウィンドウでIMEの未確定文字列と「日本語」の確定を確認する。サーバーには接続しない。ArchのFcitx5/Mozc環境では、`python3 native/verification/linux/ime-check.py native/artifacts/ime-native dotnet native/Tonarium.UiSmoke/bin/Release/net10.0/Tonarium.UiSmoke.dll unused native/artifacts/ime-native --linux-ime` で専用ウィンドウへキーを送れる。xdotoolとfcitx5-remoteが必要で、テスト中はウィンドウをアクティブにする。入力エンジンはテスト終了時に戻す。

`--ime-baseline` を追加すると修正前の起動設定を使う。IME関連の環境変数が未指定の環境では、ローマ字のままになり検証に失敗する。IBusのサービス選択は検証するが、IBusのみの実デスクトップは未検証。

`--linux-3d-ime` は `TONARIUM_UNITY_PLAYER` で指定した実UnityプレイヤーをローカルTCPブリッジに接続する。`python3 native/verification/linux/hud-check.py OUTPUT dotnet native/Tonarium.UiSmoke/bin/Release/net10.0/Tonarium.UiSmoke.dll unused OUTPUT --linux-3d-ime` で、☰・ワールド名・ワールド切替・2D復帰、空間クリックによる視点操作、日本語変換、確定Enterでは未送信、次のEnterで1回だけ送信、再入力と空Enterを検証する。製品と同じIME起動設定を使い、専用入力窓への迂回は失敗扱いにする。クリックは対象Unity窓へX11イベントを送る。IMEには実デスクトップのFcitx5/Mozcとフォーカスが必要。外部サーバーは使わない。

長文IMEの回帰確認は `TONARIUM_IME_ROMAJI=wagahaihanekodearu.namaehamadanai.` と `TONARIUM_IME_EXPECTED='吾輩は猫である。名前はまだ無い。'` を同じコマンドへ渡す。変換候補はMozcの辞書・学習状態に依存する。`TONARIUM_IME_ITEMS=1` も指定すると付箋への同じ文章の保存と画像ビューアーの拡大・終了、別窓が開かないことを確認する。事前にOUTPUT内へ `test-image.png` を置く。未確定文字はIME側で表示するため、Unityの `compositionString` が空でも正常。診断用の `hud-command.json` は `--tonarium-hud-probe` を指定したテスト起動時のみ読み取る。

`--linux-form-ime` は実際のセッション作成ダイアログを開き、最初のセッション名欄へTab移動なしで日本語を入力する。`ime-check.py` から起動する。`--linux-voice` はローカル検証サーバー上にグループを作り、実際の録音・再生ウィンドウで開始、停止、WebMアップロード、会話への添付、一時停止、再開、再再生、録音キャンセル、開始失敗を確認する。仮想PulseAudioデバイスの合成音を使用し、実マイク・実スピーカーは使わない。
