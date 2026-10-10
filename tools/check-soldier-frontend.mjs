// Real browser smoke test for the soldiers catalog, including post-load sorting and detail dialogs.
// Run: node tools/check-soldier-frontend.mjs
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {mkdtemp, rm} from "node:fs/promises";
import {setTimeout as delay} from "node:timers/promises";

const root=path.resolve("public");
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".css":"text/css; charset=utf-8",".gz":"application/octet-stream"};
const server=http.createServer((req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname)}catch{res.writeHead(400).end();return}
  const file=path.resolve(root,"."+pathname,(pathname.endsWith("/")?"index.html":""));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end("not found");return}
  res.setHeader("Content-Type",mime[path.extname(file)]||"application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url="http://127.0.0.1:"+server.address().port+"/soldiers/";
const edgeCandidates=process.platform==="win32"?[
  process.env.PROGRAMFILES+"\\Google\\Chrome\\Application\\chrome.exe",
  process.env["PROGRAMFILES(X86)"]+"\\Microsoft\\Edge\\Application\\msedge.exe",
  process.env.PROGRAMFILES+"\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
]:["/usr/bin/chromium","/usr/bin/google-chrome","/usr/bin/chromium-browser"];
const browserPath=edgeCandidates.find(x=>x&&fs.existsSync(x));
if(!browserPath){
  server.close();
  if(process.env.REQUIRE_BROWSER==="1")throw Error("Chromium/Edge not installed");
  console.log("SKIP browser smoke test: no Chromium or Edge binary");
  process.exit(0);
}
const tmp=await mkdtemp(path.join(os.tmpdir(),"xpz-soldier-cdp-"));
const port=await new Promise(resolve=>{
  const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p))});
});
const browser=spawn(browserPath,[
  "--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check",
  "--no-sandbox","--disable-extensions","--remote-allow-origins=*",
  "--remote-debugging-port="+port,"--user-data-dir="+tmp,"--window-size=1440,900",url
],{stdio:"ignore"});
let ws=null;const pending=new Map(),exceptions=[],errors=[];
let nextId=1;
function send(method,params={}){
  const id=nextId++;
  return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const answer=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if(answer.exceptionDetails)throw Error("Eval exception: "+JSON.stringify(answer.exceptionDetails));
  return answer.result?.value;
}
async function waitFor(check,description,ms=25000){
  const t=Date.now();
  while(Date.now()-t<ms){const found=await evaluate(check);if(found)return found;await delay(150)}
  throw Error("Timed out waiting for "+description);
}
try{
  let tabs;
  for(let i=0;i<160;i++){
    try{
      const response=await fetch("http://127.0.0.1:"+port+"/json");
      if(response.ok){tabs=await response.json();if(tabs.some(t=>t.type==="page"))break}
    }catch{}
    if(browser.exitCode!=null)throw Error("Chromium exited "+browser.exitCode);
    await delay(100);
  }
  const tab=tabs?.find(t=>t.type==="page");
  if(!tab?.webSocketDebuggerUrl)throw Error("Could not connect to Chromium");
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true})});
  ws.addEventListener("message",event=>{
    const msg=JSON.parse(event.data);
    if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);(msg.error?p.reject:p.resolve)(msg.error||msg.result)}}
    if(msg.method==="Runtime.exceptionThrown")exceptions.push(msg.params.exceptionDetails?.text||JSON.stringify(msg.params));
    if(msg.method==="Runtime.consoleAPICalled"&&msg.params.type==="error")errors.push(msg.params.args.map(a=>a.value||a.description||"").join(" "));
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate",{url});
  const loaded=await waitFor("(()=>{const s=document.querySelector('#summary');return s&&(s.textContent.includes('데이터 로드 실패')||document.querySelector('#soldierTable tbody tr'))?{summary:s.textContent,rows:document.querySelectorAll('#soldierTable tbody tr').length,count:document.querySelector('#rowCount')?.textContent}:null})()","soldiers initial render");
  if(loaded.summary.includes("데이터 로드 실패"))throw Error("Page showed load error: "+loaded.summary);
  if(loaded.rows<1)throw Error("No initial soldier rows");
  if(loaded.summary.includes("[object Object]"))throw Error("Initial summary rendered a list of objects instead of a count");
  console.log("Initial soldiers render:",JSON.stringify({rows:loaded.rows,count:loaded.count,summary:loaded.summary.slice(0,200)}));
  const actual=await evaluate("(()=>{document.querySelector('#dataset').value='final';document.querySelector('#dataset').dispatchEvent(new Event('change',{bubbles:true}));return {count:document.querySelector('#rowCount').textContent,rows:document.querySelectorAll('#soldierTable tbody tr').length,first:document.querySelector('#soldierTable tbody tr')?.innerText}})()");
  console.log("Final builds render:",JSON.stringify(actual));
  if(!actual.rows)throw Error("No final build rows");
  const pairCount=await evaluate("document.querySelectorAll(\x27#soldierTable tbody tr:first-child .stat-pair .stat-cap\x27).length");
  if(pairCount!==12)throw Error("Final builds show only "+pairCount+"/12 stat hard caps");
  const capSort=await evaluate("(()=>{const sort=document.querySelector(\x27#sortMetric\x27);if(sort.disabled)return {enabled:false};sort.value=\x27cap\x27;sort.dispatchEvent(new Event(\x27change\x27,{bubbles:true}));return {enabled:true,caps:[...document.querySelectorAll(\x27#soldierTable tbody tr\x27)].slice(0,5).map(x=>Number(x.querySelectorAll(\x27td\x27)[9]?.querySelector(\x27.stat-cap\x27)?.textContent.replace(/,/g,\x27\x27)||0))}})()");
  if(!capSort.enabled||capSort.caps.some((x,i)=>i>0&&x>capSort.caps[i-1]))throw Error("Final hard-cap sort is not enabled or descending: "+JSON.stringify(capSort));
  const details=await evaluate("(()=>{document.querySelector('#soldierTable tbody tr').click();return {opened:document.querySelector('#detailDialog').open,text:document.querySelector('#detailBody').innerText.slice(0,600)}})()");
  if(!details.opened)throw Error("Detail dialog did not open");
  if(!details.text.includes("하드캡"))throw Error("Final detail missing hard caps");
  if(exceptions.length||errors.length)throw Error("Browser errors: "+JSON.stringify({exceptions,errors}));
  console.log("OK soldiers browser smoke: initial rows, final hard caps, detail dialog");
}catch(e){
  console.error("Soldiers browser smoke FAILED:",e.message);
  if(exceptions.length||errors.length)console.error(JSON.stringify({exceptions,errors}));
  process.exitCode=1;
}finally{
  if(ws){ws.close()}
  browser.kill();
  server.close();
  await rm(tmp,{recursive:true,force:true,maxRetries:4,retryDelay:300}).catch(()=>{});
}
