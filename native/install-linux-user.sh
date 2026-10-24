#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
version="${1:-0.0.8}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Version must be X.Y.Z' >&2; exit 1; }
source_dir="$root/native/artifacts/Tonarium-$version-linux-x64"
base="$HOME/.local/opt/tonarium"
destination="$base/$version"
[[ -x "$source_dir/Tonarium" && -x "$source_dir/Unity/Tonarium3D.x86_64" ]] || { echo 'Build the Linux release first' >&2; exit 1; }
[[ ! -e "$destination" ]] || { echo "Already installed: $destination" >&2; exit 1; }
mkdir -p "$base" "$HOME/.local/bin" "$HOME/.local/share/applications" "$HOME/.local/share/icons/hicolor/64x64/apps"
cp -a "$source_dir" "$destination"
ln -sfn "$destination" "$base/current"
ln -sfn "$base/current/Tonarium" "$HOME/.local/bin/tonarium"
python3 - "$destination/tonarium.desktop" "$HOME/.local/share/applications/tonarium.desktop" "$base/current/Tonarium" <<'PY'
import pathlib, sys
text = pathlib.Path(sys.argv[1]).read_text()
executable = sys.argv[3].replace('\\', '\\\\').replace('"', '\\"').replace('`', '\\`').replace('$', '\\$')
pathlib.Path(sys.argv[2]).write_text(text.replace('Exec=tonarium', 'Exec="' + executable + '"'))
PY
install -m644 "$destination/tonarium.png" "$HOME/.local/share/icons/hicolor/64x64/apps/tonarium.png"
if command -v update-desktop-database >/dev/null; then update-desktop-database "$HOME/.local/share/applications"; fi
if command -v gtk-update-icon-cache >/dev/null; then gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true; fi
printf 'Installed: %s\nLaunch: %s\n' "$destination" "$HOME/.local/bin/tonarium"
