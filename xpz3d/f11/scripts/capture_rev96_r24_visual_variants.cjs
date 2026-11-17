'use strict';
const fs=require('fs'),path=require('path'),{chromium}=require('D:/xpiratez-data-atlas/node_modules/playwright-core');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 const page=await browser.newPage({viewport:{width:1480,height:1080},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r24.html',{waitUntil:'domcontentloaded',timeout:20000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('로드 완료'),{timeout:22000});
 const all=[];
 for(const [tag,filename] of [['soft-v3','r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-soft-v3.glb'],['wide-v3','r21AO-F11-user101-native-retopo-r24-posterior-opening-elliptic-wide-v3.glb'],['gentle','r21AO-F11-user101-native-retopo-r24-posterior-cleft-gentle.glb']]){
  if(tag!=='soft-v3'){await page.selectOption('#modelVariant',filename);await page.waitForFunction(s=>document.querySelector('#status')?.textContent?.includes(s),filename,{timeout:22000});}
  for(const [angle,preset,rot,tilt,focus,filter] of [[55,'under',0,-73,'pelvis','all'],[55,'behind',160,-63,'pelvis','all'],[55,'detail',0,-73,'detail','patch-core'],[0,'detail',0,-73,'detail','all']]){
   await page.evaluate(({angle,rot,tilt,focus,filter})=>{state.spread=angle;state.angle=rot;state.tilt=tilt;state.focus=focus;state.zoom=filter==='all'?3.2:3.65;state.wire=false;state.surfaceFilter=filter;state.layerChoice='all';state.clothLeft=false;state.clothRight=false;for(const v of viewers){v.lastSpread=null;v.draw();}},{angle,rot,tilt,focus,filter});
   const file='rev96-r24-'+tag+'-'+angle+'-'+preset+'.png';await page.locator('.grid').screenshot({path:path.join(__dirname,file)});all.push(file);
  }
 }
 await browser.close();
 fs.writeFileSync(path.join(__dirname,'REV96_USER101_R24_VISUAL_VARIANTS.json'),JSON.stringify({files:all,errors},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({files:all.length,errors}));
})().catch(e=>{console.error(e.stack);process.exitCode=2});