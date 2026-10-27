import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import {chromium} from "playwright-core";
const root=path.resolve("public");
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".gz":"application/octet-stream"};
const server=http.createServer((req,res)=>{
  let p;
  try{
    const url=new URL(req.url,"http://localhost");
    p=path.resolve(root,"."+decodeURIComponent(url.pathname));
    if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,"index.html");
    if(!p.startsWith(root+path.sep)||!fs.existsSync(p))throw Error("404");
    res.writeHead(200,{"Content-Type":mime[path.extname(p)]||"application/octet-stream"});
    if(req.method==="HEAD")return res.end();
    fs.createReadStream(p).pipe(res);
  }catch{res.writeHead(404).end("not found")}
});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const origin="http://127.0.0.1:"+server.address().port;
const chrome=[
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium","/usr/bin/google-chrome",chromium.executablePath()
].find(fs.existsSync);
if(!chrome){
  server.close();
  if(process.env.REQUIRE_BROWSER==="1")throw Error("No Chromium");
  console.log("SKIP modern browser QA: Chromium unavailable");
  process.exit(0);
}
let browser;
try{
  browser=await chromium.launch({executablePath:chrome,headless:true,
    args:["--no-sandbox","--disable-gpu","--disable-extensions"]});
  const page=await browser.newPage({viewport:{width:1440,height:920}});
  const errors=[],network=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.method()!=="GET")network.push(r.method()+" "+r.url())});
  await page.goto(origin+"/soldiers/modern/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#summary")?.textContent?.includes("변신·훈련 83개"),{timeout:30000});
  assert(await page.locator("#soldierTable tbody tr").count()>20);
  await page.waitForFunction(()=>document.querySelector("#futureCompareSummary")?.textContent?.includes("반 슈퍼변이체 농부: 확정 제외 34개"));
  assert.equal(await page.locator("#futureCompareTable tbody tr").count(),27);
  await page.locator("#futureDifferentOnly").uncheck();
  assert.equal(await page.locator("#futureCompareTable tbody tr").count(),83);
  await page.locator("#futureDifferentOnly").check();
  console.log("PASS 83-rule future side-by-side Gal vs half-super-peasant comparison and 27 difference filter");
  await page.locator("#family").selectOption("STR_SOLDIER");
  await page.locator("#dataset").selectOption("transformations");
  await page.waitForFunction(()=>document.querySelector("#transformationVerdict")?.textContent?.includes("확정 제외 45개 (병종 계보 43 · 내부 전용 2)"));
  assert.equal(await page.locator("#soldierTable tbody tr").count(),83);
  console.log("PASS 2.1 modern browser: 83 transformations / 43 body-only plus 2 internal-only Gal exclusions");

  await page.goto(origin+"/soldiers/modern/?profile=manufacture%3ASTR_HALF_UBER_GIRL_RECRUITMENT");
  await page.waitForSelector("#detailDialog[open]",{timeout:30000});
  const detail=await page.locator("#detailBody").innerText();
  assert(detail.includes("획득 즉시 이미 수행한 변신 3개"));
  assert(detail.includes("이 이력과 직접 충돌하는 변신 3개"));
  assert(!detail.includes("STR_CAREER_SOLDIER"),"internal-only acquisition must not show as an accessible conflicting training");
  assert(detail.includes("미래 방어구 단일 슬롯별 최대 보정 후보"));
  console.log("PASS half-super-peasant acquisition history / inherent exclusions / non-stacking armor candidates");

  await page.goto(origin+"/soldiers/modern/");
  await page.waitForFunction(()=>document.querySelector("#summary")?.textContent?.includes("실제 획득형"));
  await page.locator("#modernSaveFile").setInputFiles("tools/fixtures/modern-2.1-test.sav");
  await page.waitForFunction(()=>document.querySelector("#saveStatus")?.textContent?.includes("완료 연구 1개"),{timeout:25000});
  assert.equal(await page.locator("#analysisMode").inputValue(),"current");
  assert(await page.locator("#saveRoster").isVisible());
  assert((await page.locator("#saveProof").innerText()).includes("실제 세이브"));
  assert((await page.locator("#saveBattleStats").innerText()).includes("현재 대원 · 실제 장착 방어구 한 벌"));
  assert.equal(await page.locator("#saveBattleStats .statbox").count(),12);
  assert.equal(await page.locator("#dataset").inputValue(),"transformations");
  console.log("PASS local fake save import with current-state gating and gear-based real stats rendering");

  const invalid=fs.readFileSync("tools/fixtures/modern-2.1-test.sav","utf8").replace("v.o2","v.o1.1.1");
  await page.locator("#modernSaveFile").setInputFiles({
    name:"wrong-version.sav",mimeType:"text/plain",buffer:Buffer.from(invalid)
  });
  await page.waitForFunction(()=>document.querySelector("#saveStatus")?.textContent?.includes("세이브 판독 실패"));
  console.log("PASS reject save from wrong X-Piratez rules version");

  await page.goto(origin+"/soldiers/");
  await page.waitForSelector("#dataset",{timeout:25000});
  assert.equal(await page.locator("#dataset option[value=final]").count(),1);
  assert(await page.locator('a[href="./modern/"]').count()>0);
  await page.waitForFunction(()=>document.querySelector("#summary")?.textContent?.includes("72개"),{timeout:25000});
  console.log("PASS legacy 1.1.1 soldiers page remains intact and links to separate 2.1 data");
  assert.deepEqual(errors,[],errors.join("\n"));
  assert.deepEqual(network,[], "Save must stay local: "+network.join("; "));
  console.log("PASS all modern browser smoke assertions and no non-GET save uploads");
}finally{
  await browser?.close();
  await new Promise(ok=>server.close(ok));
}
