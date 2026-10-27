import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nativeMotionPlan} from '../native-animation.mjs';

const clip=(name,typeID=4)=>({m_Name:name,m_ClipBindingConstant:{genericBindings:[{typeID}]}});
test('entrance motion precedes the idle loop regardless of source clip order',()=>{
  const plan=nativeMotionPlan([clip('face_loop',137),clip('motion_loop'),clip('face',137),clip('motion')]);
  assert.equal(plan.intro.m_Name,'motion');assert.equal(plan.loop.m_Name,'motion_loop');
  assert.equal(plan.faceIntro.m_Name,'face');assert.equal(plan.faceLoop.m_Name,'face_loop');
});
test('loop-only and one-shot-only resources remain usable without playing a face clip as body motion',()=>{
  const loop=nativeMotionPlan([clip('face',137),clip('motion_loop')]);assert.equal(loop.intro,undefined);assert.equal(loop.loop.m_Name,'motion_loop');
  const intro=nativeMotionPlan([clip('motion'),clip('face_loop',137)]);assert.equal(intro.intro.m_Name,'motion');assert.equal(intro.loop,undefined);
});
