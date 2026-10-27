import path from 'node:path';
import fs from 'node:fs';
const root=path.dirname(new URL(import.meta.url).pathname);
const out=process.env.VIEWER_OUT||path.join(root,'dist');
export default {root,base:'./',resolve:{alias:{'haruki-local-engine':path.join(process.env.HARUKI_ROOT,'engine/src/engine/Haruki3DEngine.ts'),'haruki-local-composer':path.join(process.env.HARUKI_ROOT,'engine/src/parts/runtimePartComposer.ts'),'haruki-local-base':path.join(process.env.HARUKI_ROOT,'engine/src/base/browserCharacterRuntime.ts'),'haruki-3d-engine':path.join(process.env.HARUKI_ROOT,'engine/src/index.ts'),'three':path.join(process.env.HARUKI_ROOT,'engine/node_modules/three')}},build:{outDir:out,emptyOutDir:true,rolldownOptions:{input:{viewer:path.join(root,'index.html')}}},plugins:[{name:'third-party-notices',writeBundle(){fs.copyFileSync(path.join(root,'THIRD_PARTY_NOTICES.txt'),path.join(out,'ThirdPartyNotices.txt'));}}]};
