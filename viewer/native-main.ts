import * as THREE from 'three';
import {Haruki3DEngine} from 'haruki-local-engine';
import {previewLightDefaults} from 'haruki-3d-engine';
import {composeRuntimeCombinedCharacterAsset} from 'haruki-local-composer';
import {createHarukiBaseCharacterRuntime} from 'haruki-local-base';
import {nativePart} from './native-character.mjs';
import {createNativeMotionPlayer} from './native-animation.mjs';
import {attachViewerInteractions} from './interactions.mjs';
import {viewerStrings} from './localization.mjs';
const notify=(type:string,message='',detail:Record<string,unknown>={})=>(window as any).webkit?.messageHandlers?.model3D?.postMessage({type,message,...detail});
addEventListener('error',event=>notify('error',String(event.error??event.message)));
addEventListener('unhandledrejection',event=>notify('error',String(event.reason)));
const canvas=document.querySelector<HTMLCanvasElement>('#viewer')!;
const engine=new Haruki3DEngine({canvas,initialLight:{...previewLightDefaults},autoRender:false,manageResize:false});
let motion:any=null;
const nativeEngine=new Proxy(engine,{get(target,key){
  if(key==='loadRenderRecipe')return loadNative;
  if(key==='stepRuntimeFrame')return (delta:number,options:any)=>{motion?.update(delta);target.stepRuntimeFrame(delta,{...options,advanceAnimation:false});};
  const value=(target as any)[key];return typeof value==='function'?value.bind(target):value;
}});
const kernel=createHarukiBaseCharacterRuntime(nativeEngine,'sekai3d://runtime/');
const controls=attachViewerInteractions(canvas,kernel,state=>notify('view-state','',state));
controls.setEnabled(false);
let disposed=false,previousRole:string|undefined,chain=Promise.resolve();
async function loadNative(recipe:any){
  const loaded=[];
  for(const part of recipe.parts){
    const response=await fetch(part.sceneURL);if(!response.ok)throw Error('Local model cache could not be read');
    loaded.push({part,scene:await response.json()});
  }
  if(disposed)return;
  const packages=new Map(),registry=[];
  for(const {part,scene} of loaded){const runtime=nativePart(part.entry,scene,part.sceneURL,recipe.characterHeightMeters);packages.set(runtime.packagePath,runtime);
    registry.push({...part.entry,packagePath:runtime.packagePath,status:'ready'});}
  if(!registry.some(p=>p.costume3dId===recipe.headCostume3dId&&(p.partType==='head'||p.partType==='head_optional')))
    registry.push({characterId:recipe.characterId,unit:recipe.unit??recipe.roleId.split(':')[1],partType:'head_optional',costume3dId:recipe.headCostume3dId,packagePath:'native/empty/',status:'empty'});
  const unit=recipe.unit??recipe.roleId.split(':')[1]??'';
  const roles=[{characterId:recipe.characterId,unit,characterHeightMeters:recipe.characterHeightMeters,skinColors:recipe.skinColors,
    bodyCostume3dId:recipe.bodyCostume3dId,hairCostume3dId:recipe.defaultHairCostume3dId??recipe.hairCostume3dId,headCostume3dId:recipe.headCostume3dId}];
  const partSet:any={registry,packages,roles,roleRuntimes:new Map(),compatibility:null,baseUrl:'sekai3d://runtime/',masterVersion:recipe.roleId};
  const selection={...recipe,characterId:recipe.characterId,unit};
  const combined=composeRuntimeCombinedCharacterAsset({partSet,selection,activeRoleId:null,resolveUrl:(path:string)=>path});
  const resume=previousRole===recipe.roleId?motion?.getState():null;
  motion?.dispose();motion=null;
  await engine.importCombinedCharacter(combined,{disposeBeforeLoad:true,clearAnimationCache:true});
  const body=loaded.find(item=>item.part.entry.partType==='body');
  const clips=body?.scene.animationClips??[];
  const sourceNodes=loaded.flatMap(item=>(item.scene.nodes??[]).map((node:any)=>({...node,morphNames:item.scene.meshes.filter((m:any)=>m.transformID===node.id).flatMap((m:any)=>(m.morphTargets??[]).map((t:any)=>t.name))}))),root=engine.getCharacterRoot();
  const byPath=new Map<string,THREE.Object3D[]>();for(const [path,node] of (engine as any).currentPrefabSourceGraph?.nodeByPath??[])byPath.set(path,[node]);root.traverse(node=>{const p=node.userData.pjskTransformPath;if(p){if(!byPath.has(p))byPath.set(p,[]);if(!byPath.get(p)!.includes(node))byPath.get(p)!.push(node);}});
  motion=createNativeMotionPlayer(THREE,root,clips,sourceNodes,byPath,resume);
  (window as any).nativeModelDiagnostics={parts:loaded.length,meshCount:loaded.reduce((n,p)=>n+p.scene.meshes.length,0),motionTracks:motion?.trackCount??0,source:'local-unity'};
}
let generation=0;
(window as any).loadModel=(recipe:any)=>{const current=++generation;chain=chain.catch(()=>{}).then(async()=>{
  if(disposed||current!==generation)return;
  notify('loading');controls.setEnabled(false);
  try{await kernel.load(recipe);if(disposed||current!==generation)return;if(previousRole!==recipe.roleId)controls.reset();else controls.apply();previousRole=recipe.roleId;controls.setEnabled(true);kernel.play();notify('loaded');}
  catch(error){if(!disposed&&current===generation)notify('error',String(error));}
});return chain;};
const appearance=()=>{const theme=(window as any).viewerColorScheme??(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.viewerTheme=theme;kernel.setBackgroundTheme(theme);};
(window as any).setViewerColorScheme=(theme:string)=>{(window as any).viewerColorScheme=theme;appearance();};
(window as any).setViewerLocale=(locale:string)=>{const {language,values}=viewerStrings(locale);document.documentElement.lang=language;for(const element of document.querySelectorAll<HTMLElement>('[data-label]'))element.setAttribute('aria-label',values[element.dataset.label!]);};
(window as any).resetModelView=()=>controls.reset();
(window as any).zoomModelViewBy=(factor:number)=>controls.zoomBy(factor);
(window as any).setModelViewZoom=(zoom:number)=>controls.setZoom(zoom);
(window as any).setViewerViewportInsets=(...insets:number[])=>{(window as any).viewerViewportInsets=insets;kernel.setViewportInsets(...insets as [number,number,number,number]);};
function resize(){kernel.resize(innerWidth,innerHeight);kernel.setViewportInsets(...((window as any).viewerViewportInsets??[0,0,0,0]) as [number,number,number,number]);}
function dispose(){if(disposed)return;disposed=true;motion?.dispose();motion=null;controls.dispose();void kernel.destroy();removeEventListener('resize',resize);}
(window as any).getLocalModelDiagnostics=()=>({model:(window as any).nativeModelDiagnostics,motion:motion?.getState(),snapshots:engine.getSnapshots(),programs:(engine as any).renderer.info.programs?.map((p:any)=>({diagnostics:p.diagnostics,usedTimes:p.usedTimes}))});
(window as any).disposeModelViewer=dispose;
addEventListener('resize',resize);addEventListener('pagehide',dispose,{once:true});
document.addEventListener('visibilitychange',()=>document.hidden?kernel.pause():kernel.play());
appearance();resize();notify('ready');
