#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
version="${1:-0.0.8}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 1
build="$root/native/build/packaging"
tool="${FLATPAK:-flatpak}"
app_id=work.rheni.Tonarium
branch=stable
runtime=25.08
directory="$build/flatpak-$version"
[[ ! -e "$directory" ]] || { echo "Already exists: $directory" >&2; exit 1; }
"$tool" build-init "$directory" "$app_id" org.freedesktop.Platform org.freedesktop.Platform "$runtime"
python3 packaging/portable/prepare.py "$directory/files" flatpak
"$tool" build-finish "$directory" --command=tonarium \
    --share=network --share=ipc --socket=x11 --socket=pulseaudio --device=dri \
    --filesystem=xdg-download:ro --filesystem=xdg-pictures:ro --filesystem=xdg-videos:ro
"$tool" build-export "$build/flatpak-repo" "$directory" "$branch"
"$tool" build-bundle --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo \
    "$build/flatpak-repo" "$root/native/artifacts/Tonarium-$version-x86_64.flatpak" "$app_id" "$branch"
