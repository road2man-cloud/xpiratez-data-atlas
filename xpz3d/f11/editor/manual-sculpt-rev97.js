'use strict';
// XPZ3D manual per-region sculpt — all zero defaults retain the source GLB.
// Core/side/body edits are previewed before 63-bone skinning and can be baked into an independent GLB.
(()=>{
const mm=x=>x/1000,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),sm=(a,b,x)=>{const t=clamp((x-a)/Math.max(1e-9,b-a));return t*t*(3-2*t);},rad=v=>v*Math.PI/180;
const field=(id,title,min,max,step=1,unit='mm',initial=0,description='')=>({id,title,min,max,step,unit,initial,description});
const groups=[
{id:'body',label:'① 몸통 하단·골반 피부',note:'몸통·인접 연결 경계 연동',fields:[
 field('dx','몸통 좌우 이동',-30,30,.5),field('dy','몸통 전후 이동',-35,35,.5),field('dz','몸통 높이',-35,35,.5),
 field('width','골반 하단 폭',-45,45,1,'%'),field('height','세로 비율',-35,35,1,'%'),
 field('bulge','전방 볼륨',-30,30,.5),field('tuck','하단 후퇴',-30,30,.5),
 field('upperY','상부 전후',-30,30,.5),field('lowerY','하부 전후',-30,30,.5),
 field('upperZ','상부 높이',-25,25,.5),field('lowerZ','하부 높이',-25,25,.5),
 field('leftZ','왼쪽 몸통 높이',-20,20,.5),field('rightZ','오른쪽 몸통 높이',-20,20,.5),
 field('pitch','몸통 전후 회전',-25,25,.5,'°'),field('yaw','몸통 수평 회전',-25,25,.5,'°'),
 field('radius','영향 반경',65,210,1,'mm',145),field('feather','몸통 완충 폭',5,70,1,'mm',32),
 field('openX','벌림 전용 좌우',-20,20,.5),field('openY','벌림 전용 전후',-20,20,.5),field('openZ','벌림 전용 높이',-20,20,.5)
]},
{id:'left',label:'② 왼쪽 연결 피부',note:'몸통·중앙 패치와 공유하는 경계 연동',fields:[
 field('dx','왼쪽 안쪽 이동 +X',-30,30,.5),field('dy','좌측 연결 Y',-35,35,.5),field('dz','좌측 연결 Z',-30,30,.5),
 field('inward','바깥 테두리 안쪽 당김',-30,30,.5),field('span','연결 피부 폭',-45,45,1,'%'),
 field('bulge','연결 피부 전방 볼륨',-25,25,.5),field('tuck','연결 피부 후방 후퇴',-25,25,.5),
 field('upperY','상단 연결부 전후',-20,20,.5),field('lowerY','하단 연결부 전후',-20,20,.5),
 field('upperZ','상단 연결부 높이',-20,20,.5),field('lowerZ','하단 연결부 높이',-20,20,.5),
 field('centerPull','중앙 연결 당김',-25,25,.5),field('outerPull','외곽 연결 당김',-25,25,.5),
 field('twist','연결부 비틀림',-30,30,.5,'°'),field('radius','연결부 영향 폭',35,150,1,'mm',95),
 field('feather','접합 완충 거리',3,65,1,'mm',25),field('openX','벌림 전용 X',-30,30,.5),
 field('openY','벌림 전용 Y',-30,30,.5),field('openZ','벌림 전용 Z',-30,30,.5)
]},
{id:'right',label:'③ 오른쪽 연결 피부',note:'왼쪽과 완전히 독립된 슬라이더',fields:[
 field('dx','오른쪽 안쪽 이동 -X',-30,30,.5),field('dy','우측 연결 Y',-35,35,.5),field('dz','우측 연결 Z',-30,30,.5),
 field('inward','바깥 테두리 안쪽 당김',-30,30,.5),field('span','연결 피부 폭',-45,45,1,'%'),
 field('bulge','연결 피부 전방 볼륨',-25,25,.5),field('tuck','연결 피부 후방 후퇴',-25,25,.5),
 field('upperY','상단 연결부 전후',-20,20,.5),field('lowerY','하단 연결부 전후',-20,20,.5),
 field('upperZ','상단 연결부 높이',-20,20,.5),field('lowerZ','하단 연결부 높이',-20,20,.5),
 field('centerPull','중앙 연결 당김',-25,25,.5),field('outerPull','외곽 연결 당김',-25,25,.5),
 field('twist','연결부 비틀림',-30,30,.5,'°'),field('radius','연결부 영향 폭',35,150,1,'mm',95),
 field('feather','접합 완충 거리',3,65,1,'mm',25),field('openX','벌림 전용 X',-30,30,.5),
 field('openY','벌림 전용 Y',-30,30,.5),field('openZ','벌림 전용 Z',-30,30,.5)
]},
{id:'core',label:'④ 중앙 해부학 패치',note:'외부 경계 보호·내부 정점만 변형',fields:[
 field('dx','중심 좌우 X',-45,45,.5),field('dy','중심 전후 Y',-45,45,.5),field('dz','중심 상하 Z',-40,40,.5),
 field('targetY','이전 편집 Y 57~90 보정',57,90,.5,'mm',57,'rev89 기준 57일 때 보정 0mm; 90일 때 +33mm'),
 field('width','중앙 폭',-60,80,1,'%'),field('length','전후 길이',-60,80,1,'%'),
 field('pitch','앞뒤 기울기 X',-45,45,.5,'°'),field('roll','좌우 기울기 Y',-35,35,.5,'°'),field('yaw','수평 기울기 Z',-35,35,.5,'°'),
 field('fullness','전방 곡률·볼륨',-35,35,.5),field('recess','중앙 깊이',-30,30,.5),
 field('topZ','상단 높이',-25,25,.5),field('bottomZ','하단 높이',-25,25,.5),
 field('topY','상단 전후',-25,25,.5),field('bottomY','하단 전후',-25,25,.5),
 field('leftX','왼쪽 외연 폭',-25,25,.5),field('rightX','오른쪽 외연 폭',-25,25,.5),
 field('curve','중심부 곡률',-25,25,.5),field('round','단면 둥글기',-35,35,1,'%'),
 field('radius','중앙 편집 영향 범위',30,120,1,'mm',85),field('seamBlend','고정 경계 완충 링',1,11,1,'링',4),
 field('openX','벌림 전용 X',-25,25,.5),field('openY','벌림 전용 Y',-25,25,.5),field('openZ','벌림 전용 Z',-25,25,.5)
]},
{id:'inferior',label:'⑤ 중앙 하단 피부 연결',note:'기존 하부 피부 정점 조정·면 생성 아님',fields:[
 field('dx','하단 피복 X',-30,30,.5),field('dy','하단 피복 Y',-35,35,.5),field('dz','하단 피복 Z',-35,35,.5),
 field('cover','하부 전후 확장',-35,35,.5),field('width','하단 피복 폭',-60,70,1,'%'),
 field('droop','중앙 처짐',-25,25,.5),field('leftFill','왼쪽 연결 깊이',-25,25,.5),
 field('rightFill','오른쪽 연결 깊이',-25,25,.5),field('midFill','중앙 피복 깊이',-25,25,.5),
 field('upperBlend','위쪽 연결 완충',5,60,1,'mm',25),field('radius','하단 영향 폭',30,100,1,'mm',64),
 field('openY','벌림 전용 전후',-35,35,.5),field('openZ','벌림 전용 상하',-35,35,.5),
 field('openWidth','벌림 전용 폭',-45,45,1,'%')
]},
{id:'cloth',label:'⑥ 독립 의복 외피 피팅',note:'맨몸 정점은 보존 · 별도 의복 370면에만 적용',fields:[
 field('followRest','0° 피부 변형 추종률',0,120,1,'%',82),
 field('followOpen','55° 피부 변형 추종률',0,120,1,'%',82),
 field('clearance','옷과 피부 사이 여유',-3,8,.2,'mm',1.8),
 field('cutoff','피부 영향 탐색 거리',30,160,1,'mm',115),
 field('dx','의복 좌우 이동',-20,20,.5),
 field('dy','의복 전후 이동',-20,20,.5),
 field('dz','의복 상하 이동',-20,20,.5),
 field('openX','벌림 전용 의복 X',-20,20,.5),
 field('openY','벌림 전용 의복 Y',-20,20,.5),
 field('openZ','벌림 전용 의복 Z',-20,20,.5)
]}];
const FIELD=new Map(groups.flatMap(g=>g.fields.map(f=>[g.id+'.'+f.id,{...f,group:g.id}])));
const initial=()=>Object.fromEntries(FIELD.entries().map(([k,f])=>[k,f.initial]));
// Settings read from the user-provided 2026-11-16T14:49:42.972Z JSON, 106 controls.
const USER_CONTROLS={"left.dx":10,"left.span":-45,"left.bulge":-25,"left.tuck":25,"right.dx":10,"right.span":-45,"right.bulge":-25,"right.tuck":25,"core.pitch":-7,"core.openZ":2.5,"inferior.upperBlend":22,"inferior.radius":65,"inferior.openWidth":45};
const E={values:initial(),enabled:true,mirror:false,changed:0,parts:null,records:new Map(),centroids:new Map(),coreHops:new Map(),patchShared:new Set(),source:'',undo:[],redo:[],clothBindings:new Map(),clothCandidateTriangles:0,changedVertices:0,preset:'2026-11-16 user uploaded manual JSON'};
const $=id=>document.getElementById(id),fmt=v=>Number.isInteger(v)?String(v):Number(v.toFixed(2)).toString();
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function mark(){E.changed++;document.dispatchEvent(new CustomEvent('xpz-manual-update'));updateStatus();}
function record(){E.undo.push({...E.values});if(E.undo.length>90)E.undo.shift();E.redo.length=0;}
function updateUI(){for(const [key,f]of FIELD){const el=document.querySelector('[data-value="'+key+'"]'),num=document.querySelector('[data-number="'+key+'"]');if(el)el.value=E.values[key];if(num)num.value=E.values[key];}mark();}
function setValue(key,value){const f=FIELD.get(key);if(!f)return;const n=Number(value);if(!Number.isFinite(n))return;const v=Math.round(clamp(n,f.min,f.max)/f.step)*f.step;if(v===E.values[key])return;record();E.values[key]=Number(v.toFixed(4));if(E.mirror&&(key.startsWith('left.')||key.startsWith('right.'))){const sibling=(key.startsWith('left.')?'right.':'left.')+key.split('.')[1];E.values[sibling]=E.values[key];}updateUI();}
function weightBody(p,r){const c=E.values,rr=mm(c['body.radius']),x=Math.abs(p[0]),z=p[2],y=p[1];if(x>.22||z<.75||z>1.08||y>-.035)return 0;
const q=Math.sqrt(((x-.065)/(rr*1.15))**2+((z-.91)/(rr*.86))**2+((y+.125)/(rr*.85))**2);
const feather=mm(c['body.feather']),w=1-sm(1-feather/rr,1.1,q);return r.members.has('body')?w:(r.members.has('left')||r.members.has('right')?w*.8:0);}
function weightSide(side,p,r){const sign=side==='left'?-1:1;if(!(r.members.has(side)||r.members.has('body')||r.members.has('core')))return 0;
const sx=sign*p[0],z=p[2],y=p[1],c=E.values,rr=mm(c[side+'.radius']);
if(sx<-.004||sx>.20||z<.795||z>1.03||y>-.055)return 0;
const q=Math.sqrt(((sx-.050)/(rr*.95))**2+((z-.903)/(rr*.9))**2+((y+.121)/(rr*.8))**2);
const feather=mm(c[side+'.feather']);
const w=(1-sm(1-feather/rr,1.10,q))*sm(-.004,.026,sx);
return w*(r.members.has(side)?1:(r.members.has('body')?.65:.25));}
function weightCore(p,r){if(!r.members.has('core'))return 0;const c=E.values,rr=mm(c['core.radius']);const q=Math.sqrt((p[0]/(rr*.68))**2+((p[1]+.123)/(rr*.75))**2+((p[2]-.907)/(rr*.75))**2);const hop=E.coreHops.get(r.key)??0;
return (1-sm(.87,1.6,q))*sm(0,c['core.seamBlend']+1,hop);}
function weightInferior(p,r){if(!(r.members.has('core')||r.members.has('left')||r.members.has('right')||r.members.has('body')))return 0;const c=E.values,rr=mm(c['inferior.radius']),q=Math.sqrt((p[0]/rr)**2+((p[1]+.117)/(rr*1.2))**2+((p[2]-.880)/(rr*.82))**2);const ff=mm(c['inferior.upperBlend']);return (1-sm(1-ff/rr,1.2,q))*sm(.84,.86,p[2])*(1-sm(.931,.957,p[2]));}
function transform(p,r,open){if(!E.enabled)return [0,0,0];const v=E.values;let [x,y,z]=p,weighted=0;
{const w=weightBody(p,r),c=key=>v['body.'+key],zz=clamp((p[2]-.855)/.125),upper=sm(.35,.95,zz),lower=1-upper,side=p[0]<0?'leftZ':'rightZ';if(w>0){
 let ax=p[0]-.0,ay=p[1]+.121,az=p[2]-.905;
 const pitch=rad(c('pitch')),yaw=rad(c('yaw'));let qy=ay*Math.cos(pitch)-az*Math.sin(pitch),qz=ay*Math.sin(pitch)+az*Math.cos(pitch);
 let qx=ax*Math.cos(yaw)-qy*Math.sin(yaw);qy=ax*Math.sin(yaw)+qy*Math.cos(yaw);
 x+=w*(mm(c('dx'))+qx-ax+ax*c('width')/100);
 y+=w*(mm(c('dy'))+qy-ay-mm(c('bulge'))*Math.exp(-((p[0]/.10)**2))+mm(c('tuck'))*lower+mm(c('upperY'))*upper+mm(c('lowerY'))*lower);
 z+=w*(mm(c('dz'))+qz-az+az*c('height')/100+mm(c('upperZ'))*upper+mm(c('lowerZ'))*lower+mm(c(side))*sm(.03,.13,Math.abs(p[0])));
 if(open){x+=w*mm(c('openX'));y+=w*mm(c('openY'));z+=w*mm(c('openZ'));}weighted=Math.max(weighted,w);
}}
for(const side of ['left','right']){const w=weightSide(side,p,r);if(w<=0)continue;const sign=side==='left'?-1:1,c=key=>v[side+'.'+key],upper=sm(.875,.945,p[2]),lower=1-upper,outer=sm(.022,.085,sign*p[0]),inner=1-outer;
const a=rad(c('twist')),ly=p[1]+.12,lz=p[2]-.901,twistY=ly*Math.cos(a)-lz*Math.sin(a)-ly,twistZ=ly*Math.sin(a)+lz*Math.cos(a)-lz;
x+=w*(-sign*mm(c('dx'))-sign*mm(c('inward'))*outer+sign*(sign*p[0]-.04)*c('span')/100-sign*mm(c('centerPull'))*inner+sign*mm(c('outerPull'))*outer);
y+=w*(mm(c('dy'))-mm(c('bulge'))*Math.exp(-(((p[2]-.91)/.055)**2))+mm(c('tuck'))*lower+mm(c('upperY'))*upper+mm(c('lowerY'))*lower+twistY);
z+=w*(mm(c('dz'))+mm(c('upperZ'))*upper+mm(c('lowerZ'))*lower+twistZ);
if(open){x+=w*(-sign*mm(c('openX')));y+=w*mm(c('openY'));z+=w*mm(c('openZ'));}weighted=Math.max(weighted,w);
}
{const w=weightCore(p,r),c=key=>v['core.'+key];if(w>0){let xx=p[0],yy=p[1]+.119,zz=p[2]-.908,top=sm(.90,.955,p[2]),bottom=1-top,left=1-sm(-.035,-.006,p[0]),right=sm(.006,.035,p[0]);
const pitch=rad(c('pitch')),roll=rad(c('roll')),yaw=rad(c('yaw'));let t=yy*Math.cos(pitch)-zz*Math.sin(pitch);zz=yy*Math.sin(pitch)+zz*Math.cos(pitch);yy=t;
t=xx*Math.cos(roll)+zz*Math.sin(roll);zz=-xx*Math.sin(roll)+zz*Math.cos(roll);xx=t;
t=xx*Math.cos(yaw)-yy*Math.sin(yaw);yy=xx*Math.sin(yaw)+yy*Math.cos(yaw);xx=t;
const core=Math.exp(-((p[0]/.023)**2)-(((p[2]-.908)/.048)**2)),oval=sm(.005,.032,Math.abs(p[0]));
x+=w*(xx-p[0]+mm(c('dx'))+p[0]*c('width')/100+mm(c('leftX'))*left-mm(c('rightX'))*right);
y+=w*(yy-(p[1]+.119)+mm(c('dy'))+mm(c('targetY')-57)-mm(c('fullness'))*(1-core*.35)+mm(c('recess'))*core+mm(c('topY'))*top+mm(c('bottomY'))*bottom+mm(c('curve'))*Math.sin((p[2]-.875)/.085*Math.PI)*core);
z+=w*(zz-(p[2]-.908)+mm(c('dz'))+(p[2]-.908)*c('length')/100+mm(c('topZ'))*top+mm(c('bottomZ'))*bottom+mm(c('round'))*oval*.15);
if(open){x+=w*mm(c('openX'));y+=w*mm(c('openY'));z+=w*mm(c('openZ'));}weighted=Math.max(weighted,w);
}}
{const w=weightInferior(p,r),c=key=>v['inferior.'+key];if(w>0){const side=p[0]<0?'leftFill':'rightFill',cent=Math.exp(-((p[0]/.025)**2)),rim=1-cent;
x+=w*(mm(c('dx'))+p[0]*c('width')/100);
y+=w*(mm(c('dy'))+mm(c('cover'))*(1-sm(.89,.935,p[2]))+mm(c(side))*rim+mm(c('midFill'))*cent);
z+=w*(mm(c('dz'))-mm(c('droop'))*cent);
if(open){x+=w*p[0]*c('openWidth')/100;y+=w*mm(c('openY'));z+=w*mm(c('openZ'));}weighted=Math.max(weighted,w);
}}
return [x-p[0],y-p[1],z-p[2]];
}

// Static nearest-surface attachment for independent garment primitives.
// The mapping is constructed once from the baseline (pre-sculpt) skin, and
// transfers both the zero-pose and the 55-degree manual deformation.
const vsub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const vdot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const vscale=(a,x)=>a.map(v=>v*x);
const vadd=(a,b)=>a.map((v,i)=>v+b[i]);
function nearestTrianglePoint(p,a,b,c){
 const ab=vsub(b,a),ac=vsub(c,a),ap=vsub(p,a),d1=vdot(ab,ap),d2=vdot(ac,ap);
 if(d1<=0&&d2<=0)return {q:a,w:[1,0,0]};
 const bp=vsub(p,b),d3=vdot(ab,bp),d4=vdot(ac,bp);
 if(d3>=0&&d4<=d3)return {q:b,w:[0,1,0]};
 const vc=d1*d4-d3*d2;
 if(vc<=0&&d1>=0&&d3<=0){const u=d1/(d1-d3);return {q:vadd(a,vscale(ab,u)),w:[1-u,u,0]};}
 const cp=vsub(p,c),d5=vdot(ab,cp),d6=vdot(ac,cp);
 if(d6>=0&&d5<=d6)return {q:c,w:[0,0,1]};
 const vb=d5*d2-d1*d6;
 if(vb<=0&&d2>=0&&d6<=0){const u=d2/(d2-d6);return {q:vadd(a,vscale(ac,u)),w:[1-u,0,u]};}
 const va=d3*d6-d5*d4;
 if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0){const u=(d4-d3)/((d4-d3)+(d5-d6));return {q:vadd(b,vscale(vsub(c,b),u)),w:[0,1-u,u]};}
 const inv=1/(va+vb+vc),v=vb*inv,u=vc*inv;
 return {q:vadd(a,vadd(vscale(ab,v),vscale(ac,u))),w:[1-v-u,v,u]};
}
function buildClothBindings(parts){
 E.clothBindings=new Map();
 const skinTriangles=[];
 for(const part of parts){
  if(part.isGarment || !(part.isBody||part.isBodyContinuation||part.isPatch||part.isSkinReplacement))continue;
  const I=part.sourceIndices,P=part.sourcePositions;
  for(let q=0;q<I.length;q+=3){
   const ids=Array.from(I.slice(q,q+3));
   const pos=ids.map(id=>Array.from(P.slice(id*3,id*3+3)));
   const cent=pos.reduce((acc,x)=>vadd(acc,x),[0,0,0]).map(x=>x/3);
   if(Math.abs(cent[0])>.22||Math.abs(cent[1])>.225||cent[2]<.73||cent[2]>1.07)continue;
   skinTriangles.push({pi:part.primitiveIndex,ids,pos});
  }
 }
 E.clothCandidateTriangles=skinTriangles.length;
 for(const part of parts){
  if(!part.isGarment)continue;
  const P=part.sourcePositions;
  for(const id of new Set(part.sourceIndices)){
   const pt=Array.from(P.slice(id*3,id*3+3));
   if(Math.abs(pt[0])>.2||pt[2]<.71||pt[2]>1.08)continue;
   let best=null,d2=Infinity;
   for(const tr of skinTriangles){
    const q=nearestTrianglePoint(pt,...tr.pos),delta=vsub(pt,q.q),distance2=vdot(delta,delta);
    if(distance2<d2){d2=distance2;best={...tr,q};}
   }
   if(!best)continue;
   const distance=Math.sqrt(d2),fromSkin=vsub(pt,best.q.q);
   E.clothBindings.set(part.primitiveIndex+':'+id,{anchors:best.ids.map((idx,k)=>({pi:best.pi,id:idx,w:best.q.w[k]})),fromSkin,distance});
  }
 }
}
function garmentDelta(pi,id,open){
 if(!E.enabled)return [0,0,0];
 const link=E.clothBindings.get(pi+':'+id);if(!link)return [0,0,0];
 const v=E.values,c=k=>v['cloth.'+k],cutoff=mm(c('cutoff'));
 const proximity=1-sm(cutoff*.25,cutoff,link.distance);
 if(proximity<.001)return [0,0,0];
 let move=[0,0,0];
 for(const a of link.anchors){
  const rec=E.records.get(a.pi+':'+a.id);if(!rec)continue;
  const delta=transform(rec.point,rec,open);
  move=vadd(move,vscale(delta,a.w));
 }
 const rate=c(open?'followOpen':'followRest')/100;
 const relative=link.fromSkin,dist=Math.hypot(...relative);
 const margin=(dist>.001&&dist<.025)?mm(c('clearance'))*(1-sm(.003,.025,dist))/dist:0;
 return vadd(vscale(move,rate*proximity),vscale([
   mm(c('dx'))+(open?mm(c('openX')):0),
   mm(c('dy'))+(open?mm(c('openY')):0),
   mm(c('dz'))+(open?mm(c('openZ')):0)],proximity)).map((x,j)=>x+relative[j]*margin*proximity);
}

function bind(parts,source){
E.parts=parts;E.source=source||E.source;E.records=new Map();E.coreHops=new Map();E.patchShared=new Set();E.clothBindings=new Map();
const active=parts.filter(p=>!p.isGarment),byId=new Map();
for(const p of active){const ids=new Set(p.sourceIndices);for(const id of ids){const k=id*3,pt=Array.from(p.sourcePositions.slice(k,k+3)),entry={pi:p.primitiveIndex,id,p,pt},list=byId.get(id)||[];list.push(entry);byId.set(id,list);}}
for(const [id,items]of byId){const clusters=[];for(const entry of items){let cluster=clusters.find(c=>dist(c[0].pt,entry.pt)<.006);
if(!cluster){cluster=[];clusters.push(cluster);}cluster.push(entry);}
for(const cluster of clusters){const representative=cluster.find(e=>e.p.isBody)||cluster.find(e=>e.p.isPatch)||cluster[0];
const point=representative.pt,members=new Set(cluster.map(e=>e.p.isBody||e.p.isBodyContinuation?'body':e.p.isSkinReplacement?e.p.side:e.p.isPatch?'core':null).filter(Boolean)),key=cluster.map(e=>e.pi+':'+id).sort().join('|');
const rec={id,point,members,key,items:cluster};for(const e of cluster)E.records.set(e.pi+':'+id,rec);
}}
const core=parts.find(p=>p.isPatch),nodes=new Map(),seeds=[];
if(core){const ids=new Set(core.sourceIndices);for(const id of ids)nodes.set(id,new Set());
for(let i=0;i<core.sourceIndices.length;i+=3){const [a,b,c]=core.sourceIndices.slice(i,i+3);for(const [u,v]of [[a,b],[b,c],[c,a]]){nodes.get(u).add(v);nodes.get(v).add(u);}}
for(const id of ids){const rec=E.records.get(core.primitiveIndex+':'+id);if(rec?.items.some(x=>x.pi!==core.primitiveIndex)){E.patchShared.add(id);seeds.push(id);}}
const hops=new Map(seeds.map(x=>[x,0]));for(let at=0;at<seeds.length;at++)for(const next of nodes.get(seeds[at])||[]){if(!hops.has(next)){hops.set(next,hops.get(seeds[at])+1);seeds.push(next);}}
for(const id of ids){const rec=E.records.get(core.primitiveIndex+':'+id);if(rec)E.coreHops.set(rec.key,hops.get(id)??10);}
}
buildClothBindings(parts);
mark();
}
function delta(pi,id,open){const rec=E.records.get(pi+':'+id);if(!rec)return garmentDelta(pi,id,!!open);return transform(rec.point,rec,!!open);}
function apply(pi,id,x,y,z,openWeight){const a=delta(pi,id,false),b=delta(pi,id,true);return [x+a[0]+(b[0]-a[0])*openWeight,y+a[1]+(b[1]-a[1])*openWeight,z+a[2]+(b[2]-a[2])*openWeight];}
function changedData(){const parts=E.parts;if(!parts)return {positions:[],affected:{vertices:0,primitives:0}};const positions=[],partSet=new Set();
for(const p of parts){for(const id of new Set(p.sourceIndices)){const a=delta(p.primitiveIndex,id,false),b=delta(p.primitiveIndex,id,true);if(Math.max(...a.map(Math.abs),...b.map(Math.abs))<1e-7)continue;const k=id*3,o=Array.from(p.sourcePositions.slice(k,k+3)),m=p.sourceMorph?Array.from(p.sourceMorph.slice(k,k+3)):[0,0,0];positions.push({primitive:p.primitiveIndex,id,originalXYZ:o,restXYZ:o.map((v,j)=>v+a[j]),open55XYZ:o.map((v,j)=>v+m[j]+b[j])});partSet.add(p.primitiveIndex);}}
return {positions,affected:{vertices:positions.length,primitives:partSet.size}};}
function snapshot(){const coords=changedData();return {schema:'XPZ3D.F11.ManualSculpt.v1',editorRevision:'rev95-polygon-delete',createdAt:new Date().toISOString(),sourceGLB:$('modelVariant').value,userPreset:'manual-input-20261116T144942',skinGarmentLayers:'separate',garmentAttachmentTriangles:E.clothCandidateTriangles,garmentAttachedVertices:E.clothBindings.size,enabled:E.enabled,mirror:E.mirror,controls:{...E.values},camera:{legSpread:Number($('legSpread').value),zoom:Number($('zoom').value),preset:$('preset').value},coordinateSystem:{units:'meters',X:'left-right',negativeY:'anterior',positiveZ:'superior'},protected:{rig:true,coreBorderTaper:true},...(window.XPZPolygon?.snapshot()||{deletedFaces:[],deletionCount:0}),...coords};}
function status(t){const s=$('manualStatus');if(s)s.textContent=t;}
function updateStatus(){const n=Object.entries(E.values).filter(([k,v])=>v!==FIELD.get(k).initial).length;status('수정된 슬라이더 '+n+' / '+FIELD.size+' · '+(E.parts?E.parts.length+' 프리미티브 로드':'GLB 로드 대기')+' · 원본 GLB 보호');}
function download(filename,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),25000);}
function normFromFaces(pos,I){const n=new Float32Array(pos.length);
for(let t=0;t<I.length;t+=3){const a=3*I[t],b=3*I[t+1],c=3*I[t+2];
const ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2],vx=pos[c]-pos[a],vy=pos[c+1]-pos[a+1],vz=pos[c+2]-pos[a+2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
for(const k of [a,b,c]){n[k]+=nx;n[k+1]+=ny;n[k+2]+=nz;}}
for(let i=0;i<n.length;i+=3){const l=Math.hypot(n[i],n[i+1],n[i+2])||1;n[i]/=l;n[i+1]/=l;n[i+2]/=l;}return n;}
async function bakeGLB(){if(!E.parts)throw Error('원본 GLB 로드 전');const source=$('modelVariant').value;if(source!==E.source)throw Error('현재 미리보기와 원본이 다릅니다');
const res=await fetch(source,{cache:'no-store'});if(!res.ok)throw Error('GLB '+res.status);
const arr=await res.arrayBuffer(),view=new DataView(arr),jl=view.getUint32(12,true),doc=JSON.parse(new TextDecoder().decode(new Uint8Array(arr,20,jl))),off=28+jl,binLength=view.getUint32(20+jl,true);
let bin=new Uint8Array(arr.slice(off,off+binLength));
const dim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},sz={5126:4,5123:2,5125:4,5121:1};
function read(id){const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],n=dim[a.type],z=sz[a.componentType],start=(v.byteOffset||0)+(a.byteOffset||0),step=v.byteStride||n*z,dv=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);let result=new Array(a.count*n);for(let i=0;i<a.count;i++)for(let k=0;k<n;k++){const at=start+i*step+k*z;result[i*n+k]=a.componentType===5126?dv.getFloat32(at,true):a.componentType===5123?dv.getUint16(at,true):a.componentType===5125?dv.getUint32(at,true):dv.getUint8(at);}return result;}
function append(data){const b=new ArrayBuffer(data.length*4),v=new DataView(b);for(let i=0;i<data.length;i++)v.setFloat32(i*4,data[i],true);let old=bin,padding=(4-old.length%4)%4;bin=new Uint8Array(old.length+padding+b.byteLength);bin.set(old);bin.set(new Uint8Array(b),old.length+padding);const vi=doc.bufferViews.push({buffer:0,byteOffset:old.length+padding,byteLength:b.byteLength})-1;
const rows=data.length/3,a={bufferView:vi,componentType:5126,count:rows,type:'VEC3',min:[0,1,2].map(j=>Math.min(...Array.from({length:rows},(_,i)=>data[i*3+j]))),max:[0,1,2].map(j=>Math.max(...Array.from({length:rows},(_,i)=>data[i*3+j])))};return doc.accessors.push(a)-1;}
function appendIndices(indices){
 if(indices.length<3||indices.length%3!==0)throw Error('면 인덱스가 비었습니다');
 const max=Math.max(...indices),use32=max>65535,sz=use32?4:2;const buffer=new ArrayBuffer(indices.length*sz),dv=new DataView(buffer);
 for(let i=0;i<indices.length;i++)use32?dv.setUint32(i*4,indices[i],true):dv.setUint16(i*2,indices[i],true);
 const offset=bin.length+(4-bin.length%4)%4,next=new Uint8Array(offset+buffer.byteLength);next.set(bin);next.set(new Uint8Array(buffer),offset);bin=next;
 const viewId=doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.byteLength})-1;
 return doc.accessors.push({bufferView:viewId,componentType:use32?5125:5123,count:indices.length,type:'SCALAR',min:[Math.min(...indices)],max:[max]})-1;
}
let changed=0,removed=0,fullyDeleted=0;
const savedParts=[];
for(let pi=0;pi<doc.meshes[0].primitives.length;pi++){const p=doc.meshes[0].primitives[pi],pp=E.parts.find(v=>v.primitiveIndex===pi);if(!pp)continue;
const P=read(p.attributes.POSITION),M=p.targets?.[0]?.POSITION!==undefined?read(p.targets[0].POSITION):new Array(P.length).fill(0),I=read(p.indices),filtered=window.XPZPolygon?.filteredIndices(pi,I)??I,deletedCount=(I.length-filtered.length)/3;
 removed+=deletedCount;
 if(filtered.length===0){fullyDeleted++;continue;}
 const ids=new Set(filtered),RP=P.slice(),NM=M.slice();let modified=deletedCount>0;
for(const id of ids){const a=delta(pi,id,false),b=delta(pi,id,true);if(Math.max(...a.map(Math.abs),...b.map(Math.abs))<1e-7)continue;const k=id*3;for(let j=0;j<3;j++){RP[k+j]+=a[j];NM[k+j]+=b[j]-a[j];}modified=true;}
if(!modified){savedParts.push(p);continue;}
if(deletedCount){p.indices=appendIndices(filtered);}
p.attributes.POSITION=append(RP);if(p.targets?.[0])p.targets[0].POSITION=append(NM);
if(p.attributes.NORMAL!==undefined){const normal=normFromFaces(RP,filtered);p.attributes.NORMAL=append(Array.from(normal));if(p.targets?.[0]){const opened=RP.map((v,k)=>v+NM[k]),nOpen=normFromFaces(opened,filtered);
p.targets[0].NORMAL=append(Array.from(nOpen).map((v,k)=>v-normal[k]));}}
p.extras={...p.extras,manualSculptRev95PolygonDelete:true,deletedTriangleCount:deletedCount};savedParts.push(p);changed++;}
if(!changed&&removed===0)throw Error('변경된 정점 또는 삭제한 폴리곤이 없습니다.');
doc.meshes[0].primitives=savedParts;
doc.extras={...doc.extras,manualSculpt:'rev95-polygon-delete',manualSculptGeneratedAt:new Date().toISOString(),sourceGLB:source,
 originalPrimitivesCount:E.parts?.length??22,removedFaces:window.XPZPolygon?.snapshot()?.deletedFaces||[],deletedTriangleCount:removed,fullyRemovedPrimitives:fullyDeleted,editedPrimitives:changed,
 independentCandidate:true,rigPreserved:true};
doc.buffers[0].byteLength=bin.length;const enc=new TextEncoder(),raw=enc.encode(JSON.stringify(doc)),padJ=(4-raw.length%4)%4,padB=(4-bin.length%4)%4,bytes=new Uint8Array(12+8+raw.length+padJ+8+bin.length+padB),out=new DataView(bytes.buffer);
bytes.set([0x67,0x6c,0x54,0x46],0);out.setUint32(4,2,true);out.setUint32(8,bytes.length,true);out.setUint32(12,raw.length+padJ,true);bytes.set([0x4a,0x53,0x4f,0x4e],16);bytes.set(raw,20);bytes.fill(0x20,20+raw.length,20+raw.length+padJ);
const bStart=20+raw.length+padJ;out.setUint32(bStart,bin.length+padB,true);bytes.set([0x42,0x49,0x4e,0],bStart+4);bytes.set(bin,bStart+8);
const name='XPZ3D-F11-manual-rev95-faces-'+new Date().toISOString().replace(/[:.]/g,'-')+'.glb';download(name,new Blob([bytes],{type:'model/gltf-binary'}));status('새 GLB 내보내기 완료: '+name+' · 실제 삭제 '+removed+'면 · 변경 프리미티브 '+changed+'개');}
function install(){
const container=$('manualGroups');
for(const group of groups){const details=document.createElement('details');details.className='edit-group';details.open=group.id==='body'||group.id==='left'||group.id==='core';const summary=document.createElement('summary');summary.textContent=group.label;const hint=document.createElement('span');hint.textContent=group.fields.length+'개';summary.append(hint);details.append(summary);const wrap=document.createElement('div');wrap.className='group-wrap';wrap.innerHTML='<div class="group-actions"><small></small><button type="button">이 부위 초기화</button></div>';wrap.querySelector('small').textContent=group.note;wrap.querySelector('button').addEventListener('click',()=>{record();for(const f of group.fields)E.values[group.id+'.'+f.id]=f.initial;updateUI();});
for(const f of group.fields){const key=group.id+'.'+f.id,row=document.createElement('div');row.className='field';const label=document.createElement('label');label.textContent=f.title;label.title=f.description||f.title;const range=document.createElement('input');range.type='range';range.min=f.min;range.max=f.max;range.step=f.step;range.value=f.initial;range.dataset.value=key;range.setAttribute('aria-label',group.label+' '+f.title);
const number=document.createElement('input');number.type='number';number.min=f.min;number.max=f.max;number.step=f.step;number.value=f.initial;number.dataset.number=key;number.setAttribute('aria-label',group.label+' '+f.title+' 숫자입력');number.title=f.description||f.unit;
range.addEventListener('input',()=>setValue(key,range.value));number.addEventListener('change',()=>setValue(key,number.value));row.append(label,range,number);wrap.append(row);}
details.append(wrap);container.append(details);}
$('manualEnabled').addEventListener('change',()=>{E.enabled=$('manualEnabled').checked;mark();});
$('manualMirror').addEventListener('change',()=>{E.mirror=$('manualMirror').checked;if(E.mirror){record();for(const f of groups[1].fields)E.values['right.'+f.id]=E.values['left.'+f.id];updateUI();}});
$('manualReset').addEventListener('click',()=>{record();E.values=initial();updateUI();});
$('manualRestoreUser')?.addEventListener('click',()=>{record();E.values={...initial(),...USER_CONTROLS};updateUI();status('2026-11-16 사용자 입력값 복원 완료');});
$('manualUndo').addEventListener('click',()=>{if(!E.undo.length)return;E.redo.push({...E.values});E.values=E.undo.pop();updateUI();});
$('manualRedo').addEventListener('click',()=>{if(!E.redo.length)return;E.undo.push({...E.values});E.values=E.redo.pop();updateUI();});
$('manualDownload').addEventListener('click',()=>{try{const json=JSON.stringify(snapshot(),null,2);download('XPZ3D-F11-manual-rev95-faces-and-settings.json',new Blob([json],{type:'application/json'}));status('설정·정점 JSON 저장 완료');}catch(e){status('JSON 실패: '+e.message);}});
$('manualCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify(snapshot(),null,2));status('변경된 좌표와 슬라이더 JSON 복사 완료');}catch(e){status('복사 실패: '+e.message);}});
$('manualGLB').addEventListener('click',async()=>{try{status('독립 GLB 구성 중…');await bakeGLB();}catch(e){status('GLB 생성 실패: '+e.message);console.error(e);}});
$('manualImport').addEventListener('change',async()=>{try{const f=$('manualImport').files?.[0];if(!f)return;const data=JSON.parse(await f.text());if(data.schema!=='XPZ3D.F11.ManualSculpt.v1'||!data.controls)throw Error('지원하지 않는 JSON');
if(Array.isArray(data.deletedFaces)&&window.XPZPolygon){window.XPZPolygon.loadState(data);}else if(window.XPZPolygon){window.XPZPolygon.loadState({deletedFaces:[]});}
record();for(const [key,meta]of FIELD){const v=Number(data.controls[key]);if(Number.isFinite(v))E.values[key]=clamp(v,meta.min,meta.max);}E.enabled=data.enabled!==false;$('manualEnabled').checked=E.enabled;updateUI();status('사용자 설정 + 삭제면 불러오기 완료 · '+f.name);}
catch(e){status('가져오기 실패: '+e.message);}});
E.values={...initial(),...USER_CONTROLS};updateUI();status('최신 사용자 설정 2026-11-16 14:49 적용 · 106개 슬라이더 · 선택 면 삭제 가능');}
// Restore a source-matched checkpoint without reimporting a stale polygon selection.
function restoreFromCheckpoint(data){
 const model=$('modelVariant')?.value;
 if(!data||data.sourceGLB!==model||!data.controls||typeof data.controls!=='object')
   throw Error('rev97 backup source/controls mismatch');
 if(Object.keys(data.controls).length!==FIELD.size)
   throw Error('rev97 backup control count mismatch');
 record();
 E.values=initial();
 for(const [key,meta] of FIELD){
   const num=Number(data.controls[key]);
   if(!Number.isFinite(num))throw Error('Invalid backup control '+key);
   E.values[key]=clamp(num,meta.min,meta.max);
 }
 E.enabled=data.enabled!==false;E.mirror=data.mirror===true;
 if($('manualEnabled'))$('manualEnabled').checked=E.enabled;
 if($('manualMirror'))$('manualMirror').checked=E.mirror;
 updateUI();
 status('rev97 저장된 조형 설정 복구 완료 · '+FIELD.size+'개');
 return FIELD.size;
}
window.XPZManual={groups,state:E,bind,apply,delta,snapshot,changedData,bakeGLB,USER_CONTROLS,buildClothBindings,restoreFromCheckpoint};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();