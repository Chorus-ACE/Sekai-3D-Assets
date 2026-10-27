"""Complete regional on-device wardrobes. Publishes metadata only; never reads Bundles."""
import argparse
import json
import pathlib
import sys
import zlib
from device_sources import ROOT, REGIONS, public_part, dependencies, descriptor, digest, encoded, load_inputs, current_inputs, make_registry, source_path, read, write

REVISION = 'device-wardrobes-v2-compact'

def object_reference(output, value):
    decoded = encoded(value)
    # Apple Compression's COMPRESSION_ZLIB uses raw DEFLATE (no zlib header).
    data = zlib.compress(decoded, level=9, wbits=-15)
    sha = digest(data)
    target = output / 'objects' / (sha + '.json.deflate')
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists(): target.write_bytes(data)
    return {'path': 'objects/' + sha + '.json.deflate', 'sha256': sha, 'bytes': len(data), 'decodedBytes':len(decoded)}

def build(output, region, base, index, entries, assets, roles, compatibility, names, revision):
    summaries = []
    for role in roles:
        role = dict(role)
        role_id = f"{role['characterId']}:{role.get('unit') or ''}"
        role['id'] = role_id
        role['name'] = names.get(role['characterId'], str(role['characterId']))
        role['unit'] = role.get('unit') or ''
        parts, bundles = [], {}
        for entry in entries:
            if entry['characterId'] != role['characterId'] or (entry.get('unit') or '') != role['unit']: continue
            part = public_part(entry)
            part.update(primaryBundle=None, variationBundle=None, bundleKeys=[])
            if entry.get('status') == 'empty':
                part['status'] = 'empty'
            else:
                try:
                    primary = source_path(entry.get('bundlePath'), assets)
                    variation = source_path(entry.get('colorVariationBundlePath'), assets)
                    if primary is None or (entry.get('colorAssetbundleName') and variation is None): raise ValueError('Unresolved source')
                    roots = [primary] + ([variation] if variation else [])
                    motion = f"character/motion/costume_setting/{role['characterId']:02d}_00"
                    if entry['partType'] == 'body' and motion in index: roots.append(motion)
                    keys = dependencies(index, roots)
                    specs = {key: descriptor(index[key]) for key in keys}
                    if len(keys) > 32 or sum(x['bytes'] for x in specs.values()) > 64*1024*1024: raise ValueError('Device budget')
                    part.update(primaryBundle=primary, variationBundle=variation, bundleKeys=keys, status='available')
                    for key, spec in specs.items():
                        bundles[key] = {'bytes': spec['bytes'], 'sourceHash': digest(encoded([base,key,spec])),
                                        'downloadPath': spec.get('downloadPath')}
                except (KeyError, ValueError):
                    part['status'] = 'unavailable'
            parts.append(part)
        heads = {p['costumeID'] for p in parts if p['type']=='head_optional'}
        hairs = {p['costumeID'] for p in parts if p['type']=='hair'}
        rules = [rule for rule in compatibility.get('rules', []) if (rule.get('unit') or '') == role['unit'] and
                 rule['headCostume3dId'] in heads and rule['hairCostume3dId'] in hairs]
        # A part appears once. Clients derive their typed wardrobe from this list.
        role.pop('parts',None)
        scoped = {'schemaVersion':2, 'region':region, 'role':role,
                  'assetBaseURL':base, 'platform':'android' if region in ('jp','en') else 'ios',
                  'parts':parts, 'bundles':bundles, 'compatibility':rules}
        # Unrelated master commits must not rewrite every immutable role object.
        scoped['revision'] = digest(encoded(scoped))
        reference = object_reference(output, scoped)
        summaries.append({k:v for k,v in {**role, 'catalog':reference, 'partCount':len(parts)}.items() if k != 'parts'})
    catalog = {'schemaVersion':2, 'region':region, 'importerRevision':'native-character-v2',
               'sourceRevision':revision, 'roles':summaries}
    catalog['revision'] = digest(encoded(catalog))
    write(output/'regions'/(region+'.json'), catalog)
    return {'region':region,'roles':len(summaries),'parts':sum(role['partCount'] for role in summaries),'binaryDownloads':0}

def run(region,args):
    work = ROOT/'.work/device-wardrobes'/region
    work.mkdir(parents=True,exist_ok=True)
    if args.fixture:
        if region != 'jp': raise ValueError('Fixture region')
        master = args.fixture/'input/master'
        index = read(args.fixture/'input/jp-bundle-index.json',{})['bundles']
        version = read(master/'current_version.json',{})
        base = f'https://production-cf2d2388-assetbundle.sekai.colorfulpalette.org/{version["assetVersion"]}/{version["assetHash"]}/android/'
        revision = digest(encoded([REVISION,version]))
    else:
        commit = current_inputs(region,work)
        master,index,source,revision = load_inputs(region,commit,work)
        base = source.base
        revision = digest(encoded([REVISION,revision]))
    # Haruki's role resolver reads this canonical version filename.
    if not args.fixture: write(master/'current_version.json',read(master/'versions.json',{}))
    entries,assets = make_registry(master,index,work,args.dotnet)
    registry = read(work/'registry.json',{})
    names = {row['id']: (row.get('firstName','')+row.get('givenName','')) or str(row['id']) for row in read(master/'gameCharacters.json',[])}
    return build(args.output,region,base,index,entries,assets,registry['roles'],registry['compatibility'],names,revision)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--regions',nargs='+',choices=list(REGIONS),default=list(REGIONS))
    parser.add_argument('--fixture',type=pathlib.Path)
    parser.add_argument('--output',type=pathlib.Path,default=ROOT/'device/v2')
    parser.add_argument('--dotnet',default='dotnet')
    args=parser.parse_args();failed=False
    for region in args.regions:
        print(f'[{region}] Resolving metadata and dependencies',file=sys.stderr,flush=True)
        try: print(json.dumps(run(region,args),ensure_ascii=False),flush=True)
        except Exception as error:
            print(json.dumps({'region':region,'error':type(error).__name__,'message':str(error)[:600]}),flush=True);failed=True
    if failed:raise SystemExit(1)
if __name__=='__main__':main()
