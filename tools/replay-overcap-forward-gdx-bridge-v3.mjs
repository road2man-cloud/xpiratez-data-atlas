// Hash-bound replay and branch resume, including the shared capture prefix.
// Each sibling starts from the same pending-free checkpoint. Never combine
// awards across siblings. Additional mission/event gates remain restrictive.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
import {resumeElectronics} from "./replay-overcap-forward-electronics-v3.mjs";
import {createForwardResearch} from "./atlas-overcap-forward-research-v3.mjs";
import {createGdxBridge} from "./atlas-overcap-forward-gdx-bridge-v3.mjs";
import {exactStateHash} from "./origin-pair-exact-prefix-checkpoint.mjs";
import {key} from "./population-research-career-core.mjs";
const dir="tools/data/",sha=b=>createHash("sha256").update(b).digest("hex"),load=p=>JSON.parse(fs.readFileSync(p));
export function resumeGdxBridge({scenario="uk",root="STR_INSPECT_MACHINERY",award="STR_ALIEN_TERROR"}={}){
 const index=load(dir+"overcap-forward-gdx-bridge-active-v3.json"),row=index.scenarios.find(r=>r.scenario===scenario&&r.root===root);assert(row);
 const bytes=fs.readFileSync(row.path);assert.equal(sha(bytes),row.sha256);
 const g=JSON.parse(gunzipSync(bytes));assert.equal(g.schema,"ATLAS_FORWARD_GDX_BRIDGE_SCENARIO_V3");assert.equal(g.scenario,scenario);assert.equal(g.root,root);assert.deepEqual(g.inputs,index.inputs);
 assert.equal(sha(fs.readFileSync(dir+"overcap-forward-electronics-active-v3.json")),g.inputs.electronicsIndexSha256);
 const sourceBytes=fs.readFileSync(dir+"overcap-forward-gdx-bridge-sources-v3.json");assert.equal(sha(sourceBytes),g.inputs.sourceSha256);
 const source=JSON.parse(sourceBytes);
 assert.equal(sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz")),source.nativeArchiveSha256);
 for(const [p,h] of Object.entries(g.inputs.producerFiles))assert.equal(sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n")),h,p);
 const c=resumeElectronics({scenario,root,cursor:"core"});
 assert.equal(c.stateHash,g.prefix.stateHash);assert.equal(c.through,g.prefix.step);assert.equal(sha(fs.readFileSync(g.prefix.path)),g.prefix.sha256);
 const data=c.data,engine=createForwardResearch(data,{maxMonth:12}),bridge=createGdxBridge(data,engine,source);
 function optionsAt(w){const native=engine.options(w,root);
  return [...c.optionsAt(w),...native.choices.filter(x=>x.action.type==="sourceBuildFacility"&&x.action.id==="STR_MESS_HALL"),...bridge.options(w,root)];
 }
 function apply(w,a){
  assert(optionsAt(w).some(x=>key(x.action)===key(a)),"Action outside supported positive-gate/source frontier");
  if(["sourceGdxCapture","sourceGdxOrder"].includes(a.type))return bridge.apply(w,a,root);
  if(a.type==="sourceBuildFacility")return engine.apply(w,a,root);
  return c.apply(w,a);
 }
 let world=c.world,through=c.through;
 function replay(s){
  assert.equal(s.index,++through);assert.equal(exactStateHash(world),s.beforeHash);
  assert(optionsAt(world).some(x=>key([x.action,x.evidence])===key([s.action,s.evidence])),"Changed edge evidence "+s.index);
  world=apply(world,s.action).world;assert.equal(exactStateHash(world),s.afterHash);
 }
 for(const s of g.prefixSteps)replay(s);assert.equal(exactStateHash(world),g.forkHash);
 if(award!==null){
  const branch=g.branches.find(x=>x.award===award),b=row.branches.find(x=>x.award===award);assert(branch&&b);assert.equal(branch.seedHash,g.forkHash);
  for(const s of branch.steps)replay(s);assert.equal(exactStateHash(world),branch.final.stateHash);assert.equal(exactStateHash(world),b.stateHash);
 }
 return {world,data,source,root,scenario,award,through,stateHash:exactStateHash(world),optionsAt,choices:()=>optionsAt(world),apply,orderBlockers:()=>bridge.orderBlockers(world),actualGameCertified:false,partialInventory:true};
}
