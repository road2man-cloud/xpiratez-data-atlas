'use strict';
const fs=require('fs'),path=require('path'),{chromium}=require('D:/xpiratez-data-atlas/node_modules/playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 const page=await browser.newPage({viewport:{width:1480,height:1080}});
 await page.goto('http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r23.html',{waitUntil:'domcontentloaded',timeout:18000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('로드 완료'),{timeout:20000});
 const result=[];
 for(const angle of [0,55])for(const [view,rot,tilt]of[['under',0,-73],['behind',160,-63]])for(const filter of ['skin-underlay','patch-core','body']){
  await page.evaluate(({angle,rot,tilt,filter})=>{
   state.spread=angle;state.angle=rot;state.tilt=tilt;state.focus='pelvis';state.zoom=3.2;
   state.wire=false;state.surfaceFilter=filter;state.layerChoice='all';state.clothLeft=false;state.clothRight=false;
   for(const v of viewers){v.lastSpread=null;v.draw();}
  },{angle,rot,tilt,filter});
  const name='rev96-r23-isolate-'+angle+'-'+view+'-'+filter+'.png';
  await page.locator('#viewAfter').screenshot({path:path.join(__dirname,name)});
  result.push(name);
 }
 await browser.close();
 fs.writeFileSync(path.join(__dirname,'rev96-r23-isolate-report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.stack);process.exitCode=1});