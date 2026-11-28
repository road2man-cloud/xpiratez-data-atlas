// Compile a narrow monthly event model from the exact installed rules.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const dir=process.argv.find(x=>x.startsWith("--rules="))?.slice(8);assert(dir);
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json")),sha=b=>createHash("sha256").update(b).digest("hex");
const file="Piratez_Events.rul",b=fs.readFileSync(path.join(dir,file)),hash=sha(b);assert.equal(hash,data.meta.source.rules.find(x=>x.file===file).sha256);
const lines=b.toString("utf8").replace(/^\uFEFF/,"").split(/\r?\n/);
function block(sec,id){
 let current="",found=null;
 for(let i=0;i<lines.length;i++){
  if(/^[A-Za-z][A-Za-z0-9_]*:/.test(lines[i]))current=lines[i].split(":")[0];
  if(current===sec&&lines[i]===("  - "+(sec==="events"?"name":"type")+": "+id)){
   assert(!found);let j=i+1;while(j<lines.length&&!/^  - |^[A-Za-z][A-Za-z0-9_]*:/.test(lines[j]))j++;
   const l=lines.slice(i,j);found={lines:l,anchor:{file,sha256:hash,startLine:i+1,endLine:j,blockSha256:sha(l.join("\n"))}};
  }
 }assert(found);return found;
}
function scalar(d,k){return d.lines.find(l=>l.startsWith("    "+k+": "))?.slice(k.length+6).trim()??null;}
function number(d,k,def){const v=scalar(d,k);if(v===null)return def;assert(/^-?\d+$/.test(v),k);return Number(v);}
function list(d,k){const s=scalar(d,k);assert(s&&s.startsWith("[")&&s.endsWith("]"));return s.slice(1,-1).split(", ").filter(Boolean);}
function only(d,fields){for(const l of d.lines)if(/^    \w+:/.test(l))assert(fields.includes(l.trim().split(":")[0]),l);}
function sourceEvent(id){
 const d=block("events",id);only(d,["description","background","music","researchList","interruptResearch","randomItemList","points","timer","timerRandom"]);
 return {id,research:scalar(d,"researchList")?list(d,"researchList"):[],pool:scalar(d,"randomItemList")?list(d,"randomItemList"):[],interruptResearch:scalar(d,"interruptResearch"),points:number(d,"points",0),timer:number(d,"timer",30),timerRandom:number(d,"timerRandom",0),anchor:d.anchor};
}
function sourceScript(id,event,alias=null){
 const d=block("eventScripts",id);
 only(d,["eventWeights","firstMonth","lastMonth","executionOdds","researchTriggers"]);
 const weightLine=d.lines.find(l=>/^    eventWeights:/.test(l));assert(weightLine);
 const weights={};let owner=d;
 if(weightLine.includes("*")){assert(alias&&weightLine==="    eventWeights: *JackdumbEvents");owner=alias;}
 const wb=owner.lines.findIndex(l=>/^    eventWeights:/.test(l));assert(owner.lines[wb+1]==="      0:");
 for(let i=wb+2;i<owner.lines.length&&/^        STR_/.test(owner.lines[i]);i++){const [k,v]=owner.lines[i].trim().split(": ");assert(/^\d+$/.test(v));weights[k]=Number(v);}
 const positive=[],negative=[];for(const l of d.lines){const m=l.match(/^       (STR_\w+): (true|false)$/);if(m)(m[2]==="true"?positive:negative).push(m[1]);}
 assert(weights[event]>0);
 return {script:id,event,firstMonth:number(d,"firstMonth",0),lastMonth:number(d,"lastMonth",-1),executionOdds:number(d,"executionOdds",100),researchPositive:positive,researchNegative:negative,weight:weights[event],totalWeight:Object.values(weights).reduce((a,b)=>a+b,0),anchor:d.anchor,weightsAnchor:owner.anchor};
}
const personality=sourceEvent("STR_CAPTAIN_PERSONALITY_TEST"),trouble=sourceEvent("STR_TROUBLESEEKING_ENEMY"),order1=sourceEvent("STR_GDX_EVENT_ORDERS_1"),order2=sourceEvent("STR_GDX_EVENT_ORDERS_2");
assert.deepEqual(personality.research,["STR_CAPTAIN_PERSONALITY_TEST"]);assert.equal(trouble.pool.length,73);assert.equal(trouble.research.length,0);
for(const k of ["STR_SECTOID_MEDIC","STR_ACADEMY_NURSE","STR_SECTOID_LEADER"])assert.equal(trouble.pool.filter(x=>x===k).length,1);
const first=block("eventScripts","STR_CAPTAIN_JACKDUMB_EVENTS_1"),scripts=[sourceScript(personality.id,personality.id),...["STR_CAPTAIN_JACKDUMB_EVENTS_1","STR_CAPTAIN_JACKDUMB_EVENTS_2","STR_CAPTAIN_JACKDUMB_EVENTS_3"].map(id=>sourceScript(id,trouble.id,first)),sourceScript(order1.id,order1.id),sourceScript(order2.id,order2.id)];
assert.equal(scripts[0].executionOdds,100);for(const s of scripts.slice(1,4)){assert.deepEqual(s.researchPositive,["STR_CAPTAIN_JACKDUMB"]);assert.equal(s.executionOdds,20);}
assert(data.researchRules.STR_ACADEMY_NURSE.getOneFree.includes("STR_GDX_001"));
const out={schema:"ATLAS_FORWARD_CAPTAIN_MONTHLY_SOURCES_V3",sourceMetadataSha256:data.meta.source.metadataSha256,nativeArchiveSha256:sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz")),events:[personality,trouble,order1,order2],scripts,scope:"Source-matched monthly script eligibility and one randomItemList roll per event. Native schedule at month start, countdown in 30-minute units, event interruption at expiry, immediate or one-hour transfer. Other monthly events, calendar duration of lab/build work and full economy remain outside this projection."};
fs.writeFileSync("tools/data/overcap-forward-captain-monthly-sources-v3.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({events:out.events.map(e=>[e.id,e.pool.length,e.timer,e.timerRandom]),scripts:scripts.map(s=>[s.script,s.firstMonth,s.weight,s.totalWeight,s.executionOdds])},null,2));
