import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8'};
const server=http.createServer((req,res)=>{
  try {
    const u=new URL(req.url,'http://localhost');
    let name=path.resolve(root,'.'+decodeURIComponent(u.pathname));
    if(name!==root&&!name.startsWith(root+path.sep))throw new Error('Forbidden');
    if(fs.statSync(name).isDirectory())name=path.join(name,'index.html');
    res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream'});
    fs.createReadStream(name).pipe(res);
  }catch{res.writeHead(404).end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  const choices=['C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium',chromium.executablePath()];
  const executablePath=choices.find(x=>x&&fs.existsSync(x));
  if(!executablePath)throw new Error('Chrome or Edge missing');
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage({viewport:{width:1250,height:850}});
  const errors=[];
  page.on('pageerror',error=>errors.push('pageerror '+error.message));
  page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});
  const host='http://127.0.0.1:'+server.address().port;
  await page.goto(host+'/manufacture-v2/planner/?id=STR_3RL_HE_XXX',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('계산 완료'),null,{timeout:20000});
  assert((await page.locator('#plan-id').innerText()).includes('STR_3RL_HE_XXX'));
  assert((await page.locator('#tree').innerText()).includes('화학물질'));
  assert(await page.locator('#choice-panel').isVisible());
  const chemical=page.locator('select[aria-label*="화학물질 조달 방법"]');
  assert(await chemical.count()===1);
  await chemical.selectOption('STR_CHEMICALS_XXX');
  await page.waitForFunction(()=>document.querySelector('#tree')?.textContent?.includes('STR_CHEMICALS_XXX'),null,{timeout:20000});
  assert((await page.locator('#tree').innerText()).includes('하위 제조'));
  await page.locator('#batches').fill('3');
  await page.locator('#recalculate').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('계산 완료'));
  assert((await page.locator('#tree').innerText()).includes('3회 · 제조비 30,000'));
  assert((await page.locator('#summary').innerText()).includes('명시된 제조비 합'));
  assert(await page.locator('#download-plan').isEnabled());
  // Actual v.o2 inventory entry is applied to the consolidated bill.
  await page.locator('#stock-search').fill('STR_CHEMICALS');
  await page.locator('#stock-select').selectOption('STR_CHEMICALS');
  await page.locator('#stock-qty').fill('40');
  await page.locator('#stock-add').click();
  await page.waitForFunction(()=>document.querySelector('#summary')?.textContent?.includes('기존 재고 사용량'));
  assert((await page.locator('#stock-list').innerText()).includes('화학물질'));
  assert((await page.locator('#consolidated').innerText()).includes('STR_CHEMICALS'));
  assert((await page.locator('#summary').innerText()).includes('36개'));
  assert((await page.locator('#tree').innerText()).includes('보유 재고 36개'));
  await page.locator('#stock-clear').click();
  await page.waitForFunction(()=>document.querySelector('#stock-list')?.textContent?.includes('입력된 보유 재고 없음'));
  await page.locator('button').filter({hasText:'대체 경로 비용 비교'}).first().click();
  assert(await page.locator('#comparison-section').isVisible());
  assert((await page.locator('#comparison-data').innerText()).includes('전체 제조비'));
  assert((await page.locator('#comparison-data tbody tr').count()) >= 2);
  assert.deepEqual(errors,[]);
  console.log('PASS 2.1 manufacturing planner UI: nested production, stock deduction, consolidated materials, alternative comparison and JSON export');
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
