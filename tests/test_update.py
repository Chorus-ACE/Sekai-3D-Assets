import importlib.util,pathlib,tempfile,unittest,subprocess
spec=importlib.util.spec_from_file_location('update',pathlib.Path(__file__).resolve().parents[1]/'scripts/update.py');u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
class UpdateTests(unittest.TestCase):
 def test_dependency_closure_handles_shared_and_cyclic_inputs(self):
  index={'a':{'dependencies':['b','c']},'b':{'dependencies':['c']},'c':{'dependencies':['a']}}
  self.assertEqual(u.closure(index,['a']),['a','b','c'])
 def test_rejects_unsafe_paths(self):
  for path in ['/a','../a','a/../b','a//b','a\\b']:
   with self.assertRaises(ValueError):u.safe_path(path)
 def test_identical_objects_reuse_archive_across_regions(self):
  with tempfile.TemporaryDirectory() as t:
   p=u.Publisher(pathlib.Path(t),False);a=p.object(b'example mesh');b=p.object(b'example mesh');self.assertEqual(a,b)
   archive=pathlib.Path(t)/'archives'/(a['sha256']+'.aar');out=pathlib.Path(t)/'extract';out.mkdir()
   subprocess.run(['aa','extract','-i',str(archive),'-d',str(out)],check=True,capture_output=True)
   self.assertEqual((out/'payload').read_bytes(),b'example mesh')
if __name__=='__main__':unittest.main()
