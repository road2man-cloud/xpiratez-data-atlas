// Resume a produced V3 electronics scenario at either core milestone or
// last cursor. All prefix/source hashes are checked before replay. The
// resulting partial inventory may only support positive stock conditions;
// do not expose ordinary event, mission, purchase or economy admission.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {pathToFileURL} from "node:url";
import {createForwardResearch} from "./atlas-overcap-forward-research-v3.mjs";
import {createElectronicsMissionSupply} from "./atlas-overcap-forward-electronics-mission-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
const dir="tools/data/",sha=b=>createHash("sha256").update(b).digest("hex"),load=p=>JSON.parse(fs.readFileSync(p)),readGzip=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const custom=new Set(["sourceMissionRecovery","sourceMissionSampleExtraction"]),safe=new Set(["research","freeResearch","sourceResearchDelivery","sourceRandomManufacture","sourceManufactureItem"]);
export function resumeElectronics({scenario="uk",root="STR_INSPECT_MACHINERY",cursor="core"}={}){
 assert(["core","final"].includes(cursor));
 const index=load(dir+"overcap-forward-electronics-active-v3.json"),row=index.scenarios.find(r=>r.scenario===scenario&&r.root===root);assert(row,"Unknown scenario");
 const raw=fs.readFileSync(row.path);assert.equal(sha(raw),row.sha256);
 const g=JSON.parse(gunzipSync(raw));assert.equal(g.schema,"ATLAS_FORWARD_ELECTRONICS_SCENARIO_V3");assert.equal(g.root,root);assert.equal(g.scenario,scenario);
 const prefixBytes=fs.readFileSync(g.prefix.path);assert.equal(sha(prefixBytes),g.prefix.sha256);
 const prefix=JSON.parse(gunzipSync(prefixBytes));assert.equal(prefix.final.stateHash,g.prefix.stateHash);assert.equal(prefix.steps.length,g.prefix.steps);
 assert.equal(sha(fs.readFileSync(dir+"overcap-forward-scenario-registry-v3.json")),g.registrySha256);
 const srcBytes=fs.readFileSync(dir+"overcap-forward-electronics-mission-sources-v3.json");assert.equal(sha(srcBytes),g.sourceSha256);
 const source=JSON.parse(srcBytes);assert.equal(sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz")),source.nativeArchiveSha256);
 for(const [p,h] of Object.entries(g.inputs.files))assert.equal(sha(fs.readFileSync(p)),h,p);
 for(const [p,h] of Object.entries({...g.inputs.engineFiles,...g.producerHashes}))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,p);
 const data=load("public/data/soldiers-modern-index.json");data.forwardSupply=load(dir+"overcap-forward-supply-catalog-v2.json");data.forwardStartingBase=load(dir+"overcap-forward-starting-base-v3.json");data.forwardJunk=load(dir+"overcap-forward-junk-extraction-v3.json");
 const engine=createForwardResearch(data,{maxMonth:12}),mission=createElectronicsMissionSupply(data,engine,source);
 let world=engine.start(),firstRoot=null;
 if(scenario==="uk"){assert.equal(prefix.initialAction.scenarioContext.country,"STR_UK");world.countries=new Set(["STR_UK"]);}
 function choices(w){
  const opts=engine.options(w,firstRoot);
  return [...(w.forwardPartialMissionRecovery?opts.choices.filter(x=>safe.has(x.action.type)):opts.choices),...mission.options(w,firstRoot)];
 }
 function apply(w,a){
  assert(choices(w).some(x=>key(x.action)===key(a)),"Action absent from permitted current options");
  return custom.has(a.type)?mission.apply(w,a,firstRoot):engine.apply(w,a,firstRoot);
 }
 for(const s of prefix.steps){
  assert.equal(exactStateHash(world),s.beforeHash);world=engine.apply(world,s.action,firstRoot).world;
  if(!firstRoot){assert.equal(s.action.id,root);firstRoot=root;}assert.equal(exactStateHash(world),s.afterHash);
 }
 assert.equal(exactStateHash(world),g.prefix.stateHash);
 const through=cursor==="core"?g.coreCheckpoint?.step:g.prefix.steps+g.steps.length;
 assert(Number.isInteger(through)&&through>=g.prefix.steps);
 for(const s of g.steps.filter(x=>x.index<=through)){
  assert.equal(exactStateHash(world),s.beforeHash);
  const opt=choices(world).find(x=>key([x.action,x.evidence])===key([s.action,s.evidence]));assert(opt,"Stored action unavailable "+s.index);
  world=apply(world,s.action).world;assert.equal(exactStateHash(world),s.afterHash);
 }
 const stateHash=exactStateHash(world);
 assert.equal(stateHash,cursor==="core"?g.coreCheckpoint.stateHash:g.final.stateHash);
 assert(world.forwardPartialMissionRecovery);
 return {world,data,root,scenario,cursor,through,stateHash,choices:()=>choices(world),optionsAt:choices,apply,actualGameCertified:false,partialInventory:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const index=load(dir+"overcap-forward-electronics-active-v3.json");
 for(const row of index.scenarios){
  const c=resumeElectronics({scenario:row.scenario,root:row.root,cursor:"core"});
  assert.equal(c.world.forwardMissionReceipts.length,2);assert(!c.choices().some(x=>x.action.type==="sourceMissionRecovery"||x.action.type==="sourceMissionSampleExtraction"));
  for(const id of ["STR_PADD","STR_WASTELANDER_BACKPACK","STR_ACADEMY_CORPSE","STR_GOVT_CORPSE","STR_STUN_BATON"])assert.equal(c.world.items[id],0,id);
  assert.throws(()=>c.apply(c.world,{type:"sourceMissionRecovery",source:"neophytes-electronics",assumeMissionOutcome:true,assumeRecovered:true}));
  const f=resumeElectronics({scenario:row.scenario,root:row.root,cursor:"final"});
  console.log(JSON.stringify({scenario:row.scenario,root:row.root,core:c.through,final:f.through,coreHash:c.stateHash,finalHash:f.stateHash,coreOptions:c.choices().length,repeatHarvestBlocked:true,partialInventory:true}));
 }
}
