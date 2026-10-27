import hashlib
import json
import pathlib
import unittest
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'device/v2'

class PublishedCatalogTests(unittest.TestCase):
    def test_all_five_regional_roots_reference_complete_verified_objects(self):
        for region in ['jp','en','tw','kr','cn']:
            catalog = json.loads((ROOT/'regions'/(region+'.json')).read_text())
            self.assertEqual(catalog['schemaVersion'], 2)
            self.assertEqual(catalog['region'], region)
            self.assertEqual(catalog['importerRevision'], 'native-character-v2')
            roles = catalog['roles']
            self.assertTrue(roles)
            self.assertEqual(len({role['id'] for role in roles}), len(roles))
            for role in roles:
                ref = role['catalog']
                self.assertEqual(ref['path'], 'objects/'+ref['sha256']+'.json.deflate')
                self.assertGreater(ref['decodedBytes'], 0)
                self.assertLessEqual(ref['decodedBytes'], 32*1024*1024)
                data = (ROOT/ref['path']).read_bytes()
                self.assertEqual(len(data), ref['bytes'])
                self.assertEqual(hashlib.sha256(data).hexdigest(), ref['sha256'])
                decoder = zlib.decompressobj(wbits=-15)
                decoded = decoder.decompress(data, ref['decodedBytes']+1)
                self.assertTrue(decoder.eof)
                self.assertEqual(decoder.unused_data, b'')
                self.assertEqual(len(decoded), ref['decodedBytes'])
                scope = json.loads(decoded)
                self.assertEqual(scope['region'], region)
                self.assertEqual(scope['role']['id'], role['id'])
                self.assertEqual(scope['platform'], 'android' if region in ['jp','en'] else 'ios')

if __name__ == '__main__': unittest.main()
