// Real browser regression for the separate 2.1 research checker.
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import {readFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright-core";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../public");
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8",".gz":"application/octet-stream"};
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,"http://localhost");
    const location=decodeURIComponent(u.pathname);
    const candidate=path.resolve(root,"."+location,location.endsWith("/")?"index.html":"");
    if(!candidate.startsWith(root+path.sep))throw Error("unsafe path");
    const bytes=await readFile(candidate);
    res.writeHead(200,{"Content-Type":mime[path.extname(candidate)]||"application/octet-stream","Cache-Control":"no-store"});
    res.end(bytes);
  }catch{res.writeHead(404);res.end("not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port+"/research/";
const binaries=[process.env.EDGE_PATH,"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",chromium.executablePath()];
let binary=null;
for(const p of binaries)if(p&&existsSync(p)){binary=p;break;}
if(!binary)throw Error("Chromium/Edge binary not available");
const browser=await chromium.launch({headless:true,executablePath:binary,args:["--no-sandbox"]});
const cases=[];
const save=[
 "name: Test fixture", "mods: Piratez","---","difficulty: 1","monthsPassed: 6",
 "discovered:","  - STR_CAPTAIN_LAZYASS","  - STR_CODEX_RED","  - STR_SHADOW_CHASING",
 "  - STR_PSI_LAB","researchRuleStatus:","  STR_CAPTAIN_DUMBASS: 2",
 "  STR_REJECT_THE_POWER: 2","  STR_CAPTAIN_PUSSY: 2"
].join("\n")+"\n";
async function test(name,opts,fn){
  const context=await browser.newContext({viewport:opts.mobile?{width:390,height:844}:{width:1180,height:860}});
  const page=await context.newPage();page.setDefaultTimeout(30000);
  const errors=[],requests=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.url().includes("research-exclusivity-21.json"))requests.push(r.url());});
  try{
    if(opts.disableGzip)await page.addInitScript(()=>{
      Object.defineProperty(window,"DecompressionStream",{value:undefined,configurable:true});
    });
    if(opts.corruptGzip)await page.route(/research-exclusivity-21\.json\.gz(?:\?|$)/,route=>
      route.fulfill({status:200,contentType:"application/octet-stream",body:"invalid gzip"}));
    await page.goto(base+(opts.deepLink?"#researchExclusivity21":""),{waitUntil:"domcontentloaded"});
    await page.locator("#tbody tr").first().waitFor();
    if(!opts.deepLink){
      assert.equal(requests.length,0,"2.1 JSON must be lazy loaded");
      await page.locator("#researchExclusivity21 > summary").click();
    }
    await page.locator("#r21Content").waitFor({state:"visible",timeout:45000});
    assert(requests.length>=1,"2.1 resource was not requested");
    await fn(page,requests);
    assert.deepEqual(errors,[],"browser JavaScript errors");
    cases.push(name);console.log("PASS research-21 browser "+name);
  }finally{await context.close();}
}
try{
  await test("desktop lazy load, rules, actual-style local save and undo",{},async page=>{
    assert((await page.locator("#r21Loading").innerText()).includes("4,645"));
    await page.locator("#r21Preset").click();
    await page.locator("#r21Search").fill("STR_CAPTAIN_DUMBASS");
    await page.locator('[data-r21-pick="STR_CAPTAIN_DUMBASS"]').first().click();
    assert((await page.locator("#r21Detail").innerText()).includes("직접 영구 배제"));
    const file={name:"fixture.sav",mimeType:"text/plain",buffer:Buffer.from(save,"utf8")};
    await page.locator("#r21Save").setInputFiles(file);
    await page.waitForFunction(()=>document.querySelector("#r21Source").textContent.includes("로컬 세이브"));
    assert((await page.locator("#r21Message").innerText()).includes("전송"));
    await page.locator("#r21Search").fill("STR_DARK_STAR");
    await page.locator('[data-r21-pick="STR_DARK_STAR"]').first().click();
    const detail=await page.locator("#r21Detail").innerText();
    assert(detail.includes("무료·이벤트 지급 후보"));
    assert(detail.includes("STR_CODEX_RED")&&detail.includes("STR_SHADOW_CHASING"));
    const grant=page.locator('#r21Detail [data-r21-apply="grant"][data-r21-source="STR_CODEX_RED"]');
    assert.equal(await grant.count(),1);
    await grant.click();
    assert((await page.locator("#r21Timeline").innerText()).includes("STR_DARK_STAR"));
    assert((await page.locator("#r21Detail").innerText()).includes("완료"));
    await page.locator("#r21Undo").click();
    assert((await page.locator("#r21Detail").innerText()).includes("무료·이벤트 지급 후보"));
    await page.locator("#r21Search").fill("STR_CODEX_RED_AWAKENED");
    await page.locator('[data-r21-pick="STR_CODEX_RED_AWAKENED"]').first().click();
    assert((await page.locator("#r21Detail").innerText()).includes("실물 아이템 필요"));
    await page.locator("#r21Search").fill("STR_REJECT_THE_POWER");
    await page.locator('[data-r21-pick="STR_REJECT_THE_POWER"]').first().click();
    assert((await page.locator("#r21Detail").innerText()).includes("researchRuleStatus=2"));
  });
  await test("no-gzip browser fallback",{disableGzip:true},async page=>{
    await page.locator("#r21Search").fill("STR_VIP_014");
    await page.locator('[data-r21-pick="STR_VIP_014"]').first().click();
    assert((await page.locator("#r21Detail").innerText()).includes("STR_GOLD_AT_SEANS_NEW_FACES"));
  });
  await test("cross-database deep link opens 2.1 checker",{deepLink:true},async page=>{
    assert(await page.locator("#researchExclusivity21").evaluate(x=>x.open));
    assert((await page.locator("#r21Loading").innerText()).includes("4,645"));
  });
  await test("corrupted gzip fallback and mobile",{corruptGzip:true,mobile:true},async page=>{
    await page.locator("#r21Search").fill("STR_DARK_STAR");
    await page.locator('[data-r21-pick="STR_DARK_STAR"]').first().click();
    assert((await page.locator("#r21Detail").innerText()).includes("STR_CODEX_RED"));
    const overflow=await page.locator("#researchExclusivity21").evaluate(x=>x.scrollWidth-x.clientWidth);
    assert(overflow<=4,"2.1 panel has horizontal mobile overflow "+overflow);
  });
  console.log("OK research-21 browser:",cases.join("; "));
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
