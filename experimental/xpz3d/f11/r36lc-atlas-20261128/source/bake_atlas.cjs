'use strict';
const fs=require('fs'),zlib=require('zlib'),path=require('path');
const {normal,cross,dot,v3,length,mix,add}=require('./mesh_qem.cjs');
const art=require('./designed_skin_art.cjs');
function clamp(x,a=0,b=1){return Math.max(a,Math.min(b,x))}
function crc(buf){let x=0xFFFFFFFF;for(let i=0;i<buf.length;i++){x^=buf[i];for(let k=0;k<8;k++)x=(x>>>1)^((x&1)?0xedb88320:0);}return (x^0xffffffff)>>>0;}
function chunk(tag,b){const id=Buffer.from(tag,'ascii'),head=Buffer.alloc(8),tail=Buffer.alloc(4);head.writeUInt32BE(b.length);id.copy(head,4);tail.writeUInt32BE(crc(Buffer.concat([id,b])));return Buffer.concat([head,b,tail]);}
function png(image,w,h){const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){image.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);}
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}
function triangleClosest(q,a,b,c){
 const ab=v3(b,a),ac=v3(c,a),ap=v3(q,a);const d1=dot(ab,ap),d2=dot(ac,ap);
 if(d1<=0&&d2<=0)return [a,[1,0,0]];
 const bp=v3(q,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return [b,[0,1,0]];
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0){const t=d1/(d1-d3);return [mix(a,b,t),[1-t,t,0]];}
 const cp=v3(q,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return [c,[0,0,1]];
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0){const t=d2/(d2-d6);return [mix(a,c,t),[1-t,0,t]];}
 const va=d3*d6-d5*d4;if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){const t=(d4-d3)/((d4-d3)+(d5-d6));return [mix(b,c,t),[0,1-t,t]];}
 const div=1/(va+vb+vc),v=vb*div,w=vc*div;return [add(add(a,ab.map(x=>x*v)),ac.map(x=>x*w)),[1-v-w,v,w]];
}
function buildBVH(mesh){
 const {positions,indices,normals,colors}=mesh,triangles=[];
 for(let i=0;i<indices.length;i+=3){
  const ids=indices.slice(i,i+3),p=ids.map(k=>positions[k]);
  const min=[0,1,2].map(c=>Math.min(...p.map(x=>x[c]))),max=[0,1,2].map(c=>Math.max(...p.map(x=>x[c])));
  triangles.push({ids,p,min,max,center:[0,1,2].map(c=>(min[c]+max[c])*.5)});
 }
 function node(indices,depth=0){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const i of indices){const t=triangles[i];for(let k=0;k<3;k++){min[k]=Math.min(min[k],t.min[k]);max[k]=Math.max(max[k],t.max[k]);}}
  const n={min,max};
  if(indices.length<=10||depth>=30){n.indices=indices;return n;}
  const ext=[0,1,2].map(i=>max[i]-min[i]),axis=ext.indexOf(Math.max(...ext));
  indices.sort((a,b)=>triangles[a].center[axis]-triangles[b].center[axis]);
  const mid=indices.length>>1;n.left=node(indices.slice(0,mid),depth+1);n.right=node(indices.slice(mid),depth+1);return n;
 }
 const root=node(triangles.map((_,i)=>i));
 let totalQueries=0,totalTriTests=0;
 function boxDist(p,n){let sum=0;for(let i=0;i<3;i++){const x=p[i]<n.min[i]?n.min[i]-p[i]:p[i]>n.max[i]?p[i]-n.max[i]:0;sum+=x*x;}return sum;}
 function nearest(pos){
  let best=Infinity,out=null;totalQueries++;
  function visit(n){
   if(boxDist(pos,n)>=best)return;
   if(n.indices){for(const id of n.indices){const tri=triangles[id];totalTriTests++;const [q,bary]=triangleClosest(pos,...tri.p);const dis=dot(v3(q,pos),v3(q,pos));
    if(dis<best){best=dis;out={tri,bary,dist:dis,point:q};}
   }}else{const a=boxDist(pos,n.left),b=boxDist(pos,n.right);if(a<b){if(a<best)visit(n.left);if(b<best)visit(n.right);}else{if(b<best)visit(n.right);if(a<best)visit(n.left);}}
  }
  visit(root);if(!out)throw Error('bvh nearest failed');const ids=out.tri.ids,bc=out.bary;
  const highN=normal([0,1,2].map(j=>ids.reduce((s,k,i)=>s+normals[k][j]*bc[i],0)));
  const color=colors?[0,1,2].map(j=>ids.reduce((s,k,i)=>s+colors[k][j]*bc[i],0)):null;
  return {normal:highN,color,dist:out.dist,point:out.point};
 }
 return {nearest,stats:()=>({triangles:triangles.length,queries:totalQueries,tests:totalTriTests})};
}
const encode=x=>Math.round(clamp(x)*255);
const linearToSRGB=x=>x<=0.0031308?12.92*x:1.055*Math.pow(clamp(x),1/2.4)-0.055;
// Project any 2-D atlas texel onto the closed barycentric triangle.
// Orthogonal Euclidean projection avoids collapsing diagonal gutters
// towards a fixed 0.92 simplex radius, which caused edge pixel shifts.
function nearestSimplex(u,v){
 if(u>=0&&v>=0&&u+v<=1)return [u,v];
 const cu=clamp(u),cv=clamp(v),t=clamp((1+u-v)*.5);
 const possibilities=[[cu,0],[0,cv],[t,1-t]];
 let best=Infinity,chosen=null;
 for(const p of possibilities){const d=(u-p[0])**2+(v-p[1])**2;
  if(d<best){best=d;chosen=p;}}
 return chosen;
}
function bake(low,high,{name,folder,size=2048,bodyBVH=null,coreSource=null,artStyle=null,onProgress=null}){
 fs.mkdirSync(folder,{recursive:true});
 const triCount=low.indices.length/3,cols=Math.ceil(Math.sqrt(triCount)),tile=Math.floor(size/cols),pad=Math.max(2,Math.ceil(tile*.05));
 if(tile<12)throw Error('atlas cannot allocate enough pixels for triangles');
 const inputs={positions:[],normals:[],uvs:[],tangents:[],joints:[],weights:[],indices:[]};
 const color=Buffer.alloc(size*size*4),normalData=Buffer.alloc(size*size*4),orm=Buffer.alloc(size*size*4),heightData=Buffer.alloc(size*size*4);
 // Neutral background for unused atlas; per-tile gutters are filled with edge colors.
 for(let i=0;i<normalData.length;i+=4){normalData[i]=128;normalData[i+1]=128;normalData[i+2]=255;normalData[i+3]=255;orm[i]=255;orm[i+1]=220;orm[i+2]=0;orm[i+3]=255;heightData[i]=128;heightData[i+1]=128;heightData[i+2]=128;heightData[i+3]=255;color[i]=197;color[i+1]=162;color[i+2]=121;color[i+3]=255;}
 const bvh=buildBVH(high),start=Date.now();
 // R36KV projects the high-poly floor as a shifted source of form and normals.
 // The creative skin painting remains world-space across triangle UV islands.
 const coreBVH=coreSource?buildBVH({...coreSource,colors:null,positions:coreSource.positions.map(p=>[p[0],p[1]+.020,p[2]+.026])}):null;
 const stats={artStyle:artStyle||'none',sourceBodyTriangles:high.indices.length/3,
  sourceCoreTriangles:coreSource?coreSource.indices.length/3:0,
  artPixels:0,corePixels:0,worldGutterPixels:0,designedInkPixels:0,highlightPixels:0,structuralPixels:0,distinctBaseRGB:new Set(),colorSum:[0,0,0],colorSumSq:[0,0,0]};
 // Body colour is smoothly interpolated at the few surviving core vertices, not
 // raycast again for millions of texels. This avoids redundant source queries.
 const vertexBodyColor=bodyBVH?low.positions.map(p=>bodyBVH.nearest(p).color):null;
 for(let fi=0;fi<triCount;fi++){
  const ids=low.indices.slice(fi*3,fi*3+3),P=ids.map(i=>low.positions[i]),N=ids.map(i=>low.normals[i]),J=ids.map(i=>low.joints[i]),W=ids.map(i=>low.weights[i]);
  const cx=fi%cols,cy=Math.floor(fi/cols),x0=cx*tile,y0=cy*tile,span=tile-2*pad;
  if(span<=0)throw Error('insufficient atlas padding');
  const uvPx=[[x0+pad,y0+pad],[x0+pad+span,y0+pad],[x0+pad,y0+pad+span]];
  const UV=uvPx.map(v=>[v[0]/size,1-v[1]/size]);
  const tangentBase=normal(v3(P[1],P[0]));
  const faceN=normal(cross(v3(P[1],P[0]),v3(P[2],P[0])));
  const T=normal(v3(tangentBase,faceN.map(x=>x*dot(tangentBase,faceN))));
  const sign=dot(cross(faceN,T),v3(P[2],P[0]))>0?-1:1;
  for(let k=0;k<3;k++){const id=inputs.positions.length;inputs.indices.push(id);inputs.positions.push(P[k]);inputs.normals.push(N[k]);inputs.uvs.push(UV[k]);inputs.tangents.push([...T,sign]);inputs.joints.push(J[k]);inputs.weights.push(W[k]);}
  for(let dy=0;dy<tile;dy++){
   const y=y0+dy;if(y>=size)continue;
   for(let dx=0;dx<tile;dx++){
    const x=x0+dx;if(x>=size)continue;
    let b1=(dx+0.5-pad)/span,b2=(dy+0.5-pad)/span;
    // Compute actual texels inside the triangle; duplicate only edge texels
    // into the surrounding square as a cheap mipmap-safe gutter.
    if(b1<0||b2<0||b1+b2>1)continue;
    const b0=1-b1-b2,w=[b0,b1,b2];
    const pos=[0,1,2].map(j=>P.reduce((s,p,k)=>s+p[j]*w[k],0)),ln=normal([0,1,2].map(j=>N.reduce((s,n,k)=>s+n[j]*w[k],0)));
    let t=normal(v3(T,ln.map(z=>z*dot(T,ln))));if(length(t)<1e-9)t=normal(v3(P[1],P[0]));
    const bitangent=cross(ln,t).map(v=>v*sign);
    const sample=bvh.nearest(pos);
    const region=coreBVH?art.coreRegion(pos):0;
    const central=region>.005?coreBVH.nearest(pos):null;
    const centralMix=central&&central.dist<.00065?region*.095:central&&central.dist<.0025?region*.050:0;
    let hn=sample.normal;if(dot(hn,ln)<0)hn=hn.map(v=>-v);
    if(centralMix>0){let cn=central.normal;if(dot(cn,hn)<0)cn=cn.map(v=>-v);
     hn=normal(hn.map((v,k)=>v*(1-centralMix)+cn[k]*centralMix));stats.corePixels++;}
    if(artStyle)hn=normal(hn.map((v,k)=>v*.22+ln[k]*.78));
    let tx=dot(hn,t),ty=dot(hn,bitangent),tz=Math.max(.001,dot(hn,ln));
    const idx=(y*size+x)*4;
    const col=sample.color||(vertexBodyColor?[0,1,2].map(j=>ids.reduce((s,id,k)=>s+vertexBodyColor[id][j]*w[k],0)):[.38,.24,.17]);
    const relief=dot(v3(sample.point,pos),ln);
    const paint=artStyle?art.palette(pos,ln,col,region,relief):null;
    if(paint){if(paint.artLayers?.ink>.012)stats.designedInkPixels++;if(paint.artLayers?.highlight>.025)stats.highlightPixels++;if(Math.abs(paint.artLayers?.structure)>.03)stats.structuralPixels++;tx=clamp(tx,-.17,.17)+paint.pores[0]*.016;ty=clamp(ty,-.17,.17)+paint.pores[1]*.016;
     const sl=Math.hypot(tx,ty);if(sl>.88){tx*=.88/sl;ty*=.88/sl;}
     tz=Math.sqrt(Math.max(.001,1-tx*tx-ty*ty));stats.artPixels++;}
    normalData[idx]=encode(tx*.5+.5);normalData[idx+1]=encode(ty*.5+.5);normalData[idx+2]=encode(tz*.5+.5);normalData[idx+3]=255;
    const rgb=paint?paint.linear:col;
    for(let k=0;k<3;k++){const s=paint?art.colorLinearToSRGB(rgb[k]):linearToSRGB(rgb[k]);color[idx+k]=encode(s);
     stats.colorSum[k]+=s;stats.colorSumSq[k]+=s*s;}
    color[idx+3]=255;
    if(paint)stats.distinctBaseRGB.add((color[idx]>>2)+','+(color[idx+1]>>2)+','+(color[idx+2]>>2));
    const cavity=paint?paint.ao:clamp(.9+Math.min(0,relief)*2.5,.63,1);
    orm[idx]=encode(cavity);orm[idx+1]=encode(paint?paint.rough:name==='body'?.9:.94);orm[idx+2]=0;orm[idx+3]=255;
    const h=encode(.5+relief*11+(paint?paint.pores[0]*.010:0));
    heightData[idx]=h;heightData[idx+1]=h;heightData[idx+2]=h;heightData[idx+3]=255;
   }
  }
  // R36LC: bake albedo + ORM across UV gutters from the SAME bind-space
  // world position on the nearest triangle boundary, rather than copying
  // arbitrary interior texels 1-2 pixels away. This makes adjacent UV
  // islands evaluate the same pigment where their geometry meets.
  for(let dy=0;dy<tile;dy++)for(let dx=0;dx<tile;dx++){
   const origU=(dx+0.5-pad)/span,origV=(dy+0.5-pad)/span;
   if(origU>=0&&origV>=0&&origU+origV<=1)continue;
   const projected=nearestSimplex(origU,origV);
   const u=projected[0],v=projected[1],w=[1-u-v,u,v];
   const pos=[0,1,2].map(j=>P.reduce((acc,p,k)=>acc+p[j]*w[k],0));
   const ln=normal([0,1,2].map(j=>N.reduce((acc,n,k)=>acc+n[j]*w[k],0)));
   const dest=((y0+dy)*size+(x0+dx))*4;
   if(artStyle){
    const pigment=art.palette(pos,ln,null,coreBVH?art.coreRegion(pos):0,0);
    for(let j=0;j<3;j++)color[dest+j]=encode(art.colorLinearToSRGB(pigment.linear[j]));
    color[dest+3]=255;
    orm[dest]=encode(pigment.ao);orm[dest+1]=encode(pigment.rough);
    orm[dest+2]=0;orm[dest+3]=255;
    stats.worldGutterPixels++;
   }
   // Keep high-poly donor detail in normal/height via nearest inward
   // sample; do not flatten the normal map at independent UV boundaries.
   let interiorU=Math.max(0,u),interiorV=Math.max(0,v);
   const limit=1-1.5/span;
   if(interiorU+interiorV>limit){const factor=limit/(interiorU+interiorV);interiorU*=factor;interiorV*=factor;}
   const sx=Math.max(pad,Math.min(tile-pad-1,Math.floor(pad+interiorU*span)));
   const sy=Math.max(pad,Math.min(tile-pad-1,Math.floor(pad+interiorV*span)));
   const from=((y0+sy)*size+(x0+sx))*4;
   for(const map of [normalData,heightData])map.copy(map,dest,from,from+4);
   if(!artStyle)for(const map of [color,orm])map.copy(map,dest,from,from+4);
  }
  if(onProgress&&fi%100===0)onProgress({mesh:name,trianglesDone:fi,trianglesTotal:triCount,elapsedMs:Date.now()-start});
 }
 const paths={};for(const [kind,data]of [['color',color],['normal',normalData],['orm',orm],['relief',heightData]]){const p=path.join(folder,name+'_'+kind+'_'+size+'.png');const bytes=png(data,size,size);fs.writeFileSync(p,bytes);paths[kind]=p;}
 const n=Math.max(1,stats.artPixels);const summary={artStyle:stats.artStyle,sourceBodyTriangles:stats.sourceBodyTriangles,
  sourceCoreTriangles:stats.sourceCoreTriangles,artPixels:stats.artPixels,corePixels:stats.corePixels,worldGutterPixels:stats.worldGutterPixels,designedInkPixels:stats.designedInkPixels,highlightPixels:stats.highlightPixels,structuralPixels:stats.structuralPixels,
  uniquePaletteCells:stats.distinctBaseRGB.size,
  channelMean:stats.colorSum.map(x=>x/n),channelStd:stats.colorSumSq.map((x,k)=>Math.sqrt(Math.max(0,x/n-(stats.colorSum[k]/n)**2)))};
 return {mesh:name,triangles:triCount,atlasPixels:size,grid:cols,tile,pad,elapsedMs:Date.now()-start,sourceBVH:bvh.stats(),artReport:summary,paths,inputs};
}
module.exports={buildBVH,bake,png};

