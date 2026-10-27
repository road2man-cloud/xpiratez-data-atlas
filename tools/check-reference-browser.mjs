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
  assert.equal(await page.locator("#voxel-body-rows tr").count(),1,"species deep link");
  assert.deepEqual((await page.locator("#voxel-body-rows tr td").allTextContents())
    .slice(1,6).map(x=>x.trim()),["17","11","17","11","13"],"Loknar 17/11, muzzle 13");
  await page.locator("#voxel-species").selectOption("");
  assert.equal(await page.locator("#voxel-body-rows tr").count(),29,"all body rows");
  await page.locator("#voxel-search").fill("로크나르");
  assert.equal(await page.locator("#voxel-body-rows tr").count(),1,
    "apostrophe-normalized Korean Loknar search");
  await page.locator("#voxel-search").fill("갈");
  assert((await page.locator("#voxel-body-rows tr").count())>=1,"Gal alias search");
  assert((await page.locator("#voxel-body-rows").innerText()).includes("일반 갈"));
  await page.locator("#voxel-search").fill("캣걸");
  assert((await page.locator("#voxel-body-rows tr").count())>=2,"Catgirl body variants");
  await page.locator("#voxel-search").fill("");
  await page.locator("#voxel-sort").selectOption("kneel");
  assert((await page.locator("#voxel-body-rows tr").first().innerText()).includes("11")||
    (await page.locator("#voxel-body-rows tr").first().innerText()).includes("12"),
    "kneeling height sort");
  await page.locator("#voxel-armor-details summary").click();
  const before=await page.locator("#voxel-armor-rows tr").count();
  assert(before>=99,"significant armor exceptions");
  await page.locator("#voxel-armor-exceptions").uncheck();
  const after=await page.locator("#voxel-armor-rows tr").count();
  assert(after>=540 && after>before,"all armored species combinations");
  await page.locator("#voxel-species").selectOption("STR_SOLDIER_NEKOMIMI");
  assert((await page.locator("#voxel-body-rows tr td").allTextContents())
    .slice(1,6).map(x=>x.trim()).join(",")==="21,13,21,13,17",
    "Catgirl 21/13, muzzle 17");
  assert((await page.locator("#voxel-armor-rows tr").count())>0,
    "armor selector keeps compatible rows");
  assert.deepEqual(errors,[],"no JS or network errors");
  console.log("PASS reference browser: 29 species, Korean aliases, 17/11 Loknar, 21/13 Catgirl, 540 armors, exception toggles and page errors");
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
