"""Bounded, resumable Haruki exports. Publishing is opt-in; hourly CI supplies --publish.
Only manifests/state enter Git; immutable Apple Archives enter sharded Releases.
"""
import argparse, hashlib, importlib.util, json, os, pathlib, shutil, subprocess, tempfile, time
import requests, msgpack
ROOT=pathlib.Path(__file__).resolve().parents[1]
HARUKI=pathlib.Path(os.environ.get('HARUKI_ROOT',ROOT/'.vendor/Haruki-3D')).resolve()
SSSEKAI=pathlib.Path(os.environ.get('SSSEKAI_ROOT',ROOT/'.vendor/sssekai')).resolve()
REV='1e0abc65885a5adef8faa64925260d7f836c20e3'
REPO='Chorus-ACE/Sekai-3D-Assets'
REGIONS={'jp':'sekai-master-db-diff','en':'sekai-master-db-en-diff','tw':'sekai-master-db-tc-diff','kr':'sekai-master-db-kr-diff','cn':'sekai-master-db-cn-diff'}
TABLES=['character3ds','gameCharacters','gameCharacterUnits','costume3ds','costume3dModels','cards','cardCostume3ds','costume3dModelNotAvailablePatterns','costume3dModelDefaultHairs']

def sha(b): return hashlib.sha256(b).hexdigest()
def read(p,default): return json.loads(p.read_text()) if p.exists() else default
def write(p,x): p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,separators=(',',':'),sort_keys=True)+'\n')
def safe_path(p):
 if not p or p.startswith('/') or '\\' in p or any(x in ('','..','.') for x in p.split('/')):raise ValueError('Invalid resource path')
 return p

def run(cmd,**kwargs):return subprocess.run(list(map(str,cmd)),check=True,**kwargs)
def codec(op,source,target):
 target.parent.mkdir(parents=True,exist_ok=True)
 run(['node',ROOT/'scripts/codec.mjs',op,source,target],env={**os.environ,'HARUKI_ROOT':str(HARUKI)})
def decode(p):
 with tempfile.TemporaryDirectory() as t:
  out=pathlib.Path(t)/'decoded.json';codec('decode',p,out);return read(out,{})
def encode(p,obj):
 with tempfile.TemporaryDirectory() as t:
  src=pathlib.Path(t)/'source.json';write(src,obj);codec('encode',src,p)

def get(session,url,limit=160*1024*1024,method='GET'):
 r=session.request(method,url,timeout=(15,90),stream=True);r.raise_for_status();data=bytearray()
 for chunk in r.iter_content(65536):
  data.extend(chunk)
  if len(data)>limit:raise ValueError('Response exceeds download budget')
 return bytes(data),r.headers

class Source:
 def __init__(self,region,version):
  self.region=region;self.version=version;self.session=requests.Session()
  spec=importlib.util.spec_from_file_location('crypto',SSSEKAI/'sssekai/crypto/APIManager.py');self.crypto=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.crypto)
 def unpack(self,data):
  plain=self.crypto.decrypt(data,self.crypto.SEKAI_APIMANAGER_KEYSETS[self.region])
  try:return msgpack.unpackb(plain,raw=False)
  except (ValueError,msgpack.ExtraData):return json.loads(plain)
 def index(self):
  v=self.version;region=self.region
  if region in ('jp','en'):
   self.session.headers.update({'Content-Type':'application/octet-stream','Accept':'application/octet-stream','User-Agent':'UnityPlayer/2022.3.21f1','X-Platform':'Android','X-Unity-Version':'2022.3.21f1','X-App-Version':v['appVersion'],'X-App-Hash':v['appHash']})
   if region=='jp':
    _,headers=get(self.session,'https://issue.sekai.colorfulpalette.org/api/signature',method='POST');self.session.headers['Cookie']=headers['Set-Cookie']
    known=read(ROOT/'providers.json',{}).get('jp',{})
    if known.get('appVersion')==v['appVersion']:host=known['assetHost']
    else:host=self.unpack(get(self.session,f'https://game-version.sekai.colorfulpalette.org/{v["appVersion"]}/{v["appHash"]}')[0])['assetbundleHostHash']
    origin=f'https://production-{host}-assetbundle';suffix='.sekai.colorfulpalette.org';index_suffix=f'{v["assetVersion"]}/{v["assetHash"]}/os/android'
   else:
    game=self.unpack(get(self.session,f'https://game-version.sekai-en.com/{v["appVersion"]}/{v["appHash"]}')[0])
    origin=f'https://n-{game["profile"]}-{game["assetbundleHostHash"]}-assetbundle';suffix='.sekai-en.com';index_suffix=f'{v["assetVersion"]}/{v["assetHash"]}/os/android'
   url=f'{origin}-info{suffix}/api/version/{index_suffix}'
   self.base=f'{origin}{suffix}/{v["assetVersion"]}/{v["assetHash"]}/android/'
  else:
   cdn,path={'tw':('https://lf16-mkovscdn-sg.bytedgame.com/obj/sf-game-alisg/gdl_app_5245','online'),'kr':('https://lf19-mkkr.bytedgame.com/obj/sf-game-alisg/gdl_app_292248','kr_online'),'cn':('https://lf3-mkcncdn-tos.dailygn.com/obj/sf-game-lf/gdl_app_5236','cn_online')}[region]
   area='Mainland' if region=='cn' else 'Oversea'
   base_version=v['appVersion']
   try:number=int(get(self.session,f'{cdn.replace("sf-game","rt-game")}/{area}/{base_version}/Release/{path}/ios/version',limit=1024)[0])
   except requests.HTTPError as error:
    if error.response.status_code!=404:raise
    base_version='.'.join(v['appVersion'].split('.')[:2])+'.0'
    number=int(get(self.session,f'{cdn.replace("sf-game","rt-game")}/{area}/{base_version}/Release/{path}/ios/version',limit=1024)[0])
   self.base=f'{cdn}/AssetBundle/{base_version}/Release/{path}/'
   url=f'{self.base}ios{number}/AssetBundleInfoNew.json'
  try:data=get(self.session,url)[0]
  except requests.HTTPError as error:
   if region!='en' or error.response.status_code not in (403,404):raise
   data=get(self.session,url.replace('/'+v['assetHash']+'/os/','/os/'))[0]
  return self.unpack(data)['bundles']
 def download(self,key,entry,target):
  safe_path(key)
  url=self.base+key if self.region in ('jp','en') else self.base+entry['downloadPath']+'/'+key
  data,_=get(self.session,url,limit=min(128*1024*1024,int(entry['fileSize'])+1024*1024))
  if data[:4]==b'\x10\0\0\0':
   header=bytearray(data[4:132])
   for i in range(0,128,8):
    for j in range(5):header[i+j]^=255
   data=bytes(header)+data[132:]
  if not data.startswith(b'UnityFS'):raise ValueError('Not a UnityFS bundle')
  target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)

def closure(index,keys):
 result=set()
 def visit(k):
  if k in result:return
  safe_path(k);result.add(k)
  for d in index[k].get('dependencies',[]):visit(d)
 for k in keys:visit(k)
 return sorted(result)

class Publisher:
 def __init__(self,work,publish):self.work=work;self.publish=publish;self.releases={};self.archives={}
 def object(self,data):
  digest=sha(data);tag='objects-'+digest[:3];name=digest+'.aar'
  dest=self.work/'archives'/name
  if not dest.exists():
   with tempfile.TemporaryDirectory(dir=self.work) as t:
    p=pathlib.Path(t)/'payload';p.write_bytes(data);os.utime(p,(0,0));dest.parent.mkdir(exist_ok=True)
    run(['aa','archive','-i',p,'-o',dest,'-exclude-field','uid,gid,mod,flg,mtm,btm,ctm,xat,acl'],capture_output=True)
  if self.publish:
   if tag not in self.releases:
    r=subprocess.run(['gh','release','view',tag,'--repo',REPO,'--json','assets'],capture_output=True,text=True)
    if r.returncode:
     run(['gh','release','create',tag,'--repo',REPO,'--title',tag,'--notes','Immutable content-addressed model objects.','--latest=false'])
     self.releases[tag]=set()
    else:self.releases[tag]={a['name'] for a in json.loads(r.stdout)['assets']}
   if name not in self.releases[tag]:
    run(['gh','release','upload',tag,dest,'--repo',REPO]);self.releases[tag].add(name)
  return {'sha256':digest,'bytes':len(data),'archiveBytes':dest.stat().st_size,'url':f'https://github.com/{REPO}/releases/download/{tag}/{name}'}

def package_fingerprint(entry, dependency_hashes):
 # Haruki itself groups exports by PackagePath; role labels do not change mesh output.
 return sha(json.dumps([REV,entry['packagePath'],dependency_hashes],sort_keys=True).encode())

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--regions',nargs='+',choices=REGIONS,default=list(REGIONS));parser.add_argument('--limit',type=int,default=32);parser.add_argument('--publish',action='store_true');parser.add_argument('--local-input',type=pathlib.Path);args=parser.parse_args()
 if not 1<=args.limit<=100:raise ValueError('limit must be 1..100')
 work=ROOT/'.work';work.mkdir(exist_ok=True);os.environ['WORK_ROOT']=str(work);publisher=Publisher(work,args.publish)
 summary={};remaining=args.limit
 for region in args.regions:
  try:
   summary[region]=update_region(region,args,work,publisher,max(1,args.limit//len(args.regions)))
   remaining-=summary[region]['attempted']
  except Exception as e:
   # HTTP errors may include URLs, but never credentials or response bodies.
   summary[region]={'error':type(e).__name__+': '+str(e)[:300]}
 write(work/'summary.json',summary);print(json.dumps(summary,indent=2))
 if any('error' in x for x in summary.values()):raise SystemExit(1)

def update_region(region,args,work,publisher,budget):
 region_dir=work/region;region_dir.mkdir(exist_ok=True);master=region_dir/'master';assets=region_dir/'bundles';out=region_dir/'runtime';master.mkdir(exist_ok=True);assets.mkdir(exist_ok=True)
 state_path=ROOT/'state'/f'{region}.json';state=read(state_path,{'done':{},'failed':{},'roles':{}})
 public_path=ROOT/'regions'/f'{region}.json';public=read(public_path,{'schemaVersion':1,'region':region,'roles':[],'files':{}})
 if args.local_input:
  master=args.local_input/'input/master';assets=args.local_input/'input/asset-bundles';version=read(master/'current_version.json',{});index=read(args.local_input/'input/jp-bundle-index.json',{})['bundles'];source=None
 else:
  session=requests.Session()
  if os.environ.get('GH_TOKEN'):session.headers['Authorization']='Bearer '+os.environ['GH_TOKEN']
  info=json.loads(get(session,f'https://api.github.com/repos/Sekai-World/{REGIONS[region]}/commits/main',limit=4*1024*1024)[0]);commit=info['sha']
  if state.get('sourceCommit')==commit and state.get('exporterRevision')==REV and state.get('pending')==0:
   return {'attempted':0,'unchanged':True,'readyRoles':len(public['roles'])}
  state['sourceCommit']=commit;state['exporterRevision']=REV
  # Never send GitHub authorization to the game CDN or raw host.
  raw=requests.Session();base=f'https://raw.githubusercontent.com/Sekai-World/{REGIONS[region]}/{commit}/'
  for table in TABLES+['versions']:
   data,_=get(raw,base+table+'.json');(master/(table+'.json')).write_bytes(data)
  for table in ('costume3dGroups','costume3dColors'):
   try:(master/(table+'.json')).write_bytes(get(raw,base+table+'.json')[0])
   except requests.HTTPError as error:
    if error.response.status_code!=404:raise
  version=read(master/'versions.json',{});write(master/'current_version.json',version);source=Source(region,version);index=source.index()
  # Empty markers let Haruki resolve paths without downloading unselected bundles.
  for key in index:
   if key.startswith(('live_pv/model/','character/motion/costume_setting/')):
    p=assets/(safe_path(key)+'.bundle');p.parent.mkdir(parents=True,exist_ok=True);p.touch(exist_ok=True)
 def export(*flags):
  log=region_dir/'export.log'
  with log.open('w') as f:
   result=subprocess.run(list(map(str,['dotnet',HARUKI/'exporter/bin/Release/net9.0/Haruki-3D-Exporter.dll',*flags,'--master',master,'--asset-root',assets,'--out',out,'--png-optimize','off'])),stdout=f,stderr=subprocess.STDOUT)
  if result.returncode:raise RuntimeError(log.read_text()[-1500:])
 def prepare(keys):
  deps=closure(index,keys)
  if sum(index[k]['fileSize'] for k in deps)>256*1024*1024:raise ValueError('Per-task bundle budget exceeded')
  for k in deps:
   p=assets/(k+'.bundle')
   if not p.exists() or p.stat().st_size==0:
    if source is None:raise FileNotFoundError(k)
    source.download(k,index[k],p)
  return deps
 def archive_file(p):
  rel=p.relative_to(out).as_posix();data=p.read_bytes()
  if p.name.endswith('.msgpack.br'):
   normalized=region_dir/'normalized.br';codec('normalize',p,normalized);data=normalized.read_bytes()
  public['files'][rel]=publisher.object(data)
 def publish_tree():
  for p in sorted(out.rglob('*')):
   if p.is_file() and p.suffix in ('.br','.png','.ktx2') and p.relative_to(out).as_posix().startswith(('_texture_store/','parts/_sources/','parts/_cores/','roles/')):archive_file(p)
 export('--emit-costume-registries');export('--emit-runtime-role-catalog')
 catalog=decode(out/'runtime-role-catalog.msgpack.br');registry=decode(out/'parts/part-registry.msgpack.br')
 entries=registry['entries'];current={}
 def key(e):return f"{e['characterId']}:{e['unit']}:{e['partType']}:{e['costume3dId']}"
 def inputs(e):return [pathlib.Path(e[f]).relative_to(assets).as_posix().removesuffix('.bundle') for f in ('bundlePath','colorVariationBundlePath') if e.get(f)]
 def fingerprint(e):return sha(json.dumps([REV,e,{k:index[k]['hash'] for k in closure(index,inputs(e))}],sort_keys=True).encode())
 defaults=set()
 for role in catalog['roles']:
  for field in ('bodyCostume3dId','headCostume3dId','hairCostume3dId'):defaults.add((role['characterId'],role['unit'],role[field]))
 ordered=sorted(entries,key=lambda e:((e['characterId'],e['unit'],e['costume3dId']) not in defaults,e['characterId'],e['costume3dId']))
 attempted=0;pending=0;reused=0;completed=set()
 current_entries={key(e):e for e in entries}
 for k,record in state['done'].items():
  e=current_entries.get(k)
  if e and e['status']!='empty' and inputs(e) and record['fingerprint']==fingerprint(e):
   completed.add(package_fingerprint(e,{d:index[d]['hash'] for d in closure(index,inputs(e))}))
 for e in ordered:
  k=key(e);current[k]=e
  if e['status']=='empty':state['done'][k]={'entry':e,'fingerprint':'empty'};continue
  if not inputs(e) or (e.get('colorAssetbundleName') and not e.get('colorVariationBundlePath')):continue
  fp=fingerprint(e)
  if state['done'].get(k,{}).get('fingerprint')==fp or state['failed'].get(k,{}).get('fingerprint')==fp:continue
  package_fp=package_fingerprint(e,{d:index[d]['hash'] for d in closure(index,inputs(e))})
  if package_fp in completed:
   state['done'][k]={'entry':e,'fingerprint':fp};state['failed'].pop(k,None);reused+=1;continue
  if attempted>=budget:
   pending+=1;continue
  attempted+=1
  try:
   deps=prepare(inputs(e));export('--emit-part-packages','--part-costume3d-id',str(e['costume3dId']),'--part-type',e['partType'],'--part-unit',e['unit'])
   # Exporter writes validated part/core packages, textures are shared content-addressed files.
   package=out/e['packagePath']/'part-runtime.msgpack.br'
   if not package.exists():raise FileNotFoundError('Exporter did not produce selected part')
   publish_tree();state['done'][k]={'entry':e,'fingerprint':fp};state['failed'].pop(k,None);completed.add(package_fp)
  except (requests.RequestException,subprocess.CalledProcessError):
   raise
  except Exception as ex:
   state['failed'][k]={'fingerprint':fp,'error':str(ex)[:300]}
  finally:
   # Keep registry metadata; remove physical outputs after publication to bound disk use.
   for d in ('_texture_store','parts/_sources','parts/_cores'):
    shutil.rmtree(out/d,ignore_errors=True)
   if source:
    for p in assets.rglob('*.bundle'):
     if p.stat().st_size:p.write_bytes(b'')
 ready=[]
 character_names={x['id']: x.get('firstName','')+x.get('givenName','') for x in read(master/'gameCharacters.json',[])}
 for role in catalog['roles']:
  rolekey=f"{role['characterId']}:{role['unit']}";selected=[x['entry'] for k,x in state['done'].items() if k in current and current[k]['characterId']==role['characterId'] and current[k]['unit']==role['unit']]
  if not all(any(e['costume3dId']==role[f] for e in selected) for f in ('bodyCostume3dId','headCostume3dId','hairCostume3dId')):continue
  role_fp=sha(json.dumps([REV,role,[state['done'][key(e)]['fingerprint'] for e in selected if (e['characterId'],e['unit'],e['costume3dId']) in defaults]],sort_keys=True).encode())
  if state['roles'].get(rolekey)!=role_fp:
   try:
    keys=[k for e in selected if (e['characterId'],e['unit'],e['costume3dId']) in defaults for k in inputs(e)]
    motion=f"character/motion/costume_setting/{role['characterId']:02d}_00"
    if motion in index:keys.append(motion)
    prepare(keys);export('--emit-role-runtimes','--role-character3d-id',str(role['roleId']));publish_tree();state['roles'][rolekey]=role_fp
   except Exception:continue
  ready.append({**role,'id':rolekey,'name':character_names.get(role['characterId'],str(role['characterId'])),'parts':[{'id':key(e),'costumeID':e['costume3dId'],'type':e['partType'],'name':e['name'],'colorName':e.get('colorName','')} for e in selected]})
  scoped=out/f"parts/by-role/{role['characterId']}/{role['unit']}";scoped.mkdir(parents=True,exist_ok=True)
  encode(scoped/'part-registry.msgpack.br',{'version':2,'entries':selected})
  encode(scoped/'runtime-role-catalog.msgpack.br',{**catalog,'roles':[role]})
  archive_file(scoped/'part-registry.msgpack.br');archive_file(scoped/'runtime-role-catalog.msgpack.br')
 # Compatibility tables are metadata only. Publish after the immutable dependencies exist.
 for p in (out/'parts/compat').rglob('*.br'):archive_file(p)
 public.update(roles=ready,masterVersion=version.get('dataVersion',''),exporterRevision=REV)
 public['revision']=sha(json.dumps([public['roles'],public['files']],sort_keys=True).encode())
 state['pending']=pending
 write(public_path,public);write(state_path,state)
 return {'attempted':attempted,'readyRoles':len(ready),'reusedParts':reused,'pendingParts':pending,'publishedParts':len(state['done']),'failedParts':len(state['failed'])}

if __name__=='__main__':main()
