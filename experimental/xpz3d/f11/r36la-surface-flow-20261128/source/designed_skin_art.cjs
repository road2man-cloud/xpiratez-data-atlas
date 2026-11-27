'use strict';
/**
 * R36KW / F11: designed-art skin painter.
 * Bind-space continuous authored folds, pigment lanes, double-edge contour
 * and brush accents, based on R36KV's reference skin palette.
 * No UV-island or triangle-ID decisions: same 3D position => same pigment.
 * Positions in metres: +X=model left, -Y=anterior, +Z=superior.
 * Stylised paint model, not a claim of anatomical fidelity.
 */
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const mix=(a,b,t)=>a+(b-a)*t;
const gauss=(x,c,r)=>Math.exp(-Math.pow((x-c)/r,2));
const line=(dist,width)=>Math.exp(-.5*(dist/width)**2);
const fract=x=>x-Math.floor(x);
function hash(x,y,z){let k=(Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2246822519))|0;k=Math.imul(k^(k>>>13),1274126177);return((k^(k>>>16))>>>0)/4294967295;}
function noise(x,y,z){
 const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
 const sx=smooth(0,1,fract(x)),sy=smooth(0,1,fract(y)),sz=smooth(0,1,fract(z));
 const plane=k=>mix(mix(hash(ix,iy,iz+k),hash(ix+1,iy,iz+k),sx),mix(hash(ix,iy+1,iz+k),hash(ix+1,iy+1,iz+k),sx),sy);
 return mix(plane(0),plane(1),sz)*2-1;
}
function fBm(x,y,z){return .54*noise(x*8.5,y*8.5,z*8.5)+.26*noise(x*23,y*23,z*23)+.13*noise(x*65,y*65,z*65)+.07*noise(x*165,y*165,z*165);}
function srgb(linear){linear=clamp(linear);return linear<=.0031308?12.92*linear:1.055*linear**(1/2.4)-.055;}
function front(p){return 1-smooth(-.092,.065,p[1]);}
function coreRegion(p){const x=Math.abs(p[0]),z=p[2];return front(p)*(1-smooth(.07,.174,x))*smooth(.725,.818,z)*(1-smooth(.97,1.07,z));}
function featureMasks(p){
 const [x,y,z]=p,ax=Math.abs(x),f=front(p);
 const pelvis=coreRegion(p);
 const abdomen=f*(1-smooth(.16,.28,ax))*smooth(.94,1.06,z)*(1-smooth(1.26,1.38,z));
 const inside=f*smooth(.046,.10,ax)*(1-smooth(.145,.226,ax))*smooth(.69,.80,z)*(1-smooth(.94,1.065,z));
 const inguinal=f*gauss(ax,.09,.05)*gauss(z,.83,.15);
 const outside=f*gauss(ax,.20,.07)*gauss(z,.945,.20);
 const contourZ=.855+.035*smooth(.012,.15,ax)-.012*gauss(ax,.11,.035);
 const contourEnvelope=f*(1-smooth(.135,.195,ax))*smooth(.745,.82,z)*(1-smooth(.975,1.06,z));
 const contourShadow=line(z-contourZ,.010)*contourEnvelope;
 const contourLip=line(z-contourZ-.014,.009)*contourEnvelope;
 const groinZ=.802+.075*ax+.043*gauss(ax,.055,.05);
 const foldEnvelope=inside*(1-smooth(.17,.225,ax));
 const groinShadow=line(z-groinZ,.014)*foldEnvelope;
 const groinLip=line(z-groinZ+.022,.017)*foldEnvelope;
 const bellyHighlight=f*gauss(ax,.085,.09)*gauss(z,1.10,.18);
 const hipHighlight=f*gauss(ax,.185,.075)*gauss(z,.955,.19);
 const floorHighlight=f*gauss(ax,.085,.062)*gauss(z,.84,.095);
 // Exterior thoracic volume. Soft broad form above, carefully feathered
 // underside transition below. No explicit areola / nipple markings.
 const chestEnv=f*gauss(ax,.165,.133)*smooth(1.185,1.245,z)*(1-smooth(1.445,1.50,z));
 const chestVolume=chestEnv*gauss(z,1.352,.130);
 const chestUpperLight=chestEnv*gauss(z,1.397,.072);
 const chestLowerLight=chestEnv*gauss(z,1.297,.068);
 const chestFold=chestEnv*gauss(z,1.225+.014*gauss(ax,.16,.08),.024);
 const chestSideShade=chestEnv*gauss(ax,.285,.055)*gauss(z,1.315,.12);
 return {pelvis,abdomen,inside,inguinal,outside,contourShadow,contourLip,groinShadow,groinLip,bellyHighlight,hipHighlight,floorHighlight,chestVolume,chestUpperLight,chestLowerLight,chestFold,chestSideShade};
}
function palette(p,n,donorRGB,sourceCore=0,depth=0){
 const [x,y,z]=p,M=featureMasks(p),base=[.425,.255,.128];
 // R36LA: donor vertex colors jump at some donor triangle/UV boundaries.
 // Replace per-donor triangle tint with continuous low-frequency 3D pigment.
 // The donor still contributes to the NORMAL and RELIEF bakes; this art
 // base-color pass is now stable across each independent low-poly UV island.
 const pigment=noise(x*4.2+7.3,y*4.2-2.5,z*4.2+1.7);
 const warm=noise(x*2.3-5,y*2.3+9,z*2.3+4);
 const d=[1+.058*pigment+.018*warm,1+.041*pigment,1+.031*pigment-.016*warm];
 let c=base.map((v,i)=>v*d[i]);
 const clay=fBm(x,y,z),marble=noise(x*5,y*5,z*5),fine=noise(x*185,y*185,z*185),pore=noise(x*415+17,y*415-8,z*415+7);
 const structure=.095*M.abdomen+.105*M.inside+.060*M.inguinal-.045*M.outside+.040*M.pelvis+.075*M.chestVolume-.034*M.chestSideShade;
 // R36LB: donor depth changes abruptly across closest-triangle boundaries.
 // Keep the high-poly relief in the dedicated normal/height channels only.
 const depthShade=0;
 const ink=.092*M.contourShadow+.087*M.groinShadow+.048*M.chestFold;
 const edgeLight=.067*M.contourLip+.045*M.groinLip+.034*M.chestLowerLight;
 const highlight=.080*M.bellyHighlight+.072*M.hipHighlight+.055*M.floorHighlight+.095*M.chestUpperLight;
 const pigmentWash=.056*M.pelvis+.018*M.inside;
 const texture=.028*clay+.014*marble+.006*fine-.007*Math.max(0,pore);
 for(let i=0;i<3;i++){
  const colorVolume=structure*(i===0?1:i===1?.85:.64)+depthShade;
  const brush=highlight*(i===0?1:i===1?.93:.80);
  c[i]=clamp(c[i]*(1+colorVolume+texture)+brush-ink*(i===0?.85:i===1?.78:.66)+edgeLight*(i===0?1:i===1?.87:.72),.08,.75);
 }
 c[0]=clamp(c[0]+pigmentWash*.048,.08,.76);
 c[1]=clamp(c[1]+pigmentWash*.012,.07,.65);
 c[2]=clamp(c[2]-pigmentWash*.018,.045,.52);
 const rough=clamp(.82+.040*M.pelvis-.032*highlight+.030*clay,.73,.92);
 // World-position-defined occlusion avoids a second donor-nearest seam.
 const ao=clamp(.975-ink*.27-.035*M.groinShadow,.90,1);
 const pores=[noise(x*230+9,y*230-6,z*230+7),noise(x*230-19,y*230+17,z*230+2)];
 return {linear:c,rough,ao,pores,coreMask:M.pelvis,paintedVolume:structure,artLayers:{ink,edgeLight,highlight,structure,pigmentWash,rough}};
}
module.exports={palette,coreRegion,colorLinearToSRGB:srgb,featureMasks,noise,fBm};
