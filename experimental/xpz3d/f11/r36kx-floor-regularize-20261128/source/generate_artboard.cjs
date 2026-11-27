'use strict';
// 4-panel visual audit board of exact source palette (not GLB render).
// TL composite, TR authored border weights, BL shape highlight, BR roughness.
const fs=require('fs'),path=require('path'),art=require('./designed_skin_art.cjs');
const {png}=require('./bake_atlas.cjs');
const size=650,width=size*2,height=size*2,bytes=Buffer.alloc(width*height*4);
const toByte=x=>Math.round(255*Math.max(0,Math.min(1,x)));
for(let py=0;py<height;py++)for(let px=0;px<width;px++){
 const col=Math.floor(px/size),row=Math.floor(py/size),kind=row*2+col;
 const u=(px%size+.5)/size,v=1-(py%size+.5)/size;
 const P=[(u-.5)*.46,-.11+Math.abs(u-.5)*.065,.64+v*.73];
 const paint=art.palette(P,[0,-1,0],[.22,.10,.02],0,0);
 let rgb;
 if(kind===0)rgb=paint.linear.map(art.colorLinearToSRGB);
 else if(kind===1){const val=Math.min(1,paint.artLayers.ink*9);rgb=[.16+val*.60,.16+val*.36,.18+val*.22];}
 else if(kind===2){const val=Math.min(1,paint.artLayers.highlight*8);rgb=[.16+val*.56,.17+val*.50,.17+val*.37];}
 else {const val=(paint.rough-.73)/(.92-.73);rgb=[.22+val*.57,.23+val*.57,.24+val*.56];}
 const o=(py*width+px)*4;
 for(let k=0;k<3;k++)bytes[o+k]=toByte(rgb[k]);bytes[o+3]=255;
}
const out=path.resolve(__dirname,'../output/R36KW_DESIGNED_LAYERS.png');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,png(bytes,width,height));
console.log(JSON.stringify({file:out,bytes:fs.statSync(out).size,views:['color','authored edge','highlights','roughness']}));
