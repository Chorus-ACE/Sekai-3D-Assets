#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .vendor
fetch() {
 local repo="$1" commit="$2" target="$3"
 if [[ ! -f "$target/.source-commit" ]] || [[ "$(cat "$target/.source-commit")" != "$commit" ]]; then
  mkdir -p "$target"
  curl --fail --location --retry 3 "https://api.github.com/repos/$repo/tarball/$commit" -o .vendor/source.tar.gz
  tar -xzf .vendor/source.tar.gz -C "$target" --strip-components=1
  printf '%s' "$commit" > "$target/.source-commit"
 fi
}
fetch Team-Haruki/Haruki-3D 1e0abc65885a5adef8faa64925260d7f836c20e3 .vendor/Haruki-3D
fetch MetaSekaiLab/sssekai 523a3659ea6641a6aa9c5f940341ad458391344c .vendor/sssekai
fetch seiunx-dev/AssetStudio 70e6ec3e00665ff3c36a8af08f8e2824c2eba873 .vendor/AssetStudio
studio="$PWD/.vendor/AssetStudio"
rid=osx-arm64
[[ "$(uname -m)" == x86_64 ]] && rid=osx-x64
dotnet build "$studio/AssetStudioCLI/AssetStudioCLI.csproj" -c Release -f net8.0 -r "$rid" --self-contained false -p:TargetFrameworks=net8.0 -p:SolutionDir="$studio/"
cp -R "$studio/AssetStudioCLI/bin/Release/net8.0/$rid/." "$studio/AssetStudioCLI/bin/Release/net8.0/"
dotnet build .vendor/Haruki-3D/exporter/Haruki-3D-Exporter.csproj -c Release -p:AssetStudioRoot="$studio"
cp "$studio/AssetStudioCore/Libraries/$rid/"*.dylib .vendor/Haruki-3D/exporter/bin/Release/net9.0/
npm --prefix .vendor/Haruki-3D/engine ci --ignore-scripts --no-audit --no-fund
