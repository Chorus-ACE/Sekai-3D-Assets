import {crc32} from './native-character.mjs';
export function nativeMotionTracks(clip, nodes) {
  const raw=clip.m_MuscleClip?.m_Clip?.data??clip.m_MuscleClip?.m_Clip;
  const bindings=clip.m_ClipBindingConstant?.genericBindings??[];
  if(!raw||!bindings.length)return [];
  const streamed=raw.m_StreamedClip??{},dense=raw.m_DenseClip??{},constant=raw.m_ConstantClip?.data??[];
  const words=streamed.data??[],buffer=new ArrayBuffer(words.length*4),view=new DataView(buffer);
  words.forEach((v,i)=>view.setUint32(i*4,v,true));
  const curves=new Map();
  for(let p=0;p+8<=view.byteLength;){const time=view.getFloat32(p,true),count=view.getInt32(p+4,true);p+=8;
    if(count<0||count>100000||p+count*20>view.byteLength)throw Error('Invalid streamed animation bounds');
    for(let i=0;i<count;i++,p+=20){const index=view.getInt32(p,true),key={time,coeff:[0,1,2,3].map(j=>view.getFloat32(p+4+j*4,true))};
      if(Number.isFinite(time)){if(!curves.has(index))curves.set(index,[]);curves.get(index).push(key);}}
  }
  const streamCount=streamed.curveCount??0,denseCount=dense.m_CurveCount??0;
  const samples=dense.m_SampleArray??[],frames=dense.m_FrameCount??0,rate=dense.m_SampleRate??30,begin=dense.m_BeginTime??0;
  const duration=Math.min(300,Math.max(.001,clip.m_MuscleClip?.m_StopTime??(begin+Math.max(0,frames-1)/rate)));
  const nodeLookup=new Map();
  for(const n of nodes)for(let i=0,a=n.path.split('/');i<a.length;i++){
    const hash=crc32(a.slice(i).join('/'));if(!nodeLookup.has(hash))nodeLookup.set(hash,[]);nodeLookup.get(hash).push(n);
  }
  function value(index,t){
    if(index<streamCount){const keys=curves.get(index)??[];if(!keys.length)return 0;
      let i=0;while(i+1<keys.length&&keys[i+1].time<=t)i++;
      const key=keys[i],next=keys[i+1];if(!next)return key.coeff[3];
      const x=Math.max(0,Math.min(t,next.time)-key.time);
      return ((key.coeff[0]*x+key.coeff[1])*x+key.coeff[2])*x+key.coeff[3];
    }
    if(index<streamCount+denseCount){const sample=Math.max(0,Math.min(frames-1,(t-begin)*rate)),a=Math.floor(sample),b=Math.min(frames-1,a+1),offset=index-streamCount;
      const left=samples[a*denseCount+offset]??0,right=samples[b*denseCount+offset]??left;return left+(right-left)*(sample-a);}
    return constant[index-streamCount-denseCount]??0;
  }
  const tracks=[];let offset=0;
  for(const binding of bindings){const attribute=binding.attribute,type=binding.typeID??binding.typeId;
    const dimensions=type===4?(attribute===2?4:3):1;
    const matches=nodeLookup.get(binding.path)??[];
    const morph=type===137?matches.flatMap(n=>n.morphNames??[]).find(name=>crc32('blendShape.'+name)===attribute||crc32(name)===attribute):undefined;
    if((type===4&&[1,2,3].includes(attribute))||morph){
      const paths=matches.map(n=>n.path);
      if(paths.length){const times=[],values=[],count=Math.max(1,Math.ceil(duration*30));
        for(let f=0;f<=count;f++){const t=Math.min(duration,f/30);times.push(t);const v=Array.from({length:dimensions},(_,j)=>value(offset+j,t));
          if(morph)v[0]/=100;else if(attribute===1)v[0]*=-1;if(!morph&&attribute===2){v[1]*=-1;v[2]*=-1;const length=Math.hypot(...v)||1;for(let j=0;j<4;j++)v[j]/=length;}
          values.push(...v);
        }
        tracks.push({paths,property:morph?'morph':attribute===1?'position':attribute===2?'quaternion':'scale',morphName:morph,dimensions,times,values});
      }
    }
    offset+=dimensions;
  }
  return tracks;
}
