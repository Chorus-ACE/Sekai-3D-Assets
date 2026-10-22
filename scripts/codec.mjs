// Registry conversion only. Runtime typed-array extensions are preserved by msgpack.
import fs from 'node:fs';import {createRequire} from 'node:module';import{brotliCompressSync,brotliDecompressSync,constants}from'node:zlib';
const require=createRequire(process.env.HARUKI_ROOT+'/engine/package.json');const{encode,decode,ExtData}=require('@msgpack/msgpack');
const compress=bytes=>brotliCompressSync(bytes,{params:{[constants.BROTLI_PARAM_QUALITY]:5}});
const [op,input,output]=process.argv.slice(2);
if(op==='decode')fs.writeFileSync(output,JSON.stringify(decode(brotliDecompressSync(fs.readFileSync(input)))));
else if(op==='encode')fs.writeFileSync(output,compress(encode(JSON.parse(fs.readFileSync(input)))));
else if(op==='normalize'){
 const walk=x=>{if(x instanceof ExtData||ArrayBuffer.isView(x))return x;if(typeof x==='string'&&x.startsWith(process.env.WORK_ROOT+'/'))return x.slice(process.env.WORK_ROOT.length+1);if(Array.isArray(x))return x.map(walk);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,walk(v)]));return x};
 fs.writeFileSync(output,compress(encode(walk(decode(brotliDecompressSync(fs.readFileSync(input)),{useBigInt64:true})),{useBigInt64:true})));
}else throw Error('Unknown operation');
