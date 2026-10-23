# Sekai 3D Assets

Incrementally converts Project SEKAI character assets with [Haruki-3D](https://github.com/Team-Haruki/Haruki-3D) for GreatSekai. Regional catalogs retain their own availability and names; byte-identical objects share one SHA-256 address across regions.

## Distribution

`regions/{jp,en,tw,kr,cn}.json` is the client entry point. Each manifest lists render-ready roles, individual wardrobe parts and a mapping from Haruki runtime paths to immutable Apple Archive objects. A `.aar` contains exactly one regular file named `payload`; its uncompressed SHA-256 and length are recorded in the manifest. Model deltas, shared cores and textures are separate objects. Clients download only requested paths, validate hashes and cache by content hash.

Objects are sharded into Releases by the first three SHA-256 digits (`objects-abc`), with immutable `{sha256}.aar` assets. Catalogs are committed only after uploads succeed. Objects used by old catalogs are retained. No game binaries are committed to Git.

## Updates

The hourly workflow processes a bounded batch and resumes from committed `state/`. Source fingerprints include master records, transitive Bundle hashes and the pinned exporter revision. Changed sources are regenerated; known failing inputs are quarantined until their fingerprint changes. Inspect `state/*/failed` and workflow diagnostics before retrying those inputs. Exports sharing Haruki’s package path and identical dependency hashes reuse a completed package, while each regional/character catalog retains its own labels. Initial population takes multiple runs; only roles with successfully exported default parts and role runtimes are exposed.

Run on macOS with .NET 9, Node 24 and Python 3.12:

```
python -m pip install requests pycryptodome msgpack
bash scripts/setup.sh
python scripts/update.py --regions jp --limit 8
```

Publishing requires an authenticated `gh` and the explicit `--publish` flag. Keep local runs small. Production initialization belongs in Actions. All five regional sources are attempted independently; errors in one region do not discard successful regions. Game CDN protocols can change and may require provider maintenance.

## Viewer

`viewer/` builds the native App's embedded Haruki viewer. `HARUKI_ROOT` points to the pinned checkout; `VIEWER_OUT` points to `GreatSekai/GreatSekai/Resources/Model3DWeb.bundle`. Build with the pinned engine's Vite binary. Native SekaiKit handles archive decoding and HTTP caching; WebKit requests runtime paths through the App's `sekai3d` URL scheme.

Code: MIT (see LICENSE). Third-party tool licenses remain applicable. Game assets are not covered by this repository's code license. This project is unofficial and is not endorsed by the game publishers or Haruki.
