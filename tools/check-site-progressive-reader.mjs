// Compact mobile/desktop regression for the shared soldier-style reader flow.
// Run each half with --pages=... to keep smoke execution lightweight.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright-core';
const root=path.resolve('public');
const watchdog=setTimeout(()=>{console.error('WATCHDOG: site-wide browser smoke exceeded 150s');process.exit(3)},150000);
const defaults=['starting','captains','soldiers/modern','crafts','craft-weapons','facilities','armors','items','research','manufacture','events','forces','weapons','reference'];
const pages=process.argv.find(a=>a.startsWith('--pages='))?.slice(8).split(',')||defaults;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.gz':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://localhost');
  const file=path.resolve(root,'.'+decodeURIComponent(u.pathname),u.pathname.endsWith('/')?'index.html':'');
  if(!file.startsWith(root+path.sep))throw Error('outside public');
  const bytes=await fsp.readFile(file);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404);res.end('missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port+'/';
const browserPath=[process.env.EDGE_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium',chromium.executablePath()].find(x=>x&&fs.existsSync(x));
assert(browserPath,'Chrome/Edge not installed');
const browser=await chromium.launch({headless:true,executablePath:browserPath,args:['--no-sandbox']});
try{
 for(const slug of pages){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+slug+'/',{waitUntil:'domcontentloaded',timeout:12000});
  await page.locator('[data-atlas-reader-guide]').waitFor({timeout:8000});
  const info=await page.locator('[data-atlas-reader-guide]').evaluate(el=>{
   const actions=el.querySelector('.atlas-reader-actions');
   return {guideOverflow:el.scrollWidth>el.clientWidth+2,actionCount:actions?.children.length,
     columns:actions?getComputedStyle(actions).display:null,
     scrollable:actions?.scrollWidth>actions?.clientWidth+6};
  });
  assert.equal(info.guideOverflow,false,slug+' guide spills viewport');
  assert.equal(info.actionCount,3,slug+' 3-stage navigation');
  assert.equal(info.scrollable,true,slug+' must show horizontal 3-stage progression on phone');
  if(slug!=='soldiers/modern'){
   const wide=await page.locator('main .table-shell:has(table), main .table-scroll:has(table), main .tablewrap:has(table), main .table-container:has(table)').count();
   if(wide)assert((await page.locator('main .atlas-table-navigation').count())>=1,
     slug+' needs wide-table scroll controls');
  }
  assert.deepEqual(errors,[],slug+' page errors');
  console.log('PASS',slug,JSON.stringify(info));
  await page.close();
 }
 // Exercise dynamic content discovery on a known drawer, keeping source nodes intact.
 if(!process.argv.includes('--skip-detail')){
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
 await page.goto(base+'events/',{waitUntil:'domcontentloaded',timeout:18000});
 await page.locator('#detail').waitFor({state:'attached',timeout:8000});
 await page.evaluate(()=>{
  const root=document.getElementById('detail');
  root.innerHTML='<h2>획득 경로</h2><p>테스트 항목</p><h3>필요 연구·시설</h3><p>원본 조건</p><h3>보상과 효과</h3><p>보상 목록</p><h3>원본 근거와 검증</h3><p>정확한 수치</p>';
 });
 await page.locator('#detail .atlas-detail-index').waitFor({state:'attached',timeout:8000});
 const nav=page.locator('#detail .atlas-detail-index');
 assert((await nav.locator('.atlas-decision-step').count())>=3,'real horizontal decision stages');
 assert.equal(await nav.evaluate(el=>el.scrollWidth>el.clientWidth+2),false,'outer detail index should not overflow');
 assert.equal(await nav.locator('.atlas-detail-source').count(),1,'source evidence remains opt-in');
 await page.close();
 console.log('PASS detail stepper, source detail and mobile containment');
 }
}finally{clearTimeout(watchdog);await browser.close();await new Promise(resolve=>server.close(resolve));}
