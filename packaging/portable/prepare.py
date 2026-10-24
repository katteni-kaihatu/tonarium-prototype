#!/usr/bin/env python3
import pathlib
import os
import shutil
import sys

repo = pathlib.Path(__file__).resolve().parents[2]
build = repo / 'native/build/packaging'
destination = pathlib.Path(sys.argv[1]).resolve()
prefix = destination / 'usr' if sys.argv[2] == 'appimage' else destination
prefix.mkdir(parents=True, exist_ok=True)
shutil.copytree(build / 'runtime/usr', prefix, symlinks=True, dirs_exist_ok=True)
shutil.copytree(build / 'runtime/etc', prefix / 'etc', symlinks=True, dirs_exist_ok=True)
# ホストのシェルが新しいreadline APIを使う場合、古い同SONAMEを優先させない。
for pattern in ('libreadline.so*', 'libwayland-*.so*', 'libfontconfig.so*'):
    for path in (prefix / 'lib/x86_64-linux-gnu').glob(pattern):
        path.unlink()
for name, target in [('libvlc.so', 'libvlc.so.5'), ('libvlccore.so', 'libvlccore.so.9'),
                     ('libblas.so.3', 'blas/libblas.so.3'), ('liblapack.so.3', 'lapack/liblapack.so.3')]:
    link = prefix / 'lib/x86_64-linux-gnu' / name
    link.unlink(missing_ok=True)
    link.symlink_to(target)
# /etcもprefix下へ移すため、元の/usrを指す相対リンクを付け直す。
for source in (build / 'runtime/etc').rglob('*'):
    if source.is_symlink():
        target = source.resolve()
        if target.is_relative_to(build / 'runtime/usr'):
            dest = prefix / 'etc' / source.relative_to(build / 'runtime/etc')
            dest.unlink()
            dest.symlink_to(os.path.relpath(prefix / target.relative_to(build / 'runtime/usr'), dest.parent))
for source in (build / 'runtime/usr').rglob('*'):
    if source.is_symlink() and source.resolve().is_relative_to(build / 'runtime/etc'):
        dest = prefix / source.relative_to(build / 'runtime/usr')
        if 'alternatives' in source.resolve().parts:
            continue
        dest.unlink(missing_ok=True)
        target = prefix / 'etc' / source.resolve().relative_to(build / 'runtime/etc')
        if target.exists():
            dest.symlink_to(os.path.relpath(target, dest.parent))
# リリース版WebKitはWEBKIT_EXEC_PATHを無視するため、補助プロセスの固定パスを変更する。
webkit = prefix / 'lib/x86_64-linux-gnu/libwebkit2gtk-4.1.so.0'
binary = webkit.read_bytes()
old = b'/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1\0'
new = b'./webkit2gtk-4.1' if sys.argv[2] == 'appimage' else b'/app/lib/x86_64-linux-gnu/webkit2gtk-4.1'
assert old in binary and len(new) < len(old), 'WebKit process path changed upstream'
webkit.resolve().write_bytes(binary.replace(old, new.ljust(len(old), b'\0')))
python_wrapper = prefix / 'bin/tonarium-python'
python_wrapper.write_text('''#!/bin/sh
set -eu
prefix="${APPDIR:+$APPDIR/usr}"
prefix="${prefix:-/app}"
cd "$prefix/lib/x86_64-linux-gnu"
exec "$prefix/bin/python3" "$@"
''')
python_wrapper.chmod(0o755)
shutil.copytree(build / 'desktop', prefix / 'lib/tonarium', symlinks=True, dirs_exist_ok=True)
unity = prefix / 'lib/tonarium/Unity'
unity.mkdir(exist_ok=True)
unity_build = repo / 'native/build/unity-linux'
for name in ['Tonarium3D.x86_64', 'Tonarium3D_Data', *sorted(p.name for p in unity_build.glob('*.so*'))]:
    source = repo / 'native/build/unity-linux' / name
    if source.is_dir():
        shutil.copytree(source, unity / name, dirs_exist_ok=True)
    else:
        shutil.copy2(source, unity / name)
shutil.copy2(build / 'runtime/ubuntu-packages.txt', prefix / 'lib/tonarium/ubuntu-packages.txt')
shutil.copy2(repo / 'docs/native-linux.md', prefix / 'lib/tonarium/README-linux.md')
app_id = 'work.rheni.Tonarium'
desktop = (repo / 'packaging/linux/tonarium.desktop').read_text().replace('Icon=tonarium', 'Icon=' + app_id)
for path, text in [(prefix / 'share/applications' / (app_id + '.desktop'), desktop)]:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
icon = prefix / 'share/icons/hicolor/64x64/apps' / (app_id + '.png')
icon.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(repo / 'client/public/brand/favicon.png', icon)
launcher = destination / 'AppRun' if sys.argv[2] == 'appimage' else prefix / 'bin/tonarium'
shutil.copy2(repo / 'packaging/portable/launch.sh', launcher)
launcher.chmod(0o755)
if sys.argv[2] == 'appimage':
    (destination / (app_id + '.desktop')).write_text(desktop)
    shutil.copy2(icon, destination / (app_id + '.png'))
    (destination / '.DirIcon').symlink_to(app_id + '.png')
