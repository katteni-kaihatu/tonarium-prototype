#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
args=(build "$root/native/Tonarium.Unity" --target StandaloneLinux64 --execute-method Tonarium.UnityClient.Editor.WindowsBuild.BuildLinux --no-tail)
if [[ -n "${TONARIUM_UNITY_EDITOR:-}" ]]; then args+=(--editor-path "$TONARIUM_UNITY_EDITOR"); fi
unity "${args[@]}"
