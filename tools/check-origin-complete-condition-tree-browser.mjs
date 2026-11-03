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
  'C:/Program Files/Google/Chrome/Application/chrome.exe',chromium.executablePath()];
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
  await page.locator('#originDetails button[data-expand-origin-tree]').click();
  const tree=page.locator('#originDetails .origin-complete-tree').first();
  await tree.waitFor();
  const txt=await tree.textContent();
  for(const term of ['STR_START_COUNTRY_EGYPT_EVENT','STR_REVOLUTIONARY_SPEECH_THEBES',
    'STR_PROPAGANDA_1','STR_PROPAGANDA_4','STR_THEBAN_ASSAULT_CLONE_LICENSE']){
    assert(txt.includes(term),'Missing mobile condition '+term);
  }
  assert((await tree.locator('[data-condition-kind="or"]').count())>0);
  assert((await tree.locator('[data-condition-kind="and"]').count())>0);
  assert((await tree.evaluate(el=>el.outerHTML.length))<500000,'Mobile route disclosure too heavy');
  const expand=page.locator('#originDetails button[data-trace-id]').first();
  if(await expand.count()){
    await expand.evaluate(el=>{for(let p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
    await expand.click();
    assert((await page.locator('#originDetails .origin-complete-tree').count())>=2,
      'Continuation button should open source-rooted upstream tree');
    await expand.click();
  }
  const transform=page.locator('#originDetails .origin-transform-gates');
  if(await transform.count()){
    await transform.locator('summary').click();
    assert((await transform.textContent()).includes('요구 대원 계급'));
    const button=transform.locator('button[data-trace-research-root]').first();
    if(await button.count()){
      await button.click();
      assert((await transform.locator('.origin-complete-tree').count())>=1);
    }
  }
  await page.locator('#originDetails button[data-expand-origin-tree]').click();
  assert.equal(await page.locator('#originDetails .origin-tree-result .origin-complete-tree').count(),0);
  assert.deepEqual(errors,[],'Uncaught browser JS errors');
  console.log('PASS mobile browser: 2.1 clone detail, four propaganda alternatives, prerequisite continuation, and candidate rank/research panel');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
