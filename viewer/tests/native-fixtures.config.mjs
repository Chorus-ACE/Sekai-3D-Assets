import path from 'node:path';
import viewer from '../vite.config.mjs';
export default {...viewer,root:process.cwd(),plugins:[],resolve:{alias:{...viewer.resolve.alias,
  'haruki-local-spring':path.join(process.env.HARUKI_ROOT,'engine/src/engine/unityPrefabSpringRuntimeAdapter.ts'),
  'haruki-local-prefab':path.join(process.env.HARUKI_ROOT,'engine/src/engine/unityPrefabRuntime.ts')}},
  build:{ssr:true,target:'node22',outDir:'.work/native-fixture-tests',rolldownOptions:{input:'viewer/tests/native-fixtures.ts',external:['node:fs','node:assert/strict']}}};
