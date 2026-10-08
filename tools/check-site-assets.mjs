// Fast, dependency-free integrity check for the shipped static HTML/CSS/JS.
// Data contents are covered by the DB-specific check-* scripts. This catches
// missing navigation targets, scripts, styles and accidental syntax regressions.
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../public");
const home=fs.readFileSync(path.join(root,"index.html"),"utf8");
const expected=["starting","captains","soldiers","crafts","craft-weapons","facilities","armors","items","research","manufacture","events","forces","weapons"];
const nav=[...home.matchAll(/<a\s+href="\.\/([a-z-]+)\/(?:\?[^"]*)?"/g)].map(m=>m[1]);
assert.deepEqual([...new Set(nav)].sort(),[...expected].sort(),"Homepage navigation omits or duplicates a DB");

const errors=[];
let linkCount=0,scriptCount=0,jsCount=0;
const pages=["index.html",...expected.map(n=>n+"/index.html")];
const selector={
  starting:"cards",captains:"matrixTable",soldiers:"soldierTable",crafts:"craftTable",
  "craft-weapons":"weaponTable",facilities:"facilityTable",armors:"armorTable",
  items:"tbody",research:"tbody",manufacture:"manufactureTable",events:"eventTable",
  forces:"forceTable",weapons:"weaponTable"
};

for(const rel of pages){
  const filename=path.join(root,rel),html=fs.readFileSync(filename,"utf8");
  const slug=rel.split("/")[0];
  if(selector[slug]&&!html.includes('id="'+selector[slug]+'"'))errors.push(rel+": main view #"+selector[slug]+" missing");
  if(rel!=="index.html"&&!html.includes('id="search"'))errors.push(rel+": #search missing");
  const refRe=/\b(?:src|href)="([^"]+)"/g;
  for(const [,href] of html.matchAll(refRe)){
    if(/^(?:https?:|data:|mailto:|tel:|javascript:|#|\/\/)/i.test(href))continue;
    const value=href.split(/[?#]/)[0];
    if(!value)continue;
    const resolved=path.resolve(path.dirname(filename),decodeURIComponent(value));
    if(resolved!==root&&!resolved.startsWith(root+path.sep)){errors.push(rel+": link escapes public/: "+href);continue}
    const target=value.endsWith("/")?path.join(resolved,"index.html"):resolved;
    if(!fs.existsSync(target)){errors.push(rel+": missing asset "+href);continue}
    linkCount++;
    if(/\.js(?:$|[?#])/.test(href))scriptCount++;
  }
  if(rel!=="index.html"&&!/\b(?:src)=["'][^"']+\.js(?:\?[^"']*)?["']/.test(html)){
    errors.push(rel+": no JavaScript loaded");
  }
}
for(const name of expected){
  for(const file of fs.readdirSync(path.join(root,name)).filter(x=>x.endsWith(".js"))){
    jsCount++;
    try{execFileSync(process.execPath,["--check",path.join(root,name,file)],{stdio:"pipe"});}
    catch(e){errors.push(name+"/"+file+": JS syntax "+e.stderr?.toString().trim().slice(0,250))}
  }
}
for(const essential of ["starting-bonuses.json","soldiers-index.json","facilities-index.json","manufacture-index.json","craft-weapons-index.json","weapons-index.json"]){
  if(!fs.existsSync(path.join(root,"data",essential)))errors.push("data/"+essential+" missing");
}
for(const essential of ["items-index.json","research-index.json","schema.json","entities.json","research-insight-index.json"]){
  if(!fs.existsSync(path.join(root,"items/data",essential)))errors.push("items/data/"+essential+" missing");
  if(fs.existsSync(path.join(root,"data",essential)))errors.push("canonical duplicate under data/"+essential);
}
if(errors.length)throw new Error("Site asset integrity failed:\n"+errors.join("\n"));
console.log("OK site assets: "+expected.length+" linked DB pages, "+linkCount+" local HTML assets/links, "+scriptCount+" script tags, "+jsCount+" checked JS files, canonical item/research data");
