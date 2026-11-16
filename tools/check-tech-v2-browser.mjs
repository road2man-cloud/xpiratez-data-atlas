import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=http.createServer((req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+path.sep))throw new Error('Forbidden');
    if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  }catch{res.writeHead(404).end('Not found');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try {
  const opts=[
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium',chromium.executablePath()
  ];
  const executablePath=opts.find(x=>x&&fs.existsSync(x));
  if(!executablePath)throw new Error('No Chromium browser installed');
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage({viewport:{width:1100,height:800}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  const base='http://127.0.0.1:'+server.address().port;
  for(const [kind,count] of [['research',4629],['manufacture',2175]]){
    await page.goto(base+'/'+kind+'-v2/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(expected=>document.getElementById('status')?.textContent?.includes(expected),
      count.toLocaleString('ko-KR'),{timeout:15000});
    assert.equal(await page.locator('#rows tr').count(),100);
    const first=page.locator('#rows button.item-name').first();
    await first.click();assert(await page.locator('#detail').isVisible());
    assert((await page.locator('#detail-meta').innerText()).includes('Piratez.rul'));
    await page.locator('#close').click();
    await page.locator('#search').fill('STR_');
    await page.waitForTimeout(80);
    assert((await page.locator('#rows tr').count())>0);
    await page.locator('#sort').selectOption('id');
    assert((await page.locator('#rows tr').count())>0);
  }
  // Deep link to a known linked research record.
  await page.goto(base+'/research-v2/?id=STR_FUNGUS_OUTBREAK',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('detail')?.hidden===false,{timeout:15000});
  assert((await page.locator('#detail-meta').innerText()).includes('STR_FUNGUS_OUTBREAK'));
  await page.goto(base+'/items-v2/?id=STR_CHEMICALS',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('detail')?.hidden===false,{timeout:15000});
  assert((await page.locator('#detail-meta').innerText()).includes('STR_CHEMICALS'));
  assert.deepEqual(errors,[]);
  console.log('PASS X-Piratez 2.1 research/manufacture browser load, search, sort, details and item deep links');
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
