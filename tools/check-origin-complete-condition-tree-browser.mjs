// Mobile browser smoke for game-start acquisition paths and post-birth rank gates.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
const root=path.resolve('public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const pathname=decodeURIComponent(url.pathname);
    const filename=path.resolve(root,'.'+pathname,pathname.endsWith('/')?'index.html':'');
    if(!filename.startsWith(root+path.sep))throw Error('outside public');
    const body=await fsp.readFile(filename);
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream',
      'Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const binaries=[process.env.EDGE_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable','/usr/bin/chromium',chromium.executablePath()];
const executablePath=binaries.find(x=>x&&fs.existsSync(x));
assert(executablePath,'Edge/Chrome not available for origin browser smoke');
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=base+'/soldiers/modern/?profile=manufacture%3ASTR_THEBAN_ASSAULT_CLONE';
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#originMaxima[data-validation="validated"]').waitFor();
  await page.locator('#originDetails button[data-expand-origin-tree]').waitFor();
  const tech=page.locator('#originDetails .tech-viewer');
  await tech.waitFor();
  assert.equal(await tech.locator('.tech-original').evaluate(el=>el.open),false);
  assert((await tech.locator('.tech-wires path').count())>0,
    'Game-style technology graph must connect the birth goal to its prerequisites');
  await tech.locator('.tech-original > summary').click();
  const tree=page.locator('#originDetails .origin-complete-tree').first();
  await tree.waitFor();
  const txt=await tree.textContent();
  for(const term of ['STR_START_COUNTRY_EGYPT_EVENT','STR_REVOLUTIONARY_SPEECH_THEBES',
    'STR_PROPAGANDA_1','STR_PROPAGANDA_4','STR_THEBAN_ASSAULT_CLONE_LICENSE']){
    assert(txt.includes(term),'Missing mobile condition '+term);
  }
  assert((await tree.locator('[data-condition-kind="or"]').count())>0);
  assert((await tree.locator('[data-condition-kind="and"]').count())>0);
  const early=page.locator('#originDetails .origin-start-choice-evidence');
  await early.locator('summary').first().click();
  assert.equal(await early.locator('[data-start-choice]').count(),22);
  assert((await early.innerText()).includes('성격 연구'));
  assert((await early.innerText()).includes('STR_CAPTAIN_DUMBASS'));
  await early.locator('[data-trace-research-root="STR_CAPTAIN_LAZYASS"]').click();
  const drill=page.locator('#acquisitionTraceDialog');
  assert.equal(await drill.evaluate(el=>el.open),true,
    'Choice research must open in the full-width non-nesting explorer');
  assert.equal(await drill.locator('#acquisitionTraceContent .tech-viewer').count(),1);
  await drill.locator('#acquisitionTraceClose').click();
  assert.equal(await early.locator('.origin-complete-tree').count(),0,
    'Opening a separate research step cannot mutate the original choice card');
  assert((await tree.evaluate(el=>el.outerHTML.length))<500000,'Mobile route disclosure too heavy');
  const expand=page.locator('#originDetails button[data-trace-id]').first();
  if(await expand.count()){
    await expand.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
    await expand.click();
    assert.equal(await drill.evaluate(el=>el.open),true,
      'Continuation button must open the same independent explorer');
    assert.equal(await drill.locator('#acquisitionTraceContent .tech-viewer').count(),1);
    assert.equal(await drill.locator('.origin-readable-guide .origin-readable-guide').count(),0,
      'A continuation must never introduce recursively nested readable guides');
    await drill.locator('#acquisitionTraceClose').click();
  }
  const transform=page.locator('#originDetails .origin-transform-gates');
  if(await transform.count()){
    await transform.locator('summary').click();
    assert((await transform.textContent()).includes('요구 대원 계급'));
    const button=transform.locator('button[data-trace-research-root]').first();
    if(await button.count()){
      await button.click();
      assert.equal(await drill.evaluate(el=>el.open),true);
      assert.equal(await drill.locator('#acquisitionTraceContent .tech-viewer').count(),1);
      assert.equal(await transform.locator('.origin-complete-tree').count(),0);
      await drill.locator('#acquisitionTraceClose').click();
    }
  }
  await page.locator('#originDetails button[data-expand-origin-tree]').click();
  assert.equal(await page.locator('#originDetails .origin-tree-result .origin-complete-tree').count(),0);
  await page.locator('#search').fill('manufacture:STR_FREAK_RECRUITMENT');
  await page.locator('#originTable .origin-open').click();
  const alternate=page.locator('#originDetails [data-start-choice-profile="manufacture:STR_FREAK_RECRUITMENT"]');
  await alternate.waitFor();
  await alternate.locator('summary').first().click();
  assert((await alternate.locator('[data-start-choice-path]').count())>0,
    'Origins with source-defined captain guards must expose each specific acquisition script');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,
    'Expanded source-specific start choices must not overflow a mobile viewport');
  // All 72 origins now have conditional routes. Older unresolved deadline
  // cards must not appear, but the excluded, incompatible difficulty paths
  // remain available as expandable counterexample evidence.
  await page.locator('#search').fill('manufacture:STR_POLTERGEIST_EMBODIMENT');
  await page.locator('#originTable .origin-open').click();
  const context=page.locator('#originDetails .origin-campaign-audit[data-campaign-compatible="true"]');
  await context.waitFor();
  assert((await context.innerText()).includes('난이도 조건 일치'));
  const rejected=context.locator('.origin-rejected-candidates');
  await rejected.waitFor();
  assert.equal(await rejected.evaluate(el=>el.open),false,
    'Archived invalid routes should be accessible but collapsed by default');
  await rejected.locator(':scope > summary').click();
  const conflictProof=rejected.locator('details').first();
  await conflictProof.locator(':scope > summary').click();
  const archive=await rejected.innerText();
  assert(archive.includes('STR_ENJOYING_THE_DREAM')&&archive.includes('STR_BLESSINGS'),
    'The incompatible difficulty-0 and difficulty-1 events must remain inspectable');
  assert.equal(await page.locator('#originDetails [data-unresolved-evidence]').count(),0,
    'A repaired route must not display stale unresolved deadline cards');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,
    'Archived contradiction evidence must fit mobile without nested tech trees');
  assert.deepEqual(errors,[],'Uncaught browser JS errors');
  console.log('PASS mobile browser: 2.1 clone detail, four propaganda alternatives, prerequisite continuation, and candidate rank/research panel');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
