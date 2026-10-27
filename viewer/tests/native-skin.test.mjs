import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeSkinPalette,nativePrefabNodes} from '../native-character.mjs';

test('prefab membership follows instance identity rather than duplicated paths',()=>{
  const nodes=[{id:1,path:'face'},{id:2,path:'face/Hip',parentID:1},{id:3,path:'face'},
    {id:4,path:'face/Hip',parentID:3},{id:5,path:'sourceFBX'}];
  const active=nativePrefabNodes({nodes,meshes:[{transformID:2}]},'face');
  assert.deepEqual(nodes.filter(active).map(n=>n.id),[1,2]);
  assert.throws(()=>nativePrefabNodes({nodes,meshes:[{transformID:2},{transformID:4}]},'face'),/found 2/);
});

const nodes=new Map([[1,{path:'face'}],[2,{path:'face/Hip'}],[3,{path:'face/Hip/Neck'}],[4,{path:'sourceFBX/Hip'}]]);
const active=node=>!!node&&(node.path==='face'||node.path.startsWith('face/'));
const mesh=()=>({boneIDs:[2,3,4,1],rootBoneID:2,transformID:1,inverseBindMatrices:new Array(3*16).fill(0),
  skinIndices:[1,0,3,99],skinWeights:[1,0,0,0],boneNameHashes:[0,0,1200504540]});

test('unused stale hashes and renderer tails do not shift weighted bone slots',()=>{
  assert.deepEqual(nativeSkinPalette(mesh(),nodes,active),[2,3,2]);
});
test('explicit renderer references remain authoritative when names are duplicated',()=>{
  const duplicate=new Map(nodes);duplicate.set(5,{path:'face/Hip/Neck'});
  assert.deepEqual(nativeSkinPalette(mesh(),duplicate,active),[2,3,2]);
});
test('weighted bones outside the active prefab or bind-pose range fail explicitly',()=>{
  for(const slot of [2,3,9,-1,1.5]){
    const value=mesh();value.skinIndices[0]=slot;
    assert.throws(()=>nativeSkinPalette(value,nodes,active),/weighted skin slot/);
  }
  const missing=mesh();missing.boneIDs[1]=99;
  assert.throws(()=>nativeSkinPalette(missing,nodes,active),/weighted skin slot/);
});
test('rigid geometry stays unskinned and malformed influence lengths fail',()=>{
  assert.deepEqual(nativeSkinPalette({...mesh(),boneIDs:[]},nodes,active),[]);
  assert.throws(()=>nativeSkinPalette({...mesh(),skinWeights:[]},nodes,active),/channels/);
});
