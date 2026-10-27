import fs from 'node:fs';
import * as THREE from 'three';
import assert from 'node:assert/strict';
import {UnityPrefabSpringRuntime} from 'haruki-local-spring';
import {nativeMotionTracks} from '../native-motion.mjs';
import {nativePart,crc32} from '../native-character.mjs';
import {createNativeMotionPlayer} from '../native-animation.mjs';
import {composeRuntimeCombinedCharacterAsset} from 'haruki-local-composer';
import {buildUnityPrefabSourceGraph,installUnityRuntimeNativeMeshes} from 'haruki-local-prefab';
assert(process.env.SEKAI_NATIVE_SCENE_FIXTURES,'Set SEKAI_NATIVE_SCENE_FIXTURES to the bounded native fixture output');
const root=process.env.SEKAI_NATIVE_SCENE_FIXTURES+'/';
const packages=new Map(),registry:any[]=[];
for(const [name,type,id]of[['body','body',7002],['hair','hair',29001],['accessory','head_optional',2075025]]as const){
 const scene=JSON.parse(fs.readFileSync(root+name+'/scene.json','utf8'));
 const entry={id:'1:light_sound:'+type+':'+id,partType:type,characterId:1,unit:'light_sound',costume3dId:id,name,attachNode:'Head'};
 const runtime=nativePart(entry,scene,'file://'+root+name+'/scene.json',1.61);
 packages.set(runtime.packagePath,runtime);registry.push({...entry,status:'ready',packagePath:runtime.packagePath});
}
registry.push({characterId:1,unit:'light_sound',costume3dId:1,partType:'head_optional',status:'empty',packagePath:'empty/'});
for(const accessory of[1,2075025]){
 const roles=[{characterId:1,unit:'light_sound',bodyCostume3dId:7002,hairCostume3dId:29001,headCostume3dId:1,characterHeightMeters:1.61}];
 const selection={characterId:1,unit:'light_sound',bodyCostume3dId:7002,hairCostume3dId:29001,headCostume3dId:accessory};
 const combined=composeRuntimeCombinedCharacterAsset({partSet:{registry,packages,roles,roleRuntimes:new Map(),compatibility:null,baseUrl:'native://test'},selection,activeRoleId:null,resolveUrl:p=>p});
 const graph=buildUnityPrefabSourceGraph(combined.runtimeExtension,null);assert(graph);
 const result=installUnityRuntimeNativeMeshes(graph,combined.runtimeExtension);assert(!result.error,result.error);assert(result.meshCount>=2);assert(result.skinnedMeshCount>=2);
 const physics=UnityPrefabSpringRuntime.fromPjskRuntimeExtension(combined.runtimeExtension,graph.root);assert(physics);for(let i=0;i<120;i++)physics.update(1/60);const snapshot=physics.getSnapshot();assert.equal(snapshot.missingNodeCount,0);assert(snapshot.boneCount>0);console.log('PHYSICS',snapshot.boneCount,'bones',snapshot.colliderCount,'colliders');
 console.log('ASSEMBLY',accessory,result.meshCount,result.skinnedMeshCount,result.warnings);
}

const body=JSON.parse(fs.readFileSync(root+'body/scene.json','utf8'));
const face=JSON.parse(fs.readFileSync(root+'hair/scene.json','utf8'));
const nodes=[body,face].flatMap(scene=>scene.nodes.map(n=>({...n,morphNames:scene.meshes.filter(m=>m.transformID===n.id).flatMap(m=>(m.morphTargets??[]).map(t=>t.name))})));
for(const name of ['motion','face','motion_loop','face_loop']){
 const clip=body.animationClips.find(c=>c.m_Name===name);assert(clip);
 const tracks=nativeMotionTracks(clip,nodes);assert(tracks.length>0);assert(tracks.every(t=>t.values.every(Number.isFinite)));console.log('MOTION',name,tracks.length);
}

const motionClip=(name:string,from:number,to:number)=>({m_Name:name,m_MuscleClip:{m_StopTime:1,m_Clip:{data:{m_DenseClip:{m_CurveCount:3,m_FrameCount:2,m_SampleRate:1,m_SampleArray:[from,0,0,to,0,0]}}}},m_ClipBindingConstant:{genericBindings:[{path:crc32('Hip'),typeID:4,attribute:1}]}});
const clips=[motionClip('motion_loop',2,3),motionClip('motion',0,2)];
const makePlayer=(resume:any=null)=>{
 const root=new THREE.Group(),hip=new THREE.Object3D();root.add(hip);
 const player=createNativeMotionPlayer(THREE,root,clips,[{path:'body/Hip'}],new Map([['body/Hip',[hip]]]),resume);assert(player);return {root,hip,player};
};
const initial=makePlayer();initial.player.update(.5);assert.equal(initial.player.getState().phase,'intro');assert(Math.abs(initial.hip.position.x+1)<1e-6);
const introResume=makePlayer(initial.player.getState());assert(Math.abs(introResume.hip.position.x+1)<1e-6);introResume.player.dispose();
initial.player.update(.6);assert.equal(initial.player.getState().phase,'loop');assert(Math.abs(initial.hip.position.x+2)<1e-6);
initial.player.update(.25);const state=initial.player.getState();initial.player.dispose();
const switched=makePlayer(state);assert.equal(switched.player.getState().phase,'loop');assert(Math.abs(switched.hip.position.x+2.25)<1e-6);
switched.player.update(1);assert.equal(switched.player.getState().phase,'loop');switched.player.dispose();
console.log('ENTRANCE -> LOOP AND PART-SWITCH RESUME PASSED');

if(process.env.SEKAI_NATIVE_HAIR_FIXTURES){
 const directory=process.env.SEKAI_NATIVE_HAIR_FIXTURES;
 for(const [index,name] of fs.readdirSync(directory).entries()){
  const scene=JSON.parse(fs.readFileSync(directory+'/'+name+'/scene.json','utf8'));
  const id=900000+index,entry={id:'fixture:'+name,partType:'hair',characterId:1,unit:'light_sound',costume3dId:id,name};
  const part=nativePart(entry,scene,'file://'+directory+'/'+name+'/scene.json',1.61);
  const allPackages=new Map(packages);allPackages.set(part.packagePath,part);
  const allRegistry=[...registry,{...entry,status:'ready',packagePath:part.packagePath}];
  const combined=composeRuntimeCombinedCharacterAsset({partSet:{registry:allRegistry,packages:allPackages,roles:[{characterId:1,unit:'light_sound',bodyCostume3dId:7002,hairCostume3dId:id,headCostume3dId:1,characterHeightMeters:1.61}],roleRuntimes:new Map(),compatibility:null,baseUrl:'native://test'},selection:{characterId:1,unit:'light_sound',bodyCostume3dId:7002,hairCostume3dId:id,headCostume3dId:1},activeRoleId:null,resolveUrl:p=>p});
  const graph=buildUnityPrefabSourceGraph(combined.runtimeExtension,null);assert(graph);
  const result=installUnityRuntimeNativeMeshes(graph,combined.runtimeExtension);assert(!result.error,result.error);assert(result.skinnedMeshCount>=2);
  const sourceNodes=[body,scene].flatMap(s=>s.nodes.map(n=>({...n,morphNames:s.meshes.filter(m=>m.transformID===n.id).flatMap(m=>(m.morphTargets??[]).map(t=>t.name))})));
  const player=createNativeMotionPlayer(THREE,graph.root,body.animationClips,sourceNodes,new Map([...graph.nodeByPath].map(([path,node])=>[path,[node]])));assert(player);
  player.update(.8);graph.root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(graph.root),size=bounds.getSize(new THREE.Vector3());
  assert([size.x,size.y,size.z].every(Number.isFinite));assert(size.y>.5&&size.y<3);
  graph.root.traverse((node:any)=>{if(node.isSkinnedMesh){node.skeleton.update();assert([...node.skeleton.boneMatrices].every(Number.isFinite));}});
  player.dispose();console.log('HAIR ASSEMBLY AND ANIMATED SKIN',name,result.skinnedMeshCount,size.y);
 }
}
