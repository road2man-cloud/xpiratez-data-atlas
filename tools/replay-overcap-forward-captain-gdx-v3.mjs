// Resume the source-start captain graph, not a fabricated final snapshot.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {createForwardResearch} from "./atlas-overcap-forward-research-v3.mjs";
import {createElectronicsMissionSupply} from "./atlas-overcap-forward-electronics-mission-v3.mjs";
import {createGdxBridge} from "./atlas-overcap-forward-gdx-bridge-v3.mjs";
import {createCaptainMonthly} from "./atlas-overcap-forward-captain-monthly-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
const dir="tools/data/",sha=b=>createHash("sha256").update(b).digest("hex"),load=p=>JSON.parse(fs.readFileSync(p)),arr=x=>Array.isArray(x)?x:[];
const norm=p=>sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
export function resumeCaptainGdx({scenario="baseline",root="STR_INSPECT_MACHINERY",award="STR_BEASTMEN"}={}){
 const index=load(dir+"overcap-forward-captain-gdx-active-v3.json"),row=index.scenarios.find(x=>x.scenario===scenario&&x.root===root);assert(row);
 const b=fs.readFileSync(row.path);assert.equal(sha(b),row.sha256);const g=JSON.parse(gunzipSync(b));
 assert.equal(g.schema,"ATLAS_FORWARD_CAPTAIN_GDX_SCENARIO_V3");assert.equal(g.root,root);assert.equal(g.scenario,scenario);assert.deepEqual(g.sources,index.sources);assert.deepEqual(g.producers,index.producers);
 assert(!g.failure);for(const [p,h] of Object.entries(g.producers))assert.equal(norm(p),h,p);
 const paths={base:dir+"overcap-forward-gdx-bridge-active-v3.json",monthly:dir+"overcap-forward-captain-monthly-sources-v3.json",electronics:dir+"overcap-forward-electronics-mission-sources-v3.json",gdx:dir+"overcap-forward-gdx-bridge-sources-v3.json"};
 for(const [k,p] of Object.entries(paths))assert.equal(sha(fs.readFileSync(p)),g.sources[k],p);
 const prior=fs.readFileSync(g.prior.path);assert.equal(sha(prior),g.prior.sha256);
 const prev=JSON.parse(gunzipSync(prior)),eb=fs.readFileSync(prev.prefix.path);assert.equal(sha(eb),prev.prefix.sha256);const e=JSON.parse(gunzipSync(eb)),pb=fs.readFileSync(e.prefix.path);assert.equal(sha(pb),e.prefix.sha256);const p=JSON.parse(gunzipSync(pb));
 for(const [f,h] of Object.entries(p.inputs.files))assert.equal(sha(fs.readFileSync(f)),h,f);
 for(const [f,h] of Object.entries({...p.inputs.engineFiles,...e.producerHashes,...prev.inputs.producerFiles}))assert.equal(norm(f),h,f);
 const data=load("public/data/soldiers-modern-index.json");data.forwardSupply=load(dir+"overcap-forward-supply-catalog-v2.json");data.forwardStartingBase=load(dir+"overcap-forward-starting-base-v3.json");data.forwardJunk=load(dir+"overcap-forward-junk-extraction-v3.json");
 const source=load(paths.monthly);assert.equal(source.nativeArchiveSha256,sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz")));
 const engine=createForwardResearch(data,{maxMonth:12}),electronic=createElectronicsMissionSupply(data,engine,load(paths.electronics)),bridge=createGdxBridge(data,engine,load(paths.gdx)),monthly=createCaptainMonthly(data,source);
 let firstRoot=null,world=engine.start();
 if(scenario==="uk"){assert.equal(g.initialAction.scenarioContext.country,"STR_UK");world.countries=new Set(["STR_UK"]);}
 assert.equal(exactStateHash(world),g.initialHash);
 const cache=new WeakMap();
 function optionsAt(w){const hit=cache.get(w);if(hit?.root===firstRoot)return hit.choices;const choices=computeOptions(w);cache.set(w,{root:firstRoot,choices});return choices;}
 function computeOptions(w){
  const raw=engine.options(w,firstRoot);
  if(w.pendingFree||arr(w.forwardDeliveries).length)return raw.choices;
  if(w.forwardCaptainPending)return [...monthly.options(w),...(!firstRoot?raw.choices:[])];
  const regular=w.forwardPartialMissionRecovery?raw.choices.filter(x=>["research","freeResearch","sourceResearchDelivery","sourceRandomManufacture","sourceManufactureItem"].includes(x.action.type)||x.action.type==="sourceBuildFacility"&&x.action.id==="STR_MESS_HALL"):raw.choices;
  return [...regular.filter(x=>x.action.type!=="advanceMonth"&&!(x.action.type==="eventResearch"&&source.events.some(e=>e.id===x.action.event))),...monthly.options(w),...electronic.options(w,firstRoot),...bridge.options(w,firstRoot).filter(x=>x.action.type==="sourceGdxCapture")];
 }
 function apply(w,opt){
  assert(optionsAt(w).some(x=>key([x.action,x.evidence])===key([opt.action,opt.evidence])),"Stored current option absent");
  const a=opt.action,r=a.type.startsWith("sourceCaptain")?monthly.apply(w,opt):["sourceMissionRecovery","sourceMissionSampleExtraction"].includes(a.type)?electronic.apply(w,a,firstRoot):a.type==="sourceGdxCapture"?bridge.apply(w,a,firstRoot):engine.apply(w,a,firstRoot);
  if(a.type==="research"&&!firstRoot){assert.equal(a.id,root);firstRoot=a.id;}return r;
 }
 function step(s){
  assert.equal(exactStateHash(world),s.beforeHash);world=apply(world,s).world;assert.equal(exactStateHash(world),s.afterHash);
 }
 for(const s of g.shared)step(s);assert.equal(exactStateHash(world),g.sharedFinal.stateHash);
 const branch=g.branches.find(b=>b.award===award);assert(branch&&!branch.failure);assert.equal(branch.seedHash,exactStateHash(world));
 for(const s of branch.steps)step(s);
 assert.equal(exactStateHash(world),branch.final.stateHash);
 return {world,data,engine,root,scenario,award,artifact:row.path,artifactSha256:row.sha256,stateHash:exactStateHash(world),through:g.shared.length+branch.steps.length,optionsAt,apply,actualGameCertified:false};
}
