'use strict';
const fs=require('fs'),path=require('path'),{chromium}=require('D:/xpiratez-data-atlas/node_modules/playwright-core');
const root=__dirname,file='r21AO-F11-user101-integrated-oval-r31a-curved-lateral-skin-retopo.glb';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 const page=await browser.newPage({viewport:{width:1480,height:1080},deviceScaleFactor:1}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push('PAGE: '+e.message));
 page.on('console',e=>{if(e.type()==='error')errors.push('CONSOLE: '+e.text())});
 await page.route('**/*.glb',async route=>{
  const name=decodeURIComponent(new URL(route.request().url()).pathname).split('/').at(-1);
  if(name===file){requests.push(name);return route.fulfill({status:200,contentType:'model/gltf-binary',body:fs.readFileSync(path.join(root,file)),headers:{'Access-Control-Allow-Origin':'*'}});}
  return route.continue();
 });
 await page.goto('http://127.0.0.1:8873/f11/r21al/review-rev96-user101-r28b.html',{waitUntil:'domcontentloaded',timeout:18000});
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('로드 완료'),{timeout:25000});
 await page.evaluate(file=>{
  const sel=document.querySelector('#modelVariant'),opt=document.createElement('option');
  opt.value=file;opt.textContent='r31a curved posterior topology GLB';sel.appendChild(opt);sel.value=file;
  sel.dispatchEvent(new Event('change',{bubbles:true}));
 },file);
 await page.waitForFunction(()=>typeof viewers!=='undefined'&&viewers?.[1]?.meta?.tris===6010,{timeout:19000}).catch(async e=>{console.error('STATUS',await page.evaluate(()=>({status:document.querySelector('#status')?.textContent,models:typeof viewers!=='undefined'?viewers.map(v=>v.meta?.tris):[],selected:document.querySelector('#modelVariant')?.value})));console.error('ROUTES',requests,'ERRORS',errors);throw e;});
 await page.evaluate(()=>{const panels=document.querySelector('.grid');if(!panels)return;const right=panels.children[1];if(!right)return;const walker=document.createTreeWalker(right,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){if(node.nodeValue.includes('r28b'))node.nodeValue=node.nodeValue.replaceAll('r28b','r31a').replaceAll('내부 장변 분할·낮은 변형률 표면','실제 측면 삼각면 56 변 재토폴로지');}});
 const screenshots=[];
 for(const angle of [0,25,40,55]){
  for(const [view,rot,tilt,focus] of [['under',0,-73,'pelvis'],['behind',160,-63,'pelvis']]){
   for(const wire of [false,true]){
    await page.evaluate(({angle,rot,tilt,focus,wire})=>{
     state.spread=angle;state.angle=rot;state.tilt=tilt;state.focus=focus;state.zoom=3.2;state.wire=wire;
     state.surfaceFilter='all';state.layerChoice='all';state.clothLeft=false;state.clothRight=false;
     for(const v of viewers){v.lastSpread=null;v.draw();}
    },{angle,rot,tilt,focus,wire});
    const name='rev96-r31a-curved-lateral-canonical-'+angle+'-'+view+'-'+(wire?'wire':'solid')+'.png';
    await page.locator('.grid').screenshot({path:path.join(root,name),timeout:18000});screenshots.push(name);
   }
  }
 }
 const report={file,loadedRequests:requests,createdUTC:new Date().toISOString(),captures:screenshots,errors,meta:await page.evaluate(()=>viewers.map(v=>({tris:v.meta.tris,bones:v.meta.bones,parts:v.parts.length})))};
 fs.writeFileSync(path.join(root,'rev96-r31a-curved-lateral-canonical-render-report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(report,null,2));await browser.close();
})().catch(e=>{console.error(e.stack);process.exit(2)});
