'use strict';
/**
 * R36KV art-direction skin shader for high-poly->2048 texture baking.
 * All motifs are expressed in BIND-SPACE METERS, never raw UV coordinates.
 * This prevents discontinuities at every independent triangle UV island.
 * Uses R36HW face's linear baseColor [0.56,0.37,0.19] as calibration,
 * donor body vertex pigment and translated high-poly central-surface normals.
 * Stylized, non-photorealistic, authored tonal painting + fine skin grain.
 */
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const gauss=(x,c,r)=>Math.exp(-Math.pow((x-c)/r,2)*1.25);
function hash(x,y,z){
 let n=(Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647))|0;
 n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;
}
function noise(x,y,z){
 const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
 const fx=x-ix,fy=y-iy,fz=z-iz;
 const a=fx*fx*(3-2*fx),b=fy*fy*(3-2*fy),c=fz*fz*(3-2*fz);
 const val=(i,j,k)=>hash(ix+i,iy+j,iz+k);
 const xy=(k)=>mix(mix(val(0,0,k),val(1,0,k),a),
                   mix(val(0,1,k),val(1,1,k),a),b);
 return mix(xy(0),xy(1),c)*2-1;
}
function fBm(x,y,z){
 return .55*noise(x*9,y*9,z*9)+.26*noise(x*24,y*24,z*24)+
        .12*noise(x*63,y*63,z*63)+.07*noise(x*160,y*160,z*160);
}
function colorLinearToSRGB(v){return v<=.0031308?12.92*v:1.055*Math.pow(clamp(v),1/2.4)-.055}
function palette(p,n,donor,coreMask=0,depth=0){
 const [x,y,z]=p;const ax=Math.abs(x);
 // Face in authentic R36HW uses [0.56, 0.37, 0.19] linear.
 const face=[.44,.265,.125],srcRef=[.22,.10,.02];
 const pigment=donor||srcRef;
 // Source artist's pigmented body provides relative palette variation, not a
 // substitution for the R36HW skin tone. Clamp pigment outliers.
 const highVariation=pigment.map((v,k)=>
   clamp(Math.pow(Math.max(.015,v)/srcRef[k],.24),.82,1.16));
 const front=1-smooth(-.11,.04,y); // front (-Y) becomes strong
 const lateral=smooth(.04,.23,ax);
 const floor=smooth(.738,.812,z)*(1-smooth(.945,1.035,z))*
             (1-smooth(.075,.165,ax))*front;
 const upper=smooth(.965,1.10,z)*(1-smooth(1.32,1.47,z));
 const thigh=(1-smooth(.78,.96,z))*lateral;
 const bodyMod=[
  .97+.045*thigh+.035*upper,
  .96+.037*upper+.024*thigh,
  .91+.050*upper+.038*thigh
 ];
 const coreTone=[.49,.30,.185]; // warm hue from donor source, not grey fill
 const base=face.map((v,k)=>mix(v*bodyMod[k]*highVariation[k],coreTone[k],coreMask*.36));
 const grain=fBm(x,y,z);
 const marble=noise(x*4.5,y*4.5,z*4.5);
 const follicle=noise(x*218+17.1,y*218-5.3,z*218+21.1);
 const micro=noise(x*405-9.5,y*405+4.1,z*405-11.2);
 // Paint structural volumes: pelvis crease, upper thigh ridge, waist taper,
 // belly illumination, anatomical source relief. No isolated UV-local motifs.
 const innerThighGlow=
    .22*gauss(ax,.115,.095)*gauss(z,.79,.21)*front;
 const upperHipRidge=
    .17*gauss(ax,.23,.11)*gauss(z,1.0,.19)*front;
 const torsoGlow=
    .13*gauss(ax,.11,.20)*gauss(z,1.20,.22)*front;
 const flankShade=
    -.10*gauss(ax,.26,.10)*gauss(z,.87,.15)*front;
 const creaseShade=
    -.18*gauss(ax,.052,.025)*gauss(z,.84,.075)*front;
 const umbilicalShade=
    -.09*gauss(ax,0,.018)*gauss(z,1.145,.025)*front;
 const volume=innerThighGlow+upperHipRidge+torsoGlow+flankShade+
              creaseShade+umbilicalShade+.060*grain+.025*marble+
              .015*micro-.020*clamp(depth*30,-1,1);
 const speckles=follicle>.68?-.043*(follicle-.68)/.32:0;
 // Subcutaneous variation is warmer near source pelvic tissue; keep modest
 // saturation difference so all passes form a single coherent painted skin.
 const rose=.090*floor+.035*gauss(ax,.13,.12)*gauss(z,.79,.17)*front;
 const out=base.map((v,k)=>clamp(v*(1+volume+speckles+
                 (k===0?rose:k===1?rose*.14:-rose*.32)),.07,.86));
 const blueGreenVariation=.0035*noise(x*107,y*107,z*107);
 out[1]=clamp(out[1]+blueGreenVariation,.05,.82);
 const rough=clamp(.82 + .055*floor + .045*grain + .022*micro,.73,.94);
 const ao=clamp(.955 + volume*.22 - Math.min(0,depth)*1.1,.88,1);
 const pores=[noise(x*225,y*225,z*225),noise(x*225+31,y*225+31,z*225-22)];
 return {linear:out,rough,ao,pores,coreMask:floor,paintedVolume:volume};
}
function coreRegion(p){
 const x=Math.abs(p[0]),y=p[1],z=p[2];
 return (1-smooth(.072,.16,x))*smooth(.735,.825,z)*
        (1-smooth(.975,1.07,z))*(1-smooth(-.11,.04,y));
}
module.exports={palette,coreRegion,colorLinearToSRGB,noise,hash};
