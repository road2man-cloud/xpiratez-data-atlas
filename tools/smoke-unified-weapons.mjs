// Browser smoke: the weapon DB has one table, with optional standard-score sorting.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import {spawn} from "node:child_process";
import assert from "node:assert/strict";

const site=path.resolve("public");
const chrome=process.env.CHROME_PATH||"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8"};
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent((req.url||"/").split("?")[0]);
 let file=path.resolve(site,"."+name);
 if(file===site||file.endsWith(path.sep)||fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,"index.html");
 if(!file.startsWith(site+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end("404");return}
 const body=fs.readFileSync(file);
 res.writeHead(200,{"content-type":mime[path.extname(file)]||"application/octet-stream","content-length":body.length,"cache-control":"no-cache"});
 res.end(body);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"xp-weapon-unified-"));
let child,ws;
let nextId=0;
const pending=new Map(),exceptions=[];
function dispatch(method,params={}){
 const id=++nextId;
 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error("CDP timed out "+method))},25000);
  pending.set(id,{resolve,reject,timeout});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function js(expression){
 const r=await dispatch("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
 if(r.error||r.result?.exceptionDetails)throw Error("Browser JS error: "+JSON.stringify(r));
 return r.result?.result?.value;
}
async function until(label,expression,maxMs=30000){
 const end=Date.now()+maxMs;
 while(Date.now()<end){
  const value=await js(expression);
  if(value)return value;
  await delay(200);
 }
 throw Error(label+" timeout");
}
try{
 assert.ok(fs.existsSync(chrome),"Chrome executable unavailable: "+chrome);
 child=spawn(chrome,["--headless=new","--disable-gpu","--no-first-run",
  "--no-default-browser-check","--no-sandbox","--remote-debugging-port=0",
  "--remote-allow-origins=*","--user-data-dir="+temp,
  "http://127.0.0.1:"+port+"/weapons/"],{stdio:"ignore"});
 let devPort;
 for(let i=0;i<120;i++){
  const file=path.join(temp,"DevToolsActivePort");
  if(fs.existsSync(file)){
   try{devPort=fs.readFileSync(file,"utf8").split(/\r?\n/)[0];break}
   catch(error){if(error.code!=="EBUSY")throw error}
  }
  if(child.exitCode!==null)throw Error("Chrome stopped unexpectedly: "+child.exitCode);
  await delay(100);
 }
 assert.ok(devPort,"Chrome debugging port unavailable");
 let tab;
 for(let i=0;i<100;i++){
  try{
   const tabs=await (await fetch("http://127.0.0.1:"+devPort+"/json/list")).json();
   tab=tabs.find(x=>x.type==="page"&&x.url.includes("/weapons/"));
   if(tab)break;
  }catch{}
  await delay(100);
 }
 assert.ok(tab,"Weapon DB tab missing");
 ws=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true})});
 ws.addEventListener("message",message=>{
  const m=JSON.parse(String(message.data));
  if(m.id&&pending.has(m.id)){
   const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timeout);
   m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m);
  }else if(m.method==="Runtime.exceptionThrown")exceptions.push(m.params.exceptionDetails.text);
 });
 await dispatch("Runtime.enable");
 await until("General weapon list", "document.querySelectorAll('#weaponTable tbody tr[data-id]').length>50",40000);
 const initial=await js("({rows:document.querySelectorAll('#weaponTable tbody tr[data-id]').length,sections:!!document.querySelector('#section'),tab:!!document.querySelector('.view-tabs'),scoreHeader:document.querySelector('#weaponTable thead').textContent.includes('제식점수'),ranked:document.querySelectorAll('#weaponTable tbody input[data-compare]').length})");
 assert.equal(initial.tab,false,"Legacy dual tabs remain");
 assert.equal(initial.scoreHeader,true,"Standard-score column missing");
 assert.ok(initial.sections&&initial.ranked>0,"Unified list or rating mapping missing");
 assert.ok(await js("document.querySelector('#weaponPager')!==null && document.querySelector('#targetSearch')!==null"),"Modern pager or individual enemy selector missing");
 console.log("PASS unified general list",JSON.stringify(initial));

 await js("(()=>{const t=document.querySelector('#sortBy');t.value='standardScore';t.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 const ranking=await js("(()=>{const r=[...document.querySelectorAll('#weaponTable tbody tr[data-id]')];const values=r.map(x=>Number(x.querySelector('.score-value')?.textContent.replaceAll(',',''))).filter(Number.isFinite);return {sort:document.querySelector('#sortBy').value,values:values.slice(0,10),missing:r.filter(x=>x.querySelector('.score-value')?.textContent==='—').length}})()");
 assert.equal(ranking.sort,"standardScore");
 assert.ok(ranking.values.length>=5&&ranking.values[0]>=ranking.values[1],"Standard sort did not apply");
 console.log("PASS standard-score sorting",JSON.stringify(ranking));

 await js("(()=>{const a=[...document.querySelectorAll('input[data-compare]')];const first=a[0];first.checked=true;first.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 await js("(()=>{const a=[...document.querySelectorAll('input[data-compare]')];const picked=a.find(x=>!x.checked);picked.checked=true;picked.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 assert.equal(await js("document.querySelector('#compareSelected').disabled"),false,"Comparison unavailable");
 await js("document.querySelector('#compareSelected').click()");
 await until("Standard comparison","document.querySelector('#detailDialog').open && document.querySelector('#detailBody').textContent.includes('제식 무기·탄약 직접 비교')");
 console.log("PASS standard comparison");
 await js("document.querySelector('#detailDialog').close()");

 await js("(()=>{document.querySelector('#sortBy').value='effPerTu';document.querySelector('#sortBy').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#search').value='토미건';document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}));return true})()");
 await until("Korean search","document.querySelector('#weaponTable tbody').textContent.includes('토미건')");
 assert.equal(await js("document.querySelector('#standardPanel')===null"),true);
 await js("document.querySelector('#weaponTable tbody tr[data-id] input[data-compare]')?.closest('tr').click()");
 await until("Combined details","document.querySelector('#detailDialog').open && document.querySelector('#detailBody').textContent.includes('계산식') && document.querySelector('#detailBody').textContent.includes('제식 평가')");
 assert.equal(await js("document.querySelector('#detailBody').textContent.includes('미완료 연구')"),false);
 console.log("PASS Korean search and unified details without remaining research");
 await js("document.querySelector('#detailDialog').close()");

 await js("(()=>{document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#section').value='throwing';document.querySelector('#section').dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 await until("Throwing weapons retained","document.querySelector('#tableTitle').textContent.includes('투척') && document.querySelectorAll('#weaponTable tbody tr[data-id]').length>5");
 assert.equal(await js("document.querySelector('#standardPanel')===null"),true);
 console.log("PASS throwing remains accessible");
 assert.equal(exceptions.length,0,"Uncaught browser errors: "+exceptions.join("; "));
 console.log("PASS no uncaught browser exceptions");
}finally{
 for(const p of pending.values()){clearTimeout(p.timeout);p.reject(Error("teardown"))}
 if(ws&&ws.readyState===WebSocket.OPEN)ws.close();
 if(child){child.kill("SIGTERM");await delay(150)}
 await new Promise(resolve=>server.close(resolve));
 try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:3})}catch{}
}
