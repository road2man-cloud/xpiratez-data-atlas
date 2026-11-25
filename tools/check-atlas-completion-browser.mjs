import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {chromium} from 'playwright-core';
const root=path.resolve('public'),db=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'data/branch-soldier-results.json.gz')))),summary=db.careerCompletion.summary;
const server=http.createServer((req,res)=>{try{let f=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');if(!f.startsWith(root+path.sep)||!fs.existsSync(f))throw Error('404');res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.gz':'application/octet-stream'})[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);}catch{res.writeHead(404).end('not found');}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base='http://127.0.0.1:'+server.address().port+'/';
const chrome=[process.env.EDGE_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium',chromium.executablePath()].find(x=>x&&fs.existsSync(x));
let browser;
try{
 assert(chrome,'Browser required');
 browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-gpu']});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'soldiers/modern/',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#rowCount[data-route-status="loaded"]',{timeout:60000});
 const count=()=>page.locator('#originTable tbody tr[data-route-key]').count();
 assert.equal(await count(),Math.min(summary.completeCombinations,100));
 assert((await page.locator('#catalogStatus').innerText()).includes('완결 조합 '+summary.completeCombinations.toLocaleString('ko-KR')+'개'));
 assert.equal(await page.locator('[data-terminal-supply-plan]').count(),db.careerCompletion.terminalSupply.terminalPlans);
 assert((await page.locator('#terminalResearchProgress').textContent()).includes('실제 자금 조달'));
 assert((await page.locator('#catalogStatus').innerText()).includes('조건부 조달 계획'));
 if(db.careerCompletion.terminalEconomy){
  assert.equal(await page.locator('[data-economic-scenario]').count(),db.careerCompletion.terminalEconomy.summary.produced);
  const details=page.locator('[data-economic-detail]').first();
  await details.evaluate(el=>{for(let p=el;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
  await page.waitForFunction(()=>document.querySelector('[data-economic-body]')?.dataset.loaded==='1');
  assert((await details.innerText()).includes('월별 장부'));
  assert((await details.innerText()).includes('6×6 배치 후보'));
  const finite=db.careerCompletion.terminalEconomy.summary.finiteSeedSchedules;
  if(finite){
   assert.equal(await page.locator('[data-finite-seed="true"]').count(),finite);
   const hash=await page.locator('[data-finite-seed="true"]').first().getAttribute('data-economic-scenario');
   const row=page.locator('[data-economic-detail="'+hash+'"]');
   await row.evaluate(el=>{for(let p=el;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
   await row.locator('[data-financing-summary]').waitFor();
   assert((await row.locator('[data-financing-summary]').innerText()).includes('외부 자금 추가 지급 0'));
   await row.locator('[data-cash-ledger]').evaluate(el=>el.open=true);
   await row.locator('[data-cash-ledger-rows] li').first().waitFor();
   assert.equal(await row.locator('[data-cash-ledger-rows] li').count(),100);
  }
 }
 if(db.careerCompletion.earlyEconomy){
  assert.equal(await page.locator('[data-early-economic-scenario]').count(),db.careerCompletion.earlyEconomy.summary.scenarios);
  const row=page.locator('[data-early-economic-detail]').first();
  await row.evaluate(el=>{for(let p=el;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
  await row.locator('[data-early-transactions] li').first().waitFor();
  assert((await row.innerText()).includes('월별 장부'));
  assert((await row.innerText()).includes('실제 연구 달력 아님'));
 }
 for(const group of ['origin','body','routes']){
  await page.locator('#catalogGrouping').selectOption(group);
  if(!summary.completeCombinations)assert.equal(await count(),0);
 }
 await page.locator('#careerScopeLink').click();
 await page.waitForSelector('#originTable tbody tr[data-origin-id]',{timeout:60000});
 assert.equal(await page.locator('#originTable tbody tr[data-origin-id]').count(),72);
 await page.locator('#catalogGrouping').selectOption('routes');
 await page.waitForSelector('#rowCount[data-route-status="loaded"]',{timeout:60000});
 assert(await count()>0);
 assert((await page.locator('#rowCount').innerText()).includes('완결 조합 아님'));
 await page.goto(base+'captains/',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#bsCount[data-career-status="loaded"]',{timeout:60000});
 if(!summary.completeCombinations)assert.equal(await page.locator('#bsTable tr[data-selected-route]').count(),0);
 assert((await page.locator('#bsCareerScope').innerText()).includes('원본 최종 연구 목표'));
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({complete:summary.completeCombinations,referenceOrigins:72,branchView:'shared completion registry',errors}));
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}
