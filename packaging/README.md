# Linux配布・AUR投稿の準備

`aur/tonarium-bin/PKGBUILD` と `.SRCINFO` がAURへ入れるファイル。`native/publish-linux.sh 0.0.8` で.NETとUnityを含む配布物を作る。本体ライセンスは未指定のまま `LicenseRef-unknown` としている。MaintainerはこのリポジトリのGit設定の名前・メールを使用。

## 成果物

- `native/artifacts/Tonarium-0.0.8-linux-x64.tar.gz`
- `native/artifacts/Tonarium-0.0.8-linux-x64.tar.gz.sha256`
- `packaging/aur/tonarium-bin/tonarium-bin-0.0.8-1-x86_64.pkg.tar.zst`

このPKGBUILDは公開前のひな形。記載のURLにリリース成果物を公開するまでは、そのままAURへ投稿しない。tar.gzを作り直した場合はPKGBUILDと.SRCINFOのSHA-256も更新する。AURはバイナリ自体をホストしない。

## 公開時

1. Linux対応コードを上流へ反映し、GitHubの `v0.0.8` Releaseに上記tar.gzとsha256を添付する。
2. PKGBUILDのsource URLを匿名でダウンロードできることを確認する。公開前のローカルテストはPKGBUILDと同じディレクトリにアーカイブを置いて実行済み。
3. `makepkg --printsrcinfo > .SRCINFO` と `makepkg -f` を実行する。
4. AURに登録したSSH鍵で `git clone ssh://aur@aur.archlinux.org/tonarium-bin.git` し、PKGBUILDと.SRCINFOをコピーしてcommit/pushする。

2026-10-21時点の匿名API確認では、GitHub上流は公開リポジトリ、AURの `tonarium-bin` は未登録。公開操作はまだ実行していない。

## 検査

PKGBUILDはnamcapのエラー・警告なし。バイナリパッケージはエラーなし。上流配布のUnity/.NET/Skia等に対するPIE・RELRO・シンボル情報の警告、動的に読み込むライブラリを未使用と判定する警告は残る。再配布バイナリにstripを適用しない。

.NETに付属する任意のLTTngトレースプロバイダが `liblttng-ust.so.0` を参照する警告も残る。通常のアプリ実行ではこの診断機能を有効にせず、起動・音声・映像・Unityの検証は通過している。

確認手順と機能ごとの検証範囲は [Linux版ドキュメント](../docs/native-linux.md) を参照。

YouTubeも公式iframe APIのサンプル動画で実再生を確認済み。`xvfb-run -a /usr/bin/python3 native/verification/linux/youtube-check.py` で再実行できる。ローカルのWebKitGTKヘルパーを使い、Tonariumのセッションには接続しない。
