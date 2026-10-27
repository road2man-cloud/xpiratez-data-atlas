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
  assert.equal(await page.locator("#rareMapLootPanel summary").count(),1);
  await page.locator("#rareMapLootPanel summary").click();
  const mapLootText=await page.locator("#rareMapLootProof").innerText();
  assert(mapLootText.includes("EMANS_VOID20"));
  assert(mapLootText.includes("ABASE_03"));
  assert(mapLootText.includes("STR_BUTCHER_DONE"));
  assert(mapLootText.includes("STR_GDX_004"));
  assert(mapLootText.includes("STR_AVATAR_MEDALLION"));
  assert(mapLootText.includes("임무 발동"));
  await page.locator("#rareMapLootPanel summary").click();
  console.log("PASS 2.1 rare mission map: fixed block items, unlock scripts and non-guaranteed recovery");
  assert.equal(await page.locator("#routeSearchTarget option").count(),83);
  await page.evaluate(async()=>{
    const {showRouteSearchResult}=await import("./app.js");
    showRouteSearchResult({
      kind:"conditional",
      steps:[
        {type:"manufacture",item:"STR_TEST_PRIZE",count:1,recipe:"STR_TEST_BOX",
          assumeOutcome:true,weight:1,weightTotal:34},
        {type:"advanceMonth",month:9,assumeContinuity:true}],
      assumptions:["RNG와 월 진행을 가정"],
      pools:{transforms:1,research:1,recipes:2,randomRecipes:1,
        ambiguousRandomRecipes:1,eventScenarios:1},
      deterministic:{examined:2},searchLimits:{maxDepth:5},sourceComplete:false
    });
  });
  const renderedRoute=await page.locator("#routeSearchResult").innerText();
  assert(renderedRoute.includes("확률 제조 보상 가정"));
  assert(renderedRoute.includes("1/34"));
  assert(renderedRoute.includes("월 진행 가정: 9개월"));
  assert(!renderedRoute.includes("undefined"));
  console.log("PASS uncertain manufacture and future-month route labels render without undefined");
  await page.locator("#family").selectOption("STR_SOLDIER");
  await page.locator("#dataset").selectOption("transformations");
  await page.locator("#routeSearchButton").click();
  assert((await page.locator("#routeSearchResult").innerText()).includes("세이브를 먼저 선택"));
  await page.locator("#dataset").selectOption("profiles");
  await page.locator("#family").selectOption("");
  await page.locator("#baselineGrowthCompare summary").click();
  assert.equal(await page.locator("#baselineGrowthTable tbody tr").count(),12);
  assert.equal((await page.locator('[data-gal-cap="firing"]').innerText()).trim(),"120");
  assert.equal((await page.locator('[data-half-cap="firing"]').innerText()).trim(),"120");
  assert((await page.locator('[data-gal-battle="firing"]').innerText()).includes("125"));
  assert.equal((await page.locator('[data-half-battle="firing"]').innerText()).trim(),"60 ~ 125");
  assert.equal((await page.locator('[data-half-physical="firing"]').innerText()).trim(),"60 ~ 85");
  assert.equal((await page.locator('[data-half-battle="health"]').innerText()).trim(),"45 ~ 56");
  assert((await page.locator("#baselineGrowthSummary").innerText()).includes("41종"));
  console.log("PASS Gal vs half-super-peasant 12-stat baseline battle growth cap vs gym training, 41 tagged armors");
  await page.waitForFunction(()=>document.querySelector("#futureCompareSummary")?.textContent?.includes("반 슈퍼변이체 농부: 확정 제외 45개"));
  assert.equal(await page.locator("#futureCompareTable tbody tr").count(),28);
  await page.locator("#futureDifferentOnly").uncheck();
  assert.equal(await page.locator("#futureCompareTable tbody tr").count(),83);
  await page.locator("#futureDifferentOnly").check();
  console.log("PASS 83-rule future side-by-side Gal vs half-super-peasant comparison and 28 difference filter");
  await page.locator("#family").selectOption("STR_SOLDIER");
  await page.locator("#dataset").selectOption("transformations");
  await page.waitForFunction(()=>document.querySelector("#transformationVerdict")?.textContent?.includes("확정 제외 45개 (병종 계보 43 · 내부 전용 2 · 이력·선행 불가 0)"));
  assert.equal(await page.locator("#soldierTable tbody tr").count(),83);
  console.log("PASS 2.1 modern browser: 83 transformations / 43 body-only plus 2 internal-only Gal exclusions");
  await page.locator("#plannerMonth").fill("6");
  await page.locator("#plannerMonth").dispatchEvent("change");
  await page.locator('#soldierTable tbody tr[data-row="STR_WEIRDGAL_TRANSFORMATION"]').evaluate(el=>el.click());
  const eventSummary=page.locator("#detailDialog summary").filter({hasText:"연구 직접 지급 이벤트"});
  assert.equal(await eventSummary.count(),1,"transformation research event proof must be visible after row activation");
  await eventSummary.click();
  const eventText=await page.locator("#detailDialog").innerText();
  assert(eventText.includes("STR_PSI_INITIATION"),"research event gate uses real source IDs");
  assert(eventText.includes("월별 가중치")||eventText.includes("이벤트 보상"),
    "time-aware event evidence should be rendered");
  await page.locator("#detailDialog #closeDialog").click();
  console.log("PASS actual X-Piratez research-event month and exclusivity evidence visible in modern detail");

  await page.goto(origin+"/soldiers/modern/?profile=manufacture%3ASTR_HALF_UBER_GIRL_RECRUITMENT");
  await page.waitForSelector("#detailDialog[open]",{timeout:30000});
  const detail=await page.locator("#detailBody").innerText();
  assert(detail.includes("획득 즉시 이미 수행한 변신 3개"));
  assert(detail.includes("초기 이력으로 인해 영구 제외 2개"));
  assert(detail.includes("이력 초기화 뒤 재검토 가능한 충돌 1개"));
  assert(!detail.includes("STR_CAREER_SOLDIER"),"internal-only acquisition must not show as an accessible conflicting training");
  assert(detail.includes("미래 방어구 단일 슬롯별 최대 보정 후보"));
  console.log("PASS half-super-peasant: 2 proven inherited-history bans, 1 resettable collision, non-stacking armor");
  await page.locator("#detailDialog #closeDialog").click();
  await page.locator("#family").selectOption("STR_SOLDIER_PEASANT");
  await page.locator("#dataset").selectOption("transformations");
  await page.locator("#plannerProfile").selectOption("manufacture:STR_HALF_UBER_GIRL_RECRUITMENT");
  await page.waitForFunction(()=>document.querySelector("#transformationVerdict")?.textContent?.includes(
    "확정 제외 45개 (병종 계보 31 · 내부 전용 3 · 이력·선행 불가 11)"));
  console.log("PASS 2.1 actual half-super-peasant planner excludes 11 directed-history/predecessor dead ends");
  assert.equal(await page.locator("#statEnvelopeContent [data-stat]").count(),12);
  assert.equal((await page.locator('#statEnvelopeContent [data-stat="firing"]').innerText()).trim(),"60");
  assert((await page.locator('#statEnvelopeContent [data-stat="psiStrength"]').innerText()).includes("20 ~ 70"));
  await page.locator("#previousTransformation").selectOption("STR_REVOLUTIONARY_TRAINING");
  assert.equal(await page.locator("#addTransformation").isDisabled(),false);
  await page.locator("#addTransformation").click();
  await page.waitForFunction(()=>document.querySelector("#statEnvelopeContent [data-stat=firing]")?.textContent?.includes("45 ~ 70"));
  assert.equal((await page.locator('#statEnvelopeContent [data-stat="health"]').innerText()).trim(),"39 ~ 54");
  assert((await page.locator("#statEnvelopeContent").innerText()).includes("무작위 변화: STR_REVOLUTIONARY_TRAINING"));
  await page.locator("#clearTransformations").click();
  assert.equal((await page.locator('#statEnvelopeContent [data-stat="firing"]').innerText()).trim(),"60");
  console.log("PASS OXCE 12-stat minimum/maximum interval: half-super-peasant revolutionary firing 45..70 health 39..54, reset to source");
  assert.equal((await page.locator('#statEnvelopeContent [data-cap="firing"]').innerText()).trim(),"120");
  assert.equal((await page.locator('#statEnvelopeContent [data-training-cap="firing"]').innerText()).trim(),"85");
  await page.locator("#addBattleGrowth").click();
  assert.equal((await page.locator('#statEnvelopeContent [data-stat="firing"]').innerText()).trim(),"60 ~ 125");
  assert.equal((await page.locator('#statEnvelopeContent [data-stat="health"]').innerText()).trim(),"45 ~ 56");
  assert((await page.locator("#transformationHistory").innerText()).includes("향후 반복 전투 성장 가정"));
  await page.locator("#previousTransformation").selectOption("STR_REVOLUTIONARY_TRAINING");
  await page.locator("#addTransformation").click();
  const battleThenRevolution=(await page.locator('#statEnvelopeContent [data-stat="firing"]').innerText()).trim();
  await page.locator("#clearTransformations").click();
  await page.locator("#previousTransformation").selectOption("STR_REVOLUTIONARY_TRAINING");
  await page.locator("#addTransformation").click();
  await page.locator("#addBattleGrowth").click();
  const revolutionThenBattle=(await page.locator('#statEnvelopeContent [data-stat="firing"]').innerText()).trim();
  assert.notEqual(battleThenRevolution,revolutionThenBattle,"growth and percentage-transform order MUST differ");
  await page.locator("#clearTransformations").click();
  await page.locator("#addPhysicalGrowth").click();
  assert.equal((await page.locator('#statEnvelopeContent [data-stat="firing"]').innerText()).trim(),"60 ~ 85");
  assert.equal((await page.locator('#statEnvelopeContent [data-stat="health"]').innerText()).trim(),"45");
  console.log("PASS source-linked combat / physical growth stages, 120 vs 85 firing caps, 125 vs 85 theoretical upper and order-sensitive transformation");
  await page.locator("#clearTransformations").click();

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
  await page.waitForFunction(()=>document.querySelector("#futureCompareResearch")?.textContent
    ?.includes("현재 세이브 연구 상태 대조"),{timeout:25000});
  assert((await page.locator("#futureCompareTable tbody tr").first().innerText()).includes("미완료")||
    (await page.locator("#futureCompareTable tbody tr").first().innerText()).includes("요구 연구"));
  console.log("PASS local fake save import with current-state gating, research-evidence comparison and gear-based stats");
  await page.locator("#routeSearchTarget").selectOption("STR_CAREER_SOLDIER");
  await page.locator("#routeSearchButton").click();
  await page.waitForFunction(()=>document.querySelector("#routeSearchResult")?.textContent?.includes(
    "동일 대원 계보에서 확정 제외"),{timeout:15000});
  const internalReport=await page.locator("#routeSearchResult").innerText();
  assert(internalReport.includes("STR_UNAVAILABLE"));
  assert(internalReport.includes("비용 0 자동 연구 조건"));
  assert(internalReport.includes("내부 전용"));
  await page.locator("#routeSearchTarget").selectOption("STR_HIGH_MAGOS_CEREMONY");
  await page.locator("#routeSearchButton").click();
  await page.waitForFunction(()=>document.querySelector("#routeSearchResult")
    ?.textContent?.includes("STR_HIGH_MAGOS"),null,{timeout:20000});
  const wizardReport=await page.locator("#routeSearchResult").innerText();
  assert(wizardReport.includes("STR_HIGH_MAGOS"));
  assert(wizardReport.includes("STR_BUGEYE_WIZARD_SPECIALIZATION"));
  assert(wizardReport.includes("연구 완료 후에만 자동 처리 검토"));
  console.log("PASS saved-game zero-cost auto-research gating distinguishes prerequisites and internal-only flags");
  console.log("PASS automatic future route UI respects imported save, internal-only blocker and never uploads the save");

  const invalid=fs.readFileSync("tools/fixtures/modern-2.1-test.sav","utf8").replace("v.o2","v.o1.1.1");
  await page.locator("#modernSaveFile").setInputFiles({
    name:"wrong-version.sav",mimeType:"text/plain",buffer:Buffer.from(invalid)
  });
  await page.waitForFunction(()=>document.querySelector("#saveStatus")?.textContent?.includes("세이브 판독 실패"));
  assert((await page.locator("#futureCompareResearch").innerText()).includes("세이브를 불러오면"),
    "invalid save must clear campaign-specific research decisions");
  console.log("PASS reject save from wrong X-Piratez rules version and clear private campaign evidence");

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
