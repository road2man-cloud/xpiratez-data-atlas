'use strict';
/**
 * R36LR deliberate bind-space painted surface, informed by R36KW/R36HW:
 * coherent silhouette wash, paired shade/rim strokes, localized reflected
 * light, broad convex forms, fine grain. NOT per-triangle shading or random
 * brightness. Pixel-color deltas are applied to the existing sprite-matched
 * skin rather than replacing it with another skin tone.
 *
 * Model space: x=left/right, y=front negative, z=up.
 * All coordinates are authored normalized model units, NOT metric anatomy.
 */
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t)};
const bell=(x,c,w)=>Math.exp(-0.5*((x-c)/w)**2);
const lerp=(a,b,t)=>a+(b-a)*t;
const segDist=(px,pz,a,b)=>{
  const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((px-a[0])*dx+(pz-a[1])*dz)/(dx*dx+dz*dz||1));
  const xx=a[0]+t*dx,zz=a[1]+t*dz;
  return Math.hypot(px-xx,pz-zz);
};
const curve=(control,x,z,width)=>{
  let best=Infinity;
  for(let i=0;i<control.length-1;i++)best=Math.min(best,segDist(x,z,control[i],control[i+1]));
  return bell(best,0,width);
};
function paint(p,variant='designed'){
  const [x,y,z]=p,ax=Math.abs(x),side=x<0?-.1:.04;
  const front=1-smooth(-.055,.038,y);
  const region=front*(1-smooth(.090,.166,ax))*smooth(.730,.823,z)*(1-smooth(.994,1.081,z));
  const body=front*bell(z,.912,.140)*(1-smooth(.14,.234,ax));
  const h=variant==='designed'?1:.68;
  // Artist placed curves, continuous in object-space. These are deliberately
  // independent of mesh triangles and UV islands.
  const spine=[[.007,.984],[.015,.952],[.019,.926],[.018,.898],[.014,.862],[.022,.824]];
  const left=[[.018,.967],[.032,.941],[.042,.911],[.044,.883],[.041,.848],[.054,.811]];
  const outer=[[.061,.989],[.080,.956],[.087,.925],[.081,.888],[.071,.850],[.086,.810]];
  const innerShadow=curve(spine,ax,z,.0075)*region;
  const innerGlow=curve(spine.map(([a,b])=>[a+.011,b]),ax,z,.010)*region;
  const ridgeShadow=curve(left,ax,z,.0080)*region;
  const ridgeLight=curve(left.map(([a,b])=>[a+.010,b+.002]),ax,z,.0104)*region;
  const outerEdge=curve(outer,ax,z,.016)*region;
  const lowerBlend=curve([[.014,.827],[.034,.812],[.063,.795],[.104,.795]],ax,z,.015)*region;
  const leftMass=bell(ax,.039,.036)*bell(z,.883,.105)*region;
  const upperHalo=bell(ax,.069,.061)*bell(z,.975,.066)*region;
  const lowerBounce=bell(ax,.072,.051)*bell(z,.843,.072)*region;
  const marginalShade=bell(ax,.12,.045)*bell(z,.883,.14)*body;
  // Smaller directional brush marks, following the long axis; no rainbow/no
  // black ink. Blend with the existing skin's hue instead of replacing it.
  const flow=bell(ax,.040+.005*Math.sin(z*31),.024)*bell(z,.888,.10);
  const brush=(.65*Math.sin(z*164+x*59)+.35*Math.sin(z*279-x*117))*flow*region;
  const subtleGrain=(.5*Math.sin(347*x+241*z)+.25*Math.sin(727*z-95*x))*.0030*region;
  const shade=h*(.077*innerShadow+.055*ridgeShadow+.026*outerEdge+
      .034*lowerBlend+.022*marginalShade);
  const light=h*(.072*ridgeLight+.055*innerGlow+
      .035*leftMass+.035*upperHalo+.036*lowerBounce);
  const warm=h*(.017*leftMass+.016*lowerBounce+.012*upperHalo);
  const signed=clamp(light-shade+.014*brush+subtleGrain,-.14,.14);
  const value=[signed+warm,signed*.85+warm*.41,signed*.67-warm*.32];
  const ao=clamp(1-.30*innerShadow-.22*ridgeShadow-.12*lowerBlend,.52,1);
  const rough=clamp(.82+.032*ridgeShadow+.026*leftMass-.025*ridgeLight,.72,.94);
  const gradX=h*(.046*curve(left,ax+.003,z,.011)*Math.sign(x||1))*(1-smooth(.13,.20,ax))*region;
  const gradZ=h*(.031*curve(spine,ax,z+.004,.014))*region;
  return {region,rgba:value,ao,rough,gradX,gradZ,
    layers:{innerShadow,innerGlow,ridgeShadow,ridgeLight,outerEdge,
      lowerBlend,leftMass,upperHalo,lowerBounce,marginalShade}};
}
module.exports={paint,curve};
