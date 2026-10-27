# Sekai 3D Assets

Regional source metadata and the embedded renderer for GreatSekai/SekaiKit.
The production viewer downloads selected original Unity Bundles directly from
their official regional source, converts them on the Apple device, and passes
local geometry/textures/controllers to Haruki's runtime.

The hourly `Update local 3D wardrobes` workflow updates independent JP/EN/TW/KR/CN
indexes. It resolves dependencies and publishes compressed metadata only. There
is no hourly model export or binary backfill. See [DEVICE-SOURCES.md](DEVICE-SOURCES.md)
for the SDK flow, limits, integrity contract and bounded test commands.

## Embedded viewer

`viewer/native-main.ts` uses the original Haruki composer/material/physics runtime
with a native scene adapter. Drag to rotate/pan; pinch or scroll to zoom. Native
character-inspector controls provide zoom and reset. Camera bounds are 50–300%.
Wardrobe switches preserve the view; character changes reset it. Light/dark themes
and full-screen backgrounds retain default framing within the safe area.

Set up the pinned Haruki engine and apply the rendering patches, then build:

```sh
bash scripts/setup-viewer.sh
HARUKI_ROOT="$PWD/.vendor/Haruki-3D" \
VIEWER_OUT=/absolute/path/to/GreatSekai/GreatSekai/Resources/Model3DWeb.bundle \
  .vendor/Haruki-3D/engine/node_modules/.bin/vite build --config viewer/vite.config.mjs
node --test viewer/tests/*.test.mjs
```

The build preserves `viewer/THIRD_PARTY_NOTICES.txt`. Local Unity conversion is
implemented in SekaiKit's `Packages/SekaiModelImporter`; no .NET or Python is
required in GreatSekai. Source tools remain metadata-only on GitHub Actions.

## Published resources

The supported client endpoint is `device/v2/regions/{jp,en,tw,kr,cn}.json`.
Only the compressed objects referenced by the five current regional roots were
carried into this clean repository. Original game Bundles and converted model
archives are not stored here. Legacy V1 catalogs, merged indexes, export checkpoints
and model Releases have been retired. Current GreatSekai/SekaiKit clients keep the
same repository URL and V2 paths.

Metadata automation has no model download/export code. Its dependencies are
Python, .NET 9 and the pinned Haruki master-data resolver. `tests/test_catalogs.py`
validates the integrity and completeness of all five published regional roots;
source-contract and viewer tests run before each update.

Game data is not covered by the Haruki software license. Software attribution is
retained in `THIRD-PARTY-HARUKI-LICENSE`, `viewer/THIRD_PARTY_NOTICES.txt` and the
App's Acknowledgements.
