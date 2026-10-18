// Browser-level smoke test for /weapons/ standard-issue overlay.
// No third-party test runner: Node 22+ WebSocket + headless Chrome CDP.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import {spawn} from "node:child_process";
import assert from "node:assert/strict";

const site=path.resolve("public");
const chrome=process.env.CHROME_PATH||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png"};
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent((req.url||"/").split("?")[0]);
  let local=path.resolve(site,"."+name);
  if(local===site||local.endsWith(path.sep)||fs.existsSync(local)&&fs.statSync(local).isDirectory())local=path.join(local,"index.html");
  if(!local.startsWith(site+path.sep)||!fs.existsSync(local)){res.writeHead(404);res.end("404");return}
  const body=fs.readFileSync(local);
  res.writeHead(200,{"content-type":mime[path.extname(local)]||"application/octet-stream","content-length":body.length,"cache-control":"no-cache"});
  res.end(body);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const sitePort=server.address().port;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"xp-weapon-chrome-"));
let child,ws;
let nextId=0;
const pending=new Map();
const events=[];
function dispatch(method,params={}){
  const id=++nextId;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pending.delete(id);reject(Error("CDP timeout: "+method))},18000);
    pending.set(id,{resolve,reject,timeout});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function js(expression){
  const r=await dispatch("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if(r.error||r.result?.exceptionDetails)throw Error("Browser evaluation failed: "+JSON.stringify(r));
  return r.result?.result?.value;
}
async function until(label,test,maxMs=18000){
  const end=Date.now()+maxMs;let last;
  do{last=await js(test);if(last)return last;await delay(250)}while(Date.now()<end);
  throw Error(label+" timeout; last="+String(last));
}
try{
  assert.ok(fs.existsSync(chrome),"Chrome missing at "+chrome);
  child=spawn(chrome,[
    "--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check",
    "--no-sandbox","--remote-debugging-port=0","--remote-allow-origins=*",
    "--user-data-dir="+temp,"http://127.0.0.1:"+sitePort+"/weapons/"
  ],{stdio:["ignore","ignore","pipe"]});
  let chromeStderr="";child.stderr?.on("data",part=>{chromeStderr+=String(part).slice(-6000)});
  let devPort;
  for(let i=0;i<100;i++){
    const p=path.join(temp,"DevToolsActivePort");
    if(fs.existsSync(p)){devPort=fs.readFileSync(p,"utf8").split(/\r?\n/)[0];break}
    if(child.exitCode!==null)throw Error("Browser exited prematurely: "+child.exitCode+" "+chromeStderr.slice(-1500));
    await delay(120);
  }
  assert.ok(devPort,"Chrome DevTools port not opened");
  let tab;
  for(let i=0;i<80;i++){
    try{
      const response=await fetch("http://127.0.0.1:"+devPort+"/json/list");
      const tabs=await response.json();
      tab=tabs.find(t=>t.type==="page"&&t.url.includes("/weapons/"));
      if(tab)break;
    }catch{}
    await delay(100);
  }
  assert.ok(tab,"No Chrome weapons tab");
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true})});
  ws.addEventListener("message",e=>{
    const d=JSON.parse(String(e.data));
    if(d.id&&pending.has(d.id)){const p=pending.get(d.id);pending.delete(d.id);clearTimeout(p.timeout);d.error?p.reject(Error(JSON.stringify(d.error))):p.resolve(d);}
    else if(d.method==="Runtime.exceptionThrown")events.push(d.params.exceptionDetails.text);
  });
  await dispatch("Runtime.enable");
  await dispatch("Page.enable");
  await until("rankings loaded","Boolean(document.querySelector('#evalRows tr[data-key]'))",25000);
  let state=await js("({ranked:document.querySelectorAll('#evalRows tr[data-key]').length,save:document.querySelector('#evalProvenance').textContent,counts:document.querySelector('#evalTotals').textContent,hasLegacy:!!document.querySelector('#weaponTable')})");
  assert.ok(state.ranked>0&&state.hasLegacy,"Rankings or previous table missing");
  assert.ok(state.save.includes("16.sav"),"Save provenance missing");
  console.log("PASS initial weapons:",JSON.stringify(state));

  await js("(() => { document.querySelector('#evalSearch').value='토미건'; document.querySelector('#evalSearch').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#evalGroup').value='all';document.querySelector('#evalGroup').dispatchEvent(new Event('change',{bubbles:true}));return true })()");
  let tommy=await until("Tommygun in filtered rows","document.querySelector('#evalRows')?.textContent.includes('토미건')");
  assert.ok(tommy,"Tommygun search failed");
  console.log("PASS search and ammo group:",await js("document.querySelector('#evalSummary').textContent"));

  await js("document.querySelector('#evalRows tr[data-key]').click()");
  await until("weapon detailed dossier","document.querySelector('#detailDialog')?.open && document.querySelector('#detailBody')?.textContent.includes('제식 평가')");
  const original=await js("document.querySelector('#detailBody').textContent.includes('계산식')");
  assert.ok(original,"Ranking click did not reuse original action inspector");
  console.log("PASS linked original detail");
  await js("document.querySelector('#detailDialog').close()");

  await js("(() => {let t=document.querySelector('#evalType');t.value='근접';t.dispatchEvent(new Event('change',{bubbles:true}));let s=document.querySelector('#evalSearch');s.value='체육복';s.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
  await until("KUNG_FU melee ranking","document.querySelector('#evalRows')?.textContent.includes('체육복')");
  await js("document.querySelector('#evalRows tr[data-key]').click()");
  await until("kung fu modes","document.querySelector('#detailDialog')?.open && document.querySelector('#detailBody')?.textContent.includes('5연타')");
  assert.ok(await js("document.querySelector('#detailBody').textContent.includes('발차기')"),"KUNG_FU kick missing");
  console.log("PASS KUNG_FU punch/kick/flurry");
  await js("document.querySelector('#detailDialog').close()");

  await js("(() => { const distance=document.querySelector('#evalDistance'); distance.value='28'; distance.dispatchEvent(new Event('change',{bubbles:true})); return true; })()");
  assert.equal(await js("document.querySelectorAll('#evalRows tr[data-key]').length"),0,"Melee 1-tile attack must not appear in 28-tile ranks");
  await js("(() => { const distance=document.querySelector('#evalDistance'); distance.value='all'; distance.dispatchEvent(new Event('change',{bubbles:true})); return true; })()");
  await until("KUNG_FU restored","document.querySelector('#evalRows')?.textContent.includes('체육복')");
  console.log("PASS 1-tile melee excluded from ranged distances");

  await dispatch("Page.navigate",{url:"http://127.0.0.1:"+sitePort+"/manufacture/#recipe=STR_GROG_BARREL"});
  await until("manufacture deep-link","document.querySelector('#detail')?.textContent.includes('STR_GROG_BARREL')",25000);
  console.log("PASS manufacture deep-link");
  assert.equal(events.length,0,"Browser exception occurred: "+events.join(" / "));
  console.log("PASS browser smoke all; no uncaught JS errors");
}finally{
  for(const p of pending.values()){clearTimeout(p.timeout);p.reject(Error("smoke teardown"))}
  if(ws&&ws.readyState===WebSocket.OPEN)ws.close();
  if(child){child.kill("SIGTERM");await delay(150)}
  await new Promise(resolve=>server.close(resolve));
  try{fs.rmSync(temp,{force:true,recursive:true,maxRetries:3})}catch{}
}
