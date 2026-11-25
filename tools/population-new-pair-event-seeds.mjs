// Adapt independently retained event birth variants without changing their IDs or
// the non-event seed registry. Full birth history is reconstructed, not invented.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {replayOriginWitness} from "../public/soldiers/modern/origin-witness.js";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";
import {member} from "./population-growth-replay-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
export function createEventSeeds(db,rootFile="D:/xpiratez-data-atlas/experiments/endgame-current-save/12-damsel-madgal-2280-cap-root-chronology.json"){
 const ledger=db.originEventBirth,routes={},skipped={};
 if(!ledger)return {routes,skipped};
 const raw=fs.readFileSync(rootFile),rd=JSON.parse(raw);
 assert.equal(sha(raw),ledger.sourceRootSha256);assert.equal(rd.sourceMetadataSha256,db.sourceMetadataSha256);
 const plans=new Map([...(rd.oldExactRootPlans||[]),...(rd.oldChosenCauseRawProbes||[]),...(rd.newNoCauseProbes||[])].map(p=>[p.rank,p])),branches=new Map(db.branches.map(b=>[b.id,b]));
 for(const [id,v] of Object.entries(ledger.variants)){
  try{
   const b=branches.get(v.branch),p=plans.get(b?.rank),root=ledger.roots[v.root];
   assert(b&&!b.sourceRootConflict&&p&&root&&key(root.actions)===v.root);
   assert.equal(v.id,id);assert.equal(v.actualGameCertified,false);
   const actions=[...root.actions.slice(0,v.insertionAt),...v.extraBeforeBirth,...v.inserted,...root.actions.slice(v.insertionAt)];
   assert.equal(key(actions),v.fullActionHash);
   const births=actions.filter(a=>a.type==="recruit"&&a.soldier==="origin");assert.equal(births.length,1);assert.equal(births[0].profile,v.origin);assert.equal(births[0].script,v.script);assert.equal(births[0].band,"min");assert.equal(births[0].assumeOutcome,true);
   const wid=v.witnessIds.find(k=>ledger.witnesses[k]?.steps.length===0&&ledger.witnesses[k]?.populationEvent?.actions.length===0);
   const w=db.witnesses[wid];assert(w&&w.source==="POPEVENT12"&&w.populationEvent.variant===id);
   assert.deepEqual(w,ledger.witnesses[wid]);assert.equal(w.originProfile,v.origin);assert.deepEqual(w.branchIds,[v.branch]);
   const commit=[...new Set([...p.requiredActive,...b.captain,...Object.values(b.choices||{}).filter(Boolean)])],avoid=[...new Set([...p.avoidIds,...(b.blockedResearch||[])])].sort();
   routes[id]={eventVariant:id,witness:wid,origin:v.origin,branch:v.branch,root:v.root,body:w.body,vector:w.vector,actions,fullActionHash:v.fullActionHash,allowedDifficulties:v.allowedDifficulties,commit,avoid,rawAtBirth:v.raw,script:v.script};
  }catch(e){skipped[id]=String(e.message);}
 }
 return {routes,skipped};
}
export function replayEventSeed(r,data,g){
 const rr=replayOriginWitness(r.actions,data,{requireCompatibleContext:true});
 assert(rr.ok,rr.reason);
 const ctx=auditOriginCampaignContext(r.actions,data);
 assert.equal(ctx.kind,"compatible");assert.deepEqual(ctx.allowedDifficulties,r.allowedDifficulties);
 assert(r.commit.every(k=>g.active(rr.world,k)));assert(!rr.trace.some(t=>t.added?.some(k=>r.avoid.includes(k))));
 assert.equal(member(rr.world).state.soldierType,r.body);
 assert.deepEqual(g.finish(rr.world).raw,r.rawAtBirth);
 const grown=g.grow({world:rr.world,steps:[]});assert.deepEqual(g.finish(grown.world).vector,r.vector);
 return {r,root:{actions:[]},birth:r.actions,world:rr.world};
}
