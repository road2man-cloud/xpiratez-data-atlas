// End-to-end regression tests for lazy catalogs, fallback, cross-links and table interactions.
import assert from "node:assert/strict";
import http from "node:http";
import {readFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright-core";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../public");
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".css":"text/css; charset=utf-8",".gz":"application/octet-stream"};
const server=http.createServer(async(req,res)=>{
  try{
    const uri=new URL(req.url,"http://localhost");
    const location=decodeURIComponent(uri.pathname);
    const candidate=path.resolve(root,"."+location,location.endsWith("/")?"index.html":"");
    if(!candidate.startsWith(root+path.sep))throw Error("blocked path");
    const bytes=await readFile(candidate);
    res.writeHead(200,{"Content-Type":mime[path.extname(candidate)]||"application/octet-stream","Cache-Control":"no-store"});res.end(bytes);
  }catch{res.writeHead(404);res.end("not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base="http://127.0.0.1:"+server.address().port+"/";
const candidates=[process.env.EDGE_PATH,"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe","C:/Program Files/Google/Chrome/Application/chrome.exe","/usr/bin/google-chrome",chromium.executablePath()];
const binary=candidates.find(x=>x&&existsSync(x));
assert(binary,"browser not available");
const browser=await chromium.launch({headless:true,executablePath:binary,args:["--no-sandbox"]});
const outcomes=[];
async function scenario(name,fn,opts={}){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.setDefaultTimeout(18000);
  const pageErrors=[];page.on("pageerror",e=>pageErrors.push(e.message));
  try{
    if(opts.noGzip)await page.addInitScript(()=>{Object.defineProperty(window,"DecompressionStream",{value:undefined,configurable:true})});
    if(opts.corruptGzip)await page.route(/\.json\.gz(?:\?|$)/,route=>route.fulfill({status:200,contentType:"application/octet-stream",body:"not gzip"}));
    await fn(page);
    assert.deepEqual(pageErrors,[],"uncaught JS errors");
    outcomes.push({name,ok:true});console.log("PASS functional "+name);
  }catch(e){outcomes.push({name,ok:false,error:String(e).slice(0,1100)});console.log("FAIL functional "+name+" "+String(e).slice(0,1100));}
  finally{await context.close();}
}
const visibleRows=async(page,selector)=>{await page.locator(selector).first().waitFor({state:"attached"});return page.locator(selector).count();};
async function catalogInteractions(page,slug){
  await page.goto(base+slug+"/",{waitUntil:"domcontentloaded"});
  assert.equal(await visibleRows(page,"#tbody tr"),100);
  assert.equal(await page.locator("#tbody tr").count(),100,"bounded list");
  const first=await page.locator("#tbody tr").first().getAttribute("data-id");
  const countText=await page.locator("#statusText").innerText();
  assert.match(countText,/4,007|4,612/);
  await page.locator('#pager button[data-page="2"]').click();
  const second=await page.locator("#tbody tr").first().getAttribute("data-id");
  assert.notEqual(second,first,"pagination changes rows");
  await page.locator('#pager button[data-page="1"]').click();
  const check=page.locator('#tbody tr').first().locator('input[data-select]');
  await check.check();await page.locator("#tbody tr").nth(1).locator("input[data-select]").check();
  assert.equal(await page.locator("#compareCount").innerText(),"2");
  await page.locator("#compare").click();
  await page.locator("#compareDialog[open]").waitFor({state:"visible",timeout:30000});
  assert((await page.locator("#compareBody").innerText()).length>100);
  await page.locator("#closeCompare").click();
  await page.locator("#tbody tr").first().locator("td").nth(1).click();
  await page.locator("#drawer.open").waitFor();
  await page.waitForFunction(()=>document.querySelector("#detail")?.innerText.length>150);
  assert((await page.locator("#detail").innerText()).length>150);
  await page.locator("#closeDrawer").click();
  assert.equal(await page.locator("#drawer.open").count(),0);
  await page.locator("#search").fill("unlikely_no_match_search__regression");
  await page.waitForFunction(()=>document.querySelectorAll("#tbody tr").length===0);
  await page.locator("#search").fill("");
  await visibleRows(page,"#tbody tr");
  return first;
}
await scenario("items list/sort/pager/compare/drawer/search",p=>catalogInteractions(p,"items"));
await scenario("research list/sort/pager/compare/drawer/search",p=>catalogInteractions(p,"research"));
await scenario("research alternative/nested/self/cycle count",async page=>{
  await page.goto(base+"research/");await visibleRows(page,"#tbody tr");
  for(const [filter,expected] of [["alternative",42],["nested",8],["self-source",3],["cycle",95]]){
    await page.locator('[data-filter="branch"]').selectOption(filter);
    assert.equal(await page.locator("#tbody tr").count(),expected,filter);
  }
});
await scenario("items research cross-reference opens correct detail",async page=>{
  await page.goto(base+"items/");await visibleRows(page,"#tbody tr");
  // Open an item known to reference research, then follow a cross-catalog chip.
  await page.goto(base+"items/#item=STR_BUCKSHOT_HV");
  await page.locator("#drawer.open").waitFor();
  await page.waitForFunction(()=>document.querySelector("#detail")?.innerText.includes("STR_BUCKSHOT_HV"));
  const cross=page.locator('#detail [data-kind="research"]').first();
  assert(await cross.count(),"item detail must link related research");
  const id=await cross.getAttribute("data-open");
  await cross.click();
  await page.waitForFunction(id=>decodeURIComponent(location.hash)==="#research="+id,id);
  await page.waitForFunction(id=>document.querySelector("#detail")?.innerText.includes(id),id);
  assert.equal(decodeURIComponent(new URL(page.url()).hash),"#research="+id);
});
for(const slug of ["items","research","armors","weapons","soldiers","trainings","crafts","manufacture"]){
  await scenario(slug+" no DecompressionStream fallback",async page=>{
    await page.goto(base+slug+"/",{waitUntil:"domcontentloaded"});
    const selector={items:"#tbody tr",research:"#tbody tr",armors:"#armorTable tbody tr",weapons:"#weaponTable tbody tr",soldiers:"#soldierTable tbody tr",trainings:"#trainingTable tbody tr",crafts:"#craftTable tbody tr",manufacture:"#manufactureTable tbody tr"}[slug];
    assert((await visibleRows(page,selector))>0,"page must load on old browsers");
  },{noGzip:true});
}
for(const slug of ["items","research","armors","weapons","soldiers","trainings","crafts","manufacture"]){
  await scenario(slug+" corrupted gzip fallback",async page=>{
    await page.goto(base+slug+"/",{waitUntil:"domcontentloaded"});
    const selector={items:"#tbody tr",research:"#tbody tr",armors:"#armorTable tbody tr",weapons:"#weaponTable tbody tr",soldiers:"#soldierTable tbody tr",trainings:"#trainingTable tbody tr",crafts:"#craftTable tbody tr",manufacture:"#manufactureTable tbody tr"}[slug];
    assert((await visibleRows(page,selector))>0,"decompression error must recover via canonical JSON");
  },{corruptGzip:true});
}
await scenario("weapons section switch, distance, opponent, sort, detail",async page=>{
  await page.goto(base+"weapons/");assert.equal(await visibleRows(page,"#weaponTable tbody tr"),100);
  await page.locator('#weaponPager button[data-page="1"]').first().click();
  const page1=await page.locator("#weaponTable tbody tr").first().getAttribute("data-id");
  await page.locator('#weaponPager button[data-page="0"]').first().click();
  assert.notEqual(await page.locator("#weaponTable tbody tr").first().getAttribute("data-id"),page1);
  assert.equal(await page.locator(".toolbar").evaluate(el=>getComputedStyle(el).position),"static","mobile weapon toolbar must not cover table");
  await page.locator("#distance").fill("5");
  const before=await page.locator("#weaponTable tbody tr").first().innerText();
  await page.locator("#distance").fill("250");
  await page.waitForTimeout(200);
  const after=await page.locator("#weaponTable tbody tr").first().innerText();
  assert.notEqual(before,after,"distance must recalculate weapon rows");
  await page.locator("#section").selectOption("melee");
  assert((await visibleRows(page,"#weaponTable tbody tr"))>0);
  await page.locator("#section").selectOption("throwing");
  assert((await visibleRows(page,"#weaponTable tbody tr"))>0);
  await page.locator("#weaponTable tbody tr").first().click();
  await page.locator("#detailDialog[open]").waitFor();
  const d=await page.locator("#detailBody").innerText();
  assert(d.includes("장비·손 사용")&&d.includes("룰셋 유효 정의 전체"));
});
await scenario("armors sort/filter/pager/raw detail",async page=>{
  await page.goto(base+"armors/");assert.equal(await visibleRows(page,"#armorTable tbody tr"),100);
  const first=await page.locator("#armorTable tbody tr").first().getAttribute("data-id");
  await page.locator("#armorPager button[data-page='1']").first().click();
  assert.notEqual(first,await page.locator("#armorTable tbody tr").first().getAttribute("data-id"));
  await page.locator("#armorPager button[data-page='0']").first().click();
  assert.equal(await page.locator(".toolbar").evaluate(el=>getComputedStyle(el).position),"static","mobile toolbar must not cover table");
  await page.locator(".table-shell").evaluate(el=>{const target=el.querySelector('th[data-sort="frontArmor"]');const sticky=el.querySelector('th[data-sort="name"]').getBoundingClientRect().width;el.scrollLeft=Math.max(0,target.offsetLeft-sticky-60)});
  await page.locator('#armorTable th[data-sort="frontArmor"]').click();
  await page.locator("#equipableOnly").check();
  assert((await visibleRows(page,"#armorTable tbody tr"))>0);
  await page.locator("#armorTable tbody tr").first().click();
  await page.locator("#detailDialog[open]").waitFor();
  await page.locator("#loadRawRule").evaluate(el=>{el.closest("details").open=true});
  await page.locator('#loadRawRule').click();
  await page.waitForFunction(()=>document.querySelector("#rawRuleBody")?.innerText.includes("{"));
  assert((await page.locator("#rawRuleBody").innerText()).length>50);
});

await scenario("items delayed detail must not overwrite newer selection",async page=>{
  const rows=JSON.parse(await readFile(path.join(root,"items/data/items-index.json"),"utf8")).index;
  const byId=new Map(rows.map(r=>[r.id,r]));
  await page.goto(base+"items/");await visibleRows(page,"#tbody tr");
  const ids=await page.locator("#tbody tr").evaluateAll(elements=>elements.map(e=>e.dataset.id));
  const first=ids[0],second=ids.find(id=>byId.get(id)?.bucket!==byId.get(first)?.bucket);
  assert(second,"need two distinct chunks");
  const delayed=String(byId.get(first).bucket);
  await page.route("**/items/data/chunks/"+delayed+".json",async route=>{
    await new Promise(resolve=>setTimeout(resolve,850));
    await route.continue();
  });
  await page.locator('#tbody tr[data-id="'+first+'"] td').nth(1).click();
  await page.locator('#tbody tr[data-id="'+second+'"] td').nth(1).click();
  await page.waitForFunction(id=>location.hash==="#item="+encodeURIComponent(id),second);
  await page.waitForTimeout(1100);
  assert.equal(decodeURIComponent(new URL(page.url()).hash),"#item="+second,"older response replaced current detail");
  assert((await page.locator("#detail").innerText()).includes(second));
});

await scenario("weapons delayed detail must not replace newer choice",async page=>{
  const catalog=JSON.parse(await readFile(path.join(root,"data/weapons-index.json"),"utf8"));
  await page.goto(base+"weapons/");await visibleRows(page,"#weaponTable tbody tr");
  const display=await page.locator("#weaponTable tbody tr").evaluateAll(elements=>elements.map((el,i)=>({i,itemId:el.querySelector("td .id")?.textContent?.trim(),name:el.querySelector("td .name")?.textContent?.trim()})));
  const first=display.find(x=>catalog.detailIndex[x.itemId]);
  const second=display.find(x=>x.itemId!==first.itemId&&catalog.detailIndex[x.itemId]!==catalog.detailIndex[first.itemId]&&catalog.detailIndex[x.itemId]);
  assert(first&&second,"Need two different detail buckets");
  const delayed=catalog.detailIndex[first.itemId];
  await page.route("**/data/"+delayed+"*",async route=>{await new Promise(resolve=>setTimeout(resolve,850));await route.continue();});
  await page.locator("#weaponTable tbody tr").nth(first.i).click();
  await page.locator("#weaponTable tbody tr").nth(second.i).click();
  await page.locator("#detailDialog[open]").waitFor();
  await page.waitForFunction(name=>document.querySelector("#detailBody > h2")?.textContent===name,second.name);
  await page.waitForTimeout(1000);
  assert.equal(await page.locator("#detailBody > h2").innerText(),second.name,"Late weapon detail overwrote newer selection");
});
await scenario("armors closed and replaced dialog ignores late load",async page=>{
  await page.goto(base+"armors/");await visibleRows(page,"#armorTable tbody tr");
  const ids=await page.locator("#armorTable tbody tr").evaluateAll(elements=>elements.map((el,i)=>({i,id:el.dataset.id,bucket:el.dataset.bucket,name:el.querySelector(".name")?.textContent?.trim()})));
  const first=ids[0],second=ids.find(x=>x.bucket!==first.bucket&&x.name!==first.name);
  assert(first&&second,"Need two armor buckets");
  await page.route("**/data/armor-chunks/"+first.bucket+".json",async route=>{await new Promise(resolve=>setTimeout(resolve,850));await route.continue();});
  await page.locator("#armorTable tbody tr").nth(first.i).click();
  await page.locator("#detailDialog[open]").waitFor();
  await page.locator("#closeDialog").click();
  await page.locator("#armorTable tbody tr").nth(second.i).click();
  await page.waitForFunction(name=>document.querySelector("#detailBody h2")?.textContent===name,second.name);
  await page.waitForTimeout(1100);
  assert.equal(await page.locator("#detailBody h2").innerText(),second.name,"Late armor detail overwrote newer selection");
});
// Additional multi-step and failure-recovery paths. Keep canonical data untouched.
const loadedSelector={
  items:"#tbody tr",research:"#tbody tr",armors:"#armorTable tbody tr",
  weapons:"#weaponTable tbody tr",soldiers:"#soldierTable tbody tr",
  trainings:"#trainingTable tbody tr",crafts:"#craftTable tbody tr",
  manufacture:"#manufactureTable tbody tr"
};
for(const slug of Object.keys(loadedSelector)){
  await scenario(slug+" missing gzip HTTP 404 fallback",async page=>{
    await page.route(/\.json\.gz(?:\?|$)/,route=>route.fulfill({status:404,body:"not found"}));
    await page.goto(base+slug+"/",{waitUntil:"domcontentloaded"});
    assert((await visibleRows(page,loadedSelector[slug]))>0,"HTTP 404 gzip must fall back to JSON");
  });
}
await scenario("transient network failure permits same-page runtime retry",async page=>{
  await page.goto(base+"items/");await visibleRows(page,"#tbody tr");
  await page.route("**/data/soldiers-runtime.json.gz",route=>route.fulfill({status:404,body:"missing"}));
  let rawRequests=0;
  await page.route("**/data/soldiers-index.json",route=>{
    if(++rawRequests===1)return route.abort("failed");
    return route.continue();
  });
  const rejected=await page.evaluate(async()=>{
    const mod=await import("../db-runtime.js");
    try{await mod.loadRuntime("../data/soldiers-runtime.json");return false;}catch{return true;}
  });
  assert(rejected,"first request should fail");
  const recovered=await page.evaluate(async()=>{
    const mod=await import("../db-runtime.js");
    const value=await mod.loadRuntime("../data/soldiers-runtime.json");
    return value&&Object.keys(value).length>0;
  });
  assert(recovered,"rejected promise must not poison subsequent fetches");
  assert.equal(rawRequests,2,"canonical JSON was not retried");
});
await scenario("items combined search/sort/filter/page/detail/reset",async page=>{
  await page.goto(base+"items/");assert.equal(await visibleRows(page,"#tbody tr"),100);
  await page.locator("#search").fill("STR_");
  await page.waitForFunction(()=>document.querySelector("#statusText")?.textContent?.includes("결과"));
  await page.locator("#sort").selectOption("costSell");
  await page.locator("#direction").click();
  await page.locator('[data-filter="kind"]').selectOption("weapon");
  if(!(await page.locator('#pager button[data-page="2"]').count()))
    await page.locator('[data-filter="kind"]').selectOption("item");
  const secondPage=page.locator('#pager button[data-page="2"]');
  assert(await secondPage.count(),"combined filter must have multiple pages");
  const firstId=await page.locator("#tbody tr").first().getAttribute("data-id");
  await secondPage.click();
  const secondId=await page.locator("#tbody tr").first().getAttribute("data-id");
  assert.notEqual(secondId,firstId,"filtered pagination must change rows");
  await page.locator("#tbody tr").first().locator("td").nth(1).click();
  await page.locator("#drawer.open").waitFor();
  await page.waitForFunction(id=>document.querySelector("#detail")?.innerText.includes(id),secondId);
  await page.locator("#closeDrawer").click();
  await page.locator("#search").fill("");
  await page.locator('[data-filter="kind"]').selectOption("");
  await page.locator("#sort").selectOption("koName");
  assert.equal(await page.locator("#tbody tr").count(),100);
  assert.match(await page.locator("#statusText").innerText(),/4,007/);
});
for(const slug of ["armors","weapons"]){
  await scenario(slug+" portrait-landscape table and dialog controls",async page=>{
    await page.goto(base+slug+"/");await visibleRows(page,loadedSelector[slug]);
    for(const [width,height] of [[390,844],[844,390]]){
      await page.setViewportSize({width,height});
      assert.equal(await page.locator(".toolbar").evaluate(el=>getComputedStyle(el).position),"static");
      const scroll=await page.locator(".table-shell").evaluate(el=>{el.scrollLeft=600;return el.scrollLeft;});
      assert(scroll>0,"horizontal table scrolling must remain available");
      await page.locator(loadedSelector[slug]).first().click();
      await page.locator("#detailDialog[open]").waitFor();
      await page.locator("#closeDialog").click();
      assert.equal(await page.locator("#detailDialog[open]").count(),0);
    }
  });
}
await scenario("item/research direct hash and browser back navigation",async page=>{
  await page.goto(base+"items/#item=STR_BUCKSHOT_HV");
  await page.waitForFunction(()=>document.querySelector("#detail")?.innerText.includes("STR_BUCKSHOT_HV"));
  await page.goto(base+"research/#research=STR_CUNNING");
  await page.waitForFunction(()=>document.querySelector("#detail")?.innerText.includes("STR_CUNNING"));
  await page.goBack({waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#detail")?.innerText.includes("STR_BUCKSHOT_HV"));
  assert.equal(decodeURIComponent(new URL(page.url()).hash),"#item=STR_BUCKSHOT_HV");
});
await scenario("enemy forces Sandcrawler vessel search, landing and crew",async page=>{
  await page.goto(base+"forces/",{waitUntil:"domcontentloaded"});
  await visibleRows(page,"#forceTable tbody tr");
  assert.equal(await page.locator("#forceTable tbody tr").count(),100,"mission-only default remains bounded");
  await page.locator("#search").fill("샌드크롤러");
  await page.waitForFunction(()=>document.querySelectorAll("#forceTable tbody tr").length===2);
  const vessel=page.locator('#forceTable tbody tr[data-kind="vessel"][data-id="STR_VESSEL_GHOUL_CRAWLER"]');
  const mission=page.locator('#forceTable tbody tr[data-kind="mission"][data-id="STR_MISSION_SANDCRAWLER"]');
  assert.equal(await vessel.count(),1,"Sandcrawler must have its own row");
  assert.equal(await mission.count(),1,"Marauding operation must link the Sandcrawler");
  assert((await mission.innerText()).includes("등장 기체: 샌드크롤러"));
  await vessel.click();
  await page.locator("#drawer.open").waitFor();
  await page.waitForFunction(()=>document.querySelector("#detail")?.innerText.includes("래트맨"));
  const detail=await page.locator("#detail").innerText();
  for(const word of ["샌드크롤러","기체 내구도","180","최대속도","40","구울","래트맨","유랑자","착륙 waypoint가 확인되지 않습니다"])assert(detail.includes(word),"Missing vessel info "+word);
  await page.locator("#detailDifficulty").selectOption("4");
  await page.waitForFunction(()=>document.querySelector("#detail")?.innerText.includes("14~23명"));
  await page.locator('a.force-link[href="#force=STR_MISSION_SANDCRAWLER"]').first().click();
  await page.waitForFunction(()=>document.querySelector("#detail")?.innerText.includes("STR_MISSION_SANDCRAWLER"));
  await page.locator("#closeDrawer").click();
  await page.locator("#search").fill("");
  await page.locator("#kind").selectOption("vessel");
  await page.waitForFunction(()=>document.querySelector("#rowCount")?.innerText==="213개");
  assert.equal(await page.locator("#forceTable tbody tr").count(),100,"vessel pagination bounded");
  assert.equal(await page.locator(".toolbar").evaluate(el=>getComputedStyle(el).position),"static","mobile toolbar must remain scrollable");
});
await browser.close();await new Promise(resolve=>server.close(resolve));
const failures=outcomes.filter(x=>!x.ok);
console.log("FUNCTIONAL AUDIT "+(outcomes.length-failures.length)+"/"+outcomes.length+" pass");
if(failures.length)process.exitCode=1;
