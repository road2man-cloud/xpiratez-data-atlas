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
  try{
    await page.waitForFunction(()=>document.querySelectorAll("#originTable tbody tr").length===112,
      {timeout:30000});
  }catch(error){
    console.error("Origin table not ready:",await page.locator("#originStatus").innerText(),errors);
    throw error;
  }
  assert.equal(await page.locator("#originTable thead th").count(),15);
  assert.equal(await page.locator("#originMaxima").getAttribute("data-validation"),"validated");
  const proofDashboard=await page.locator("#originProofDashboard").innerText();
  assert(proofDashboard.includes("0 / 112"),"No unverified maximum may be silently published");
  assert(proofDashboard.includes("72"));
  assert(proofDashboard.includes("40"));
  assert(proofDashboard.includes("3,559"));
  assert(proofDashboard.includes("불가능 확정 0건"));
  await page.locator("#originProofMeaning > summary").click();
  assert((await page.locator("#originProofMeaning").innerText()).includes("그보다 높은 최종"));
  await page.locator("#originProofMeaning > summary").click();
  assert((await page.locator("#originSummary").innerText()).includes("72개"));
  assert((await page.locator("#originSummary").innerText()).includes("40개"));
  assert((await page.locator("#originSummary").innerText()).includes("확정 0개"));
  assert((await page.locator("#originSummary").innerText()).includes("선보유 17개"));
  assert((await page.locator("#originSummary").innerText()).includes("충돌 15개"));
  assert((await page.locator("#originSummary").innerText()).includes("구조 사슬 401개"));
  assert((await page.locator("#originSummary").innerText()).includes("훈련 삽입 순서 후보 22686건(미실행)"));
  assert((await page.locator("#originSummary").innerText()).includes("현재능력·하드캡 시간순 구조 계산 3559단계(미실행)"));
  assert.equal(await page.locator("#originMetric").inputValue(),"verified",
    "confirmed full-route maxima must be the default display");
  assert.equal((await page.locator("#originTable tbody tr").first().locator("td").nth(3).innerText()).trim(),"—");
  assert((await page.locator("#originStatus").innerText()).includes("실제 연구·훈련·성장·훈장·변신 순서"));
  await page.locator("#originMetric").selectOption("max");
  await page.locator("#originSearch").fill("manufacture:STR_HALF_UBER_GIRL_RECRUITMENT");
  assert.equal(await page.locator("#originTable tbody tr").count(),1);
  const halfBirth=await page.locator("#originTable tbody tr").first().innerText();
  assert(halfBirth.includes("반 슈퍼변이체"));
  assert(halfBirth.includes("미검증"));
  assert.equal((await page.locator("#originTable tbody tr").first().locator("td").nth(9).innerText()).trim(),"60");
  await page.locator("#originTable .maxima-show").first().click();
  const originEvidence=await page.locator("#originDetails").innerText();
  assert(originEvidence.includes("STR_UBERIZATION"));
  assert(originEvidence.includes("출생 시 영구 보너스"));
  assert(originEvidence.includes("체육관 → 전투 장기 상계"));
  assert(originEvidence.includes("미검증 · 숫자 표시 금지"));
  assert(originEvidence.includes("출생 직후 일반 훈련·필수 선행 순서의 제한적 탐색"));
  assert(originEvidence.includes("서로 다른 목표 훈련 27종"));
  assert(originEvidence.includes("아직 완료되지 않은 증명"));
  assert(originEvidence.includes("전역 최적성"));
  assert.equal(await page.locator("#originDetails [data-gate]").count(),10);
  assert.equal(await page.locator('#originDetails [data-gate-status="UNPROVEN"]').count(),7);
  assert.equal(await page.locator('#originDetails [data-gate-status="RULE_INDEXED"]').count(),2);
  await page.locator("#originDetailClose").click();
  await page.locator("#originSearch").fill("direct:STR_SOLDIER_PEASANT");
  await page.locator("#originTable .maxima-show").first().click();
  assert((await page.locator("#originDetails").innerText()).includes("서로 다른 목표 훈련 30종"));
  await page.locator("#originTrainingBirthButton").click();
  const peasantTraining=await page.locator("#originTrainingBirthPanel").innerText();
  assert(peasantTraining.includes("STR_BASIC_FIREARMS_TRAINING"));
  assert(peasantTraining.includes("STR_BOOT_CAMP_TRAINING"));
  assert(peasantTraining.includes("STR_MILITARY_DRILL_TRAINING"));
  assert(peasantTraining.includes("DOJO"));
  assert(peasantTraining.includes("STR_ELERIUM_115"));
  assert(peasantTraining.includes("연구·재료·훈장·계급·능력치·시간순 미검증"));
  await page.locator("#originBirthCapTimelineButton").click();
  assert.equal(await page.locator("#originBirthCapTimelinePanel .origin-stage-cap-projection").count(),2);
  const peasantCapPreview=page.locator("#originBirthCapTimelinePanel .origin-stage-cap-projection").nth(1);
  await peasantCapPreview.locator("details").nth(1).locator("summary").click();
  assert.equal((await peasantCapPreview.locator("details").nth(1).locator("tbody tr").nth(5).locator("td").nth(2).innerText()).trim(),"55",
    "Battle Form cannot raise the raw health growth cap");
  assert.equal((await peasantCapPreview.locator("details").nth(1).locator("tbody tr").nth(8).locator("td").nth(2).innerText()).trim(),"70",
    "The unique +15 SoldierBonus only raises the effective-cap reference");
  const peasantCapEvidence=await peasantCapPreview.innerText();
  assert(peasantCapEvidence.includes("최종 능력치 미산출"));
  assert(peasantCapEvidence.includes("실제 statCaps"));
  await page.locator("#originDetailClose").click();
  await page.locator("#originSearch").fill("manufacture:STR_THEBAN_ASSAULT_CLONE");
  assert.equal(await page.locator("#originTable tbody tr").count(),1);
  assert.equal((await page.locator("#originTable tbody tr").first().locator("td").nth(9).innerText()).trim(),"80");
  assert.equal((await page.locator("#originTable tbody tr").first().locator("td").nth(6).innerText()).trim(),"55");
  assert.equal((await page.locator("#originTable tbody tr").first().locator("td").nth(14).innerText()).trim(),"80");
  await page.locator("#originTable .maxima-show").first().click();
  const assaultEvidence=await page.locator("#originDetails").innerText();
  assert(assaultEvidence.includes("출생 계급 1"));
  assert(assaultEvidence.includes("STR_THEBAN_ASSAULT_CLONE"));
  assert(assaultEvidence.includes("STR_BATTLE_FORM_AUGMENTATION"));
  assert(assaultEvidence.includes("출생 이력으로 직접 차단되는 후보 훈련"));
  assert(assaultEvidence.includes("불가능 판정은 아닙니다"));
  assert(assaultEvidence.includes("실물 재료"));
  assert(assaultEvidence.includes("STR_THEBAN_ASSAULT_CLONE_LICENSE"));
  assert(assaultEvidence.includes("STR_START_COUNTRY_EGYPT_EVENT"));
  assert(assaultEvidence.includes("STR_REVOLUTIONARY_SPEECH_THEBES"));
  assert(assaultEvidence.includes("서로 다른 목표 훈련 18종"));
  assert(assaultEvidence.includes("7개 훈련은 출생 직후 이력을 유지한 직접 시도에서 차단됨"));
  assert(assaultEvidence.includes("우회 경로 전체가 불가능하다는 뜻은 아님"));
  await page.locator("#originTrainingBirthButton").click();
  const cloneTraining=await page.locator("#originTrainingBirthPanel").innerText();
  assert(cloneTraining.includes("STR_CAPTAINS_11"));
  assert(cloneTraining.includes("STR_CAPTAINS_11_TOKEN"));
  assert(cloneTraining.includes("STR_GLAMOUR"));
  assert(!cloneTraining.includes("STR_MILITARY_DRILL_TRAINING"));
  assert(!cloneTraining.includes("STR_BATTLE_FORM_AUGMENTATION"));
  await page.locator("#originBirthCapTimelineButton").click();
  const cloneCaps=page.locator("#originBirthCapTimelinePanel .origin-stage-cap-projection").first();
  assert.equal((await cloneCaps.locator("tbody tr").nth(5).locator("td").nth(2).innerText()).trim(),"55");
  assert.equal((await cloneCaps.locator("tbody tr").nth(8).locator("td").nth(2).innerText()).trim(),"65");
  await page.locator("#originDetailClose").click();
  await page.locator("#originSearch").fill("event:STR_CODEX_BONUS_G5");
  assert.equal(await page.locator("#originTable tbody tr").count(),1);
  await page.locator("#originTable .maxima-show").first().click();
  let houndOriginEvidence=await page.locator("#originDetails").innerText();
  assert(houndOriginEvidence.includes("2.1 원본 이벤트 출처"));
  assert(houndOriginEvidence.includes("1개 스크립트 분기"));
  await page.locator("#originDetails details summary")
    .filter({hasText:"대체 이벤트별"}).click();
  houndOriginEvidence=await page.locator("#originDetails").innerText();
  assert(houndOriginEvidence.includes("스크립트 실행 확률 23%"));
  assert(houndOriginEvidence.includes("STR_CAPTAIN_SAINT"));
  assert(houndOriginEvidence.includes("STR_GODS_E5"));
  await page.locator("#originDetailClose").click();
  await page.locator("#originSearch").fill("event:STR_MRSHAN_FIGHTER_EVENT");
  assert.equal(await page.locator("#originTable tbody tr").count(),1);
  await page.locator("#originTable .maxima-show").first().click();
  assert((await page.locator("#originDetails").innerText()).includes("3개 스크립트 분기"));
  await page.locator("#originDetails details summary")
    .filter({hasText:"대체 이벤트별"}).click();
  const fighterEvidence=await page.locator("#originDetails").innerText();
  assert(fighterEvidence.includes("STR_MRSHAN_FIGHTER_EVENT_CATPATH_2"));
  assert(fighterEvidence.includes("STR_MRSHAN_FIGHTER_EVENT_CATPATH"));
  assert(fighterEvidence.includes("대체 출처 3"));
  assert(fighterEvidence.includes("서로 독립된 발생 조건·추첨"));
  await page.locator("#originDetailClose").click();
  await page.locator("#originSearch").fill("direct:STR_SOLDIER_PEASANT");
  assert.equal(await page.locator("#originTable tbody tr").count(),1);
  assert.equal((await page.locator("#originTable tbody tr").first().locator("td").nth(9).innerText()).trim(),"36");
  await page.locator("#originSearch").fill("transform:STR_CHORT_SUMMONING:from:STR_SOLDIER_PEASANT");
  assert.equal(await page.locator("#originTable tbody tr").count(),1);
  assert((await page.locator("#originTable tbody tr").first().innerText()).includes("이력 초기화"));
  assert.equal((await page.locator("#originTable tbody tr").first().locator("td").nth(9).innerText()).trim(),"—");
  await page.locator("#originTable .maxima-show").first().click();
  let chortOriginDetail=await page.locator("#originDetails").innerText();
  assert(chortOriginDetail.includes("reset: true"),
    "Chort reset detail not visible: "+chortOriginDetail.slice(0,1700));
  assert(chortOriginDetail.includes("최초 획득처에서 연결되는 병종변경 사슬"));
  await page.locator("#originDetails .origin-lineage-candidates summary").click();
  chortOriginDetail=await page.locator("#originDetails").innerText();
  assert(chortOriginDetail.includes("direct:STR_SOLDIER_PEASANT"));
  assert(chortOriginDetail.includes("동일 병종 훈련은 추가 목표 한 가지"));
  const directPeasantPath=page.locator("#originDetails .origin-lineage-candidates > ol > li")
    .filter({hasText:"direct:STR_SOLDIER_PEASANT"}).first();
  await directPeasantPath.locator("button[data-training-path-index]").click();
  const chortTraining=await directPeasantPath.locator("[data-training-panel-index]").innerText();
  assert(chortTraining.includes("STR_NEPOTISM"));
  assert(chortTraining.includes("STR_PERSONAL_ATTENTION"));
  assert(chortTraining.includes("STR_BRIDES_TO_THE_QUEEN"));
  assert(chortTraining.includes("STR_HAREM_COLLAR"));
  assert(chortTraining.includes("CULT"));
  assert(chortTraining.includes("요구 계급 3"));
  assert(chortTraining.includes("시술 자금 3,000,000"));
  assert(chortTraining.includes("연구·재료·훈장·계급·능력치·시간순 미검증"));
  await directPeasantPath.locator("button[data-stage-path-index]").click();
  const chortCaps=directPeasantPath.locator("[data-stage-panel-index]");
  assert.equal(await chortCaps.locator(".origin-stage-cap-projection").count(),2);
  assert.equal(await chortCaps.locator(".origin-stage-cap-projection").nth(1).locator("details").count(),5);
  assert((await chortCaps.innerText()).includes("최종 능력치 미산출"));
  assert((await chortCaps.textContent()).includes("STR_BRIDES_TO_THE_QUEEN"));
  assert((await chortCaps.textContent()).includes("원시 전투 성장 하드캡"));
  await page.locator("#originDetailClose").click();
  await page.locator("#originSearch").fill("transform:STR_SHADE_EMBODIMENT:from:STR_SOLDIER_SPECTRE");
  assert.equal(await page.locator("#originTable tbody tr").count(),1);
  assert((await page.locator("#originTable tbody tr").first().innerText())
    .includes("출생처 추적 후보 68건(미실행)"));
  await page.locator("#originTable .maxima-show").first().click();
  await page.locator("#originDetails .origin-lineage-candidates summary").click();
  const shadeAncestry=await page.locator("#originDetails").innerText();
  assert(shadeAncestry.includes("direct:STR_SOLDIER_PEASANT"));
  assert(shadeAncestry.includes("STR_SPECTRE_SUMMONING"));
  assert(shadeAncestry.includes("사망 후 후속 변신"));
  await page.locator("#originDetailClose").click();
  await page.locator("#originSearch").fill("transform:STR_SPECTRE_SUMMONING:from:STR_SOLDIER_SPECTRE");
  assert.equal(await page.locator("#originTable tbody tr").count(),1);
  await page.locator("#originTable .maxima-show").first().click();
  const zeroAncestry=await page.locator("#originDetails").innerText();
  assert(zeroAncestry.includes("0개 구조 후보"));
  assert(zeroAncestry.includes("획득 불가능하다는 뜻이 아닙니다"));
  assert(zeroAncestry.includes("출발 개인을 찾지 못해 조건부 수치조차 산출하지 않음"));
  assert.equal(await page.locator('#originDetails [data-gate-status="UNPROVEN"]').count(),8);
  await page.locator("#originDetailClose").click();
  await page.locator("#originMetric").selectOption("verified");
  assert.equal((await page.locator("#originTable tbody tr").first().locator("td").nth(3).innerText()).trim(),"—");
  await page.locator("#originMetric").selectOption("max");
  await page.locator("#originSearch").fill("");
  await page.locator("#originType").selectOption("STR_SOLDIER_PEASANT");
  assert(await page.locator("#originTable tbody tr").count()>1);
  await page.locator("#originType").selectOption("");
  assert.equal(await page.locator("#originTable tbody tr").count(),112);
  await page.locator("#originSearch").fill("root:STR_THEBAN_ASSAULT_CLONE");
  assert.equal(await page.locator("#originTable tbody tr").count(),6);
  const clonedSourceFollowups=await page.locator("#originTable").innerText();
  assert(clonedSourceFollowups.includes("STR_SHADE_EMBODIMENT"));
  assert(clonedSourceFollowups.includes("STR_SPECTRE_SUMMONING"));
  assert(clonedSourceFollowups.includes("STR_CHORT_SUMMONING"));
  assert((await page.locator("#originStatus").innerText()).includes("최초 획득처 1개"));
  await page.locator("#originSearch").fill("");
  assert.equal(await page.locator("#originTable tbody tr").count(),112);
  await page.locator("#originSourceType").selectOption("direct");
  assert.equal(await page.locator("#originTable tbody tr").count(),15);
  await page.locator("#originSourceType").selectOption("manufacture");
  assert.equal(await page.locator("#originTable tbody tr").count(),48);
  await page.locator("#originSourceType").selectOption("event");
  assert.equal(await page.locator("#originTable tbody tr").count(),9);
  await page.locator("#originSourceType").selectOption("typeChange");
  assert.equal(await page.locator("#originTable tbody tr").count(),40);
  await page.locator("#originSourceType").selectOption("");
  await page.locator("#originFocus").selectOption("history");
  assert.equal(await page.locator("#originTable tbody tr").count(),15);
  await page.locator("#originFocus").selectOption("event");
  assert.equal(await page.locator("#originTable tbody tr").count(),9);
  await page.locator("#originFocus").selectOption("ancestry");
  assert.equal(await page.locator("#originTable tbody tr").count(),39);
  await page.locator("#originFocus").selectOption("unlinked");
  assert.equal(await page.locator("#originTable tbody tr").count(),1);
  await page.locator("#originFocus").selectOption("reset");
  assert.equal(await page.locator("#originTable tbody tr").count(),32);
  await page.locator("#originFocus").selectOption("");
  assert.equal(await page.locator("#originTable tbody tr").count(),112);
  console.log("PASS 112 acquisition routes: 72 independent birth profiles, 40 body-change branches, reset history, 11 stats, 401 source-anchored type-change candidates, no invented final maximum");
  assert.equal(await page.locator("#legacyMaximaArchive").getAttribute("open"),null,
    "historical body-only scores must not be shown by default");
  await page.locator("#legacyMaximaArchive > summary").click();
  assert.equal(await page.locator("#maximaStatMode").inputValue(),"bonus",
    "historical cap-plus-bonus arithmetic cannot be the default view");
  await page.waitForFunction(()=>document.querySelectorAll("#maximaTable tbody tr").length===29,
    {timeout:30000});
  assert.equal(await page.locator("#maximaTable thead th").count(),14);
  assert((await page.locator("#maximaTable tbody tr").first().innerText()).includes("+411"),
    "Damsel maxima must be shown, not old illegal +445");
  const auditText=await page.locator("#maximaAudit").innerText();
  assert(auditText.includes("441"));
  assert(auditText.includes("능력치 게이트 미달 4종"));
  assert(auditText.includes("이벤트 출생 예외 1종"));
  assert(auditText.includes("병종 유형 변환 필수 5종"));
  assert(auditText.includes("이력 초기화 3종"));
  assert(auditText.includes("입증 0/29"));
  assert(auditText.includes("예전 최적화기 추가 진단 24종"));
  assert((await page.locator("#researchMaxima h2").innerText()).includes("정적 점수"));
  await page.locator("#maximaSearch").fill("STR_SOLDIER_HERO");
  assert.equal(await page.locator("#maximaTable tbody tr").count(),1);
  assert((await page.locator("#maximaTable tbody tr").first().innerText()).includes("+282"));
  await page.locator("#maximaSearch").fill("STR_SOLDIER_PEASANT");
  assert.equal(await page.locator("#maximaTable tbody tr").count(),1);
  assert((await page.locator("#maximaTable tbody tr").first().innerText()).includes("+261"));
  await page.locator("#maximaSearch").fill("STR_SOLDIER_SYNTH");
  assert((await page.locator("#maximaTable tbody tr").first().innerText()).includes("다수 훈장 등 보정 필요"));
  await page.locator("#maximaTable .maxima-show").first().click();
  const synthEvidence=await page.locator("#maximaDetails").innerText();
  assert(synthEvidence.includes("추가 능력치 상승 수단 필요"));
  assert(synthEvidence.includes("사이오닉 강도 최소 45"));
  assert(synthEvidence.includes("상한 1"));
  assert(synthEvidence.includes("44"));
  assert(synthEvidence.includes("최소 11종"));
  assert(synthEvidence.includes("합은 +52"));
  await page.locator("#maximaDetailClose").click();
  await page.locator("#maximaSearch").fill("STR_SOLDIER_BLOODOGE");
  await page.locator("#maximaTable .maxima-show").first().click();
  const houndEvidence=await page.locator("#maximaDetails").innerText();
  assert(houndEvidence.includes("이벤트 출생 예외"));
  assert(houndEvidence.includes("STR_CODEX_BONUS_G5"));
  assert(houndEvidence.includes("STR_GODS_E5"));
  assert(houndEvidence.includes("STR_CAPTAIN_SAINT"));
  assert(houndEvidence.includes("STR_HERO_RED_TRAINING"));
  assert(houndEvidence.includes("STR_CAPTAINS_11"));
  assert(houndEvidence.includes("보너스 합계 +131"));
  await page.locator("#maximaDetailClose").click();
  await page.locator("#maximaSearch").fill("STR_SOLDIER_CHORT");
  assert((await page.locator("#maximaTable tbody tr").first().innerText())
    .includes("병종 유형 변환 선행 필요"));
  await page.locator("#maximaTable .maxima-show").first().click();
  const chortEvidence=await page.locator("#maximaDetails").innerText();
  assert(chortEvidence.includes("원본 획득 프로필이 없는 병종"));
  assert(chortEvidence.includes("STR_CHORT_SUMMONING"));
  assert(chortEvidence.includes("reset: true"));
  assert(chortEvidence.includes("STR_UNAVAILABLE"));
  await page.locator("#maximaDetailClose").click();
  await page.locator("#maximaSearch").fill("STR_SOLDIER_NEKOMIMI");
  await page.locator("#maximaTable .maxima-show").first().click();
  const nekoEvidence=await page.locator("#maximaDetails").innerText();
  assert(nekoEvidence.includes("STR_MEDAL_SERVICE_TIME_NAME"));
  assert(nekoEvidence.includes("totalMonthlyService"));
  assert(nekoEvidence.includes("≥ 6"));
  await page.locator("#maximaDetailClose").click();
  await page.locator("#maximaSearch").fill("");
  await page.locator("#maximaStatMode").selectOption("bonus");
  assert.equal((await page.locator("#maximaTable tbody tr").first()
    .locator("td").nth(3).innerText()).trim(),"+48");
  await page.locator("#maximaStatMode").selectOption("capPlusBonus");
  assert.equal((await page.locator("#maximaTable tbody tr").first()
    .locator("td").nth(3).innerText()).trim(),"128");
  await page.locator("#maximaTable .maxima-show").first().click();
  const maximaDetail=await page.locator("#maximaDetails").innerText();
  assert(maximaDetail.includes("STR_PARIAH_TRAINING"));
  assert(maximaDetail.includes("연구 선행·이벤트 출처 감사"));
  assert(maximaDetail.includes("STR_CAPTAIN_THIEF"));
  assert(maximaDetail.includes("STR_QUEEN_SAVAGE"));
  assert(maximaDetail.includes("STR_CAPTAINS_11"));
  assert(maximaDetail.includes("전체 경로 인증: 0회"));
  assert(maximaDetail.includes("이력 제약 통과 순서"));
  assert(maximaDetail.includes("연구 완료 시점"));
  await page.locator("#maximaDetailClose").click();
  await page.locator("#researchExclusionAudit summary").click();
  assert.equal(await page.locator("#researchExclusionTable tbody tr").count(),441);
  await page.locator("#researchExclusionKind").selectOption("reciprocal");
  assert.equal(await page.locator("#researchExclusionTable tbody tr").count(),268);
  await page.locator("#researchExclusionKind").selectOption("oneway");
  assert.equal(await page.locator("#researchExclusionTable tbody tr").count(),172);
  await page.locator("#researchExclusionKind").selectOption("self");
  assert.equal(await page.locator("#researchExclusionTable tbody tr").count(),1);
  await page.locator("#researchExclusionKind").selectOption("all");
  await page.locator("#researchExclusionSearch").fill("STR_CODEX_RED");
  assert(await page.locator("#researchExclusionTable tbody tr").count()>2);
  await page.locator("#researchExclusionTable .research-audit-pair").first().click();
  assert((await page.locator("#researchExclusionDetail").innerText()).includes("원본 근거"));
  await page.locator("#researchAuditClose").click();
  await page.locator("#researchExclusionSearch").fill("");
  await page.locator("#researchExclusionAudit summary").click();
  console.log("PASS 29-class audited maximum stat table + 441 complete 2.1 direct research disables with proof/filter controls");
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
  assert((await page.locator("#saveStatus").innerText()).includes("진행 중 연구 미확인"),
    "a missing base research-project list must not be certified as empty");
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
  assert(wizardReport.includes("비용 0 연구 연쇄 처리 시뮬레이션"));
  assert(wizardReport.includes("모두 미증명 후보"));
  console.log("PASS saved-game zero-cost auto-research gating and conditional OXCE queue simulation");
  console.log("PASS automatic future route UI respects imported save, internal-only blocker and never uploads the save");

  const invalid=fs.readFileSync("tools/fixtures/modern-2.1-test.sav","utf8").replace("v.o2","v.o1.1.1");
  await page.locator("#modernSaveFile").setInputFiles({
    name:"wrong-version.sav",mimeType:"text/plain",buffer:Buffer.from(invalid)
  });
  await page.waitForFunction(()=>document.querySelector("#saveStatus")?.textContent?.includes("세이브 판독 실패"));
  assert((await page.locator("#futureCompareResearch").innerText()).includes("세이브를 불러오면"),
    "invalid save must clear campaign-specific research decisions");
  console.log("PASS reject save from wrong X-Piratez rules version and clear private campaign evidence");

  // Negative deployment tests: no old 29-body scores, no numeric source
  // table, and no local fallback whenever the current 2.1 ledger is corrupt.
  const corruptOrigin=await browser.newPage({viewport:{width:1200,height:800}});
  await corruptOrigin.route("**/data/soldier-acquisition-progression-20261102.json*",async route=>{
    const original=await route.fetch();
    const json=await original.json();
    json.rows.find(x=>x.id==="manufacture:STR_THEBAN_ASSAULT_CLONE")
      .birthStatCapSnapshot.rawGrowthCaps.health=999;
    await route.fulfill({response:original,body:JSON.stringify(json),
      contentType:"application/json"});
  });
  await corruptOrigin.goto(origin+"/soldiers/modern/",{waitUntil:"domcontentloaded"});
  await corruptOrigin.waitForFunction(()=>document.querySelector("#originMaxima")?.dataset.validation==="rejected",
    {timeout:30000});
  await corruptOrigin.waitForFunction(()=>document.querySelector("#maximaStatus")
    ?.textContent?.includes("표시 중단"),{timeout:15000});
  assert.equal(await corruptOrigin.locator("#originTable tbody tr").count(),0);
  assert.equal(await corruptOrigin.locator("#maximaTable tbody tr").count(),0);
  assert((await corruptOrigin.locator("#originProofDashboard").innerText())
    .includes("모든 획득처 수치 표시 중단"));
  assert((await corruptOrigin.locator("#originStatus").innerText()).includes("검사 실패"));
  assert(await corruptOrigin.locator("#originMetric").isDisabled());
  await corruptOrigin.locator("#legacyMaximaArchive > summary").click();
  assert.equal(await corruptOrigin.locator("#maximaTable tbody tr").count(),0);
  assert(!(await corruptOrigin.locator("#maximaTable").innerText()).includes("+411"));
  await corruptOrigin.close();

  // Origin ledger valid, but second independently fetched archived source
  // diverges. The historical table must fail closed instead of publishing.
  const corruptArchive=await browser.newPage({viewport:{width:1200,height:800}});
  let archivalFetches=0;
  await corruptArchive.route("**/data/soldier-research-maxima-20261101.json*",async route=>{
    archivalFetches++;
    const response=await route.fetch();
    if(archivalFetches===1){await route.fulfill({response});return;}
    const json=await response.json();
    json.rows[0].bonus.tu=99999;
    await route.fulfill({response,body:JSON.stringify(json),contentType:"application/json"});
  });
  await corruptArchive.goto(origin+"/soldiers/modern/",{waitUntil:"domcontentloaded"});
  await corruptArchive.waitForFunction(()=>document.querySelector("#originMaxima")?.dataset.validation==="validated",
    {timeout:30000});
  await corruptArchive.waitForFunction(()=>document.querySelector("#researchMaxima")?.dataset.proofGate==="rejected",
    {timeout:30000});
  assert.equal(archivalFetches,2,
    "Archived report may load only AFTER successful source-ledger validation");
  assert.equal(await corruptArchive.locator("#originTable tbody tr").count(),112);
  assert.equal(await corruptArchive.locator("#maximaTable tbody tr").count(),0);
  assert((await corruptArchive.locator("#maximaStatus").textContent()).includes("모든 숫자 차단"));
  await corruptArchive.close();
  console.log("PASS strict fail-closed deployment: corrupt birth caps block source AND historical tables; "+
    "stale legacy maxima never leak through a validated origin ledger");

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
