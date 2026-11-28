'use strict';
/**
 * R36LR authored directional skin illustration.
 *
 * This is not per-triangle smoothing: the stroke list below deliberately
 * specifies drawn contour paths, rim lighting, directional form highlights
 * and warm pigment strokes in bind-space (meters).
 *
 * Source sprite-matched skin tone is retained as base; these strokes add
 * artistic structure, like the HW garment's contour-art approach.
 * No independent central-body geometry is created.
 */
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{let t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const bell=(x,c,r)=>Math.exp(-.5*((x-c)/r)**2);
const PI=Math.PI;
const curves=[];
function stroke(name,side,coords,width,color,height,kind,extent=1){
  const pts=coords.map(([x,z])=>[side===-1?-x:x,z]);
  const xs=pts.map(a=>a[0]),zs=pts.map(a=>a[1]);
  curves.push({name,side,pts,width,color,height,kind,extent,
    minX:Math.min(...xs)-width*3.1,maxX:Math.max(...xs)+width*3.1,
    minZ:Math.min(...zs)-width*3.1,maxZ:Math.max(...zs)+width*3.1});
}
// Curved chest underlines, upper specular strokes, and lateral volume.
for(const side of [-1,1]){
 const s=side<0?.95:1;
 stroke('thoracic-underfold',side,[[.069,1.243],[.112,1.229],[.165,1.222],[.211,1.238],[.264,1.267]],.014,[-13,-11,-10],-.0014,'shadow',s);
 stroke('thoracic-rim',side,[[.073,1.258],[.117,1.247],[.168,1.242],[.217,1.256],[.263,1.279]],.019,[11,10,9],.0011,'highlight',s);
 stroke('chest-arch',side,[[.086,1.348],[.133,1.393],[.192,1.409],[.247,1.376]],.050,[9,8,7],.0010,'highlight',s);
 stroke('chest-outer-volume',side,[[.245,1.354],[.281,1.313],[.274,1.263]],.043,[-7,-6,-5],-.0007,'shadow',s);
 stroke('collarbone-rim',side,[[.064,1.491],[.133,1.473],[.229,1.451]],.018,[10,9,8],.0005,'highlight',s);
 // Waist, rib and abdomen: designed taper and change in skin temperature.
 stroke('waist-form',side,[[.215,1.218],[.199,1.138],[.207,1.043],[.216,.989]],.040,[-6,-4,-3],-.0006,'shadow',s);
 stroke('abdominal-lateral',side,[[.101,1.208],[.126,1.115],[.128,1.029],[.107,.963]],.034,[8,7,6],.0008,'highlight',s);
 stroke('abdominal-edge',side,[[.145,1.191],[.154,1.084],[.163,1.009]],.018,[-6,-5,-4],-.0005,'shadow',s);
 // Pelvic silhouette: the two sides painted separately, not dark overlay.
 stroke('pelvis-lateral-light',side,[[.064,.983],[.077,.937],[.083,.889],[.074,.846]],.027,[11,8,7],.0013,'highlight',s);
 stroke('pelvis-lateral-warm',side,[[.042,.972],[.048,.923],[.052,.872],[.046,.818]],.018,[6,1,-1],.0008,'warm',s);
 stroke('pelvis-inner-contour',side,[[.023,.978],[.027,.925],[.028,.874],[.026,.824]],.013,[-13,-10,-9],-.0011,'shadow',s);
 stroke('pelvis-inner-rim',side,[[.040,.956],[.042,.906],[.043,.852]],.012,[9,7,6],.0006,'highlight',s);
 stroke('pelvic-transition',side,[[.078,.808],[.109,.775],[.152,.749]],.024,[-9,-7,-6],-.0005,'shadow',s);
 stroke('pelvic-transition-rim',side,[[.082,.834],[.117,.806],[.169,.779]],.028,[8,6,5],.0005,'highlight',s);
 // Broad hip and upper-leg painting: not copied across mesh triangles.
 stroke('hip-volume',side,[[.211,.990],[.252,.923],[.267,.834],[.254,.754]],.053,[8,6,5],.0008,'highlight',s);
 stroke('upper-leg-inner-shade',side,[[.145,.740],[.140,.674],[.151,.575]],.032,[-7,-5,-4],-.0004,'shadow',s);
 stroke('thigh-long-highlight',side,[[.250,.775],[.259,.674],[.247,.552],[.251,.475]],.054,[9,7,6],.0010,'highlight',s);
 stroke('thigh-outer-shadow',side,[[.347,.771],[.341,.647],[.316,.542]],.037,[-6,-5,-4],-.0005,'shadow',s);
 stroke('knee-rim',side,[[.202,.477],[.241,.487],[.278,.470]],.029,[11,9,8],.0011,'highlight',s);
 stroke('knee-underfold',side,[[.208,.425],[.240,.423],[.279,.428]],.014,[-9,-8,-7],-.0006,'shadow',s);
 stroke('shin-catchlight',side,[[.242,.386],[.240,.304],[.226,.216],[.225,.156]],.040,[8,7,7],.0006,'highlight',s);
 // Shoulder and arms get their own profile instead of generic noise.
 stroke('deltoid-light',side,[[.325,1.439],[.387,1.389],[.438,1.341]],.043,[9,8,7],.0006,'highlight',s);
 stroke('upper-arm-long',side,[[.427,1.309],[.455,1.216],[.457,1.136],[.462,1.056]],.042,[7,6,5],.0006,'highlight',s);
 stroke('elbow-crease',side,[[.434,1.061],[.474,1.051],[.499,1.067]],.018,[-8,-6,-5],-.0004,'shadow',s);
 stroke('forearm-rim',side,[[.483,1.039],[.498,.963],[.515,.882]],.035,[8,7,6],.0005,'highlight',s);
}
// Midline landmark + subtle low abdominal rim (not an unlit black hole).
stroke('midline-upper',1,[[0,1.213],[.003,1.149],[.002,1.074],[0,1.018]],.013,[-5,-4,-3],-.0006,'shadow');
stroke('midline-warm',1,[[.012,1.198],[.012,1.116],[.011,1.041]],.018,[5,3,2],.0004,'warm');
stroke('lower-belly-rim',1,[[-.073,1.014],[-.034,1.023],[0,1.027],[.036,1.023],[.075,1.012]],.022,[8,6,5],.0006,'highlight');
// Deliberately tapered center transition, no permanent black texture mark.
stroke('center-shadow',1,[[.001,.945],[0,.904],[.002,.865]],.011,[-10,-7,-6],-.0006,'shadow');
stroke('center-rim',1,[[.018,.941],[.016,.896],[.017,.856]],.014,[6,5,4],.0004,'highlight');

function distCurve(p,s){
 let best=1e30,rx=0,rz=0;
 for(let i=0;i<s.pts.length-1;i++){
   const a=s.pts[i],b=s.pts[i+1],dx=b[0]-a[0],dz=b[1]-a[1];
   const t=clamp(((p[0]-a[0])*dx+(p[2]-a[1])*dz)/(dx*dx+dz*dz+1e-16));
   const cx=a[0]+dx*t,cz=a[1]+dz*t;
   const xx=p[0]-cx,zz=p[2]-cz,d2=xx*xx+zz*zz;
   if(d2<best){best=d2;rx=xx;rz=zz}
 }
 return {d2:best,rx,rz};
}
function frontGate(y,z){
  return (1-smooth(.004,.099,y))*(1-smooth(1.53,1.60,z));
}
function microNoise(x,y,z){
 // Continuous skin grain: no triangle-id / UV-seed dependence.
 const a=Math.sin(x*174.7+y*88.1+z*147.3)*Math.cos(x*231.6-z*155.2+y*51.3);
 const b=Math.sin(x*359.7-z*270.3+y*107.4)*Math.sin(z*311.1+x*149.8);
 const c=Math.sin(z*37.3+x*23.4+y*18.8)*Math.sin(x*48.3-z*59.5);
 return .53*a+.21*b+.26*c;
}
function broadWashes(x,y,z,gate){
 const ax=Math.abs(x);
 const chest=bell(ax,.177,.138)*bell(z,1.340,.140)*gate;
 const belly=bell(ax,.095,.148)*bell(z,1.111,.16)*gate;
 const waist=bell(ax,.214,.060)*bell(z,1.058,.135)*gate;
 const hip=bell(ax,.236,.080)*bell(z,.879,.157)*gate;
 const legs=bell(ax,.257,.107)*bell(z,.586,.245)*gate;
 const arms=bell(ax,.46,.080)*bell(z,1.20,.240)*gate;
 return {chest,belly,waist,hip,legs,arms};
}
function paint(p,{strength=1,detail=1}={}){
 const [x,y,z]=p,gate=frontGate(y,z);
 const color=[0,0,0],gradient=[0,0],masks={shadow:0,highlight:0,warm:0,detail:0,shape:0};
 if(gate<.001)return {color,gradient,masks,roughnessShift:0,strokeCount:0};
 const broad=broadWashes(x,y,z,gate);
 // Broad directional body planes, with compensating shading to preserve
 // character skin-tone mean and avoid overexposure.
 const form=6.1*broad.chest+4.7*broad.belly-3.9*broad.waist+
          4.8*broad.hip+3.9*broad.legs+2.7*broad.arms;
 for(let c=0;c<3;c++)color[c]+=form*[1,.83,.68][c];
 masks.shape=clamp(Math.abs(form)/9);
 let strokes=0;
 for(const s of curves){
   if(x<s.minX||x>s.maxX||z<s.minZ||z>s.maxZ)continue;
   const {d2,rx,rz}=distCurve(p,s);
   const sig=s.width,gauss=Math.exp(-.5*d2/(sig*sig))*gate*s.extent;
   if(gauss<.0015)continue;
   strokes++;
   const a=gauss*strength;
   for(let c=0;c<3;c++)color[c]+=s.color[c]*a;
   const h=s.height*a*detail;
   gradient[0]+=-h*rx/(sig*sig);
   gradient[1]+=-h*rz/(sig*sig);
   masks[s.kind]=clamp(masks[s.kind]+a*.65);
 }
 const grain=microNoise(x,y,z)*gate*detail;
 for(let c=0;c<3;c++)color[c]+=grain*[3.25,2.6,2.2][c];
 const pigment=gate*(2.0*bell(Math.abs(x),.050,.048)*bell(z,.913,.10)
                     -1.1*bell(Math.abs(x),.0,.020)*bell(z,.867,.073));
 color[0]+=pigment;color[1]+=pigment*.48;color[2]-=pigment*.24;
 masks.detail=clamp(Math.abs(grain)/2.1);
 color[0]=clamp(color[0],-26,22);color[1]=clamp(color[1],-24,20);color[2]=clamp(color[2],-22,18);
 gradient[0]=clamp(gradient[0],-.18,.18);
 gradient[1]=clamp(gradient[1],-.18,.18);
 const roughnessShift=clamp(5*masks.shadow-7*masks.highlight+grain*1.9,-12,12);
 return {color,gradient,masks,roughnessShift,strokeCount:strokes};
}
module.exports={curves,paint,frontGate,microNoise,broadWashes};
