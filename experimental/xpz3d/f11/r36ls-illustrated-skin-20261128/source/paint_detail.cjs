'use strict';
/**
 * R36LS deliberate secondary painting pass.
 * Object/bind-space strokes: regional crease ink, reflected light,
 * pigment wash and subtle relief. No UV triangle index decides pigment.
 * Source palette is R36LR (sprite-harmonized); this pass is additive.
 */
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const bell=(x,c,r)=>Math.exp(-0.5*((x-c)/r)**2);
const strokeList=[];
const curve=(name,side,points,width,rgb,depth,kind)=>{
 const p=points.map(([x,z])=>[x*side,z]);
 strokeList.push({name,points:p,width,rgb,depth,kind,
   x0:Math.min(...p.map(a=>a[0]))-width*3.3,x1:Math.max(...p.map(a=>a[0]))+width*3.3,
   z0:Math.min(...p.map(a=>a[1]))-width*3.3,z1:Math.max(...p.map(a=>a[1]))+width*3.3});
};
for(const side of [-1,1]){
 // Thin counter-edges and tapered reflective strips; do not draw anatomy
 // with black-filled polygons. Lines become increasingly broken at ends.
 curve('torso-upper-sheen',side,[[.093,1.463],[.151,1.481],[.228,1.458]],.012,[7,6,5],.00018,'light');
 curve('thorax-upper-flow',side,[[.098,1.386],[.148,1.418],[.215,1.404],[.264,1.365]],.025,[5,5,4],.00025,'light');
 curve('thorax-lateral-undershade',side,[[.228,1.265],[.261,1.289],[.292,1.324]],.015,[-7,-6,-5],-.0003,'ink');
 curve('thorax-underside-bounce',side,[[.090,1.266],[.157,1.251],[.219,1.272]],.012,[7,5,4],.00021,'light');
 curve('upper-rib-stroke',side,[[.191,1.235],[.207,1.183],[.195,1.133]],.021,[-4,-3,-2],-.0002,'ink');
 curve('upper-rib-reflection',side,[[.167,1.223],[.167,1.170],[.163,1.127]],.021,[5,4,4],.00021,'light');
 curve('flank-soft-edge',side,[[.225,1.078],[.225,1.027],[.234,.969]],.020,[-5,-4,-3],-.00025,'ink');
 curve('abdomen-warm-flow',side,[[.064,1.156],[.085,1.091],[.071,1.030]],.042,[5,2,1],.00025,'warm');
 curve('abdomen-bottom-reflection',side,[[.041,.999],[.084,.993],[.127,.979]],.022,[6,5,4],.00020,'light');
 curve('hip-crest-wash',side,[[.133,1.016],[.201,.987],[.242,.938]],.037,[4,1,0],.00019,'warm');
 curve('hip-crest-shadow',side,[[.168,.944],[.212,.902],[.244,.846]],.027,[-5,-4,-3],-.0003,'ink');
 curve('hip-reflected-rim',side,[[.189,.930],[.223,.878],[.237,.817]],.032,[6,5,4],.00027,'light');
 curve('inner-leg-bridge',side,[[.090,.793],[.138,.758],[.179,.708]],.014,[-6,-5,-4],-.00024,'ink');
 curve('upper-thigh-volume',side,[[.236,.769],[.260,.727],[.272,.666],[.267,.602]],.047,[5,4,3],.00033,'light');
 curve('thigh-secondary-catch',side,[[.218,.651],[.226,.588],[.230,.523]],.022,[5,4,4],.00020,'light');
 curve('knee-upper-arc',side,[[.214,.492],[.257,.502],[.297,.478]],.015,[7,6,5],.00016,'light');
 curve('knee-undershade',side,[[.216,.447],[.255,.438],[.294,.450]],.014,[-6,-5,-4],-.00020,'ink');
 curve('shin-soft-reflection',side,[[.219,.409],[.226,.350],[.220,.274],[.232,.210]],.031,[5,4,3],.00020,'light');
 curve('shin-outer-ink',side,[[.304,.390],[.303,.303],[.289,.244]],.024,[-4,-4,-3],-.00023,'ink');
 curve('shoulder-broken-rim',side,[[.324,1.437],[.377,1.416],[.409,1.372]],.018,[7,6,5],.00019,'light');
 curve('biceps-long-sheen',side,[[.431,1.285],[.449,1.238],[.447,1.188]],.025,[5,4,4],.00023,'light');
 curve('elbow-pocket-shadow',side,[[.443,1.084],[.467,1.061],[.490,1.078]],.010,[-7,-5,-4],-.00022,'ink');
 curve('forearm-bounce',side,[[.477,1.025],[.486,.976],[.507,.932]],.022,[6,5,4],.00022,'light');
}
curve('abdomen-midline-soft',1,[[-.004,1.230],[-.006,1.153],[-.002,1.079],[0,1.009]],.011,[-3,-2,-2],-.00016,'ink');
curve('abdomen-midline-bounce',1,[[.010,1.216],[.011,1.146],[.009,1.064]],.019,[4,3,2],.00015,'light');
curve('under-abdomen-wash',1,[[-.082,.994],[-.032,1.016],[.028,1.021],[.084,1.000]],.023,[6,5,4],.00024,'light');

function distance2(p,stroke){
 let best=1e9,rx=0,rz=0,along=0;
 const pts=stroke.points;
 for(let i=0;i<pts.length-1;i++){
  const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dz=b[1]-a[1];
  const t=clamp(((p[0]-a[0])*dx+(p[2]-a[1])*dz)/(dx*dx+dz*dz+1e-12));
  const xx=p[0]-a[0]-dx*t,zz=p[2]-a[1]-dz*t,d2=xx*xx+zz*zz;
  if(d2<best){best=d2;rx=xx;rz=zz;along=(i+t)/(pts.length-1)}
 }
 return {d2:best,rx,rz,along};
}
function regionGate(y,z){
 return (1-smooth(-.012,.094,y))*(1-smooth(1.537,1.59,z))*(1-smooth(-.10,.03,-z));
}
function skinGrain(x,y,z){
 // Three superimposed sparse frequencies, continuous in 3D and independent
 // from raster / triangle IDs; small amplitude preserves original palette.
 return .63*Math.sin(117*x+53*y+173*z)*Math.sin(183*x-91*y+103*z)
  +.27*Math.sin(311*x-149*y+239*z)*Math.cos(299*x+123*y-251*z)
  +.10*Math.sin(39*x+21*y+71*z)*Math.sin(57*x-27*y-49*z);
}
function details(p,{strength=1}={}){
 const [x,y,z]=p,gate=regionGate(y,z),rgb=[0,0,0],grad=[0,0];
 const layers={ink:0,light:0,warm:0,grain:0};
 if(gate<.001)return {rgb,grad,roughness:0,layers,strokeHits:0};
 let hits=0;
 for(const s of strokeList){
  if(x<s.x0||x>s.x1||z<s.z0||z>s.z1)continue;
  const {d2,rx,rz,along}=distance2(p,s);
  if(d2>12*s.width*s.width)continue;
  const taper=Math.pow(Math.sin(Math.PI*(.085+.83*along)),.7);
  const w=Math.exp(-d2/(2*s.width*s.width))*gate*taper*strength;
  if(w<.001)continue;
  for(let ch=0;ch<3;ch++)rgb[ch]+=s.rgb[ch]*w;
  const slope=s.depth*w/(s.width*s.width);
  grad[0]+=-slope*rx;grad[1]+=-slope*rz;
  layers[s.kind]=clamp(layers[s.kind]+w*.6);
  hits++;
 }
 const ax=Math.abs(x);
 // Local broad painted planes: light directions are authored in bind space,
 // not derived from flat polygon facet normals.
 const form=(2.8*bell(ax,.12,.10)*bell(z,1.22,.22)+
             2.4*bell(ax,.20,.09)*bell(z,.84,.13)+
             2.1*bell(ax,.23,.09)*bell(z,.59,.21)-
             1.6*bell(ax,.32,.05)*bell(z,.65,.17))*gate*strength;
 for(let k=0;k<3;k++)rgb[k]+=form*[1,.83,.72][k];
 const grain=skinGrain(x,y,z)*gate*strength;
 for(let k=0;k<3;k++)rgb[k]+=grain*[2.5,2.0,1.8][k];
 layers.grain=clamp(Math.abs(grain)/1.7);
 // Only slight added warmth in the central/lower abdomen.
 const warmth=(1.7*bell(ax,.069,.051)*bell(z,.96,.15)
               +.85*bell(ax,.185,.11)*bell(z,1.28,.15))*gate*strength;
 rgb[0]+=warmth;rgb[1]+=warmth*.44;rgb[2]-=warmth*.18;
 grad[0]=clamp(grad[0],-.16,.16);grad[1]=clamp(grad[1],-.16,.16);
 for(let k=0;k<3;k++)rgb[k]=clamp(rgb[k],-18,18);
 const roughness=clamp(3.2*layers.ink-4.8*layers.light+grain*1.5,-8,8);
 return {rgb,grad,roughness,layers,strokeHits:hits};
}
module.exports={strokeList,details,regionGate,skinGrain};
