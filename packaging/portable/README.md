# Flatpak / AppImage

`native/build-portable-linux.sh 0.0.8` はUbuntu 24.04の依存ライブラリをPodmanで集め、.NETの自己完結ビルドとUnity Linuxプレイヤーを合わせて2形式を生成する。成果物は `native/artifacts/`。

必要なツールは.NET 10 SDK、Podman、Python 3、Flatpak、[appimagetool](https://github.com/AppImage/appimagetool)。Unityプレイヤーは先に `native/build-unity-linux.sh` で作る。

```bash
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user flathub org.freedesktop.Platform//25.08
APPIMAGETOOL=/path/to/appimagetool-x86_64.AppImage native/build-portable-linux.sh 0.0.8
```

Flatpakの作業用インストール先を隔離する場合は、全コマンドで同じ `FLATPAK_USER_DIR=/absolute/path` を設定する。AppImageの起動ランタイムを固定する場合は、[type2-runtime](https://github.com/AppImage/type2-runtime/releases) のファイルを取得し `APPIMAGE_RUNTIME=/absolute/path/runtime-x86_64` を指定する。

`native/build/packaging/runtime/` は依存ファイルのキャッシュ。Ubuntuのセキュリティ更新を取り込むときはこのディレクトリを退避し、コンテナを `podman build --pull --no-cache -t localhost/tonarium-portable:ubuntu24 packaging/portable` で再作成する。同じバージョンのAppDirやFlatpak作業ディレクトリが既にあるとスクリプトは停止する。新しいバージョンを指定するか、既存の作業ディレクトリを退避してから実行する。

各パッケージには `ubuntu-packages.txt` に依存パッケージのバージョン一覧、`share/doc/` にUbuntuパッケージの著作権・ライセンス情報、アプリ配下の `licenses/` に既存の第三者ライセンスを収録する。本体のライセンスは未指定のまま。Flathubへの申請や署名・自動更新用リポジトリの公開は行わない。

## 同梱時の調整

- glibc、libstdc++、GPUドライバー、Wayland、FontconfigはホストまたはFlatpakランタイムを使用する。古いライブラリを新しいMesaより優先すると、必要なシンボルがなく起動できないため。
- GTK、WebKit、Python、GStreamer、LibVLC、PulseAudioクライアントは同梱する。`.NET`からバージョンなしの名前で読み込むLibVLCには対応するsymlinkも置く。
- リリース版WebKitは `WEBKIT_EXEC_PATH` を使わないため、ライブラリ中の補助プロセスの固定パスを置換する。Flatpakは `/app`、AppImageはPythonヘルパー専用の作業ディレクトリを基準にする。WebKitのサンドボックスは維持する。
- PipeWireの設定・SPAモジュールも同梱し、読み込み先を明示する。画面共有のバッファ数は最低1枚に設定し、最大4枚の共有元とも接続できるようにする。GLibの終了シグナル登録は新旧APIに対応する。
- Pythonヘルパーの選択は `TONARIUM_PYTHON`。通常のLinux版では従来どおり `/usr/bin/python3` を使う。

## 起動と検証

```bash
chmod +x native/artifacts/Tonarium-0.0.8-x86_64.AppImage
native/artifacts/Tonarium-0.0.8-x86_64.AppImage
flatpak install --user native/artifacts/Tonarium-0.0.8-x86_64.flatpak
flatpak run work.rheni.Tonarium
```

`TONARIUM_PACKAGE_EXEC` は検証用の実行ファイルを同じ依存環境で起動するための設定。通常起動では設定不要。パッケージのテスト結果は `native/artifacts/` の `appimage-*` / `flatpak-*` に出力する。実機のマイクを録音する代わりに仮想音声デバイスを使う。

設計の参照: [AppImageの互換性指針](https://docs.appimage.org/reference/best-practices.html)、[Flatpakの権限](https://docs.flatpak.org/en/latest/sandbox-permissions.html)、[Flatpak単一ファイル配布](https://docs.flatpak.org/en/latest/single-file-bundles.html)。
