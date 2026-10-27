import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crc32} from '../native-character.mjs';
import {nativeMotionTracks} from '../native-motion.mjs';

test('dense Unity translation samples are mirrored once and preserve duration',()=>{
  const clip={m_MuscleClip:{m_StopTime:1,m_Clip:{data:{m_DenseClip:{m_CurveCount:3,m_FrameCount:2,m_SampleRate:1,m_SampleArray:[1,2,3,4,5,6]}}}},m_ClipBindingConstant:{genericBindings:[{path:crc32('Hip'),typeID:4,attribute:1}]}};
  const [track]=nativeMotionTracks(clip,[{path:'body/Position/Hip'}]);
  assert.equal(track.property,'position');assert.deepEqual(track.paths,['body/Position/Hip']);
  assert.deepEqual(track.values.slice(0,3),[-1,2,3]);assert.deepEqual(track.values.slice(-3),[-4,5,6]);
  assert.equal(track.times.at(-1),1);
});

test('constant rotations retain normalized handedness and morphs use Unity percent weights',()=>{
  const nodes=[{path:'face/Face',morphNames:['Smile']}];
  const clip={m_MuscleClip:{m_StopTime:.1,m_Clip:{data:{m_ConstantClip:{data:[0,1,0,1,50]}}}},m_ClipBindingConstant:{genericBindings:[
    {path:crc32('Face'),typeID:4,attribute:2},{path:crc32('Face'),typeID:137,attribute:crc32('blendShape.Smile')}]}};
  const [rotation,morph]=nativeMotionTracks(clip,nodes);
  assert.equal(rotation.property,'quaternion');assert(Math.abs(rotation.values[1]+Math.SQRT1_2)<1e-6);
  assert(Math.abs(Math.hypot(...rotation.values.slice(0,4))-1)<1e-6);
  assert.equal(morph.morphName,'Smile');assert(morph.values.every(value=>value===.5));
});

test('invalid streamed key lengths fail before reading beyond the input',()=>{
  const words=new Uint32Array(2);new DataView(words.buffer).setInt32(4,999999,true);
  assert.throws(()=>nativeMotionTracks({m_MuscleClip:{m_Clip:{data:{m_StreamedClip:{data:[...words]}}}},m_ClipBindingConstant:{genericBindings:[{path:1,typeID:4,attribute:1}]}},[]),/bounds/);
});
