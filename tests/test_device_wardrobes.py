import pathlib,sys,tempfile,json,unittest,zlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
import device_wardrobes as wardrobes
from unittest.mock import patch
from types import SimpleNamespace

class WardrobeTests(unittest.TestCase):
 def test_all_variants_publish_without_binary_hash_backfill(self):
  with tempfile.TemporaryDirectory() as folder:
   root=pathlib.Path(folder)
   entry={'characterId':1,'unit':'light_sound','partType':'body','costume3dId':2,'name':'Normal','status':'ready',
          'bundlePath':str(root/'body.bundle'),'packagePath':'parts/body/2/','costume3dGroupId':1,'colorId':1}
   variant={**entry,'costume3dId':3,'name':'Colour','colorId':2,'colorAssetbundleName':'01','colorVariationBundlePath':str(root/'colour.bundle')}
   index={'body':{'fileSize':100,'hash':'build','dependencies':['shared']},'colour':{'fileSize':50,'hash':'colour','dependencies':[]},'shared':{'fileSize':20,'hash':'shader','dependencies':[]}}
   role={'characterId':1,'unit':'light_sound','bodyCostume3dId':2,'hairCostume3dId':201,'headCostume3dId':1,'characterHeightMeters':1.61}
   result=wardrobes.build(root/'output','jp','https://official/android/',index,[entry,variant],root,[role],{}, {1:'Ichika'},'rev')
   self.assertEqual(result['binaryDownloads'],0)
   directory=json.loads((root/'output/regions/jp.json').read_text());self.assertNotIn('parts',directory['roles'][0])
   ref=directory['roles'][0]['catalog'];data=(root/'output'/ref['path']).read_bytes();self.assertEqual(wardrobes.digest(data),ref['sha256'])
   scope=json.loads(zlib.decompress(data,wbits=-15));self.assertEqual(len(zlib.decompress(data,wbits=-15)),ref["decodedBytes"]);self.assertEqual(len(scope['parts']),2);self.assertTrue(all(p['status']=='available' for p in scope['parts']))
   self.assertEqual(scope['parts'][1]['variationBundle'],'colour')
   self.assertEqual(set(scope['bundles']),{'body','colour','shared'})
   self.assertNotIn('sha256',scope['bundles']['body'])
   self.assertNotIn('parts',scope['role'])
   wardrobes.build(root/'output','jp','https://official/android/',index,[entry,variant],root,[role],{}, {1:'Ichika'},'unrelated-master-commit')
   second=json.loads((root/'output/regions/jp.json').read_text())
   self.assertEqual(second['roles'][0]['catalog'],ref)
 def test_remote_input_supplies_haruki_master_version_file(self):
  with tempfile.TemporaryDirectory() as folder:
   root=pathlib.Path(folder);master=root/'master';master.mkdir();(master/'versions.json').write_text('{"dataVersion":"test-version"}')
   def registry(m,index,work,dotnet):
    self.assertEqual(json.loads((m/'current_version.json').read_text())['dataVersion'],'test-version')
    (work/'registry.json').write_text('{"roles":[],"compatibility":{}}');return [],root/'markers'
   args=SimpleNamespace(fixture=None,output=root/'out',dotnet='unused')
   with patch.object(wardrobes,'ROOT',root),patch.object(wardrobes,'current_inputs',return_value='commit'),patch.object(wardrobes,'load_inputs',return_value=(master,{},SimpleNamespace(base='https://official/'),'rev')),patch.object(wardrobes,'make_registry',side_effect=registry):
    self.assertEqual(wardrobes.run('jp',args)['binaryDownloads'],0)
 def test_crc_only_regional_source_keeps_its_own_download_path(self):
  with tempfile.TemporaryDirectory() as folder:
   root=pathlib.Path(folder)
   entry={'characterId':1,'unit':'u','partType':'hair','costume3dId':201,'status':'ready','bundlePath':str(root/'face.bundle'),'packagePath':'p/'}
   role={'characterId':1,'unit':'u'};index={'face':{'fileSize':100,'hash':None,'crc':42,'downloadPath':'ios7'}}
   wardrobes.build(root/'out','tw','https://regional/',index,[entry],root,[role],{},{},'revision')
   catalog=json.loads((root/'out/regions/tw.json').read_text());scope=json.loads(zlib.decompress((root/'out'/catalog['roles'][0]['catalog']['path']).read_bytes(),wbits=-15))
   self.assertEqual(scope['region'],'tw');self.assertEqual(scope['bundles']['face']['downloadPath'],'ios7');self.assertEqual(scope['parts'][0]['status'],'available')

if __name__=='__main__':unittest.main()
