'use strict';
const fs=require('fs'),path=require('path'),{chromium}=require('D:/xpiratez-data-atlas/node_modules/playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 const p=await browser.newPage({viewport:{width:1480,height:1080},deviceScaleFactor:1}),errors=[];
 p.on('pageerror',e=>errors.push('page:'+e.message));p.on('console',e=>{if(e.type()==='error')errors.push('console:'+e.text())});
 await p.goto('http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r28b.html',{waitUntil:'domcontentloaded',timeout:18000});
 await p.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('로드 완료'),{timeout:20000});
 if(await p.evaluate(()=>document.querySelector('#modelVariant')?.value)!=='r21AO-F11-user101-integrated-oval-r28b-lowstrain-skin-retopo.glb')throw Error('Viewer did not select r28 candidate');
 await p.evaluate(()=>document.querySelector('#modelVariant').dispatchEvent(new Event('change',{bubbles:true})));
 await p.waitForFunction(()=>viewers?.[1]?.meta?.tris===5446,{timeout:25000});
 const screenshots=[];
 for(const angle of [0,25,40,55]){
  for(const [view,rot,tilt,focus] of [['under',0,-73,'pelvis'],['behind',160,-63,'pelvis']]){
    for(const wire of [false,true]){
     await p.evaluate(({angle,rot,tilt,focus,wire})=>{
      state.spread=angle;state.angle=rot;state.tilt=tilt;state.focus=focus;state.zoom=3.2;state.wire=wire;
      state.surfaceFilter='all';state.layerChoice='all';state.clothLeft=false;state.clothRight=false;
      for(const v of viewers){v.lastSpread=null;v.draw();}
     },{angle,rot,tilt,focus,wire});
     const name='rev96-r28b-lowstrain-canonical-'+angle+'-'+view+'-'+(wire?'wire':'solid')+'.png';
     await p.locator('.grid').screenshot({path:path.join(__dirname,name),timeout:18000});
     screenshots.push(name);
    }
   }
 }
 const report={captures:screenshots,errors,meta:await p.evaluate(()=>viewers.map(v=>({triangles:v.meta.tris,parts:v.parts.length,bones:v.meta.bones})))};
 fs.writeFileSync(path.join(__dirname,'rev96-r28b-lowstrain-canonical-render-report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({screenshots:screenshots.length,errors,meta:report.meta}));
 await browser.close();
})().catch(e=>{console.error(e.stack);process.exitCode=2});