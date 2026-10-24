#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
version="${1:-0.0.8}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Version must be X.Y.Z' >&2; exit 1; }
unity="$root/native/build/unity-linux"
[[ -x "$unity/Tonarium3D.x86_64" ]] || { echo 'Run native/build-unity-linux.sh first' >&2; exit 1; }
output="$root/native/artifacts/Tonarium-$version-linux-x64"
[[ ! -e "$output" ]] || { echo "Output already exists: $output (use a new version or move it aside)" >&2; exit 1; }
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/tonarium-publish.XXXXXXXX")"
trap 'rm -rf -- "$build_dir"' EXIT
dotnet publish "$root/native/Tonarium.Desktop" -c Release -r linux-x64 --self-contained true --artifacts-path "$build_dir" -p:Version="$version" -p:DebugType=None -p:DebugSymbols=false -o "$output"
mkdir -p "$output/Unity"
cp -a "$unity/Tonarium3D.x86_64" "$unity/Tonarium3D_Data" "$unity/"*.so* "$output/Unity/"
install -Dm644 "$root/client/public/brand/favicon.png" "$output/tonarium.png"
install -Dm644 "$root/packaging/linux/tonarium.desktop" "$output/tonarium.desktop"
install -Dm644 "$root/docs/native-linux.md" "$output/README-linux.md"
archive="$root/native/artifacts/Tonarium-$version-linux-x64.tar.gz"
tar -C "$root/native/artifacts" -czf "$archive" "Tonarium-$version-linux-x64"
(cd "$root/native/artifacts" && sha256sum "Tonarium-$version-linux-x64.tar.gz" | tee "Tonarium-$version-linux-x64.tar.gz.sha256")
