// Extract the small, explicit startingBase section from the exact installed
// v.o2 ruleset. Refuse mismatched files and unmodeled startingBase variants.
// Do not publish the underlying ruleset or treat craft cargo as base storage.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const dir=process.argv.find(x=>x.startsWith("--rules="))?.slice(8);
assert(dir,"Pass --rules=<installed Ruleset directory>");
const sha=b=>createHash("sha256").update(b).digest("hex");
let section=null,source=null;const hashes={};
for(const r of data.meta.source.rules){
 const b=fs.readFileSync(path.join(dir,r.file));assert.equal(sha(b),r.sha256,r.file);hashes[r.file]=r.sha256;
 const lines=b.toString("utf8").replace(/^\uFEFF/,"").split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  if(/^startingBase\w*:/.test(lines[i])){
   assert.equal(lines[i].trim(),"startingBase:");assert(!section,"Multiple starting base declarations");
   let j=i+1;while(j<lines.length&&!/^[A-Za-z][A-Za-z0-9_]*:/.test(lines[j]))j++;
   section=lines.slice(i,j);source={file:r.file,lineStart:i+1,lineEnd:j,sectionSha256:sha(section.join("\n"))};
  }
 }
}
assert(section);
const facilities=[],items={},crafts=[];let mode=null,craft=null,facility=null,scientists=null,engineers=null,randomSoldiers=null,cargo=false;
for(const raw of section.slice(1)){
 if(!raw.trim()||/^\s*#/.test(raw))continue;
 let m;
 if((m=raw.match(/^  (facilities|crafts|items):\s*$/))){mode=m[1];cargo=false;continue;}
 if((m=raw.match(/^  (scientists|engineers|randomSoldiers): (\d+)\s*$/))){
  mode=null;const n=Number(m[2]);if(m[1]==="scientists")scientists=n;else if(m[1]==="engineers")engineers=n;else randomSoldiers=n;continue;
 }
 if(mode==="facilities"){
  if((m=raw.match(/^    - type: (STR_\w+)\s*$/))){facility={id:m[1]};facilities.push(facility);continue;}
  if((m=raw.match(/^      ([xy]): (\d+)\s*$/))){assert(facility);facility[m[1]]=Number(m[2]);continue;}
 }
 if(mode==="items"&&(m=raw.match(/^    (STR_\w+): (\d+)\s*$/))){assert(!Object.hasOwn(items,m[1]));items[m[1]]=Number(m[2]);continue;}
 if(mode==="crafts"){
  if((m=raw.match(/^    - type: (STR_\w+)\s*$/))){craft={type:m[1],items:{}};crafts.push(craft);cargo=false;continue;}
  if((m=raw.match(/^      (id|fuel|damage): (\d+)\s*$/))){assert(craft);craft[m[1]]=Number(m[2]);cargo=false;continue;}
  if((m=raw.match(/^      status: (STR_\w+)\s*$/))){craft.status=m[1];cargo=false;continue;}
  if(raw==="      items:"){cargo=true;continue;}
  if(cargo&&(m=raw.match(/^        (STR_\w+): (\d+)\s*$/))){assert(!Object.hasOwn(craft.items,m[1]));craft.items[m[1]]=Number(m[2]);continue;}
 }
 throw Error("Unmodeled startingBase line: "+raw);
}
assert(facilities.length&&scientists!==null&&engineers!==null&&randomSoldiers!==null&&Object.keys(items).length);
const functions=new Set();
for(const f of facilities){assert(Number.isInteger(f.x)&&Number.isInteger(f.y));const rule=data.baseFacilityFunctions[f.id];assert(rule,"Missing facility rule "+f.id);for(const k of rule.provides)functions.add(k);}
const out={schema:"ATLAS_FORWARD_STARTING_BASE_V3",sourceMetadataSha256:data.meta.source.metadataSha256,source,ruleFiles:hashes,facilities,baseFunctions:[...functions].sort(),items,crafts,scientists,engineers,randomSoldiers,scope:"Explicit installed v.o2 startingBase. Craft cargo preserved separately, not usable as lab stock. No inferred global funds, geography, soldier types or event outcome."};
fs.writeFileSync("tools/data/overcap-forward-starting-base-v3.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({source,facilities:facilities.length,functions:out.baseFunctions,baseItemTypes:Object.keys(items).length,craftItemTypes:crafts.reduce((n,c)=>n+Object.keys(c.items).length,0),scientists,engineers,randomSoldiers},null,2));
