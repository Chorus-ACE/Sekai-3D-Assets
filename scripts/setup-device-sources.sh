#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .vendor
fetch() {
 local repo="$1" commit="$2" target="$3"
 if [[ ! -f "$target/.source-commit" ]] || [[ "$(cat "$target/.source-commit")" != "$commit" ]]; then
  mkdir -p "$target"
  curl --fail --location --retry 3 "https://api.github.com/repos/$repo/tarball/$commit" -o .vendor/device-source.tar.gz
  tar -xzf .vendor/device-source.tar.gz -C "$target" --strip-components=1
  printf '%s' "$commit" > "$target/.source-commit"
 fi
}
fetch Team-Haruki/Haruki-3D 1e0abc65885a5adef8faa64925260d7f836c20e3 .vendor/Haruki-3D
fetch MetaSekaiLab/sssekai 523a3659ea6641a6aa9c5f940341ad458391344c .vendor/sssekai
dotnet build tools/DeviceSourceRegistry -c Release -p:HarukiRoot="$PWD/.vendor/Haruki-3D"
