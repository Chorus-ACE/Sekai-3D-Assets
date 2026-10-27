import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import { attachViewerInteractions } from '../interactions.mjs';
import { viewerStrings } from '../localization.mjs';
setMaxListeners(0);
class Canvas extends EventTarget {
  clientWidth=600;clientHeight=800;dataset={};style={};captures=new Set();
  ownerDocument={defaultView:new EventTarget()};
  focus() { this.focused=true; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
}
function fixture() {
  const canvas=new Canvas(),applied={};
  const runtime={setViewYawDegrees:v=>applied.yaw=v,setViewZoom:v=>applied.zoom=v,setViewHeightOffset:v=>applied.height=v};
  const controls=attachViewerInteractions(canvas,runtime);controls.setEnabled(true);
  const send=(type,props={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:1,pointerType:'mouse',button:0,clientX:0,clientY:0},props);canvas.dispatchEvent(event);return event;};
  return {canvas,controls,send,applied};
}
test('drag rotates the view and pans vertically without altering the rig',()=>{
  const f=fixture();f.send('pointerdown',{clientX:100,clientY:100});f.send('pointermove',{clientX:200,clientY:180});
  assert.equal(f.applied.yaw,-60);assert.equal(f.applied.height,.2);assert.equal(f.canvas.focused,true);
  f.send('pointerup');assert.equal(f.canvas.captures.size,0);f.controls.dispose();
});
test('pinch zooms, lifting one finger continues without a jump',()=>{
  const f=fixture();f.send('pointerdown',{pointerType:'touch',clientX:100,clientY:100});
  f.send('pointerdown',{pointerId:2,pointerType:'touch',clientX:200,clientY:100});
  f.send('pointermove',{pointerId:2,pointerType:'touch',clientX:300,clientY:100});assert.equal(f.applied.zoom,2);
  f.send('pointerup',{pointerId:2});f.send('pointermove',{clientX:110,clientY:100});assert.equal(f.applied.yaw,-6);
  f.controls.dispose();
});
test('wheel and Safari trackpad pinch stay within the engine framing limits',()=>{
  const f=fixture();assert.equal(f.send('wheel',{deltaY:-100000,deltaMode:0}).defaultPrevented,true);
  for(let i=0;i<5;i++)f.send('wheel',{deltaY:-100000,deltaMode:0});assert.equal(f.applied.zoom,3);
  f.send('gesturestart');f.send('gesturechange',{scale:.01});assert.equal(f.applied.zoom,.5);
  f.send('pointerdown');f.send('pointermove',{clientY:10000});assert.equal(f.applied.height,.8);
  f.send('pointermove',{clientY:-10000});assert.equal(f.applied.height,-.5);f.controls.dispose();
});
test('cancel, blur, disabled controls and disposal stop stale input',()=>{
  const f=fixture();f.send('pointerdown');f.send('pointercancel');f.send('pointermove',{clientX:50});assert.deepEqual(f.applied,{});
  f.send('pointerdown');f.canvas.ownerDocument.defaultView.dispatchEvent(new Event('blur'));f.send('pointermove',{clientX:50});assert.deepEqual(f.applied,{});
  f.controls.setEnabled(false);f.send('wheel',{deltaY:-10,deltaMode:0});assert.deepEqual(f.applied,{});
  f.controls.setEnabled(true);f.controls.dispose();f.send('pointerdown');f.send('pointermove',{clientX:50});assert.deepEqual(f.applied,{});
});
test('keyboard controls and reset restore the original framing',()=>{
  const f=fixture();f.send('keydown',{key:'ArrowRight'});f.send('keydown',{key:'+'});
  assert.equal(f.applied.yaw,-15);assert.equal(f.applied.zoom,1.2);
  f.send('keydown',{key:'Home'});assert.deepEqual(f.controls.getState(),{yaw:0,zoom:1,height:0});
  f.send('keydown',{key:'ArrowLeft',metaKey:true});assert.equal(f.applied.yaw,0);f.controls.dispose();
});
test('viewer localization follows the App language and keeps both Chinese scripts',()=>{
  assert.ok(viewerStrings('zh-Hans-CN').values['viewer.canvas'].includes('重置视角'));
  assert.ok(viewerStrings('zh-TW').values['viewer.canvas'].includes('重設視角'));
  assert.equal(viewerStrings('ja-JP').language,'ja');assert.equal(viewerStrings('fr').language,'en');
});

test('double click suppresses browser zoom and leaves the model framing unchanged',()=>{
  const f=fixture();f.send('keydown',{key:'ArrowRight'});f.send('keydown',{key:'+'});
  const before=f.controls.getState();assert.equal(f.send('dblclick').defaultPrevented,true);
  assert.deepEqual(f.controls.getState(),before);f.controls.dispose();
});
