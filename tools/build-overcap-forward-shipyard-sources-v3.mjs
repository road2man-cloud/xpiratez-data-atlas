// Narrow raw-source anchors for the country-start and delayed vessel event.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const dir=process.argv.find(x=>x.startsWith("--rules="))?.slice(8);assert(dir);
const sha=b=>createHash("sha256").update(b).digest("hex");
const expected=new Map(data.meta.source.rules.map(r=>[r.file,r.sha256]));
const file="Piratez_Events.rul",bytes=fs.readFileSync(path.join(dir,file));
assert.equal(sha(bytes),expected.get(file));
const lines=bytes.toString("utf8").replace(/^\uFEFF/,"").split(/\r?\n/);
function block(section,id){
 let sec="",found=null;
 for(let i=0;i<lines.length;i++){
  if(/^[A-Za-z][A-Za-z0-9_]*:/.test(lines[i]))sec=lines[i].split(":")[0];
  if(sec===section&&lines[i]===("  - "+(section==="events"?"name":"type")+": "+id)){
   assert(!found);let j=i+1;while(j<lines.length&&!/^  - |^[A-Za-z][A-Za-z0-9_]*:/.test(lines[j]))j++;
   const text=lines.slice(i,j).join("\n");found={text,anchor:{file,sha256:sha(bytes),startLine:i+1,endLine:j,blockSha256:sha(text)}};
  }
 }assert(found);return found;
}
const rows=[];
for(const id of ["STR_START_COUNTRY_UK_EVENT","STR_AIR_BANDITS_EVENT"]){
 const ev=block("events",id),script=block("eventScripts",id);
 const checks=id==="STR_START_COUNTRY_UK_EVENT"?{research:"STR_UK",country:"STR_UK",firstMonth:0,lastMonth:0,items:{STR_JUNK_PILE:8,STR_NECROPLANE_PARTS:30,STR_CHEMICALS:50,STR_SCRAP_METAL:50}}:{research:"STR_VESSEL_RUSTFIGHTER3",firstMonth:2,lastMonth:null,items:{}};
 assert(ev.text.includes("researchList: ["+checks.research+"]"));
 assert(script.text.includes("firstMonth: "+checks.firstMonth)&&script.text.includes("executionOdds: 100"));
 if(checks.country){assert(script.text.includes("lastMonth: 0")&&script.text.includes("xcomBaseInCountryTriggers:")&&script.text.includes("STR_UK: true"));for(const [k,v] of Object.entries(checks.items))assert(ev.text.includes(k+": "+v));}
 else assert(script.text.includes("oneTimeRandomEvents:")&&script.text.includes(id+": 100")&&script.text.includes(checks.research+": false"));
 rows.push({id,...checks,eventAnchor:ev.anchor,scriptAnchor:script.anchor});
}
const out={schema:"ATLAS_FORWARD_SHIPYARD_SOURCE_ANCHORS_V3",sourceMetadataSha256:data.meta.source.metadataSha256,rows,scope:"Raw-source matched country event and delayed vessel event. UK is a separate assumed campaign start, not a modification of an existing campaign. Actual event timing remains conditional."};
fs.writeFileSync("tools/data/overcap-forward-shipyard-sources-v3.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(rows,null,2));
