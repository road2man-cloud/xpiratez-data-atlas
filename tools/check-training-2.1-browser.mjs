import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import {chromium} from "playwright-core";
const root=path.resolve("public");
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",
  ".gz":"application/octet-stream"};
const server=http.createServer((req,res)=>{
  try{
    const url=new URL(req.url,"http://localhost");
    let file=path.resolve(root,"."+decodeURIComponent(url.pathname));
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,"index.html");
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))throw Error("not found");
    res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream"});
    fs.createReadStream(file).pipe(res);
  }catch{res.writeHead(404).end("missing")}
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
  console.log("SKIP 2.1 training browser: Chromium unavailable");
  process.exit(0);
}
let browser;
try{
  browser=await chromium.launch({executablePath:chrome,headless:true,
    args:["--no-sandbox","--disable-gpu","--disable-extensions"]});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[],requests=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",req=>requests.push({method:req.method(),url:req.url()}));
  await page.goto(origin+"/trainings/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>
    document.querySelector("#trainingTable tbody tr[data-id]")&&
    document.querySelector("#loadStatus")?.dataset.state==="validated",
    {timeout:45000});
  assert.equal(await page.locator("#trainingTable tbody tr[data-id]").count(),83);
  assert.equal(await page.locator("#origin option").count(),72);
  assert.equal(await page.locator("#origin").inputValue(),"direct:STR_SOLDIER_PEASANT");
  assert.equal(await page.locator("#legacyMaximaArchive").count(),0);
  assert(!(await page.locator("header").textContent()).includes("1.1.1"));
  const badRequests=requests.filter(x=>/trainings-runtime|training-access|soldiers-runtime|play-guide\/trainings/.test(x.url));
  assert.deepEqual(badRequests,[],"Legacy 1.1.1 assets requested by new page");
  assert(requests.some(x=>/soldiers-modern-index\.json(?:\.gz)?/.test(x.url)));
  console.log("PASS 2.1 training first paint: 83 rules, 72 acquisition profiles, no 1.1.1 runtime");

  await page.locator("#search").fill("STR_BASIC_FIREARMS_TRAINING");
  assert(await page.locator("#trainingTable tbody tr[data-id]").count()>=1);
  await page.locator('#trainingTable tbody tr[data-id="STR_BASIC_FIREARMS_TRAINING"]').click();
  const detail=await page.locator("#detailPanel").innerText();
  assert(detail.includes("기본 총기 훈련")&&detail.includes("필요 연구")&&
    detail.includes("직접 능력치 변화")&&detail.includes("영구 특성 증가")&&
    detail.includes("STR_BASIC_FIREARMS_TRAINING"));
  assert.equal(await page.locator('#detailPanel [data-status="conditional"]').count(),1);
  await page.locator("#addTraining").click();
  assert.equal(await page.locator("#timeline li").count(),1);
  assert((await page.locator("#planSummary").innerText()).includes("실제 완료 인증 없음"));
  assert.equal(await page.locator("#addTraining").isDisabled(),true,
    "Repeated firearm training was not history-gated");
  await page.locator("#undo").click();
  assert.equal(await page.locator("#timeline li").count(),1); // placeholder only
  assert.equal(await page.locator("#addTraining").isDisabled(),false);
  await page.locator("#search").fill("");
  assert.equal(await page.locator("#trainingTable tbody tr[data-id]").count(),83);
  console.log("PASS search/detail/direct-vs-trait effects and conditional step + one-shot history + undo");

  await page.locator("#search").fill("STR_CAREER_SOLDIER");
  const internal=page.locator('#trainingTable tbody tr[data-id="STR_CAREER_SOLDIER"]');
  await internal.click();
  assert.equal(await page.locator('#detailPanel [data-status="excluded"]').count(),1);
  assert((await page.locator("#detailPanel").innerText()).includes("STR_UNAVAILABLE"));
  assert.equal(await page.locator("#addTraining").isDisabled(),true);
  await page.locator("#search").fill("");
  await page.locator("#origin").selectOption("manufacture:STR_THEBAN_ASSAULT_CLONE");
  assert((await page.locator("#summary").innerText()).includes("돌격 클론"));
  assert((await page.locator("#summary").innerText()).includes("출생 변신 이력"));
  await page.locator("#search").fill("STR_BATTLE_FORM_AUGMENTATION");
  await page.locator('#trainingTable tbody tr[data-id="STR_BATTLE_FORM_AUGMENTATION"]').click();
  assert.notEqual(await page.locator("#detailPanel [data-status='conditional']").count(),1);
  await page.locator("#origin").selectOption("direct:STR_SOLDIER_PEASANT");
  assert((await page.locator("#summary").innerText()).includes("직접 고용 · 농부"));
  console.log("PASS internal-only exclusion and same-body different-origin histories");

  await page.goto(origin+"/trainings/?training=STR_PERSON_OF_CULTURE_TRAINING");
  await page.waitForFunction(()=>document.querySelector("#loadStatus")?.dataset.state==="validated",
    {timeout:30000});
  assert((await page.locator("#detailPanel").innerText()).includes("문화 교육"));
  assert.equal(await page.locator("#trainingTable tbody tr[data-id]").count(),83);
  await page.locator("#savePanel > summary").click();
  await page.locator("#trainingSaveFile").setInputFiles("tools/fixtures/modern-2.1-test.sav");
  await page.waitForFunction(()=>document.querySelector("#trainingSaveSummary")
    ?.textContent.includes("2.1 저장본"),{timeout:30000});
  assert(await page.locator("#origin").isDisabled());
  assert(await page.locator("#condition").isDisabled());
  assert(await page.locator("#trainingSaveRoster").isVisible());
  assert((await page.locator("#trainingSaveSummary").innerText()).includes("완료 연구"));
  await page.locator("#clearTrainingSave").click();
  assert(!(await page.locator("#origin").isDisabled()));
  assert(await page.locator("#trainingSaveRoster").isHidden());
  const oldSave=fs.readFileSync("tools/fixtures/modern-2.1-test.sav","utf8")
    .replace("v.o2","v.o1.1.1");
  await page.locator("#trainingSaveFile").setInputFiles({
    name:"old-version.sav",mimeType:"text/plain",buffer:Buffer.from(oldSave)
  });
  await page.waitForFunction(()=>document.querySelector("#trainingSaveSummary")
    ?.textContent.includes("세이브 판독 실패"),{timeout:18000});
  assert((await page.locator("#trainingSaveSummary").innerText()).includes("2.1"));
  assert(await page.locator("#trainingSaveRoster").isHidden());
  console.log("PASS deep-link, local 2.1 save and explicit wrong-version rejection");

  await page.setViewportSize({width:390,height:844});
  await page.locator("#search").fill("");
  assert.equal(await page.locator("#trainingTable tbody tr[data-id]").count(),83);
  const metrics=await page.evaluate(()=>({
    bodyWidth:document.documentElement.scrollWidth,
    viewport:window.innerWidth,
    tableScroll:document.querySelector(".table-shell").scrollWidth >
      document.querySelector(".table-shell").clientWidth
  }));
  assert(metrics.bodyWidth<=metrics.viewport+1,"Training page overflows mobile viewport: "+JSON.stringify(metrics));
  assert(metrics.tableScroll);
  console.log("PASS mobile no page-level horizontal overflow with scrollable 83-rule comparison table");

  const tampered=await browser.newPage();
  const tamperErrors=[];
  tampered.on("pageerror",e=>tamperErrors.push(e.message));
  await tampered.route("**/data/soldiers-modern-index.json.gz*",route=>
    route.fulfill({status:404,body:"missing"}));
  await tampered.route("**/data/soldiers-modern-index.json?*",async route=>{
    const response=await route.fetch();
    const json=await response.json();
    json.meta.mod.version="v.o1.1.1";
    await route.fulfill({response,body:JSON.stringify(json),contentType:"application/json"});
  });
  await tampered.goto(origin+"/trainings/",{waitUntil:"domcontentloaded"});
  await tampered.waitForFunction(()=>document.querySelector("#loadStatus")
    ?.dataset.state==="rejected",{timeout:30000});
  assert.equal(await tampered.locator("#trainingTable tbody tr[data-id]").count(),0);
  assert((await tampered.locator("#loadStatus").innerText()).includes("2.1 원본"));
  await tampered.close();
  assert.deepEqual(errors,[],errors.join("\n"));
  assert.deepEqual(requests.filter(x=>x.method!=="GET"),[],
    "Imported save must never be uploaded with non-GET requests");
  console.log("PASS fail-closed wrong source and private-only save; no JS page errors or upload");
}finally{
  await browser?.close();
  await new Promise(ok=>server.close(ok));
}
