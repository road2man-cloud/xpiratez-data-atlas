import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import {chromium} from "playwright-core";
const publicRoot=path.resolve("public");
const server=http.createServer((req,res)=>{
  try {
    let p=path.resolve(publicRoot,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));
    if(fs.existsSync(p)&&fs.statSync(p).isDirectory())p=path.join(p,"index.html");
    if(!p.startsWith(publicRoot+path.sep)||!fs.existsSync(p))throw Error("404");
    const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".gz":"application/octet-stream"};
    res.writeHead(200,{"content-type":mime[path.extname(p)]||"application/octet-stream"});
    fs.createReadStream(p).pipe(res);
  }catch{res.writeHead(404).end("not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const browser=await chromium.launch({
  executablePath:["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe","C:/Program Files/Google/Chrome/Application/chrome.exe",chromium.executablePath()].find(fs.existsSync),
  headless:true,args:["--no-sandbox"]
});
try {
  const page=await browser.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:"+server.address().port+"/soldiers/modern/");
  await page.waitForFunction(()=>document.querySelector("#originMaxima")?.dataset.validation==="validated",{timeout:60000});
  const first=page.locator("#originTable tbody tr[data-origin-id]").first();
  const origin=await first.getAttribute("data-origin-id");
  const before=(await first.locator("td.score").innerText()).trim();
  await first.locator("[data-compare-origin]").click();
  assert.equal(await page.locator("#compareOrigin").inputValue(),origin);
  assert.match(await page.locator("#compareStatus").innerText(),/비교 기준/);
  assert.match(await page.locator('#originTable tr[data-reference="true"] td.score').innerText(),/기준 대비 0/);
  const second=page.locator("#originTable tbody tr[data-origin-id]").nth(1);
  const score=await second.locator("td.score").innerText();
  assert.match(score,/기준 대비/);
  assert.equal((await first.locator("td.score strong").innerText()).trim(),before);
  const deltas=await second.locator("td .route-delta").allTextContents();
  assert.equal(deltas.length,13);
  const parse=n=>Number(n.replaceAll(",","").replace("기준 대비","").trim());
  assert.equal(parse(deltas[0]),deltas.slice(1).reduce((sum,n)=>sum+parse(n),0));
  await page.locator("#catalogMetric").selectOption("birth");
  assert.match(await second.locator("td.score").innerText(),/기준 대비/);
  await page.locator("#catalogMetric").selectOption("certified");
  assert.equal((await second.locator("td.score").innerText()).trim(),"—");
  await page.locator("#catalogMetric").selectOption("growth");
  await second.locator("[data-open-origin]").click();
  await page.waitForFunction(()=>document.querySelector("#originDetails")?.textContent.includes("연구 경로 재생 완료"),{timeout:60000});
  assert.equal(await page.locator("#originDetails .route-compare-evidence").count(),1);
  const c=page.locator("#originDetails [data-compare-candidate]");
  await c.click();
  assert.equal(await page.locator("#compareOrigin").inputValue(),await second.getAttribute("data-origin-id"));
  await page.locator("#compareClear").click();
  assert.equal(await page.locator("#compareOrigin").inputValue(),"");
  assert.equal(await page.locator("#originTable .route-delta").count(),0);
  // A universal birthplace statistic must work for every original profile,
  // including those with no registered future research/transform completion.
  await page.locator("#catalogMetric").selectOption("birth-expected");
  assert.equal(await page.locator("#originTable tbody tr[data-origin-id]").count(),72);
  const bornFirst=page.locator("#originTable tbody tr[data-origin-id]").first();
  await bornFirst.locator("[data-compare-origin]").click();
  assert.match(await page.locator("#compareStatus").innerText(),/비교 기준/);
  assert.equal(await page.locator('#originTable tr[data-reference="true"] .birth-win-chance').count(),1);
  const otherBorn=page.locator("#originTable tbody tr[data-origin-id]").nth(1);
  assert.match(await otherBorn.locator("td.score").innerText(),/독립 추첨 우세/);
  await bornFirst.locator("[data-open-origin]").click();
  await page.waitForFunction(()=>document.querySelector("[data-birth-roll]")!==null,{timeout:60000});
  assert.equal(await page.locator(".birth-stat-table tbody tr").count(),12);
  const birthRoll=await page.locator("[data-birth-roll]").getAttribute("data-birth-roll");
  assert.equal(birthRoll,await bornFirst.getAttribute("data-origin-id"));
  const minBorn=Number(await page.locator("#birthThreshold").getAttribute("min"));
  const maxBorn=Number(await page.locator("#birthThreshold").getAttribute("max"));
  await page.locator("#birthThreshold").fill(String(minBorn));
  assert.match(await page.locator("#birthThresholdResult").innerText(),/100%/);
  await page.locator("#birthThreshold").fill(String(maxBorn+1));
  assert.match(await page.locator("#birthThresholdResult").innerText(),/0%/);
  await page.locator('[data-switch-metric="growth"]').click();
  await page.waitForFunction(()=>!document.querySelector("[data-birth-roll]")&&
    /연구 경로 재생 완료|완결 연구 경로 미확보/.test(document.querySelector("#originDetails")?.textContent||""),{timeout:60000});
  assert.equal(await page.locator("#catalogMetric").inputValue(),"growth");
  await page.locator("#compareClear").click();
  await page.locator('#catalogMetric').selectOption('route-expected');
  assert.equal(await page.locator('#originTable tbody tr[data-origin-id]').count(),72);
  assert.equal(await page.locator('#routeGrowthTimingWrap').isVisible(),true);
  const routeFirst=page.locator('#originTable tbody tr[data-origin-id]').first();
  assert.match(await routeFirst.locator('td.score').innerText(),/[0-9]/);
  await page.locator('#routeGrowthTiming').selectOption('before');
  await page.locator('#routeGrowthAttempts').fill('4');
  await page.locator('#routeGrowthAttempts').dispatchEvent('change');
  await page.locator('#routeGrowthSuccess').fill('50');
  await page.locator('#routeGrowthSuccess').dispatchEvent('change');
  assert.match(await page.locator('#catalogStatus').innerText(),/가상 전투 성장/);
  await page.locator('#originTable tbody tr[data-origin-id]').first().locator('[data-open-origin]').click();
  await page.waitForFunction(()=>document.querySelector('[data-route-roll]')!==null,{timeout:60000});
  assert.equal(await page.locator('[data-route-roll] .birth-stat-table tbody tr').count(),12);
  await page.locator('.route-placement-scan > summary').click();
  await page.locator('#placementAttempts').fill('3');
  await page.locator('#placementSuccess').fill('70');
  await page.locator('#placementObjective').selectOption('tu');
  await page.locator('#scanGrowthPlacements').click();
  assert.match(await page.locator('#growthPlacementResults').innerText(),/성장 위치|최유리 배치/);
  assert(await page.locator('#growthPlacementResults table tbody tr').count()>0);
  const routeMin=Number(await page.locator('#routeRollThreshold').getAttribute('min'));
  const routeMax=Number(await page.locator('#routeRollThreshold').getAttribute('max'));
  await page.locator('#routeRollThreshold').fill(String(routeMin));
  assert.match(await page.locator('#routeRollThresholdResult').innerText(),/100%/);
  await page.locator('#routeRollThreshold').fill(String(routeMax+1));
  assert.match(await page.locator('#routeRollThresholdResult').innerText(),/0%/);
  await page.locator('#routeGrowthTiming').selectOption('after');
  await page.waitForFunction(()=>document.querySelector('[data-route-roll]')!==null,{timeout:60000});
  await page.locator('.candidate-expectation-scan > summary').click();
  assert.match(await page.locator('.candidate-expectation-scan > summary').innerText(),/등록 성장 경로/);
  await page.locator('#candidateExpectationObjective').selectOption('firing');
  await page.locator('#candidateExpectationMinGate').selectOption('0');
  await page.locator('#scanCandidateExpectations').click();
  await page.waitForFunction(()=>document.querySelector('#candidateExpectationResults [data-candidate-ranking]')!==null,{
    timeout:90000
  });
  const rankedRows=page.locator('#candidateExpectationResults [data-candidate-ranking]');
  assert(await rankedRows.count()>0,'at least one ranked registered source path');
  assert.match(await page.locator('#candidateExpectationResults').innerText(),/능력치 요건 통과/);
  const columnBefore=await page.locator('#candidateExpectationResults .candidate-rank-table thead th').nth(2).innerText();
  await page.locator('#candidateExpectationObjective').selectOption('tu');
  const columnAfter=await page.locator('#candidateExpectationResults .candidate-rank-table thead th').nth(2).innerText();
  assert.notEqual(columnAfter,columnBefore,'changing objective must reorder without rescanning');
  await page.locator('#candidateExpectationMinGate').selectOption('0.9');
  assert.match(await page.locator('#candidateExpectationResults').innerText(),/조건 미충족/);
  await page.locator('#candidateExpectationMinGate').selectOption('0');
  const rankedId=await rankedRows.first().getAttribute('data-candidate-ranking');
  await rankedRows.first().locator('[data-candidate]').click();
  await page.waitForFunction(id=>document.querySelector('[data-route-roll]')?.getAttribute('data-route-roll')===id,rankedId,{
    timeout:60000
  });
  // Upstream v.o2 keeps Chort endgame terminal separate from the birthplace
  // ranking. The new expectation metric must preserve that separation too.
  if(await page.locator('#family option[value="origin:manufacture:STR_THEBAN_ASSAULT_CLONE"]').count()){
    await page.locator('#family').selectOption('origin:manufacture:STR_THEBAN_ASSAULT_CLONE');
    assert.equal(await page.locator('#originTable tbody tr[data-origin-id]').count(),1);
    await page.locator('#originTable [data-open-origin]').first().click();
    await page.waitForFunction(()=>document.querySelector('[data-route-roll]')!==null,{timeout:60000});
    assert.doesNotMatch(await page.locator('#originDetails > p').first().innerText(),/코르트/);
    await page.locator('#family').selectOption('');
  }
  assert.deepEqual(errors,[]);
  console.log("PASS generic route comparison: baseline, 12 stat deltas, metric switching, candidate, research evidence, reset");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
