#!/usr/bin/env python3
import os
import pathlib
import shutil
import subprocess
import sys

output = pathlib.Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=False)
excluded = set()
for package in ('libc6', 'libc-bin', 'libegl-mesa0', 'libgl1-mesa-dri', 'libglx-mesa0',
                'mesa-vulkan-drivers', 'libgbm1', 'libdrm2', 'libdrm-amdgpu1',
                'libdrm-intel1', 'libdrm-radeon1', 'libgl1', 'libglx0', 'libegl1',
                'libgles2', 'libglvnd0', 'libgcc-s1', 'libstdc++6', 'libreadline8t64'):
    result = subprocess.run(['dpkg-query', '-L', package], text=True, capture_output=True)
    excluded.update(result.stdout.splitlines())

def copy(source):
    source = pathlib.Path(source)
    if str(source) in excluded or not (source.is_file() or source.is_symlink()):
        return
    dest = output / str(source).lstrip('/')
    dest.parent.mkdir(parents=True, exist_ok=True)
    if source.is_symlink():
        # alternativesを経由する共有ライブラリも同梱先だけで解決させる。
        target = str(source.resolve()) if source.resolve().is_file() else os.readlink(source)
        if target.startswith('/'):
            target = os.path.relpath(output / target.lstrip('/'), dest.parent)
        dest.symlink_to(target)
    else:
        shutil.copy2(source, dest)

for directory in ('/usr/lib', '/usr/share/glib-2.0/schemas', '/usr/share/mime', '/usr/share/pipewire',
                  '/usr/share/fonts', '/usr/share/fontconfig', '/usr/share/zoneinfo',
                  '/usr/share/ca-certificates', '/usr/share/doc', '/etc/fonts', '/etc/ssl'):
    for root, dirs, files in os.walk(directory):
        for name in files:
            copy(pathlib.Path(root) / name)
for name in ('python3', 'python3.12', 'pactl', 'paplay', 'parec', 'bwrap', 'xdg-open',
             'gdk-pixbuf-query-loaders', 'gio'):
    path = shutil.which(name)
    if path:
        copy(path)
subprocess.run(['dpkg-query', '-W', '-f=${Package}\t${Version}\n'],
               stdout=(output / 'ubuntu-packages.txt').open('w'), check=True)
