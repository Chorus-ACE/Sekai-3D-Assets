#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .vendor
pin=1e0abc65885a5adef8faa64925260d7f836c20e3
target=.vendor/Haruki-3D
if [[ ! -f "$target/.source-commit" ]] || [[ "$(cat "$target/.source-commit")" != "$pin" ]]; then
  mkdir -p "$target"
  curl --fail --location --retry 3 "https://api.github.com/repos/Team-Haruki/Haruki-3D/tarball/$pin" -o .vendor/viewer-source.tar.gz
  tar -xzf .vendor/viewer-source.tar.gz -C "$target" --strip-components=1
  printf '%s' "$pin" > "$target/.source-commit"
fi
for patch_file in patches/*.patch; do
  if git -C "$target" apply --check "$PWD/$patch_file" 2>/dev/null; then
    git -C "$target" apply "$PWD/$patch_file"
  else
    git -C "$target" apply --reverse --check "$PWD/$patch_file"
  fi
done
npm --prefix "$target/engine" ci --ignore-scripts --no-audit --no-fund
