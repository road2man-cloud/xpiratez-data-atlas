// Item DB acquisition smoke: live legacy sources, not fabricated success paths.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {chromium} from 'playwright-core';

const root=path.resolve('public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8',
  '.gz':'application/gzip'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname),
      url.pathname.endsWith('/')?'index.html':'');
    if(!file.startsWith(root+path.sep))throw Error('Path outside public');
    const bytes=await fsp.readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream',
      'Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end('missing');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base=(process.env.ATLAS_TECH_SITE_BASE||
  ('http://127.0.0.1:'+server.address().port)).replace(/\/+$/,'');
const binary=[process.env.EDGE_PATH,process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser','/opt/google/chrome/chrome',
  chromium.executablePath()].find(x=>x&&fs.existsSync(x));
assert(binary,'Browser executable missing');
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:binary,
    args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.setDefaultTimeout(35000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/items/#item=STR_BUCKSHOT_HV',{waitUntil:'domcontentloaded'});
  const launch=page.locator('#detail [data-open-item-tech="STR_BUCKSHOT_HV"]');
  await launch.waitFor({timeout:80000});
  await launch.click();
  const dialog=page.locator('#itemTechDialog');
  const tech=dialog.locator('.tech-viewer');
  await tech.waitFor({timeout:60000});
  assert.equal(await tech.locator('.tech-column').count(),2);
  assert((await tech.locator('.tech-adapter-notice').innerText()).includes('v.o1.1.1'));
  assert((await tech.locator('.tech-adapter-notice').innerText()).includes('재고'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const node=(stage,index)=>tech.locator('.tech-node[data-tech-stage="'+stage+
    '"][data-tech-index="'+index+'"]');
  assert.equal(await tech.locator('.tech-node[data-tech-stage="1"]').count(),2);
  await node(1,0).click(); // store candidate
  const store=await tech.locator('.tech-node[data-tech-stage="2"]').allInnerTexts();
  assert(store.some(t=>t.includes('연구')&&t.includes('벅샷')));
  assert(store.some(t=>t.includes('재고')));
  assert(store.some(t=>t.includes('100')));
  await tech.locator('.tech-node[data-tech-stage="2"].tech-node--research').click();
  assert((await tech.locator('.tech-source-link').getAttribute('href'))
    .includes('../research/#research=STR_BUCKSHOT_HV'));
  await tech.locator('[data-tech-action="reset"]').click();
  await node(1,1).click(); // manufacturing random outcome
  const manufacture=await tech.locator('.tech-node[data-tech-stage="2"]').allInnerTexts();
  assert(manufacture.some(t=>t.includes('황무지주민의 배낭')));
  assert(manufacture.some(t=>t.includes('0.388%')));
  const ingredient=tech.locator('.tech-node[data-tech-stage="2"].tech-node--item');
  await ingredient.click();
  assert.equal(await tech.locator('.tech-column').count(),4);
  assert((await tech.locator('.tech-source-link').getAttribute('href'))
    .includes('../items/#item=STR_WASTELANDER_BACKPACK'));
  assert((await tech.locator('.tech-route-step').count())>=3);
  await tech.locator('[data-tech-action="source"]').click();
  await tech.locator('.tech-original .tech-adapter-proof').waitFor();
  const evidence=await tech.locator('.tech-original .tech-adapter-proof').innerText();
  assert(evidence.includes('v.o1.1.1'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  if(process.env.ATLAS_ITEM_SCREENSHOT==='1'){
    await tech.locator('.tech-original > summary').click();
    await tech.screenshot({path:path.join(os.tmpdir(),'xpiratez-item-tech-mobile.png')});
  }
  await dialog.locator('#closeItemTech').click();
  assert.equal(await dialog.evaluate(el=>el.open),false);
  assert.equal(await page.locator('#drawer').getAttribute('aria-hidden'),'false',
    'Opening and closing acquisition map cannot close the item dossier');

  await page.goto(base+'/items/#item=STR_MED_CANNON_PARTS',{waitUntil:'domcontentloaded'});
  // Same-path hash navigation does not reload the document. Wait for the
  // new item's exact ID, not an old button from the previous drawer state.
  const eventLaunch=page.locator('#detail [data-open-item-tech="STR_MED_CANNON_PARTS"]');
  await eventLaunch.waitFor();
  await eventLaunch.click();
  await dialog.locator('.tech-viewer').waitFor();
  const eventGraph=dialog.locator('.tech-viewer');
  await eventGraph.locator('.tech-node[data-tech-stage="1"]').first().click();
  await eventGraph.locator('.tech-node[data-tech-stage="2"]').first().waitFor();
  const eventGates=await eventGraph.locator('.tech-node[data-tech-stage="2"]').allInnerTexts();
  assert(eventGates.some(t=>t.includes('이벤트 발생')));
  assert(eventGates.some(t=>t.includes('지급')));
  assert(!eventGates.some(t=>t.includes('랜덤표 내부 비중')));
  await dialog.locator('#closeItemTech').click();

  await page.goto(base+'/items/#item=SPC_CUM_OR_ELSE',{waitUntil:'domcontentloaded'});
  await page.locator('#detail [data-open-item-tech="SPC_CUM_OR_ELSE"]').waitFor();
  await page.locator('#detail [data-open-item-tech="SPC_CUM_OR_ELSE"]').click();
  const unsupported=dialog.locator('.tech-viewer');
  await unsupported.waitFor();
  assert((await unsupported.locator('.tech-node[data-tech-stage="1"]').innerText())
    .includes('확인된 획득 경로 없음'));
  await dialog.locator('#closeItemTech').click();
  await page.setViewportSize({width:1280,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[],'Unexpected page JavaScript errors');
  console.log('PASS item acquisition viewer: mobile 390px + desktop 1280px, purchase vs stock, recursive manufacturing inputs, conditional RNG, source proof, fixed event reward, unknown sources, no overflow');
}finally{
  if(browser)await browser.close();
  await new Promise(ok=>server.close(ok));
}
