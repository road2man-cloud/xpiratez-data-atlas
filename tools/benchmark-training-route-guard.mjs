// Matched browser A/B of the training startup guard and cached number formatting.
// Run: node tools/benchmark-training-route-guard.mjs
// Three trials per version, 4x CPU slowdown, 150ms RTT, 1.6Mbps, no cache.
// The baseline SHA is PR #22's deployed main; only two training JS modules
// differ, while the same current ruleset/data and browser serve both variants.
// For a different baseline use ATLAS_TRAINING_BASELINE=<commit SHA>.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {gzipSync} from "node:zlib";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import {chromium} from "playwright-core";
const root=path.resolve("public");
const baselineRef=process.env.ATLAS_TRAINING_BASELINE||"6325f21d5e5ea652508175573a75496e545ba83c";
const baseline=execFileSync("git",["show",baselineRef+":public/trainings/route-access.js"],{encoding:"utf8"});
const current=fs.readFileSync(path.join(root,"trainings/route-access.js"),"utf8");
const beforeApp=execFileSync("git",["show",baselineRef+":public/trainings/app.js"],{encoding:"utf8"});
const afterApp=fs.readFileSync(path.join(root,"trainings/app.js"),"utf8");
assert.notEqual(current,baseline,"candidate must differ from baseline");
const server=http.createServer((req,res)=>{
 try{
  const match=new URL(req.url,"http://localhost").pathname.match(/^\/(before|after)\/(.*)$/);
  if(!match){res.writeHead(404).end();return;}
  const [_,variant,subpath]=match;
  const file=path.resolve(root,subpath,subpath.endsWith("/")?"index.html":"");
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  const ext=path.extname(file);
  const raw=fs.readFileSync(file);
  const source=subpath==="trainings/route-access.js"?Buffer.from(variant==="before"?baseline:current):
    subpath==="trainings/app.js"?Buffer.from(variant==="before"?beforeApp:afterApp):raw;
  const gz=ext!==".gz"&&/gzip/.test(req.headers["accept-encoding"]||"");
  const ct={".html":"text/html",".css":"text/css",".js":"text/javascript",".json":"application/json",".gz":"application/octet-stream"}[ext]||"application/octet-stream";
  res.writeHead(200,{"Content-Type":ct,"Cache-Control":"no-store",...(gz?{"Content-Encoding":"gzip"}:{})});
  res.end(gz?gzipSync(source):source);
 }catch(e){res.writeHead(404).end();}
});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const base="http://127.0.0.1:"+server.address().port;
const exe=[process.env.EDGE_PATH,"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe","C:/Program Files/Google/Chrome/Application/chrome.exe",chromium.executablePath()].find(x=>x&&fs.existsSync(x));
const browser=await chromium.launch({executablePath:exe,headless:true,args:["--no-sandbox"]});
const records=[];
async function test(variant,trial){
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await ctx.newPage(),cdp=await ctx.newCDPSession(page),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await cdp.send("Network.enable");
 await cdp.send("Network.setCacheDisabled",{cacheDisabled:true});
 await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:150,downloadThroughput:1.6e6/8,uploadThroughput:1.6e6/8});
 await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
 await page.addInitScript(()=>{
  window.__long=[];
  new PerformanceObserver(l=>window.__long.push(...l.getEntries().map(x=>Math.round(x.duration)))).observe({type:"longtask",buffered:true});
 });
 await page.goto(base+"/"+variant+"/trainings/",{waitUntil:"domcontentloaded",timeout:30000});
 await page.locator("#trainingTable tbody tr[data-id]").first().waitFor({state:"attached",timeout:30000});
 await page.evaluate(()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));
 const first=await page.evaluate(()=>{
  const view=document.querySelector("#trainingTable tbody").textContent.replace(/\s+/g," ");
  return {readyMs:Math.round(performance.now()),rows:document.querySelectorAll("#trainingTable tbody tr[data-id]").length,
    digestText:view, longTaskMs:window.__long.reduce((a,b)=>a+b,0),longTaskMax:Math.max(0,...window.__long)};
 });
 assert.equal(first.rows,83);
 const initialDigest=createHash("sha256").update(first.digestText).digest("hex");
 const actions=await page.evaluate(()=>{
  const snapshot=()=>{
   const rows=[...document.querySelectorAll("#trainingTable tbody tr[data-id]")].map(el=>[el.dataset.id,el.querySelector("td:nth-child(2)")?.textContent,el.querySelector("input[data-toggle]")?.disabled]);
   return JSON.stringify({rows,summary:document.querySelector("#summary")?.textContent,
     branch:document.querySelector("#branchBlockedCount")?.textContent,
     mobile:document.querySelector("#mobileExclusionTitle")?.textContent});
  };
  const go=id=>{
   const x=document.querySelector("#captainStage0");
   const now=performance.now();x.value=id;x.dispatchEvent(new Event("change",{bubbles:true}));
   return {ms:Math.round(performance.now()-now),rows:snapshot()};
  };
  const one=go("STR_CAPTAIN_PUSSY");
  const y=document.querySelector("#captainStage1");
  const t=performance.now();y.value="STR_CAPTAIN_THIEF";y.dispatchEvent(new Event("change",{bubbles:true}));
  const two={ms:Math.round(performance.now()-t),rows:snapshot()};
  return {one,two};
 });
 const out={trial,variant,readyMs:first.readyMs,longTaskMs:first.longTaskMs,longTaskMax:first.longTaskMax,
  initialDigest,firstMs:actions.one.ms,firstDigest:createHash("sha256").update(actions.one.rows).digest("hex"),
  thiefMs:actions.two.ms,thiefDigest:createHash("sha256").update(actions.two.rows).digest("hex"),errors};
 assert.deepEqual(errors,[]);
 records.push(out);console.log("RUN "+JSON.stringify(out));await ctx.close();
}
try{
 for(let t=0;t<3;t++)for(const variant of t%2===0?["before","after"]:["after","before"])await test(variant,t);
 const before=records.filter(r=>r.variant==="before"),after=records.filter(r=>r.variant==="after");
 const median=arr=>[...arr].sort((a,b)=>a-b)[1];
 for(const field of ["initialDigest","firstDigest","thiefDigest"]){assert.equal(new Set(records.map(r=>r[field])).size,1,"REGRESSION in "+field);}
 for(const field of ["readyMs","longTaskMs","firstMs","thiefMs"]){
  const b=median(before.map(x=>x[field])),a=median(after.map(x=>x[field]));
  console.log("RESULT "+field+" "+b+" => "+a+"; reduction "+Math.round((b-a)/b*100)+"%");
 }
 console.log("SEMANTIC PARITY 3/3 view states, 6 isolated runs");
}finally{await browser.close();await new Promise(ok=>server.close(ok));}
