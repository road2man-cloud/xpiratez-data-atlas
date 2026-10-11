// Browser-side first-list paint and resource budget audit for every Atlas DB.
// Usage: node tools/profile-site-performance.mjs --local [--pages=items,soldiers]
// Requires playwright-core and a local Edge/Chrome executable.
import http from "node:http";
import fs from "node:fs/promises";
import {existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright-core";

const publicDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../public");
const args=process.argv.slice(2);
const arg=k=>args.find(a=>a.startsWith(k+"="))?.slice(k.length+1);
const pages=(arg("--pages")||"items,research,soldiers,trainings,weapons,armors,manufacture,events,forces,crafts,facilities,starting,craft-weapons").split(",");
const ready={
 items:"#tbody tr",research:"#tbody tr",soldiers:"#soldierTable tbody tr",
 trainings:"#trainingTable tbody tr",weapons:"#weaponTable tbody tr",
 armors:"#armorTable tbody tr",manufacture:"#manufactureTable tbody tr",
 events:"#eventTable tbody tr",forces:"#forceTable tbody tr",
 crafts:"#craftTable tbody tr",facilities:"#facilityTable tbody tr",
 starting:"#cards .card","craft-weapons":"#weaponTable tbody tr"
};
let server;
if(args.includes("--local")){
 const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".gz":"application/octet-stream"};
 server=http.createServer(async(req,res)=>{
   try{
     const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
     const file=path.resolve(publicDir,"."+pathname,(pathname.endsWith("/")?"index.html":""));
     if(file!==publicDir&&!file.startsWith(publicDir+path.sep)){res.writeHead(403);res.end();return;}
     const data=await fs.readFile(file);
     res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream","Content-Length":data.length,"Cache-Control":"no-store"});
     res.end(data);
   }catch{res.writeHead(404);res.end("Not found");}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
}
const base=server?"http://127.0.0.1:"+server.address().port+"/":arg("--base")||"https://road2man-cloud.github.io/xpiratez-data-atlas/";
const edge=[
 process.env.EDGE_PATH,
 "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
 "C:/Program Files/Google/Chrome/Application/chrome.exe",
 "/usr/bin/google-chrome","/usr/bin/chromium",
 chromium.executablePath()
].find(x=>x&&existsSync(x));
if(!edge)throw new Error("No local browser executable");
const browser=await chromium.launch({executablePath:edge,headless:true,args:["--no-first-run","--no-sandbox"]});
const results=[];
try{
 for(const slug of pages){
   const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
   const errors=[],resources=[];
   page.on("pageerror",e=>errors.push(e.message));
   page.on("response",r=>{
     const url=new URL(r.url());
     if(url.pathname.includes("/data/")||url.pathname.includes("/items/data/")){
       resources.push({name:url.pathname.split("/").slice(-2).join("/"),bytes:Number(r.headers()["content-length"]||0),status:r.status()});
     }
   });
   await page.addInitScript(()=>{
     window.__longTaskDurations=[];
     try{new PerformanceObserver(list=>{
       for(const e of list.getEntries())window.__longTaskDurations.push(Math.round(e.duration));
     }).observe({entryTypes:["longtask"]});}catch{}
   });
   try{
     await page.goto(new URL(slug+"/",base).href,{waitUntil:"domcontentloaded",timeout:50000});
     await page.locator(ready[slug]).first().waitFor({state:"attached",timeout:50000});
     const loadedAt=await page.evaluate(()=>Math.round(performance.now()));
     await page.waitForTimeout(400);
     const metrics=await page.evaluate(selector=>({
       documentNodes:document.getElementsByTagName("*").length,
       rows:document.querySelectorAll(selector).length,
       jsHeapMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:null,
       longTasks:window.__longTaskDurations?.length||0,
       longTaskMs:window.__longTaskDurations?.reduce((a,b)=>a+b,0)||0
     }),ready[slug]);
     const sorted=resources.sort((a,b)=>b.bytes-a.bytes);
     const rawMB=Number((resources.reduce((total,r)=>total+r.bytes,0)/1048576).toFixed(2));
     const row={slug,loadedAt,rawMB,...metrics,resources:resources.length,largest:sorted.slice(0,4),errors};
     results.push(row);
     console.log(JSON.stringify(row));
   }catch(e){
     const row={slug,error:e.message.slice(0,600),errors};results.push(row);console.log(JSON.stringify(row));
   }finally{await page.close();}
 }
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
console.log("PROFILE "+results.length+" pages; errors="+results.filter(x=>x.error||x.errors?.length).length);
if(results.some(x=>x.error||x.errors?.length))process.exitCode=1;
