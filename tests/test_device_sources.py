import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
import device_sources as sources

class MetadataSourceTests(unittest.TestCase):
    def test_dependency_closure_rejects_missing_cycles_and_traversal(self):
        index = {'model': {'dependencies': ['shared']}, 'shared': {}}
        self.assertEqual(sources.dependencies(index, ['model', 'shared']), ['model', 'shared'])
        for key in ['../escape', '/absolute', 'absent']:
            with self.assertRaises(ValueError): sources.dependencies(index, [key])
        index['shared']['dependencies'] = ['model']
        with self.assertRaises(ValueError): sources.dependencies(index, ['model'])

    def test_regional_crc_descriptors_keep_paths_and_are_not_binary_hashes(self):
        value = sources.descriptor({'fileSize': 123, 'crc': 42, 'downloadPath': 'ios7'})
        self.assertEqual(value, {'bytes':123, 'upstreamHash':None, 'upstreamCRC':42, 'downloadPath':'ios7'})
        self.assertNotIn('sha256', value)
        for size in [0, -1, 32 * 1024 * 1024 + 1]:
            with self.assertRaises(ValueError): sources.descriptor({'fileSize':size, 'hash':'build'})
        with self.assertRaises(ValueError): sources.descriptor({'fileSize':123})

    def test_source_markers_remain_relative_to_the_asset_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            self.assertEqual(sources.source_path(str(root/'face/model.bundle'), root), 'face/model')
            self.assertIsNone(sources.source_path(None, root))
            with self.assertRaises(ValueError): sources.source_path(str(root.parent/'outside.bundle'), root)
            with self.assertRaises(ValueError): sources.source_path(str(root/'model.txt'), root)

    def test_public_part_preserves_regional_identity_attachment_and_empty_values(self):
        value = sources.public_part({'characterId':21, 'unit':'idol', 'partType':'head', 'costume3dId':1,
            'name':'', 'colorId':0, 'attachNode':None, 'headCostume3dAssetbundleType':'head_and_hair'})
        self.assertEqual(value['id'], '21:idol:head:1')
        self.assertEqual(value['name'], '')
        self.assertEqual(value['colorId'], 0)
        self.assertIsNone(value['attachNode'])
        self.assertEqual(value['headCostume3dAssetbundleType'], 'head_and_hair')

if __name__ == '__main__': unittest.main()
