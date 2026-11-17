'use strict';const fs=require('fs'),path=require('path'),{chromium}=require('D:/xpiratez-data-atlas/node_modules/playwright-core');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
const p=await browser.newPage({viewport:{width:1480,height:1080}}),logs=[];p.on('pageerror',e=>logs.push(e.message));
await p.goto('http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r23.html');
await p.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('로드 완료'),{timeout:20000});
const files=[],variants=[['refined','r21AO-F11-user101-native-retopo-r23-refined.glb'],['soft','r21AO-F11-user101-native-retopo-r23-soft.glb']];
for(const [tag,model]of variants){
 await p.selectOption('#modelVariant',model);
 await p.waitForFunction(v=>document.querySelector('#status')?.textContent?.includes(v),model,{timeout:25000});
 for(const [angle,view,rot,tilt]of[[55,'under',0,-73],[55,'behind',160,-63],[0,'behind',160,-63]]){
  await p.evaluate(({angle,rot,tilt})=>{state.spread=angle;state.angle=rot;state.tilt=tilt;state.focus='pelvis';state.zoom=3.2;state.wire=false;state.surfaceFilter='all';state.layerChoice='all';state.clothLeft=false;state.clothRight=false;for(const v of viewers){v.lastSpread=null;v.draw();}},{angle,rot,tilt});
  const name='rev96-r23-'+tag+'-'+angle+'-'+view+'-solid.png';await p.locator('.grid').screenshot({path:path.join(__dirname,name)});files.push(name);
 }
}
await browser.close();
fs.writeFileSync(path.join(__dirname,'rev96-r23-variants-report.json'),JSON.stringify({files,logs},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({files,logs}));
})().catch(e=>{console.error(e.stack);process.exitCode=1});