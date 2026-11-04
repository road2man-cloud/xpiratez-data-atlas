// Cross-database tech viewer: real legacy Research DB browser smoke.
// Verify source-version isolation and the shared Soldiers presentation engine.
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
    const u=new URL(req.url,'http://localhost');
    const filename=path.resolve(root,'.'+decodeURIComponent(u.pathname),
      u.pathname.endsWith('/')?'index.html':'');
    if(!filename.startsWith(root+path.sep))throw Error('outside public');
    const bytes=await fsp.readFile(filename);
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream',
      'Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end('missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=(process.env.ATLAS_TECH_SITE_BASE||
  ('http://127.0.0.1:'+server.address().port)).replace(/\/+$/,'');
const binary=[process.env.EDGE_PATH,process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/usr/bin/chromium','/usr/bin/chromium-browser',
  '/opt/google/chrome/chrome',chromium.executablePath()]
  .find(x=>x&&fs.existsSync(x));
assert(binary,'Browser executable unavailable');
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:binary,
    args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/research/#research=STR_SDD_CONTROL',{waitUntil:'domcontentloaded'});
  const launch=page.locator('#detail [data-open-research-tech="STR_SDD_CONTROL"]');
  await launch.waitFor({timeout:90000});
  assert.equal(await page.locator('#researchTechDialog').evaluate(x=>x.open),false);
  await launch.click();
  const dialog=page.locator('#researchTechDialog');
  const tech=dialog.locator('.tech-viewer');
  await tech.waitFor({timeout:55000});
  assert.equal(await tech.locator('.tech-column').count(),2);
  assert((await tech.locator('.tech-adapter-notice').innerText()).includes('v.o1.1.1'));
  assert((await tech.locator('.tech-adapter-notice').innerText()).includes('2.1'));
  assert.equal(await tech.locator('.tech-original').evaluate(el=>el.open),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const at=(stage,index=0)=>tech.locator('.tech-node[data-tech-stage="'+stage+
    '"][data-tech-index="'+index+'"]');
  await at(1,0).click();
  await tech.locator('.tech-node[data-tech-stage="2"]').first().waitFor();
  const gates=await tech.locator('.tech-node[data-tech-stage="2"]').allInnerTexts();
  assert(gates.some(t=>t.includes('CPU')),'Must retain source base function');
  assert(gates.some(t=>t.includes('선행 연구 또는 직접 해금')),
    'Must retain separate AND and unlock logic');
  await tech.locator('.tech-node[data-tech-stage="2"][data-tech-kind="facility-function"]').click();
  assert((await tech.locator('.tech-node[data-tech-stage="3"]').innerText())
    .includes('기지 기능 제공 시설 선택'));
  await at(3,0).click();
  const providers=tech.locator('.tech-node[data-tech-stage="4"][data-tech-kind="facility-type"]');
  assert(await providers.count()>0,'Research base function must expand into real source facilities');
  await providers.first().click();
  assert((await tech.locator('.tech-source-link').getAttribute('href'))
    .includes('../facilities/#facility='));
  const routes=tech.locator('.tech-node[data-tech-stage="5"]');
  assert(await routes.count()>0,'Selected facility must show starting vs construction routes');
  await tech.locator('.tech-node[data-tech-stage="2"].tech-node--or').click();
  await tech.locator('.tech-node[data-tech-stage="3"]').first().waitFor();
  const access=await tech.locator('.tech-node[data-tech-stage="3"]').allInnerTexts();
  assert(access.some(t=>t.includes('선행 연구 모두 완료')));
  await tech.locator('.tech-node[data-tech-stage="3"].tech-node--and').click();
  assert.equal(await tech.locator('.tech-node[data-tech-stage="4"]').count(),4,
    'SSDD Control uses four legacy dependencies');
  assert((await tech.locator('.tech-wire--required').count())>0);
  await tech.locator('[data-tech-action="source"]').click();
  await tech.locator('.tech-original .tech-adapter-proof').waitFor();
  const proof=await tech.locator('.tech-original .tech-adapter-proof').innerText();
  assert(proof.includes('STR_SDD_CONTROL')&&proof.includes('v.o1.1.1'));
  assert(proof.includes('requiresBaseFunc')&&proof.includes('CPU'));
  await tech.locator('.tech-original > summary').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  if(process.env.ATLAS_RESEARCH_TECH_SCREENSHOT==='1')
    await tech.screenshot({path:path.join(os.tmpdir(),'xpiratez-research-tech-mobile.png')});
  await dialog.locator('#closeResearchTech').click();
  assert.equal(await dialog.evaluate(x=>x.open),false);
  assert.equal(await page.locator('#drawer').getAttribute('aria-hidden'),'false',
    'Closing viewer must retain original research dossier');

  const researchIndex=JSON.parse(await fsp.readFile(
    path.join(root,'research/acquisition-index.json'),'utf8'));
  const topics=researchIndex.topics;
  const direct=Object.entries(topics).flatMap(([source,r])=>
    r.unlocks.map(target=>({source,target}))).find(({source,target})=>
    topics[target]?.dependencies.length&&!topics[source].disables.includes(target)&&
      !topics[source].disables.includes(source));
  assert(direct,'Expected original unlock alternative');
  await page.goto(base+'/research/#research='+encodeURIComponent(direct.target),
    {waitUntil:'domcontentloaded'});
  const other=page.locator('#detail [data-open-research-tech="'+direct.target+'"]');
  await other.waitFor();
  await other.click();
  await dialog.locator('.tech-viewer').waitFor();
  const graph=dialog.locator('.tech-viewer');
  await graph.locator('.tech-node[data-tech-stage="1"]').first().click();
  await graph.locator('.tech-node[data-tech-stage="2"].tech-node--or').click();
  await graph.locator('.tech-node[data-tech-stage="3"]').first().waitFor();
  const choices=await graph.locator('.tech-node[data-tech-stage="3"]').allInnerTexts();
  assert(choices.some(t=>t.includes('선행 연구 모두 완료')));
  assert(choices.some(t=>t.includes('직접 해금:')),
    'Original unlock is an alternative to nominal dependencies');
  assert((await graph.locator('.tech-wire--alternative').count())>0);
  await dialog.locator('#closeResearchTech').click();
  await page.setViewportSize({width:1280,height:900});
  const dimension=await page.evaluate(()=>({
    document:document.documentElement.scrollWidth,view:innerWidth
  }));
  assert(dimension.document<=dimension.view+1);
  if(process.env.ATLAS_RESEARCH_TECH_SCREENSHOT==='1'){
    await other.click();
    await dialog.locator('.tech-viewer').waitFor();
    await dialog.locator('.tech-viewer').screenshot({
      path:path.join(os.tmpdir(),'xpiratez-research-tech-desktop.png')});
  }
  assert.deepEqual(errors,[],'Browser script errors');
  console.log('PASS cross-DB research tech: 390px + 1280px, legacy 4612-topic source, CPU gate, AND/OR unlock, source proof, drawer persistence, no overflow');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
