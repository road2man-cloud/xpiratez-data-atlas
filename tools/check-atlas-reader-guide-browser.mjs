// Human-reader acceptance gate for the 14 public DB entrances and 2.1 origin.
import assert from 'node:assert/strict';
import http from 'node:http';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright-core';
const root=path.resolve('public');
const pages=['starting','captains','soldiers/modern','crafts','craft-weapons','facilities',
  'armors','items','research','manufacture','events','forces','weapons','reference'];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.gz':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost');
    const filename=path.resolve(root,'.'+decodeURIComponent(u.pathname),
      u.pathname.endsWith('/')?'index.html':'');
    if(!filename.startsWith(root+path.sep))throw Error('path outside public');
    const bytes=await fsp.readFile(filename);
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream',
      'Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end('missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port+'/';
const binary=[process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium',
  chromium.executablePath()]
  .find(x=>x&&fs.existsSync(x));
assert(binary,'Browser not available');
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox']});
  for(const slug of pages){
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+slug+'/',{waitUntil:'domcontentloaded',timeout:30000});
    const guide=page.locator('[data-atlas-reader-guide]');
    await guide.waitFor({timeout:12000});
    assert.equal(await guide.count(),1,slug+' guide must be unique');
    assert((await guide.locator('.atlas-reader-head h2').textContent()).length>=8,slug+' requires readable purpose');
    assert((await guide.locator('.atlas-reader-actions > *').count())>=2,slug+' requires task navigation');
    assert.equal(await guide.evaluate(el=>el.scrollWidth>el.clientWidth+2),false,
      slug+' guide overflows narrow phone');
    const dir=guide.locator('.atlas-reader-directory');
    assert.equal(await dir.locator('.atlas-nav-group').count(),4);
    assert.equal(await dir.locator('a').count(),14);
    assert.equal(await guide.locator('.atlas-reader-id-toggle input').count(),1);
    assert.equal(await page.locator('body.atlas-show-source-ids').count(),0);
    await guide.locator('.atlas-reader-id-toggle input').check();
    assert.equal(await page.locator('body.atlas-show-source-ids').count(),1);
    await guide.locator('.atlas-reader-id-toggle input').uncheck();
    assert.equal(await page.locator('body.atlas-show-source-ids').count(),0);
    assert.deepEqual(errors,[],slug+' shared guide JS errors');
    await page.close();
  }
  const home=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
  await home.goto(base,{waitUntil:'domcontentloaded'});
  await home.locator('.atlas-home-group').first().waitFor();
  assert.equal(await home.locator('.atlas-home-group').count(),4);
  assert.equal(await home.locator('.atlas-home-group a.card').count(),14);
  assert.equal(await home.locator('.atlas-home-directory:not([open])').count(),1);
  await home.close();
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'soldiers/modern/?profile=manufacture%3ASTR_THEBAN_ASSAULT_CLONE',
    {waitUntil:'domcontentloaded',timeout:30000});
  await page.locator('#originMaxima[data-validation="validated"]').waitFor({timeout:60000});
  await page.locator('#originDetails button[data-expand-origin-tree]').click();
  const guide=page.locator('#originDetails .origin-readable-guide').first();
  await guide.waitFor();
  assert((await guide.locator('.guide-card[data-guide-category="material"]').count())>=1);
  const material=guide.locator('.guide-card[data-guide-category="material"]').first();
  const previous=page.locator('#originDetails .origin-source-expansion');
  assert.equal(await previous.count(),1,'Original data can still be expanded for advanced users');
  assert.equal(await previous.evaluate(el=>el.open),false,
    'The old verbose acquisition ledger must not be visible by default');
  assert.equal(await material.locator('.guide-option').count(),3,
    'Assault clone should show shop, Egyptian start and propaganda event as three readable choices');
  assert((await material.locator('.guide-option-heading').allTextContents()).some(t=>t.includes('구매')));
  assert((await material.locator('.guide-option-heading').allTextContents()).some(t=>t.includes('보상')));
  const methodsText=await material.innerText();
  assert(methodsText.includes('125,000'),'The store option should show its actual cost upfront');
  assert(methodsText.includes('12개 고정'),'Egypt start reward quantity must be readable');
  assert(methodsText.includes('3개 고정'),'Theban speech reward quantity must be readable');
  assert.equal(await guide.locator('.guide-technical-evidence').evaluate(el=>el.open),false,
    'Source IDs must not dominate the default experience');
  assert.equal(await guide.locator('.guide-source-id').first().isVisible(),false,
    'Raw identifier text must be hidden until a user asks for the source');
  const visible=await guide.locator('.guide-cards').innerText();
  assert(!visible.includes('STR_THEBAN_ASSAULT_CLONE_LICENSE'),'Raw item IDs must stay out of readable cards');
  await material.locator('.guide-option-details summary').first().click();
  assert((await material.locator('.guide-conditions').first().innerText()).length>5);
  assert.equal(await guide.evaluate(el=>el.scrollWidth>el.clientWidth+2),false,
    'The readable birth guide must not overflow mobile');
  await guide.locator('.guide-technical-evidence > summary').click();
  assert.equal(await guide.locator('.guide-source-id').first().isVisible(),true);
  assert.deepEqual(errors,[],'Origin detail reader errors');
  await page.close();
  console.log('PASS readable site-wide guide in all 14 DBs, four homepage categories, 390px mobile');
  console.log('PASS assault clone: 3 plain-language acquisition methods, source IDs collapsed, detailed evidence preserved');
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
