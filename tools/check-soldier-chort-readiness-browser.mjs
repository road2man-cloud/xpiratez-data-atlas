import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright-core';

const root=path.resolve('public');
const external=process.argv.find(a=>a.startsWith('--base='))?.slice(7);
let server;
if(!external){
  server=http.createServer((req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      let file=path.resolve(root,'.'+pathname);
      if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file))throw Error('404');
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
        '.json':'application/json','.css':'text/css; charset=utf-8'};
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
      fs.createReadStream(file).pipe(res);
    }catch{res.writeHead(404).end('not found');}
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
}
const base=external||('http://127.0.0.1:'+server.address().port+'/');
const url=new URL('soldiers/modern/chort-readiness.html',base).href;
const browsers=[
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome','/usr/bin/chromium',chromium.executablePath()
];
const executablePath=browsers.find(x=>fs.existsSync(x));
if(!executablePath)throw Error('Browser executable not found');
let browser;
try{
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];
  page.on('pageerror',x=>errors.push(x.message));
  await page.goto(new URL('soldiers/modern/',base).href,{waitUntil:'domcontentloaded',timeout:60000});
  const linked=page.locator('[data-chort-readiness-link]');
  await linked.waitFor({timeout:60000});
  await linked.click();
  assert.equal(page.url(),url,'Chort audit must be accessible from the primary Soldier DB');
  await page.waitForFunction(()=>document.documentElement.dataset.chortAudit==='validated',null,{timeout:60000});
  assert.equal(await page.locator('#sources tr[data-profile]').count(),42);
  assert((await page.locator('#summary').innerText()).includes('17개'));
  assert((await page.locator('#summary').innerText()).includes('25개'));
  assert((await page.locator('#transformGate').innerText()).includes('Psi 강도 40 이상'));
  assert((await page.locator('#transformGate').innerText()).includes('계급 1 이상'));
  assert((await page.locator('#comparison [data-profile="direct:STR_SOLDIER_PEASANT"]').innerText()).includes('5,000'));
  const farmer=await page.locator('#comparison [data-profile="direct:STR_SOLDIER_PEASANT"]').innerText();
  assert(farmer.includes('20~70')&&farmer.includes('완결 경로 미발견'));
  const clone=await page.locator('#comparison [data-profile="manufacture:STR_THEBAN_ASSAULT_CLONE"]').innerText();
  assert(clone.includes('10,000')&&clone.includes('50')&&clone.includes('2,131'));
  await page.locator('#psiFilter').selectOption('meets');
  assert.equal(await page.locator('#sources tr[data-profile]').count(),17);
  await page.locator('#psiFilter').selectOption('depends');
  assert.equal(await page.locator('#sources tr[data-profile]').count(),25);
  await page.locator('#psiFilter').selectOption('all');
  await page.locator('#proofFilter').selectOption('found');
  assert.equal(await page.locator('#sources tr[data-profile]').count(),3);
  await page.locator('#proofFilter').selectOption('unfound');
  assert.equal(await page.locator('#sources tr[data-profile]').count(),39);
  await page.locator('#proofFilter').selectOption('all');
  await page.locator('#filter').fill('direct:STR_SOLDIER_PEASANT');
  assert.equal(await page.locator('#sources tr[data-profile]').count(),1);
  await page.locator('#filter').fill('');
  assert.equal(await page.locator('#sources tr[data-profile]').count(),42);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,
    'Mobile page should not overflow horizontally outside the intended table');
  assert.deepEqual(errors,[]);
  console.log('PASS Chort origin readiness browser: 42 sources, 17 fixed Psi / 25 variable, 3 conditional witnesses, two-source comparison and 390px filters');
}finally{await browser?.close();await new Promise(ok=>server?server.close(ok):ok());}
