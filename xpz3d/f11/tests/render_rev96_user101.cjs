'use strict';
const fs=require('fs'),path=require('path'),{chromium}=require('D:/xpiratez-data-atlas/node_modules/playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 const page=await browser.newPage({viewport:{width:1640,height:1030},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push('page: '+e.message));
 page.on('console',e=>{if(e.type()==='error')errors.push('console: '+e.text())});
 await page.goto('http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r4.html',{waitUntil:'domcontentloaded',timeout:16000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('로드 완료'),{timeout:18000});
 const results=[];
 for(const [variant,file,tri] of [
   ['base','r21AO-F11-user-trim-rev96-base.glb',3546],
   ['minimal','r21AO-F11-user-trim-rev96-bridge-minimal-r4.glb',3552],
   ['smooth','r21AO-F11-user-trim-rev96-bridge-smooth-r4.glb',3566]
 ]){
  await page.locator('#modelVariant').selectOption(file);
  await page.waitForFunction(expected=>document.querySelector('#metaAfter')?.textContent?.includes(expected.toLocaleString()),tri,{timeout:20000});
  for(const angle of [0,25,40,55])for(const wire of [true,false]){
   await page.evaluate(({angle,wire})=>{
    state.spread=angle;state.wire=wire;state.focus='detail';state.zoom=2.8;state.tilt=-55;state.angle=8;
    state.layerChoice='all';state.surfaceFilter='all';state.clothLeft=false;state.clothRight=false;
    for(const v of viewers){v.lastSpread=null;v.draw();}
   },{angle,wire});
   const filename='rev96-user101-'+variant+'-'+angle+'-'+(wire?'wire':'solid')+'.jpg';
   await page.locator('.grid').screenshot({path:path.join(__dirname,filename),type:'jpeg',quality:87,timeout:20000});
   results.push({variant,angle,mode:wire?'wire':'solid',file:filename});
  }
 }
 const report={source:'2026-11-16 15:28 user JSON, 101 deleted faces',page:page.url(),captures:results,errors,meta:await page.evaluate(()=>viewers.map(v=>({triangles:v.meta.tris,bones:v.meta.bones,parts:v.parts.length})))};
 fs.writeFileSync(path.join(__dirname,'rev96-user101-render-report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({captures:results.length,errors,meta:report.meta}));
 await browser.close();
})().catch(e=>{console.error(e.stack);process.exitCode=2});