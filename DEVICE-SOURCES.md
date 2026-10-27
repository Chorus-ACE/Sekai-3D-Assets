# On-device 3D source service

GreatSekai's production viewer uses `Model3DLocalClient`. GitHub hosts regional
metadata; selected original Unity Bundles are downloaded directly from the
corresponding official regional source and converted on the device. The hourly
`Update local 3D wardrobes` workflow performs no model conversion, raw Bundle
backfill or mesh/PNG upload. Legacy export code and model Releases have been retired from this repository.

## Publication

- `device/v2/regions/{jp,en,tw,kr,cn}.json`: independent small regional directories,
  role defaults and immutable wardrobe references.
- `device/v2/objects/<sha256>.json.deflate`: one role's complete part metadata,
  dependency descriptors, attachment information, skin palettes and relevant
  head/hair compatibility. Raw DEFLATE is decoded with Apple Compression.
- Each reference records compressed SHA-256, encoded bytes and bounded decoded
  bytes. A part occurs once in its scope; unrelated roles' compatibility rules are
  excluded. Only compact V2 source metadata is published here.

The metadata-only .NET 9 resolver reuses pinned Haruki registry/role semantics;
it does not load AssetStudio or a native exporter. Python obtains regional master
tables and official Bundle indexes through the pinned sssekai source adapter.
Only completed regional roots advance; failed regions keep their preceding root
and fail the job after successful regions are published. Immutable objects are
written before their root references and retained for clients holding older roots.
There is no fixed regional release offset, merged index or JP resource fallback.

## Integrity and budgets

V2 `sourceHash` is the upstream Bundle descriptor/version identity, **not a file
checksum**. Indexed `fileSize` can be approximate. The device validates the trusted
regional HTTPS origin/path, bounds wire bytes, normalizes the transport, and
checks Unity archive structure during conversion. It records the measured size
and actual SHA-256 locally, then validates that hash on reuse. Older V1 plans with
server-measured binary SHA-256 still enforce their exact size and hash.

JP signature cookies are scoped in memory to that source and never published.
TW/KR/CN preserve their own iOS download-path variants and CRC/build identities.
Common downloaded Bundles reuse the same local content-addressed file. Raw and
derived data share a 512 MiB model-cache budget. Derived PNGs belong to their part
cache; identical dependencies are not downloaded again. There is no silent use of
legacy preconverted model Releases.

Per-part native limits: 32 Bundles, 64 MiB compressed input, 128 MiB expanded input,
500,000 vertices, 16,777,216 decoded texture pixels and 4096px maximum texture edge.
Each metadata object is bounded to 32 MiB decoded. Unsupported formats fail
explicitly. `available` means a dependency plan exists; it does not certify that
every costume has passed rendering validation.

## Renderer

`viewer/native-main.ts` adapts local Unity scenes to Haruki's original composer
and real material engine. The native importer retains rig/bind poses, weights,
morphs, raw material properties, color variations, controllers and animation.
The renderer assembles complete heads/accessories, applies role skin palettes,
plays local body/face motion and simulates hair/clothing springs. The active
prefab roots and mirrored coordinates are resolved once. PNG row orientation
matches Haruki's unflipped export and `texture.flipY=false`.

Interactions, native zoom/reset feedback, light/dark backgrounds and safe-area
framing remain supported. Apply `patches/*.patch` to the pinned Haruki checkout
before building. `HARUKI_ROOT` points to that checkout; `VIEWER_OUT` points to the
App's `GreatSekai/Resources/Model3DWeb.bundle`. The old standalone preview has been retired; this repository contains only the
production viewer entry.

## Validation and bounded experiments

```sh
bash scripts/setup-device-sources.sh
python -m unittest discover -s tests -p 'test_*.py' -v
# Metadata only, all five regions; no Bundle downloads:
python scripts/device_wardrobes.py --regions jp en tw kr cn
node --test viewer/tests/*.test.mjs
```

The local fixture generator reuses the existing experiment's masters and index:

```sh
python scripts/device_wardrobes.py --regions jp --fixture /path/to/experiment \
  --output .work/native-catalogs
```

SDK tests use `SEKAI_LOCAL_VIEWER_BASE` for that V2 base URL. Explicit
`SEKAI_LOCAL_VIEWER_DOWNLOAD=1` converts one default character, with
`SEKAI_LOCAL_VIEWER_REGION` choosing its region. `SEKAI_LOCAL_VIEWER_HEAD_TEST=1`
adds one complete head; `SEKAI_LOCAL_VIEWER_OUTPUT` saves generated fixtures for
the renderer test. No test loops over a wardrobe library.

Native fixture assembly/physics tests use `viewer/tests/native-fixtures.config.mjs`
and `SEKAI_NATIVE_SCENE_FIXTURES` (body/hair/accessory scene folders).
`SEKAI_NATIVE_HAIR_FIXTURES` adds a bounded directory of hairstyle scenes to the
assembly, animated-skin and finite-bounds checks. The SDK's
`SEKAI_LOCAL_VIEWER_HAIR_ID` selects one specific hairstyle for a reproduction.
`viewer/tests/native-render-probe.swift` runs an offscreen WKWebView against a
fixture folder containing `viewer/` and `full-preview/`. It checks actual GPU
materials, animation, errors and local resource requests without desktop control.
Optional `SEKAI_RENDER_SNAPSHOT=1` writes a generated render artifact; no simulator
or physical device is controlled. Physical iPhone latency and peak memory remain
to be measured. Small Mac probes and known fixtures are not full-library parity.
`SEKAI_RENDER_RECIPES` accepts a comma-separated sequence of fixture recipe names
for repeated switches in one viewer. `SEKAI_RENDER_VALIDATE_MOTION=1` drives an
offscreen animation clock and verifies the entrance, idle transition and retained
motion progress across these switches.

Haruki is pinned to `1e0abc65885a5adef8faa64925260d7f836c20e3` (MIT;
`THIRD-PARTY-HARUKI-LICENSE`). sssekai is pinned to
`523a3659ea6641a6aa9c5f940341ad458391344c`. Decoder notices ship in SekaiKit and
GreatSekai Acknowledgements.
