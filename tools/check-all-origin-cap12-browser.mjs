import assert from 'node:assert/strict';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {chromium} from 'playwright-core';
const source=process.argv.find(x=>x.startsWith('--source='))?.slice(9)||'origin/main';
const publicBase=process.argv.find(x=>x.startsWith('--base='))?.slice(7);
const cache=new Map();
const mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css',json:'application/json',gz:'application/octet-stream',svg:'image/svg+xml',png:'image/png',webp:'image/webp',ico:'image/x-icon'};
const server=publicBase?null:http.createServer((req,res)=>{
 try{
 let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '');
 if(p.endsWith('/')||!p)p+='index.html';
 if(p.includes('..')||p.includes('\\'))throw Error('bad path');
 if(!cache.has(p))cache.set(p,execFileSync('git',['show',source+':public/'+p],{maxBuffer:256*1024*1024,stdio:['ignore','pipe','ignore']}));
 res.writeHead(200,{'content-type':mime[p.split('.').at(-1)]||'application/octet-stream'});
 res.end(cache.get(p));
 }catch(e){res.writeHead(404);res.end();}
});
if(server)await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=publicBase||'http://127.0.0.1:'+server.address().port+'/';
const exe=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
let b;
try {
 b=await chromium.launch({headless:true,...(exe?{executablePath:exe}:{}),args:['--no-sandbox']});
 const results=[];
 for(const route of ['soldiers/modern/','captains/']){
  const page=await b.newPage();const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>requests.push(r.url()));
  await page.goto(base+route+(publicBase?'?allorigin='+Date.now():''),{waitUntil:'domcontentloaded',timeout:90000});
  const panel=page.locator('#allOriginCapFrontier');await panel.waitFor({timeout:60000});
  if(!(await panel.evaluate(el=>el.open)))await panel.locator('summary').first().click();
  const cov=panel.locator('[data-all-origin-model-coverage]');try{await cov.waitFor({timeout:15000});}catch(e){console.log(JSON.stringify({route,panel:await panel.innerText(),errors,requests:requests.slice(-50)}));throw e;}
  const text=await cov.innerText();assert.match(text,/72 \/ 72/);assert.match(text,/4,386/);assert.match(text,/4,324/);
  const picker=panel.locator('[data-oc-origin]');assert.equal(await picker.locator('option').count(),73);
  await picker.selectOption({index:1});
  await panel.locator('[data-oc-mode]').selectOption('all');
  assert(await panel.locator('[data-oc-rows] tr').count()>0);
  await panel.locator('[data-oc-rows] tr button').first().click();
  assert(await panel.locator('[data-oc-detail] [data-all-origin-cap]').count()===1);
  assert(!requests.some(u=>u.includes('soldier-origin-cap-frontier.json')));
  results.push({route,coverage:text,selected:await picker.inputValue(),rows:await panel.locator('[data-oc-rows] tr').count(),errors,sharedRegistryRequests:requests.filter(u=>u.includes('branch-soldier-results.json.gz')).length});
  await page.close();
 }
 console.log(JSON.stringify({source,base,results},null,2));
}finally{await b?.close();if(server)server.close();}
