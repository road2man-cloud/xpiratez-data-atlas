import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import {chromium} from "playwright-core";

const root=path.resolve("public");
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8"};
const server=http.createServer((req,res)=>{
  try {
    const url=new URL(req.url,"http://localhost");
    let file=path.resolve(root,"."+decodeURIComponent(url.pathname));
    if(fs.statSync(file).isDirectory())file=path.join(file,"index.html");
    if(!file.startsWith(root+path.sep))throw new Error("outside root");
    res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream"});
    fs.createReadStream(file).pipe(res);
  } catch {res.writeHead(404).end("not found");}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const base="http://127.0.0.1:"+server.address().port;
const chrome=[
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium","/usr/bin/google-chrome",chromium.executablePath()
].find(p=>p&&fs.existsSync(p));
if(!chrome)throw Error("Chromium required for reference browser QA");
let browser;
try {
  browser=await chromium.launch({executablePath:chrome,headless:true,args:["--no-sandbox","--disable-gpu"]});
  const page=await browser.newPage({viewport:{width:1260,height:900}});
  const errors=[];
  page.on("pageerror",e=>errors.push("pageerror: "+e.message));
  page.on("response",r=>{if(r.status()>=400)errors.push("HTTP "+r.status()+" "+r.url())});
  await page.goto(base+"/reference/?species=STR_SOLDIER_LOKNAR#unit-voxels",
    {waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#voxel-body-status")?.textContent?.includes("/ 29개"),{timeout:20000});
  await page.waitForFunction(()=>document.querySelector("#voxel-large-status")?.textContent?.includes("/ 46종"),
    {timeout:20000});
  assert.equal(await page.locator("#voxel-large-rows tr").count(),46,"all 46 unique 2x2 armors");
  await page.locator("#voxel-large-search").fill("하이에나");
  assert.equal(await page.locator("#voxel-large-rows tr").count(),1,"Hyena 2x2 mount lookup");
  const hyena=await page.locator("#voxel-large-rows tr").first().innerText();
  assert(hyena.includes("22")&&hyena.includes("18")&&hyena.includes("불가능"),
    "Hyena rider inherits Gal 22-voxel height, shot Z 18, no kneeling");
  assert(hyena.includes("32×32")&&hyena.includes("780/1024")&&hyena.includes("76.17%"),
    "Hyena exact four-tile collision footprint");
  assert(hyena.includes("92, 89, 90, 91"),"Hyena four collision mask IDs");
  for(const [query,expected] of [["노움디스크",3],["메카",5],["장갑차",13],["XEC",9]]){
    await page.locator("#voxel-large-search").fill(query);
    assert.equal(await page.locator("#voxel-large-rows tr").count(),expected,
      "all 2x2 armors in group "+query);
  }
  await page.locator("#voxel-large-search").fill("");
  assert.equal(await page.locator("#voxel-large-rows tr").count(),46);
  assert.equal(await page.locator("#voxel-body-rows tr").count(),1,"species deep link");
  assert.deepEqual((await page.locator("#voxel-body-rows tr td").allTextContents())
    .slice(1,7).map(x=>x.trim()),["17","11","17","11","13","7"],"Loknar 17/11, standing shot 13, kneeling shot 7");
  await page.locator("#voxel-species").selectOption("");
  assert.equal(await page.locator("#voxel-body-rows tr").count(),29,"all body rows");
  await page.locator("#voxel-search").fill("블러드하운드");
  assert((await page.locator("#voxel-body-rows tr").count())>=2,
    "Bloodhound search includes the Loknar mount and Bloodhound soldier");
  assert.equal(await page.locator("#voxel-body-STR_SOLDIER_LOKNAR").count(),1,
    "Bloodhound-mount search links to Loknar body");
  const mountRow=page.locator("#voxel-armor-STR_LOKNAR_PLATE_MAIL_RIDER_UC-STR_SOLDIER_LOKNAR");
  assert.equal(await mountRow.count(),1,
    "Bloodhound-mount appears even with difference-only filter checked");
  assert.deepEqual((await mountRow.locator("td").allTextContents()).slice(2,7).map(x=>x.trim()),
    ["17","11","0","13","7"],"mounted Loknar keeps standing/kneeling heights and shot origins");
  const maskText=(await mountRow.locator("td").nth(8).textContent())||"";
  assert(maskText.includes("4 (9×9, 61복셀/층)")&&maskText.includes("(기본 2와 다름)"),
    "mounted Loknar displays decoded collision mask footprint and baseline difference");
  await page.goto(base+"/reference/?species=STR_SOLDIER_LOKNAR"+
    "#voxel-armor-STR_LOKNAR_PLATE_MAIL_RIDER_UC-STR_SOLDIER_LOKNAR",
    {waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#voxel-armor-details")?.open===true,
    {timeout:20000});
  assert(await page.locator("#voxel-armor-STR_LOKNAR_PLATE_MAIL_RIDER_UC-STR_SOLDIER_LOKNAR").isVisible(),
    "mounted Loknar direct link must expand armor differences");
  await page.locator("#voxel-armor-details summary").click();
  await page.locator("#voxel-species").selectOption("");
  await page.locator("#voxel-search").fill("로크나르");
  assert.equal(await page.locator("#voxel-body-rows tr").count(),1,
    "apostrophe-normalized Korean Loknar search");
  await page.locator("#voxel-search").fill("갈");
  assert((await page.locator("#voxel-body-rows tr").count())>=1,"Gal alias search");
  assert((await page.locator("#voxel-body-rows").innerText()).includes("일반 갈"));
  assert.deepEqual((await page.locator("#voxel-body-STR_SOLDIER td").allTextContents())
    .slice(5,7).map(x=>x.trim()),["18","10"],"Gal standing shot 18 / kneeling shot 10");
  await page.locator("#voxel-search").fill("캣걸");
  assert((await page.locator("#voxel-body-rows tr").count())>=2,"Catgirl body variants");
  await page.locator("#voxel-search").fill("");
  await page.locator("#voxel-sort").selectOption("kneel");
  assert.equal((await page.locator("#voxel-body-rows tr").first().locator("td").nth(2).innerText()).trim(),"11",
    "kneeling body height sort");
  await page.locator("#voxel-sort").selectOption("kneelShot");
  assert.equal((await page.locator("#voxel-body-rows tr").first().locator("td").nth(6).innerText()).trim(),"7",
    "kneeling projectile origin sort");
  await page.locator("#voxel-armor-details summary").click();
  const before=await page.locator("#voxel-armor-rows tr").count();
  assert(before>=99,"significant armor exceptions");
  await page.locator("#voxel-armor-exceptions").uncheck();
  const after=await page.locator("#voxel-armor-rows tr").count();
  assert(after>=540 && after>before,"all armored species combinations");
  const prohibited = page.locator("#voxel-armor-rows tr").filter({hasText:"불가 명시"}).first();
  assert((await prohibited.count())>0,"kneeling-prohibited armor exists");
  assert.match(await prohibited.locator("td").nth(6).innerText(),/무릎 불가/,
    "theoretical kneeling shot Z must be clearly marked as unusable");
  await page.locator("#voxel-species").selectOption("STR_SOLDIER_NEKOMIMI");
  assert((await page.locator("#voxel-body-rows tr td").allTextContents())
    .slice(1,7).map(x=>x.trim()).join(",")==="21,13,21,13,17,9",
    "Catgirl 21/13, standing shot 17, kneeling shot 9");
  assert((await page.locator("#voxel-armor-rows tr").count())>0,
    "armor selector keeps compatible rows");
  await page.goto(base+"/reference/#large-unit-voxels",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#voxel-large-status")?.textContent?.includes("/ 46종"));
  await page.locator("#voxel-large-STR_HYENA_RIDER_ARMOR_UC a").click();
  await page.waitForFunction(()=>document.querySelector("#voxel-armor-details")?.open===true);
  assert(new URL(page.url()).searchParams.get("species")==="STR_SOLDIER",
    "2x2 detailed link chooses eligible Gal soldier");
  assert(await page.locator("#voxel-armor-STR_HYENA_RIDER_ARMOR_UC-STR_SOLDIER").isVisible(),
    "Hyena 2x2 deep link resolves to detailed per-soldier armor comparison");
  assert.deepEqual(errors,[],"no JS or network errors");
  console.log("PASS reference browser: 29 species / 540 armors / all 46 unique 2x2 armors, Hyena 32x32 and 780 voxels, mounted Loknar, no kneeling, accurate shot heights, search and browser errors");
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
