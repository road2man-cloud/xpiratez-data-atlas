import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {createResourceClock} from "./atlas-overcap-forward-clock-v4-resources.mjs";
import {START_RESEARCH} from "./atlas-overcap-rooted-early-research.mjs";
const files={data:"public/data/soldiers-modern-index.json",forwardSupply:"tools/data/overcap-forward-supply-catalog-v2.json",forwardStartingBase:"tools/data/overcap-forward-starting-base-v3.json",forwardJunk:"tools/data/overcap-forward-junk-extraction-v3.json",facilities:"public/data/facilities-v2-index.json",items:"public/data/items-v2-index.json"};
const bytes=Object.fromEntries(Object.entries(files).map(([k,p])=>[k,fs.existsSync(p)?fs.readFileSync(p):execFileSync("git",["show","HEAD:"+p],{maxBuffer:80*1024*1024})]));
const data=JSON.parse(bytes.data);for(const k of ["forwardSupply","forwardStartingBase","forwardJunk"])data[k]=JSON.parse(bytes[k]);
const facilities=JSON.parse(bytes.facilities),items=JSON.parse(bytes.items);
assert.equal(facilities.meta.sourceVersion,"v.o2");assert.equal(items.meta.sourceVersion,"v.o2");
const facilityFields=Object.fromEntries(facilities.facilities.map(x=>[x.id,x.fields])),itemFields=Object.fromEntries(items.items.map(x=>[x.id,x.fields]));
const runs=[],clock=createResourceClock(data,{budget:325000,labCapacity:12,quarters:20,facilityFields,itemFields});
const hall=["STR_WAT_DO","STR_INSPECT_MACHINERY","STR_JACKSTOWN_SCOUTING","STR_MESS_HALL"];
const labs=["STR_WAT_DO","STR_JACKSTOWN_SCOUTING","STR_INSPECT_MACHINERY","STR_PIRATE_STYLE","STR_KULTUR","STR_HARDWARE_SHOPPING","STR_GUN_SHOPPING","STR_THE_PHARMACIST","STR_CUNNING","STR_WEIRDNESS","STR_SCI_REP","STR_SCHOOLING_1","STR_CONTACT_GENERAL_SUPPLIES","STR_SC_WIRE","STR_PERSONAL_LABS"];
const goals={hall,hire:hall,labs};
for(const root of Object.values(START_RESEARCH))for(const mode of ["hall","hire","labs"])for(const roll of [50,100]){
 const s=clock.start(),target=goals[mode];let reason="JANUARY_LIMIT",blocked=[];
 try{
  clock.begin(s,root,s.scientists,roll);while(s.projects.length)clock.tick(s);clock.flush(s);
  if(mode==="hire")clock.hire(s);
  for(let i=0;i<31;i++){
   clock.flush(s);
   if(mode==="hall"&&s.world.facilities.has("STR_MESS_HALL")){reason="HALL_COMPLETED";break;}
   if(mode==="hall"&&s.world.researched.has("STR_MESS_HALL")&&!s.construction.length){
    try{clock.build(s,"STR_MESS_HALL");}catch(e){blocked.push({id:"STR_MESS_HALL",reason:e.message});reason=e.message;break;}
   }
   if(mode==="hire"&&s.scientists>3&&target.every(id=>s.world.researched.has(id))){reason="HIRE_AND_RESEARCH_COMPLETED";break;}
   if(mode==="labs"&&s.world.researched.has("STR_PERSONAL_LABS")){
    try{clock.build(s,"STR_PERSONAL_LABS");reason="LAB_CONSTRUCTION_STARTED";}catch(e){blocked.push({id:"STR_PERSONAL_LABS",reason:e.message,availableFunds:s.world.funds,requiredFunds:data.forwardSupply.facilities.STR_PERSONAL_LABS.cost});reason=e.message;}break;
   }
   if(mode==="labs"&&s.world.researched.has("STR_CONTACT_GENERAL_SUPPLIES")&&!s.world.items.STR_SC_WIRE&&!s.world.researched.has("STR_SC_WIRE")&&!s.projects.some(p=>p.id==="STR_SC_WIRE")&&!s.transfers.some(p=>p.id==="STR_SC_WIRE")){
    try{clock.buy(s,"STR_SC_WIRE");}catch(e){blocked.push({id:"STR_SC_WIRE",reason:e.message});}
   }
   let eligible=clock.options(s).filter(o=>o.action.type==="research"&&target.includes(o.action.id)).map(o=>o.action.id).sort((a,b)=>target.indexOf(a)-target.indexOf(b));
   for(const id of eligible){if(!clock.available(s))break;clock.begin(s,id,1,roll);}
   if(s.projects.length&&clock.available(s))clock.assign(s,s.projects[0].id,s.projects[0].assigned+clock.available(s));
   if(!s.projects.length&&!s.construction.length&&!s.transfers.length){reason="NO_SUPPORTED_NEXT_STEP";break;}
   clock.tick(s);
  }
 }catch(e){reason=e.message;}
 runs.push({root,mode,roll,reason,date:clock.stamp(s),funds:s.world.funds,scientists:s.scientists,facilities:[...s.world.facilities].sort(),research:[...s.world.researched].sort(),stock:s.world.items,grid:s.grid,construction:s.construction,transfers:s.transfers,projects:s.projects,blocked,trace:s.trace});
}
const sha=b=>createHash("sha256").update(b).digest("hex");
const out={schema:"ATLAS_FORWARD_RESOURCES_V4_2",actualGameCertified:false,normalizationComplete:false,scope:"Conditional January resource scenarios. Budget 325000 is funding target, not observed initial balance. Assumed conservative quarters 20 and lab capacity 12, no capacity increases credited. No monthly events, manufacture or battle. Purchase storage limit and inherited rules not independently certified.",source:{globals:"Piratez_Globals.rul:8858-8862",hireCost:200000,hireHours:72,fundingTarget:325000,itemTransferDefault:24},inputs:Object.fromEntries(Object.entries(files).map(([k,p])=>[p,sha(bytes[k])])),engineSha256:sha(fs.readFileSync("tools/atlas-overcap-forward-clock-v4-resources.mjs","utf8").replace(/\r\n/g,"\n")),runs};
assert(runs.some(r=>r.reason==="HALL_COMPLETED"),"No completed facility");
assert(runs.some(r=>r.reason==="HIRE_AND_RESEARCH_COMPLETED"),"No completed hire");
fs.writeFileSync("tools/data/overcap-forward-resources-v4.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(runs.map(r=>({root:r.root,mode:r.mode,roll:r.roll,reason:r.reason,date:r.date,funds:r.funds,scientists:r.scientists,hall:r.facilities.includes("STR_MESS_HALL"),wire:r.research.includes("STR_SC_WIRE"),labs:r.research.includes("STR_PERSONAL_LABS"),blocked:r.blocked})),null,2));
