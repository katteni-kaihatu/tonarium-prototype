# Linux ネイティブ版

Linux x86_64向けにAvaloniaの2DクライアントとUnityの3Dプレイヤーを配布する。3Dは別ウィンドウで起動し、2Dと同じセッション・通話・アイテムを使う。

## 動作環境

Arch Linux。UIはX11、WaylandセッションではXWaylandを使用する。音声にはPulseAudioまたはPipeWireのPulseAudio互換サーバーが必要。マイク・スピーカーは「音声設定」で選択する。音声共有は選択した出力（未指定なら既定出力）のモニターを使い、通話音声も含む。エコーキャンセルはWindows版と同様に未実装。

画面共有はxdg-desktop-portalのScreenCastとPipeWireを使用する。共有時にデスクトップ側のダイアログで画面またはウィンドウを選ぶ。デスクトップに対応したportalバックエンド（KDE、GNOME、wlroots等）が必要。バックエンドによって選べる共有対象は異なる。

動画アイテムはシステムのLibVLC、YouTubeはWebKitGTK 4.1の公式iframeプレーヤーを使用し、再生・停止・シークを共有する。Pythonのヘルパーはアプリに同梱し、システムのPyGObjectを利用する。

設定とログは通常 `~/.local/share/Tonarium/`（XDG_DATA_HOME設定時はその配下）。`--data-dir /path` で分離できる。Unityのログは同じ場所の `unity-player.log`。3Dの終了コード・終了要求の有無・同期切断時のキュー診断は `desktop.log` に記録する。

同期受信はUIスレッドから分離する。一時的な同期切断では3Dを閉じず、再接続後のSnapshotで状態を復元する。送信失敗は3D画面内に通知し、失敗した操作は自動再送しない。同期復旧後に再度操作する。セッション退出・2Dへの切替時は通常どおり3Dを終了する。

## ビルド

.NET 10 SDK、Unity 6000.6.7f1 Linux EditorとLinux Build Support、Unity CLIが必要。

```sh
unity install 6000.6.7f1 --module windows-mono --yes --accept-eula
```

Editorのバージョンは `native/Tonarium.Unity/ProjectSettings/ProjectVersion.txt` で固定する。

```bash
native/build-unity-linux.sh
native/publish-linux.sh 0.0.8
```

Editorを明示する場合は `TONARIUM_UNITY_EDITOR=/path/to/Editor/Unity` を設定する。配布物は `native/artifacts/Tonarium-0.0.8-linux-x64.tar.gz`。同じ出力先がある場合は上書きせず停止する。起動時には.NETの追加インストールは不要。

開発時は `dotnet run --project native/Tonarium.Desktop`。3Dプレイヤーの探索先は配布ディレクトリの `Unity/` と開発用の `native/build/unity-linux/`。`TONARIUM_UNITY_PLAYER` で実行ファイルを指定することもできる。

## Archパッケージ

`packaging/aur/tonarium-bin/` にPKGBUILDと.SRCINFOを置く。依存パッケージをインストール後、次を実行する。リリース公開前のローカル検証では同名のtar.gzをPKGBUILDの隣に置く。

```bash
cp native/artifacts/Tonarium-0.0.8-linux-x64.tar.gz packaging/aur/tonarium-bin/
cd packaging/aur/tonarium-bin
makepkg -s
sudo pacman -U tonarium-bin-0.0.8-1-x86_64.pkg.tar.zst
```

アプリメニューのTonarium、または `tonarium` で起動する。削除は `sudo pacman -Rns tonarium-bin`。ユーザー設定は削除しない。

## ユーザー領域へのインストール

依存パッケージがインストール済みなら `native/install-linux-user.sh 0.0.8` で管理者権限なしでもインストールできる。配置先は `~/.local/opt/tonarium/0.0.8/`、コマンドは `~/.local/bin/tonarium`。アプリメニューにも登録する。これはpacmanの管理対象ではない。後でArchパッケージへ移行する場合は、ユーザー側のコマンドとdesktopエントリーを取り除く。

## 検証

2026-10-21、Arch Linux x86_64で確認済み。

- `npm run typecheck`、`npm run build`、.NET Releaseビルド。
- サイドパネル、チャットのスクロール、X11上のホーム・ルーム描画。
- LibVLCで動画の再生・停止・シークと、動画ウィンドウを閉じる際の終了処理。
- WebKitGTKの埋め込み、リサイズ、再生時計と操作イベントの往復（ローカルテストページ）。YouTube側の動画制限・ログイン要求は動画や環境に依存する。
- PulseAudioの仮想デバイスによる音声再生・取得。実マイク・実スピーカーは自動テストでは使用しない。
- KDEのScreenCast portalでユーザーが選択した画面から5フレームを取得。映像は保存・送信しない。
- Unity Linuxプレイヤーでカフェ・ホール・ゲームの描画。
- `https://tonarium.rheni.work/` に新規テストセッションを作成し、2クライアントのチャット・付箋同期、Unityの起動と2Dへの復帰、6秒のUI停止中の24件受信と3回の同期切断後の3D維持、LiveKitで合成音声と仮想カメラ映像を送受信。ラウンジには参加せず、テストセッションは終了後に削除。

```bash
dotnet run --project native/Tonarium.UiSmoke -c Release -- unused native/artifacts/linux-platform --linux-platform
# 新規のテストセッションを作成し、終了時に削除する。実デスクトップと音声サービスが必要。
dotnet run --project native/Tonarium.UiSmoke -c Release -- https://tonarium.rheni.work/ native/artifacts/linux-online --linux-online
```

Avalonia 12.0用のD-Bus依存は0.92.0に固定する。0.93以降ではAvaloniaが使うAPIが削除されているため、そのまま上げるとLinux起動時に失敗する。0.92.0は[セキュリティ修正版](https://github.com/tmds/Tmds.DBus/releases/tag/rel%2F0.92.0)。

## 日本語入力（IME）

LinuxではAvaloniaのX11/XWaylandバックエンドからFcitx・IBusへ接続する。`AVALONIA_IM_MODULE`、`GTK_IM_MODULE`、`QT_IM_MODULE`、`XMODIFIERS`で入力方式が指定されていない場合は、起動中のD-Busサービスを調べてFcitxまたはIBusを選ぶ。FcitxのIBus互換サービスが同時にある場合はFcitxを優先する。表示言語が英語でもIMEを有効にする。

既存のIME指定や明示的な無効化は変更しない。手動指定する場合は `AVALONIA_IM_MODULE=fcitx tonarium` または `AVALONIA_IM_MODULE=ibus tonarium`。Flatpakでは `flatpak run --env=AVALONIA_IM_MODULE=fcitx work.rheni.Tonarium` のように指定できる。IME本体と日本語エンジン（Mozcなど）はホスト側で起動しておく。アプリ起動後に初めてIMEを起動した場合はアプリを再起動する。

Avalonia 12の既定の入力方式選択は環境変数に依存するため、Waylandデスクトップで変数を設定せずに使う構成では日本語入力に接続できなかった。自動検出はアプリのプロセス内だけに反映し、デスクトップ全体の設定を変更しない。検出には2秒の上限を設け、D-Busが利用できない場合もアプリの起動を続行する。

### 3D内の日本語入力

Unity 6.6（6000.6.7f1）では、3DのチャットはEnterでUnity内の入力欄を開く。IMEの変換確定Enterでは送信せず、確定後のEnterまたは送信ボタンで送信する。Escapeで閉じても下書きは保持する。デスクトップ側で検出したFcitx5/IBusをUnityのSDL入力バックエンドへ渡すため、通常は環境変数の手動設定は不要。既に指定された `SDL_IM_MODULE` は上書きしない。付箋もUnity内で編集し、画像はUnity内のビューアーで全体表示・拡大・スクロールする。画像と付箋の操作では別窓を開かない。

Unity 6.6のLinux入力では、長い未確定文字列が約10文字ごとに上書き表示されるため、`SDL_IME_INTERNAL_EDITING=1` を既定で渡し、変換中の文字はIMEの候補ウィンドウ側に表示する。確定した文字はUnityの入力欄に入る。明示的に設定された値は上書きしない。

左上の☰とワールド名（ラウンジ・カフェなど）はどちらもメニューを開く。UIがクリックを処理した後、空間へのクリックだけでマウスを固定する。Escapeでカーソルを出す。

Fcitx5/Mozcの実デスクトップで、通常版・Flatpak・AppImageを検証する。Unity単体を直接起動する場合は `SDL_IM_MODULE=fcitx XMODIFIERS=@im=fcitx` で入力方式を指定できる。IBus単独環境は未検証。[Unity公式のLinux IME対応案内](https://docs.unity.com/en-us/engine/6000.6/manual/input/imeinput)。

## Flatpak・AppImage

追加の配布形式は `0.0.8`。前述の通常のLinux配布物とは別に、Ubuntu 24.04のPython・GTK・WebKitGTK・LibVLC・音声ツールを同梱する。

- `Tonarium-0.0.8-x86_64.AppImage`: Ubuntu 24.04以降とArchの通常のデスクトップ環境向け。実行権限を付けて起動する。FUSEが使えない環境では `--appimage-extract-and-run` を付ける。glibc 2.39以降とホストのグラフィックスライブラリが必要。
- `Tonarium-0.0.8-x86_64.flatpak`: `flatpak install --user ./Tonarium-0.0.8-x86_64.flatpak` でインストールし、`flatpak run work.rheni.Tonarium` で起動する。初回はFreedesktop 25.08ランタイムも必要。設定は `~/.var/app/work.rheni.Tonarium/data/Tonarium/` に分離する。

Flatpakは通信、X11、音声入出力、GPU、およびDownloads・Pictures・Videosの読み取りを許可する。それ以外のファイルはファイル選択ダイアログから開く。権限外の場所からのドラッグ＆ドロップは使えない場合がある。画面共有はホストのportalを使用する。

Arch実機で両形式の起動、同梱Unityの3D維持・復帰、音声・動画とYouTube再生を確認した。Flatpak内でもportal経由で5フレームの画面取得を確認した（保存・送信なし）。AppImageはUbuntu 24.04コンテナの仮想画面でも起動確認済み。Ubuntuの実デスクトップでの操作は未検証。

ビルド手順・依存関係の管理は [portableパッケージの説明](../packaging/portable/README.md) を参照。FlathubやAppImageHubへの投稿は行っていない。本体のライセンスは引き続き未指定。

## AUR公開前の手順

1. Linux対応の変更を上流リポジトリへ反映し、`v0.0.8` のGitHub Releaseに検証済みのtar.gzを添付する。PKGBUILDのURLから取得できることを確認する。
2. 本体ライセンスは未指定。現在の `LicenseRef-unknown` はプレースホルダーであり、オープンソースライセンスを示さない。既存の第三者ライセンスは同梱する。
3. バージョンやアーカイブを更新したらSHA-256を更新し、`makepkg --printsrcinfo > .SRCINFO`、`makepkg`、`namcap`で再確認する。
4. AURアカウントのSSH鍵を登録し、`ssh://aur@aur.archlinux.org/tonarium-bin.git` をcloneする。PKGBUILDと.SRCINFOのみをコピーしてcommit/pushする。配布アーカイブや生成したパッケージはAURへ入れない。

AURへの投稿・GitHub Releaseへの公開はビルドスクリプトでは実行しない。

### 初回フォーカスと音声メッセージ

「セッションを作る」「グループを作る」などのフォームでは、Avalonia 12.0のD-Bus IME接続が完了した後に、現在の入力欄と候補表示位置を再通知する。接続前に送られた初回フォーカスが失われ、Tab移動まで日本語入力が有効にならない問題を回避する。固定時間待ちや入力欄の強制移動は使わない。Avaloniaの内部APIを参照する限定的な回避策のため、Avalonia更新時には `--linux-form-ime` で再検証する。

Linuxのグループ／DM音声メッセージは、`Linux/voice.py` のGStreamer経路を使う。PulseAudio/PipeWireの既定マイクから録音し、Opus/WebMで最大60秒保存して、既存のメディアアップロードと会話メッセージへ渡す。再生はGStreamerで行い、一時停止・再開・再再生に対応する。WindowsのMedia Foundation／WaveInはLinuxでは呼び出さない。録音窓を閉じると録音を停止して一時ファイルを削除し、送信しない。AppImage/Flatpakでは既存のGStreamer・PulseAudio依存を利用する。
