// Lossless binary transport for the same exact-resource label numbering.
// Header + aligned, little-endian typed arrays. No JSON numeric-array parsing.
const MAGIC="XPZEX001";
const align8=n=>Math.ceil(n/8)*8;
const types={stateMeta:Uint32Array,stateStats:Int16Array,labelMeta:Uint32Array,labelCodes:Float64Array,resourceMeta:Uint32Array,resourceCodes:Float64Array};
const integer=(v,min,max)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw Error("Exact packed integer range: "+v);return v;};
function lengths(a){
 const n=a.metrics.states,l=a.metrics.labels,r=a.metrics.distinctMultisets,k=a.stats.length;
 return {stateMeta:n,stateStats:n*3*k,labelMeta:l*3,labelCodes:l,resourceMeta:r*7,resourceCodes:r};
}
function layout(a,start){
 const result={};let end=start;
 for(const [key,length] of Object.entries(lengths(a))){
  end=align8(end);result[key]={offset:end,length};
  end+=length*types[key].BYTES_PER_ELEMENT;
 }
 return {result,end};
}
export function packExactResourceIndex(a,originalSha256){
 const {states,labels,resources,...meta}=a;
 const header=new TextEncoder().encode(JSON.stringify({...meta,transportFormat:MAGIC,originalSha256}));
 const start=align8(12+header.length),{result,end}=layout(meta,start);
 const out=new Uint8Array(end);out.set(new TextEncoder().encode(MAGIC));new DataView(out.buffer).setUint32(8,header.length,true);out.set(header,12);
 const v=Object.fromEntries(Object.entries(result).map(([key,x])=>[key,new types[key](out.buffer,x.offset,x.length)]));
 const K=a.stats.length,S=a.stateStride,L=a.labelStride,R=a.resourceStride;
 for(let n=0;n<a.metrics.states;n++){
  const i=n*S,j=n*3*K;
  v.stateMeta[n]=integer(states[i],0,0x7fffffff)*2+integer(states[i+1],0,1);
  for(let k=0;k<3*K;k++)v.stateStats[j+k]=integer(states[i+2+k],-32768,32767);
 }
 for(let n=0;n<a.metrics.labels;n++){
  const i=n*L,j=n*3;
  v.labelMeta[j]=integer(labels[i],0,a.metrics.states-1);
  v.labelMeta[j+1]=integer(labels[i+1],0,a.metrics.distinctMultisets-1);
  v.labelCodes[n]=integer(labels[i+2],0,Number.MAX_SAFE_INTEGER);
  v.labelMeta[j+2]=integer(labels[i+3],0,0xffffffff);
 }
 for(let n=0;n<a.metrics.distinctMultisets;n++){
  const i=n*R,j=n*7;
  v.resourceCodes[n]=integer(resources[i],0,Number.MAX_SAFE_INTEGER);
  for(let k=0;k<7;k++)v.resourceMeta[j+k]=integer(resources[i+1+k],0,0xffffffff);
 }
 return out;
}
export function unpackExactResourceIndex(bytes,originalSha256){
 if(bytes.byteOffset%8)bytes=Uint8Array.from(bytes);
 if(new TextDecoder().decode(bytes.subarray(0,8))!==MAGIC||bytes.length<12)throw Error("전체 상태 바이너리 형식 오류");
 const n=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(8,true);
 if(n>bytes.length-12)throw Error("전체 상태 바이너리 헤더 오류");
 const meta=JSON.parse(new TextDecoder().decode(bytes.subarray(12,12+n)));
 if(meta.transportFormat!==MAGIC||meta.originalSha256!==originalSha256)throw Error("전체 상태 바이너리 원본 해시 불일치");
 const {result,end}=layout(meta,align8(12+n));
 if(end!==bytes.length)throw Error("전체 상태 바이너리 길이 오류");
 return {...meta,packed:Object.fromEntries(Object.entries(result).map(([key,x])=>[key,new types[key](bytes.buffer,bytes.byteOffset+x.offset,x.length)]))};
}
export function exactColumns(a){
 const p=a.packed,K=a.stats.length,S=a.stateStride,L=a.labelStride,R=a.resourceStride;
 return p?{
  stateCount:p.stateMeta.length,labelCount:p.labelCodes.length,resourceCount:p.resourceCodes.length,
  mask:n=>Math.floor(p.stateMeta[n]/2),random:n=>p.stateMeta[n]&1,
  stat:(n,k)=>p.stateStats[n*3*K+k],vector:(n,offset)=>Array.from(p.stateStats.subarray(n*3*K+offset,n*3*K+offset+K)),
  node:l=>p.labelMeta[l*3],rid:l=>p.labelMeta[l*3+1],code:l=>p.labelCodes[l],growth:l=>p.labelMeta[l*3+2],
  resCode:r=>p.resourceCodes[r],res:(r,k)=>p.resourceMeta[r*7+k-1]
 }:{
  stateCount:a.states.length/S,labelCount:a.labels.length/L,resourceCount:a.resources.length/R,
  mask:n=>a.states[n*S],random:n=>a.states[n*S+1],
  stat:(n,k)=>a.states[n*S+2+k],vector:(n,offset)=>a.states.slice(n*S+2+offset,n*S+2+offset+K),
  node:l=>a.labels[l*L],rid:l=>a.labels[l*L+1],code:l=>a.labels[l*L+2],growth:l=>a.labels[l*L+3],
  resCode:r=>a.resources[r*R],res:(r,k)=>a.resources[r*R+k]
 };
}
