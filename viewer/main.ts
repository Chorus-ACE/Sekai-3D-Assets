import { createHaruki3DKernel } from 'haruki-3d-engine';
const canvas=document.querySelector<HTMLCanvasElement>('#viewer')!;
const params=new URLSearchParams(location.search);
const kernel=createHaruki3DKernel({canvas,assetBaseUrl:params.get('assets')??'sekai3d://runtime/',ktx2TranscoderPath:'./basis/'});
function notify(type:string,message=''){(window as any).webkit?.messageHandlers?.model3D?.postMessage({type,message});}
let chain=Promise.resolve();
(window as any).loadModel=(selection:any)=>{
 chain=chain.catch(()=>{}).then(async()=>{try{notify('loading');await kernel.load(selection);kernel.play();notify('loaded');}catch(e){notify('error',String(e));throw e;}});
};
addEventListener('resize',()=>kernel.resize(innerWidth,innerHeight));
document.addEventListener('visibilitychange',()=>document.hidden?kernel.pause():kernel.play());
addEventListener('pagehide',()=>{void kernel.destroy()},{once:true});
kernel.resize(innerWidth,innerHeight);notify('ready');
