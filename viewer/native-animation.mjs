import {nativeMotionTracks} from './native-motion.mjs';

export function nativeMotionPlan(clips) {
  const poses=clips.filter(c=>c.m_ClipBindingConstant?.genericBindings?.some(b=>(b.typeID??b.typeId)===4));
  const intro=poses.find(c=>/^motion$/i.test(c.m_Name))??poses.find(c=>!/(?:idle|wait|loop)/i.test(c.m_Name));
  const loop=poses.find(c=>/^motion_loop$/i.test(c.m_Name))??poses.find(c=>/(?:idle|wait|loop)/i.test(c.m_Name));
  return {intro,loop,faceIntro:clips.find(c=>/^face$/i.test(c.m_Name)),faceLoop:clips.find(c=>/^face_loop$/i.test(c.m_Name))};
}

// Unity's preview motion contains a one-shot entrance and a separate idle loop.
// Keep body and face on the same action timeline, including across part switches.
export function createNativeMotionPlayer(THREE,root,clips,nodes,byPath,resume=null) {
  const plan=nativeMotionPlan(clips);
  const build=(source,face)=>{
    if(!source)return null;
    const tracks=[],seen=new Set();
    for(const track of [source,face].filter(Boolean).flatMap(clip=>nativeMotionTracks(clip,nodes)))for(const path of track.paths)for(const target of byPath.get(path)??[]){
      if(track.property==='morph'){
        target.traverse(node=>{const index=node.morphTargetDictionary?.[track.morphName];if(index!==undefined){const key=node.uuid+'.morphTargetInfluences['+index+']';if(!seen.has(key)){seen.add(key);tracks.push(new THREE.NumberKeyframeTrack(key,track.times,track.values));}}});
        continue;
      }
      const key=target.uuid+'.'+track.property;if(seen.has(key))continue;seen.add(key);
      tracks.push(track.property==='quaternion'?new THREE.QuaternionKeyframeTrack(key,track.times,track.values):new THREE.VectorKeyframeTrack(key,track.times,track.values));
    }
    if(!tracks.length)return null;
    const duration=source.m_MuscleClip?.m_StopTime;
    return new THREE.AnimationClip(source.m_Name,Number.isFinite(duration)&&duration>0?duration:-1,tracks);
  };
  const intro=build(plan.intro,plan.faceIntro),loop=build(plan.loop,plan.faceLoop);
  if(!intro&&!loop)return null;
  const mixer=new THREE.AnimationMixer(root);
  const introAction=intro?mixer.clipAction(intro).setLoop(THREE.LoopOnce,1):null;
  if(introAction)introAction.clampWhenFinished=true;
  const loopAction=loop?mixer.clipAction(loop).setLoop(THREE.LoopRepeat,Infinity):null;
  const compatible=resume?.introName===(intro?.name??null)&&resume?.loopName===(loop?.name??null);
  let phase=introAction?'intro':'loop',pendingLoop=false;
  if(compatible&&loopAction&&resume.phase==='loop')phase='loop';
  if(compatible&&introAction&&!loopAction&&resume.phase==='ended')phase='ended';
  let active=phase==='loop'?loopAction:introAction;
  active.reset().play();
  if(compatible&&Number.isFinite(resume.time)&&resume.time>=0){
    active.time=phase==='loop'?resume.time%loop.duration:Math.min(resume.time,intro.duration);
    if(phase==='ended')active.paused=true;
  }
  const finished=event=>{if(event.action===introAction){if(loopAction)pendingLoop=true;else phase='ended';}};
  mixer.addEventListener('finished',finished);
  mixer.update(0);
  return {
    trackCount:(intro?.tracks.length??0)+(loop?.tracks.length??0),
    update(delta){
      mixer.update(delta);
      if(pendingLoop){pendingLoop=false;introAction.stop();active=loopAction.reset().play();phase='loop';mixer.update(0);}
    },
    getState:()=>({phase,time:active.time,introName:intro?.name??null,loopName:loop?.name??null,introDuration:intro?.duration??0,loopDuration:loop?.duration??0,clipName:active.getClip().name}),
    dispose(){mixer.removeEventListener('finished',finished);mixer.stopAllAction();mixer.uncacheRoot(root);},
  };
}
