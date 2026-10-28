# Electron 版

自動再起動の設定、カウントダウンとキャンセル、更新後のセッション・画面状態の復元は [updates.md](updates.md) を参照。

Electron 版は接続先サーバーの Web クライアントを、そのまま専用ウィンドウで開く。2D は React、3D は React Three Fiber / Three.js で、サバイバーズを含む描画・操作・音・通信は Web 版と同じコードを実行する。Avalonia／Unity による Windows／Linux ネイティブ版は廃止し、デスクトップ向けの開発・配布は Electron 版に集約した。公開済みのネイティブ版配布物は保持する。

初期接続先は `https://tonarium.rheni.work/`。サーバーに配信された Web 更新は、Electron 版でも再読み込み時に反映される。Web アセットやサーバーは配布物に同梱しないため、接続にはネットワークが必要。Electron 本体は GitHub Releases のコミット別 `nightly-<コミットSHA>` から更新できる。初回起動時に更新設定を選び、以後はメニューの「アプリの更新…」から変更する。

メニューの「接続先を変更…」から接続先を設定する。設定はユーザーデータ内の `connection.json` に保存する。起動時の `--server URL` でも指定できる。HTTPS 接続を使用し、開発用の `localhost` / `127.0.0.1` / `[::1]` だけ HTTP を許可する。`--data-dir PATH` でテスト用に保存先を分離できる。

## 開発とビルド

Node.js 22.12 以上 / npm が必要。Electron と electron-builder は `electron/package-lock.json` で固定している。`npm ci` の postinstall で開発・テスト用 Electron 本体もダウンロードする。

```bash
npm --prefix electron ci
npm --prefix electron start
npm --prefix electron run build:linux
npm --prefix electron run build:windows
```

Linux x86_64 は tar.gz と AppImage、Windows x86_64 は ZIP と NSIS インストーラーを生成する。成果物と SHA-256 は `electron/artifacts/`、展開済みアプリやビルド中間ファイルは `electron/build/` に置く。Windows版のCIはWindows runnerで実行する。LinuxからNSISを含めてクロスビルドする場合はWineが必要。Windows実機での動作確認は別途必要。コード署名・macOS 配布は含めていない。

AppImage は実行権限を付けて起動する。FUSE を利用できない環境では `--appimage-extract-and-run` を利用できる。

```bash
chmod +x electron/artifacts/Tonarium-Electron-0.0.8-linux-x86_64.AppImage
electron/artifacts/Tonarium-Electron-0.0.8-linux-x86_64.AppImage
```

## 更新設定

初回はどちらの設定もオフで表示する。保存するまで更新確認の通信は行わない。

- 「起動時に更新を確認する」: 有効なら起動時と設定保存時に更新情報を取得し、新しい版を表示する。オフでも「今すぐ確認」で手動確認できる。
- その下の「更新を自動でダウンロードし、アプリ終了時に適用する」: 起動時確認が有効な場合に選べる。ダウンロード済みの更新は通常終了時に適用する。「今すぐ更新」から即時適用もできる。取得後の自動再起動は別の設定で、既定はオフ。オンの場合は通話中も状態を保存して更新する。

Linux AppImage と Windows NSIS でインストールしたアプリが自動適用に対応する。AppImage はユーザーが書き換えられる場所に保存する。tar.gz／展開済みLinux版とWindows ZIP版は更新の確認・通知に対応し、適用は「Releasesを開く」から手動で行う。Windows ZIP利用者が自動更新を利用するにはNSIS版をインストールする。

更新先は接続中のWebサーバーに関係なく `katteni-kaihatu/tonarium-prototype` に固定する。`nightly` の更新情報から各OSの最新成功版を確認し、実体はコミット別 `nightly-<コミットSHA>` Releaseから取得する。既存版の更新URLも継続して使える。これは開発版の配信で、安定版のみのチャンネルではない。取得失敗は更新画面に表示し、アプリの利用は継続できる。設定はユーザーデータ内の `updates.json` に保存する。

### AURなど、パッケージ管理向けビルド

```bash
npm --prefix electron run build:linux -- --disable-updates
# 展開済みアプリだけが必要な場合
node electron/scripts/build.cjs --linux --dir --disable-updates
```

このオプションはアプリ内の初回更新案内・確認通信・自動適用を無効にする。実行時の設定で再び有効にはできない。AURのPKGBUILDなどではこのフラグを渡し、`electron/build/package-linux/linux-unpacked/` を配置する。更新はパッケージマネージャーで行う。生成する `app/update-build.json` はビルドごとに上書きし、ソース管理しない。

## Linux へのインストール

ビルド後、次を実行する。

```bash
bash electron/install-linux-user.sh
tonarium-electron
```

アプリは `~/.local/opt/tonarium-electron/`、起動コマンドは `~/.local/bin/tonarium-electron`、アプリメニューには **Tonarium Electron** として登録する。再インストール時は新しい日時付きディレクトリに配置して `current` を切り替え、古いアプリを保持する。ユーザーデータの既定位置は Linux では `$XDG_CONFIG_HOME/tonarium-electron`（通常 `~/.config/tonarium-electron`）、Windows では `%APPDATA%/tonarium-electron`。保存先は Web ブラウザーとも別のため、初回は Web 版と同様にログインが必要。

## 機能と制約

- マイク・カメラは接続先の Web ページから要求された際に確認する。
- 画面共有は Electron / OS の画面選択を通す。Wayland では PipeWire とデスクトップ環境に対応する XDG Desktop Portal が必要。Linux は画面の映像のみで、システム音声の共有は未対応。Windows は要求時にループバック音声を利用するが、実機確認が必要。
- 外部リンクは通常のブラウザーで開く。Web ページに Node.js や任意のローカルファイル操作権限を渡さない。
- 日本語入力・WebGL・音声・画面共有は同梱 Chromium と OS の組み合わせに依存する。Web と同じコードを使うが、ブラウザーのバージョン、GPU、コーデック、外部サービス側の埋め込み制限による差はあり得る。
- アプリ本体のライセンスは未設定。パッケージの `UNLICENSED` はオープンソースライセンスの付与を意味しない。同梱 Electron / Chromium 等のライセンス文書は配布物に保持する。

テスト用のサーバーやセッションを使い、運用中のラウンジで自動操作テストを実行しない。

## 検証

```bash
npm run electron:test
# Playwrightが別ディレクトリにある場合はPLAYWRIGHT_MODULEにその絶対パスを指定
xvfb-run -a node electron/verification/smoke.cjs
xvfb-run -a node electron/verification/web-smoke.cjs
xvfb-run -a node electron/verification/launch.cjs
xvfb-run -a node electron/verification/updates.cjs
```

`smoke.cjs` はローカルHTTPページと合成メディアデバイスで、接続先・保存・権限・外部リンク・接続失敗時の復帰・画面共有選択のキャンセルを確認する。実画面・実マイクは取得しない。`ELECTRON_BINARY` に展開済みの実行ファイルを指定すると配布版を検証できる。PlaywrightのElectronドライバーは起動時にサンドボックスを無効にするため、別の `launch.cjs` では通常の配布版をその指定なしで起動して確認する。仮想画面のGPU描画にはテスト時のみSwiftShaderを指定する。

`web-smoke.cjs` は既存のWeb版React／Three.jsコンポーネントを変更せずElectronで描画し、2D／3D画像を保存する。Viteのローカル検証ページを一時生成し、終了時に削除する。結果は `electron/build/verification/` に置く。OSの実IME変換、Waylandでの実画面選択、Windows実行はこの自動検証の対象外。

Electronの隔離と権限処理は[公式セキュリティガイド](https://www.electronjs.org/docs/latest/tutorial/security)、画面共有は[desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer)に基づく。

### マイク・スピーカーの選択

Electronの「Tonarium Electron → マイク・スピーカー…」から、アプリに同梱された設定ウィンドウを開きます。入力・出力のプルダウンで選んだ機器はElectronのユーザーデータ内に接続先ごとに保存します。機器名が表示されない場合は「機器の利用を許可」を押してください。許可と一覧取得だけではマイクを開始しません。

設定はElectron専用のpreloadからWebの音声APIへ適用します。`client/` の変更やサーバーへの新版デプロイは不要です。remote rendererは引き続きsandbox・contextIsolation有効、NodeとホストIPC非公開です。設定保存のIPCはローカル設定ウィンドウに限定します。

現在のTonarium Webでは既存LiveKit接続のデバイス切替を利用し、通話中のマイク変更を反映します。接続APIを持たないページでは次回の録音・通話開始から反映します。出力設定はWeb Audioとトップページ内の音声・動画要素に適用します。YouTube等の別オリジンiframeは対象外で、OS側で出力先を選択します。

音声設定の単体検証は `npm run electron:test`。`electron/verification/audio-settings.cjs` はローカル設定画面の選択・保存・ページ再読込後の復元を検証します。`audio-virtual-devices.cjs` は専用PulseAudio仮想機器2組で、選択した入力ID・取得元・出力sink IDの一致を確認します。後者は仮想入力をexact指定し、音声を保存・送信・可聴再生しません。PlaywrightのElectron起動は `--no-sandbox` が付くため、OSのsandbox確認は別途 `launch.cjs` で行います。

## Nightly配布

配布ページは [GitHub Releases 一覧](https://github.com/katteni-kaihatu/tonarium-prototype/releases)。Web 版のログイン画面下部から、ログインせず別タブで開けます。現在の Electron 配布物は `nightly-<コミットSHA>` の各 Release にあります。固定 `nightly` は更新用情報と過去の配布物を保持するため、初回ダウンロードの案内には一覧を使います。

main更新時はLinux／Windowsの独立したジョブでビルドし、成功したOSから `nightly-<コミットSHA>` Releaseへ公開します。固定 `nightly` には自動更新の参照情報だけを上書きします。各成果物のソースコミットは対応する `.build.json` を確認してください。構成は [.github/workflows/electron-nightly.yml](../.github/workflows/electron-nightly.yml)、公開処理は [.github/scripts/publish-nightly.py](../.github/scripts/publish-nightly.py) にあります。

`updates.cjs` はローカルページと実際の更新設定画面・コントローラーを用い、更新取得・適用だけを偽物に置き換えて初回選択、設定復元、確認のみ、自動適用、再起動操作を検証する。実際のReleaseへのアクセスやアプリの置換は行わない。

## VRの利用について

Electron版は今回のWebXR対応の対象外で、VR開始ボタンを無効化して「Electron非対応」と表示する。VRを試す場合は同じ接続先をWebXR対応の単体ブラウザで開く。通常の2D・3D利用は従来どおり。[対応条件と検証範囲](webxr.md) を参照。
