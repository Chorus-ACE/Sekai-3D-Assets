import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname);
export default {root,base:'./',resolve:{alias:{'haruki-3d-engine':path.join(process.env.HARUKI_ROOT,'engine/src/index.ts')}},build:{outDir:process.env.VIEWER_OUT||path.join(root,'dist'),emptyOutDir:true}};
