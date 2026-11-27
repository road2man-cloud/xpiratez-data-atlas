'use strict';
const fs=require('fs'),crypto=require('crypto');
const clone=x=>JSON.parse(JSON.stringify(x));
const dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const funcs={5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'};
function load(file){
 const raw=fs.readFileSync(file);if(raw.toString('ascii',0,4)!=='glTF'||raw.readUInt32LE(4)!==2||raw.readUInt32LE(8)!==raw.length)throw Error('GLB invalid '+file);
 let ptr=12,g=null,bin=null;
 while(ptr<raw.length){const n=raw.readUInt32LE(ptr),typ=raw.toString('ascii',ptr+4,ptr+8);
 if(typ==='JSON')g=JSON.parse(raw.toString('utf8',ptr+8,ptr+8+n));
 if(typ==='BIN\0')bin=raw.subarray(ptr+8,ptr+8+n);
 ptr+=n+8;
 }if(!g||!bin||ptr!==raw.length)throw Error('Missing GLB sections');
 return {file,raw,g,bin,sha:crypto.createHash('sha256').update(raw).digest('hex')};
}
function values(q,id){
 const a=q.g.accessors[id],v=q.g.bufferViews[a.bufferView];if(!a||!v||a.sparse)throw Error('unsupported accessor '+id);
 const d=dims[a.type],s=sizes[a.componentType],method=funcs[a.componentType],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||d*s;
 if(!method||!d||off+(a.count-1)*stride+d*s>q.bin.length)throw Error('invalid accessor bounds '+id);
 const norm=a.normalized&&a.componentType!==5126;
 const max=s===1?255:s===2?65535:4294967295;
 return Array.from({length:a.count},(_,i)=>Array.from({length:d},(_,k)=>{const z=q.bin[method](off+i*stride+k*s);return norm?z/max:z}));
}
function extract(q,mi,pi){
 const p=q.g.meshes[mi].primitives[pi],a=p.attributes,n=values(q,a.POSITION).length;
 const positions=values(q,a.POSITION),normals=a.NORMAL==null?Array.from({length:n},()=>[0,0,1]):values(q,a.NORMAL);
 const uvs=a.TEXCOORD_0==null?Array.from({length:n},()=>[0,0]):values(q,a.TEXCOORD_0);
 const colors=a.COLOR_0==null?null:values(q,a.COLOR_0);
 const joints=a.JOINTS_0==null?Array.from({length:n},()=>[0,0,0,0]):values(q,a.JOINTS_0);
 const weights=a.WEIGHTS_0==null?Array.from({length:n},()=>[1,0,0,0]):values(q,a.WEIGHTS_0);
 const indices=values(q,p.indices).map(v=>v[0]);
 return {positions,normals,uvs,colors,joints,weights,indices,mat:p.material??-1,mesh:mi,primitive:pi};
}
class Builder{
 constructor(q){this.g=clone(q.g);this.parts=[Buffer.from(q.bin)];this.size=q.bin.length;this.baseSource=q.sha;}
 push(bytes){if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);const pad=(4-this.size%4)%4;if(pad){this.parts.push(Buffer.alloc(pad));this.size+=pad;}const off=this.size;this.parts.push(bytes);this.size+=bytes.length;return off}
 appendView(bytes,target){const off=this.push(bytes),i=this.g.bufferViews.length;let v={buffer:0,byteOffset:off,byteLength:bytes.length};if(target)v.target=target;this.g.bufferViews.push(v);return i}
 addAccessor(rows,type,comp=5126,target){const cols=dims[type],flat=Array.isArray(rows[0])?rows.flat():rows;if(flat.length%cols)throw Error('row shape mismatch');
 const bytes=Buffer.alloc(flat.length*sizes[comp]);
 for(let i=0;i<flat.length;i++){const val=flat[i];if(comp===5126)bytes.writeFloatLE(val,i*4);
 else if(comp===5123)bytes.writeUInt16LE(val,i*2);
 else if(comp===5125)bytes.writeUInt32LE(val,i*4);
 else throw Error('unsupported write component type');}
 const buf=this.appendView(bytes,target);const o={bufferView:buf,componentType:comp,count:flat.length/cols,type};
 if(type==='VEC3'&&target===34962&&comp===5126){o.min=[0,1,2].map(c=>Math.min(...rows.map(v=>v[c])));o.max=[0,1,2].map(c=>Math.max(...rows.map(v=>v[c])));}
 const id=this.g.accessors.length;this.g.accessors.push(o);return id;
 }
 addImage(name,bytes){const bv=this.appendView(bytes);const i=(this.g.images??=[]).length;this.g.images.push({name,mimeType:'image/png',bufferView:bv});return i}
 addTexture(name,bytes){const source=this.addImage(name,bytes),id=(this.g.textures??=[]).length;this.g.textures.push({name,source,sampler:0});return id}
 save(file){this.g.buffers[0].byteLength=this.size;const json=Buffer.from(JSON.stringify(this.g),'utf8'),jp=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const b=Buffer.concat(this.parts);const bp=Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);
 const out=Buffer.allocUnsafe(28+jp.length+bp.length);out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jp.length,12);out.write('JSON',16);jp.copy(out,20);
 const k=20+jp.length;out.writeUInt32LE(bp.length,k);out.write('BIN\0',k+4,'binary');bp.copy(out,k+8);
 fs.writeFileSync(file,out);
 return {file,bytes:out.length,sha:crypto.createHash('sha256').update(out).digest('hex')};
 }
}
module.exports={load,values,extract,Builder};
