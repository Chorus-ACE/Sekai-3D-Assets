// Adapter from locally decoded Unity data to Haruki's original part composer.
// Positions/bind matrices are mirrored once; prefab transforms stay Unity-space.
const vec = a => ({x:a?.[0]??0,y:a?.[1]??0,z:a?.[2]??0});
const quat = a => ({...vec(a),w:a?.[3]??1});
const mirror = (a,size=3) => (a??[]).map((v,i)=>i%size===0?-v:v);
const pointer = p => p?.m_PathID ?? 0;
const enabled = v => v !== false && v !== 0;
const rgba = a => ({r:a[0],g:a[1],b:a[2],a:a[3]??1});

export function nativeSkinPalette(mesh,nodes,active) {
  const source=mesh.boneIDs??[],matrices=mesh.inverseBindMatrices??[];
  if(!source.length)return [];
  if(matrices.length%16)throw Error('Native inverse-bind palette is malformed');
  const count=matrices.length/16,indices=mesh.skinIndices??[],weights=mesh.skinWeights??[];
  if(indices.length!==weights.length)throw Error('Native skin influence channels do not match');
  const weighted=new Set();
  for(let i=0;i<weights.length;i++){
    const weight=weights[i],slot=indices[i];
    if(!Number.isFinite(weight)||weight<0)throw Error('Native skin influence weight is invalid');
    if(weight>0){
      if(!Number.isInteger(slot)||slot<0||slot>=count||slot>=source.length||!active(nodes.get(source[slot])))throw Error(`Native weighted skin slot ${slot} has no exact prefab bone`);
      weighted.add(slot);
    }
  }
  const fallback=[mesh.rootBoneID,mesh.transformID,...source].find(id=>active(nodes.get(id)));
  return Array.from({length:count},(_,slot)=>{
    // Explicit renderer PPtrs and vertex indices define the actual binding.
    // Stale hashes on unused mesh slots must not override that relationship.
    if(active(nodes.get(source[slot])))return source[slot];
    if(weighted.has(slot)||fallback===undefined)throw Error(`Native skin slot ${slot} has no prefab bone`);
    return fallback;
  });
}

export function nativePrefabNodes(scene, rootName) {
  const nodes=new Map(scene.nodes.map(n=>[n.id,n]));
  const rootOf=node=>{
    const visited=new Set();
    while(node&&node.parentID!=null){
      if(visited.has(node.id))throw Error('Native prefab hierarchy contains a cycle');
      visited.add(node.id);node=nodes.get(node.parentID);
    }
    return node;
  };
  const roots=new Set(scene.meshes.map(m=>rootOf(nodes.get(m.transformID))).filter(n=>n?.path===rootName).map(n=>n.id));
  if(roots.size!==1)throw Error(`Native part requires one ${rootName} prefab instance; found ${roots.size}`);
  const rootID=[...roots][0];
  return node=>!!node&&rootOf(node)?.id===rootID;
}

export function nativePart(entry, scene, sceneURL, height) {
  if (!scene.nodes?.length || !scene.meshes?.length) throw Error('The native part has no prefab geometry');
  const nodes=new Map(scene.nodes.map(n=>[n.id,n]));
  const byId=new Map((scene.behaviours??[]).map(b=>[b.id,b]));
  const nodeRef=id=>{const n=nodes.get(id);return n?{pathId:id,name:n.name,transformPath:n.path}:null};
  const partKind=entry.partType==='body'?'body':'head';
  const activeRoot=entry.partType==='body'?'body':entry.partType==='head_optional'?'optional':'face';
  const active=nativePrefabNodes(scene,activeRoot);
  const transforms=scene.nodes.filter(active).map(n=>({pathId:n.id,name:n.name,transformPath:n.path,poseRoot:n.path.split('/')[0],
    parentPathId:n.parentID??null,childPathIds:scene.nodes.filter(c=>c.parentID===n.id).map(c=>c.id),
    localPosition:vec(n.position),localRotation:quat(n.rotation),localScale:vec(n.scale)}));
  const controllers={},managers=[],bones=[],colliders=[],extraBones=[],colliderBindings=[];
  const behaviours=(scene.behaviours??[]).filter(b=>active(nodes.get(b.nodeID)));
  for(const b of behaviours){
    const n=nodes.get(b.nodeID),d=b.data,base={pathId:b.id,nodeName:n.name,nodePath:n.path,poseRoot:activeRoot,partKind,enabled:enabled(d.m_Enabled),activeSelf:true,activeInHierarchy:true};
    if(b.script==='SekaiCharacterEye')controllers.eye=d;
    if(b.script==='SekaiCharacterHair')controllers.hair={...d,headTransform:nodeRef(pointer(d.headTransform))};
    if(/SpringManager$/.test(b.script))managers.push({...base,...Object.fromEntries(['automaticUpdates','enableLengthLimits','enableAngleLimits','enableCollision','collideWithGround','isSumOfForcesOnBone','isPaused'].filter(k=>k in d).map(k=>[k,enabled(d[k])])),
      groundHeight:d.groundHeight??0,dynamicRatio:d.dynamicRatio??1,simulationFrameRate:d.simulationFrameRate??60,slowMotionScale:d.slowMotionScale??1,bounce:d.bounce??0,friction:d.friction??0,
      rawGravity:d.gravity,bonePathIds:(d.springBones??[]).map(pointer),animatedBoneNames:[],forceProviders:[]});
    if(/^(Sekai)?SpringBone$/.test(b.script))bones.push({...base,hitRadius:d.radius??0,rawStiffnessForce:d.stiffnessForce,rawDragForce:d.dragForce,dragForce:d.dragForce,
      rawSpringForce:d.springForce,rawWindInfluence:d.windInfluence,rawAngularStiffness:d.angularStiffness,rawSpringConstant:d.SpringConstant,
      pivotNodePath:nodeRef(pointer(d.pivotNode))?.transformPath??n.path,pivotSourcePathId:pointer(d.pivotNode)||null,
      rawAngleLimits:{y:d.yAngleLimits?{...d.yAngleLimits,active:enabled(d.yAngleLimits.active)}:null,z:d.zAngleLimits?{...d.zAngleLimits,active:enabled(d.zAngleLimits.active)}:null},lengthLimitTargets:(d.lengthLimitTargets??[]).map(p=>nodeRef(pointer(p))).filter(Boolean),
      directColliderPathIds:[...(d.sphereColliders??[]),...(d.capsuleColliders??[]),...(d.panelColliders??[])].map(pointer),colliderFlag:d.colliderFlag??0});
    if(/^Spring(Sphere|Capsule|Panel)Collider$/.test(b.script))colliders.push({...base,index:colliders.length,scriptName:b.script,
      shape:b.script.includes('Capsule')?{capsule:{offset:[0,0,0],radius:d.radius??0,tail:[0,d.height??0,0]}}:b.script.includes('Panel')?{panel:{width:d.width??0,height:d.height??0}}:{sphere:{offset:[0,0,0],radius:d.radius??0}},linkedRendererEnabled:true});
    if(b.script==='ExtraBone')extraBones.push({...d,pathId:b.id,scriptName:b.script,gameObject:nodeRef(b.nodeID),referenceBone:nodeRef(pointer(d.referenceBone)),raw:d});
  }
  for(const b of bones)colliderBindings.push({sourceKind:'direct',partKind,sourceSpringBonePathId:b.pathId,sourceColliderPathIds:b.directColliderPathIds,
    colliders:colliders.filter(c=>b.directColliderPathIds.includes(c.pathId)).map(c=>c.index)});
  const materials=scene.materials,materialSlots=[];
  const meshes=scene.meshes.filter(mesh=>active(nodes.get(mesh.transformID))).map((mesh,meshIndex)=>{
    const transform=nodes.get(mesh.transformID);
    if(!transform)throw Error('Native renderer transform is missing');
    const submeshes=mesh.groups.map((group,slotIndex)=>{
      const m=materials[group.material];if(!m)throw Error('Native material slot is missing');
      const key=`local:${entry.id}:${group.material}`,name=m.name.toLowerCase();
      const kind=entry.partType==='body'?(name.includes('skin')?'skin':'body'):
        entry.partType==='head_optional'?'accessory':name.includes('eyelash')?'eyelash':name.includes('eyebrow')?'eyebrow':/(eye_highlight|_ehl_)/.test(name)?'eyelight':name.includes('_eye')?'eye':name.includes('_hair_')?'hair':name.includes('_acc_')?'accessory':m.textures?._FaceShadowTex?'face_sdf':'face';
      const tex=Object.fromEntries(Object.entries(m.textures??{}).map(([k,v])=>[k,new URL(v,sceneURL).href]));
      const floats=m.floats??{},colors=m.colors??{};
      const textureProperties=Object.entries(tex).map(([name,uri])=>{const st=m.textureTransforms?.[name]??[1,1,0,0];return {name,uri,textureFileId:0,texturePathId:0,scaleX:st[0],scaleY:st[1],offsetX:st[2],offsetY:st[3],wrapU:0,wrapV:0,filterMode:1,anisoLevel:1,colorSpace:1};});
      materialSlots.push({part:partKind,meshName:mesh.name,slotIndex,materialKey:key,materialFileId:0,materialPathId:group.material+1,materialName:m.name,materialKind:kind,
        mainTex:tex._MainTex,shadowTex:tex._ShadowTex,valueTex:tex._ValueTex,faceShadowTex:tex._FaceShadowTex,mode:kind==='face_sdf'?'sdf':'layer',
        isAccessory:entry.partType==='head_optional',shaderPipeline:partKind==='body'?'body':kind==='face_sdf'?'face':'layer',
        rawMaterial:{textureProperties,colorProperties:Object.entries(colors).map(([name,a])=>({name,...rgba(a)})),floatProperties:Object.entries(floats).map(([name,value])=>({name,value})),intProperties:[],validKeywords:m.validKeywords??[],invalidKeywords:m.invalidKeywords??[],customRenderQueue:-1,stringTags:{},disabledShaderPasses:[]}});
      const indices=mesh.indices.slice(group.start,group.start+group.count);
      for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
      return {slotIndex,materialKey:key,materialFileId:0,materialPathId:group.material+1,materialName:m.name,indices,start:group.start,count:group.count};
    });
    const boneIDs=nativeSkinPalette(mesh,nodes,active);
    const inverses=(mesh.inverseBindMatrices??[]).map((v,i)=>((i%16)%4===0)!==(Math.floor((i%16)/4)===0)?-v:v);
    const morphTargets=(mesh.morphTargets??[]).map(m=>({...m,hasTangentDeltas:false,tangentDeltas:[],positionDeltas:mirror(m.positionDeltas),normalDeltas:mirror(m.normalDeltas)}));
    return {partKind,meshPath:transform.path,meshName:mesh.name,rendererPathId:meshIndex+100000,
      rendererTransformPathId:mesh.transformID,rendererTransformPath:transform.path,rootBonePathId:mesh.rootBoneID??mesh.boneIDs?.[0],rootBonePath:nodes.get(mesh.rootBoneID??mesh.boneIDs?.[0])?.path,bonePathIds:boneIDs,bonePaths:boneIDs.map(id=>nodes.get(id)?.path??''),
      boneInverseBindMatrices:inverses,submeshes,positions:mirror(mesh.positions),normals:mirror(mesh.normals),tangents:(mesh.tangents??[]).map((v,i)=>(i%4===0||i%4===3)?-v:v),uv0:mesh.uv,uv1:mesh.uv1??[],uv2:mesh.uv2??[],colors:mesh.colors??[],skinIndices:(mesh.skinIndices??[]).map((slot,i)=>(mesh.skinWeights?.[i]??0)>0?slot:0),skinWeights:mesh.skinWeights??[],morphTargets};
  });
  const graph={version:1,partKind,transforms,gameObjects:[],renderers:meshes.map(m=>({pathId:m.rendererPathId,typeName:m.bonePathIds.length?"SkinnedMeshRenderer":"MeshRenderer",transformPathId:m.rendererTransformPathId,transformPath:m.rendererTransformPath})),
    monoBehaviours:behaviours.map(b=>({pathId:b.id,scriptName:b.script,transformPath:nodes.get(b.nodeID)?.path,enabled:enabled(b.data.m_Enabled)})),constraints:[],animators:[]};
  const adjustments={};
  for(const b of behaviours){const dict=b.data?._faceIdAccessoryTransformDict;if(dict)for(let i=0;i<(dict.m_Keys??[]).length;i++){
    const value=dict.m_Values[i];adjustments[dict.m_Keys[i]]={position:value?.position??value?._position,rotationEulerDegrees:value?.rotation??value?._rotation,scale:value?.scale??value?._scale};
  }}
  const packagePath='native/'+encodeURIComponent(entry.id)+'/';
  return {version:'0414',packagePath,part:entry,mount:{attachNode:entry.attachNode??'Head',accessoryTransformAdjustments:adjustments},
    manifest:{characterHeightMeters:height,source:{meshUrl:'native://geometry'},proxy:{bodyColor:'#ffffff',shadowColor:'#ffffff',bodyScale:1,torsoLength:.5,shoulderWidth:.3,faceColor:'#ffffff',faceShadeColor:'#ffffff',hairColor:'#ffffff',hairShadowColor:'#ffffff',headRadius:.1,faceDepth:.1,hairArc:1}},
    nativeMeshes:{version:'0414',meshes,warnings:[]},materialSlots,textureRoles:[],characterTextures:{},characterControllers:controllers,
    springBone:{prefabGraph:graph,managers,bones,extraBones,colliders,colliderBindings,managerColliderCaches:[],activeRootProfile:{activeRoots:[activeRoot]},constraintSetup:{version:'0414',constraints:[],warnings:[]},warnings:[]},
    morphChannelBindings:meshes.flatMap(m=>m.morphTargets.map(t=>({name:t.name,sourceName:t.name,nameHash:crc32(t.name),curveHash:crc32('blendShape.'+t.name)}))),warnings:[]};
}
export function crc32(text){let c=0xffffffff;for(const byte of new TextEncoder().encode(text)){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
