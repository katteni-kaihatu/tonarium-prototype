#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
version="${1:-0.0.8}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Version must be X.Y.Z' >&2; exit 1; }
build="$root/native/build/packaging"
mkdir -p "$build" "$root/native/artifacts"
[[ -x native/build/unity-linux/Tonarium3D.x86_64 ]] || { echo 'Build Unity for Linux first' >&2; exit 1; }
if [[ ! -d "$build/runtime" ]]; then
    podman build -t localhost/tonarium-portable:ubuntu24 packaging/portable
    podman run --rm -v "$build:/output" localhost/tonarium-portable:ubuntu24
fi
dotnet publish native/Tonarium.Desktop -c Release -r linux-x64 --self-contained true \
    -p:Version="$version" -p:DebugType=None -p:DebugSymbols=false -o "$build/desktop"
appdir="$build/Tonarium-$version.AppDir"
[[ ! -e "$appdir" ]] || { echo "Already exists: $appdir" >&2; exit 1; }
python3 packaging/portable/prepare.py "$appdir" appimage
tool="${APPIMAGETOOL:-appimagetool}"
runtime_args=()
if [[ -n "${APPIMAGE_RUNTIME:-}" ]]; then runtime_args=(--runtime-file "$APPIMAGE_RUNTIME"); fi
APPIMAGE_EXTRACT_AND_RUN=1 ARCH=x86_64 "$tool" "${runtime_args[@]}" "$appdir" "$root/native/artifacts/Tonarium-$version-x86_64.AppImage"
"$root/native/build-flatpak.sh" "$version"
(cd native/artifacts && sha256sum "Tonarium-$version-x86_64.AppImage" "Tonarium-$version-x86_64.flatpak" > "Tonarium-$version-portable.sha256")
