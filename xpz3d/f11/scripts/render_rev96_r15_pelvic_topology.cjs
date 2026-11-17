'use strict';
const fs=require('fs'),path=require('path'),root=__dirname,buf=fs.readFileSync(path.join(root,'r21AO-F11-user101-core-rounded-fairing-r13.glb')),jl=buf.readUInt32LE(12),doc=JSON.parse(buf.toString('utf8',20,20+jl)),binary=buf.subarray(28+jl,28+jl+buf.readUInt32LE(20+jl));
const sizes={5121:1,5123:2,5125:4,5126:4},ops={5121:'readUInt8',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'},dims={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function read(id){const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n=dims[a.type],sz=sizes[a.componentType],offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*sz,rows=[];for(let i=0;i<a.count;i++){const x=[];for(let k=0;k<n;k++)x.push(binary[ops[a.componentType]](offset+i*stride+k*sz));rows.push(n===1?x[0]:x);}return rows;}
const pp=doc.meshes[0].primitives,specs=[{pi:0,color:'#414141',name:'Torso border'},{pi:13,color:'#2589a9',name:'Core anatomy border'},{pi:17,color:'#a779ae',name:'Left skin'},{pi:18,color:'#9b5a77',name:'Right skin'},{pi:21,color:'#c88a2e',name:'Pelvic skin'}];
function data(pi){const p=pp[pi],P=read(p.attributes.POSITION),I=read(p.indices),E=new Map();for(let i=0;i<I.length;i+=3)for(const [a,b] of [[I[i],I[i+1]],[I[i+1],I[i+2]],[I[i+2],I[i]]]){const k=a<b?a+':'+b:b+':'+a,row=E.get(k)||{a,b,n:0};row.n++;E.set(k,row);}return {P,I,borders:[...E.values()].filter(e=>e.n===1)};}
const parts=Object.fromEntries([0,13,17,18,21].map(pi=>[pi,data(pi)]));
let s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 660" width="1800" height="660"><rect width="1800" height="660" fill="#f7f8fa"/><text x="25" y="32" font-family="Arial" font-size="21" font-weight="bold">rev96 r13: pelvis surface boundary topology (physical rest pose)</text>';
for(let panel=0;panel<3;panel++){
 const axes=[[0,1],[1,2],[0,2]][panel],rect=[panel*595+12,48,570,565];
 s+='<rect x="'+rect[0]+'" y="'+rect[1]+'" width="'+rect[2]+'" height="'+rect[3]+'" fill="white" stroke="#bdc5cc"/><text x="'+(rect[0]+15)+'" y="72" font-family="Arial" font-size="17">'+['XY (top-down)','YZ (side)','XZ (front)'][panel]+'</text>';
 const [ix,iy]=axes,domainX=ix===0?[-.19,.19]:[-.16,.16],domainY=iy===1?[-.16,.16]:[.70,.99];
 const coord=P=>[rect[0]+25+(P[ix]-domainX[0])/(domainX[1]-domainX[0])*(rect[2]-50),rect[1]+rect[3]-30-(P[iy]-domainY[0])/(domainY[1]-domainY[0])*(rect[3]-90)];
 function pathPts(P,a,b){const p=coord(P[a]),q=coord(P[b]);return 'M'+p[0].toFixed(2)+','+p[1].toFixed(2)+'L'+q[0].toFixed(2)+','+q[1].toFixed(2);}
 const tr=parts[13];
 for(let t=491;t<tr.I.length/3;t++){const tri=tr.I.slice(3*t,3*t+3),points=tri.map(id=>coord(tr.P[id]));s+='<polyline points="'+points.map(x=>x.map(v=>v.toFixed(1)).join(',')).join(' ')+'" stroke="#d09a68" stroke-opacity=".22" fill="none" stroke-width=".8"/>';}
 for(const spec of specs){const obj=parts[spec.pi];s+='<path d="'+obj.borders.filter(v=>[v.a,v.b].some(id=>Math.abs(obj.P[id][0])<.18&&obj.P[id][2]>.70&&obj.P[id][2]<.99)).map(e=>pathPts(obj.P,e.a,e.b)).join('')+'" fill="none" stroke="'+spec.color+'" stroke-width="'+(spec.pi===0?2.5:1.3)+'" stroke-opacity=".85"/>';}
 for(const def of [{pi:0,ids:[29,174,296,306,214,75,216,78,221,82,83,215,222]},{pi:13,ids:[340,568,342,506,510,348]}]){
  const P=parts[def.pi].P;for(const id of def.ids){const pos=coord(P[id]);s+='<circle cx="'+pos[0].toFixed(2)+'" cy="'+pos[1].toFixed(2)+'" r="2.6" fill="'+(def.pi===0?'#333':'#1280ad')+'"/><text x="'+(pos[0]+4).toFixed(2)+'" y="'+(pos[1]-4).toFixed(2)+'" font-family="Arial" font-size="10" fill="'+(def.pi===0?'#333':'#1280ad')+'">'+id+'</text>';}}
 for(let i=0;i<6;i++){let v=domainX[0]+i*(domainX[1]-domainX[0])/5,x=rect[0]+25+i*(rect[2]-50)/5;s+='<path d="M'+x+','+(rect[1]+85)+'V'+(rect[1]+rect[3]-30)+'" stroke="#cdd5dd" stroke-width=".55"/><text x="'+x+'" y="'+(rect[1]+rect[3]-12)+'" font-size="11" fill="#666" text-anchor="middle">'+v.toFixed(2)+'</text>';}
}
s+='<text x="20" y="648" font-family="Arial" font-size="14" fill="#444">Gray: native body border · teal: original core boundary · orange: added r13 core triangles · purple: lateral skin boundaries</text></svg>';
fs.writeFileSync(path.join(root,'rev96-r15-pelvic-edges.svg'),s,{flag:'wx'});
(async()=>{const {chromium}=require('D:/xpiratez-data-atlas/node_modules/playwright-core');const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});const p=await b.newPage({viewport:{width:1800,height:660},deviceScaleFactor:1});await p.goto('file:///'+path.join(root,'rev96-r15-pelvic-edges.svg').replace(/\\/g,'/'));await p.screenshot({path:path.join(root,'rev96-r15-pelvic-edges.png')});await b.close();console.log('Created pelvis boundary map')})().catch(e=>{console.error(e);process.exitCode=1});
