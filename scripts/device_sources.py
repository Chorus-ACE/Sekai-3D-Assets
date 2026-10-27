"""Metadata-only regional source discovery; no model download or conversion."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import requests
import msgpack

ROOT = pathlib.Path(__file__).resolve().parents[1]
SSSEKAI = pathlib.Path(os.environ.get('SSSEKAI_ROOT', ROOT / '.vendor/sssekai')).resolve()
REGIONS = {'jp':'sekai-master-db-diff','en':'sekai-master-db-en-diff','tw':'sekai-master-db-tc-diff','kr':'sekai-master-db-kr-diff','cn':'sekai-master-db-cn-diff'}
TABLES = ['character3ds','gameCharacters','gameCharacterUnits','costume3ds','costume3dModels','cards','cardCostume3ds','costume3dModelNotAvailablePatterns','costume3dModelDefaultHairs']
REVISION = 'raw-source-catalog-v2'
MAX_BUNDLE = 32 * 1024 * 1024
COOKIE = re.compile(r'(?:^|[;,]\s*)(CloudFront-(?:Policy|Signature|Key-Pair-Id))=([^;,\s]+)')

PART_METADATA_FIELDS=('costume3dGroupId','colorId','outfitId','accessoryId','costumeAssetbundleName','modelAssetbundleName','colorAssetbundleName','headCostume3dAssetbundleType','part','attachNode','packagePath','sourcePackagePath','sourceKey','baseSourceKey','status','warnings')

def read(p,default): return json.loads(p.read_text()) if p.exists() else default

def write(p,x):
 p.parent.mkdir(parents=True,exist_ok=True);temporary=p.with_name(p.name+'.tmp')
 temporary.write_text(json.dumps(x,ensure_ascii=False,separators=(',',':'),sort_keys=True)+'\n');temporary.replace(p)

def safe_path(p):
 if not p or p.startswith('/') or '\\' in p or any(x in ('','..','.') for x in p.split('/')):raise ValueError('Invalid resource path')
 return p

def get(session,url,limit=160*1024*1024,method='GET'):
 r=session.request(method,url,timeout=(15,90),stream=True);r.raise_for_status();data=bytearray()
 for chunk in r.iter_content(65536):
  data.extend(chunk)
  if len(data)>limit:raise ValueError('Response exceeds download budget')
 return bytes(data),r.headers

class Source:

    def __init__(self, region, version):
        self.region = region
        self.version = version
        self.session = requests.Session()
        spec = importlib.util.spec_from_file_location('crypto', SSSEKAI / 'sssekai/crypto/APIManager.py')
        self.crypto = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.crypto)

    def unpack(self, data):
        plain = self.crypto.decrypt(data, self.crypto.SEKAI_APIMANAGER_KEYSETS[self.region])
        try:
            return msgpack.unpackb(plain, raw=False)
        except (ValueError, msgpack.ExtraData):
            return json.loads(plain)

    def index(self):
        v = self.version
        region = self.region
        if region in ('jp', 'en'):
            self.session.headers.update({'Content-Type': 'application/octet-stream', 'Accept': 'application/octet-stream', 'User-Agent': 'UnityPlayer/2022.3.21f1', 'X-Platform': 'Android', 'X-Unity-Version': '2022.3.21f1', 'X-App-Version': v['appVersion'], 'X-App-Hash': v['appHash']})
            if region == 'jp':
                _, headers = get(self.session, 'https://issue.sekai.colorfulpalette.org/api/signature', method='POST')
                self.session.headers['Cookie'] = headers['Set-Cookie']
                known = read(ROOT / 'providers.json', {}).get('jp', {})
                if known.get('appVersion') == v['appVersion']:
                    host = known['assetHost']
                else:
                    host = self.unpack(get(self.session, f"https://game-version.sekai.colorfulpalette.org/{v['appVersion']}/{v['appHash']}")[0])['assetbundleHostHash']
                origin = f'https://production-{host}-assetbundle'
                suffix = '.sekai.colorfulpalette.org'
                index_suffix = f"{v['assetVersion']}/{v['assetHash']}/os/android"
            else:
                game = self.unpack(get(self.session, f"https://game-version.sekai-en.com/{v['appVersion']}/{v['appHash']}")[0])
                origin = f"https://n-{game['profile']}-{game['assetbundleHostHash']}-assetbundle"
                suffix = '.sekai-en.com'
                index_suffix = f"{v['assetVersion']}/{v['assetHash']}/os/android"
            url = f'{origin}-info{suffix}/api/version/{index_suffix}'
            self.base = f"{origin}{suffix}/{v['assetVersion']}/{v['assetHash']}/android/"
        else:
            cdn, path = {'tw': ('https://lf16-mkovscdn-sg.bytedgame.com/obj/sf-game-alisg/gdl_app_5245', 'online'), 'kr': ('https://lf19-mkkr.bytedgame.com/obj/sf-game-alisg/gdl_app_292248', 'kr_online'), 'cn': ('https://lf3-mkcncdn-tos.dailygn.com/obj/sf-game-lf/gdl_app_5236', 'cn_online')}[region]
            area = 'Mainland' if region == 'cn' else 'Oversea'
            base_version = v['appVersion']
            try:
                number = int(get(self.session, f"{cdn.replace('sf-game', 'rt-game')}/{area}/{base_version}/Release/{path}/ios/version", limit=1024)[0])
            except requests.HTTPError as error:
                if error.response.status_code != 404:
                    raise
                base_version = '.'.join(v['appVersion'].split('.')[:2]) + '.0'
                number = int(get(self.session, f"{cdn.replace('sf-game', 'rt-game')}/{area}/{base_version}/Release/{path}/ios/version", limit=1024)[0])
            self.base = f'{cdn}/AssetBundle/{base_version}/Release/{path}/'
            url = f'{self.base}ios{number}/AssetBundleInfoNew.json'
        try:
            data = get(self.session, url)[0]
        except requests.HTTPError as error:
            if region != 'en' or error.response.status_code not in (403, 404):
                raise
            data = get(self.session, url.replace('/' + v['assetHash'] + '/os/', '/os/'))[0]
        return self.unpack(data)['bundles']

def part_key(e):return f"{e['characterId']}:{e['unit']}:{e['partType']}:{e['costume3dId']}"

def public_part(e):
 # Keep region-specific identity/attachment metadata so clients never infer grouping
 # from translated names or assume a numeric costume ID is globally unique.
 return {'id':part_key(e),'costumeID':e['costume3dId'],'type':e['partType'],'name':e.get('name'),'colorName':e.get('colorName'),**{k:e[k] for k in PART_METADATA_FIELDS if k in e}}

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def dependencies(index, keys):
    visiting, visited, result = set(), set(), set()
    def visit(key):
        safe_path(key)
        if key in visiting:
            raise ValueError('Cyclic Bundle dependencies')
        if key in visited:
            return
        if key not in index:
            raise ValueError('Missing Bundle dependency')
        visiting.add(key)
        for child in index[key].get('dependencies', []):
            visit(child)
        visiting.remove(key)
        visited.add(key)
        result.add(key)
    for key in keys:
        visit(key)
    return sorted(result)

def source_path(value, asset_root):
    if not value:
        return None
    path = pathlib.Path(value).resolve().relative_to(asset_root.resolve()).as_posix()
    if not path.endswith('.bundle'):
        raise ValueError('Unexpected registry path')
    return safe_path(path[:-7])

def descriptor(entry):
    size = int(entry['fileSize'])
    if not 0 < size <= MAX_BUNDLE:
        raise ValueError('Bundle exceeds device budget')
    value = entry.get('hash')
    crc = entry.get('crc')
    if not value and not (isinstance(crc, int) and 0 <= crc <= 0xffffffff):
        raise ValueError('Missing upstream Bundle identity')
    # Build hash/CRC identify source revisions, not SHA-256 of the download.
    return {'upstreamHash': value, 'upstreamCRC': crc,
            'downloadPath': entry.get('downloadPath'), 'bytes': size}

def make_registry(master, index, work, dotnet):
    import shutil
    assets = work / 'markers'
    shutil.rmtree(assets, ignore_errors=True)
    assets.mkdir(parents=True, exist_ok=True)
    # Empty markers only. The Haruki resolver never reads a model in this operation.
    for key in index:
        if key.startswith('live_pv/model/'):
            path = assets / (safe_path(key) + '.bundle')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch(exist_ok=True)
    target = work / 'registry.json'
    subprocess.run([dotnet, str(ROOT / 'tools/DeviceSourceRegistry/bin/Release/net9.0/DeviceSourceRegistry.dll'),
                    str(master), str(assets), str(target)], check=True)
    return read(target, {})['entries'], assets

def current_inputs(region, work):
    session = requests.Session()
    if os.environ.get('GH_TOKEN'):
        session.headers['Authorization'] = 'Bearer ' + os.environ['GH_TOKEN']
    info = json.loads(get(session, f'https://api.github.com/repos/Sekai-World/{REGIONS[region]}/commits/main', limit=4*1024*1024)[0])
    return info['sha']

def load_inputs(region, commit, work):
    master = work / 'master'
    master.mkdir(parents=True, exist_ok=True)
    session = requests.Session()  # GitHub credentials must never reach raw/CDN hosts.
    base = f'https://raw.githubusercontent.com/Sekai-World/{REGIONS[region]}/{commit}/'
    table_hashes = {}
    for table in TABLES + ['versions', 'costume3dGroups', 'costume3dColors']:
        path = master / (table + '.json')
        try:
            data = get(session, base + table + '.json')[0]
        except requests.HTTPError as error:
            if error.response.status_code != 404 or table not in ('costume3dGroups', 'costume3dColors'):
                raise
            path.unlink(missing_ok=True)
            continue
        path.write_bytes(data)
        table_hashes[table] = digest(data)
    version = read(master / 'versions.json', {})
    source = Source(region, version)
    index = source.index()
    if region == 'jp':
        # requests also loses folded cookie pairs; mirror the tested Swift handling.
        _, headers = get(source.session, 'https://issue.sekai.colorfulpalette.org/api/signature', method='POST', limit=1024*1024)
        pairs = dict(COOKIE.findall(headers.get('Set-Cookie', '')))
        names = ['CloudFront-Policy', 'CloudFront-Signature', 'CloudFront-Key-Pair-Id']
        if not all(name in pairs for name in names):
            raise ValueError('Incomplete source signature')
        source.session.cookies.clear()
        source.session.headers['Cookie'] = '; '.join(name + '=' + pairs[name] for name in names)
    return master, index, source, digest(encoded([REVISION, table_hashes, source.base]))
