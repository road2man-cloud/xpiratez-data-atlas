// Compile necessary, branch-specific research constraints. Never promote
// an exclusion from this relaxed indexed model to campaign impossibility.
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync,gzipSync} from "node:zlib";
import {performance} from "node:perf_hooks";
import {createResearchConstraintModel,createActionSubsetBDD} from "./population-research-constraint-core.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex"),key=x=>sha(JSON.stringify(x));
const decode=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const read=p=>JSON.parse(fs.readFileSync(p));
const arg=(k,d)=>process.argv.find(x=>x.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const start=performance.now(),db=decode("public/data/branch-soldier-results.json.gz"),data=read("public/data/soldiers-modern-index.json"),p=db.populationSearch;
const v=p.versions.D3,graphBytes=fs.readFileSync("public/data/"+v.file),graph=JSON.parse(gunzipSync(graphBytes));
assert.equal(sha(graphBytes),v.sha256);assert.equal(data.meta.source.metadataSha256,db.sourceMetadataSha256);
const files=["tools/build-population-research-constraint.mjs","tools/population-research-constraint-core.mjs","public/data/soldiers-modern-index.json","public/soldiers/modern/event-chronology.js","public/soldiers/modern/auto-zero-cascade.js","public/soldiers/modern/campaign-proof.js","public/soldiers/modern/foundation-research-planner.js"];
const hashes=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f,"utf8").replace(/\r\n/g,"\n"))]));
const branches=new Map(db.branches.map(b=>[b.id,b])),rules=data.transformations.filter(r=>!r.requires.includes("STR_UNAVAILABLE")&&!r.producedItem);
assert(rules.every(r=>!r.createsClone));
const model=createResearchConstraintModel(data),bdd=createActionSubsetBDD(rules,model),full=(1n<<BigInt(rules.length))-1n;
const idToRule=new Map(rules.map((r,i)=>[r.id,i])),temp=new Map(),issues=[],bad=new Map();
const flag=(branch,detail)=>{bad.set(branch,(bad.get(branch)||0)+1);if(issues.length<50)issues.push({branch,...detail});};
for(const id of p.branches){
 const b=branches.get(id);assert(b);
 const commitments=[...new Set([...b.captain,...Object.values(b.choices||{}).filter(Boolean)])].sort();
 const a=model.analyze(commitments),mask=bdd.allowedMask(rules,a),root=bdd.build(mask);
 temp.set(id,{commitments,a,mask,root});
 // Self-disabled choices are historical processed flags, not active flags.
 for(const c of commitments)if(!a.isP(c))flag(id,{kind:"COMMITMENT_NOT_PROCESSED",id:c,reason:a.explain(c)});
}
let historyChecks=0,historyConflicts=0,witnessChecks=0,witnessConflicts=0,subsetConflicts=0;
for(const h of graph.histories){
 const t=temp.get(h.branchId);assert(t);
 const m=BigInt("0x"+h.activeMaskHex);
 for(let i=0;i<graph.researchVocabulary.length;i++)if(m&(1n<<BigInt(i))){
  historyChecks++;const id=graph.researchVocabulary[i];
  if(!t.a.isA(id)){historyConflicts++;flag(h.branchId,{kind:"OBSERVED_ACTIVE_RESEARCH_OUTSIDE",history:h.id,id});}
 }
}
// Route witnesses are a consistency screen, not a proof of completeness.
// A conflict fails open for that branch; never delete existing witnesses.
for(const [id,w] of Object.entries(db.witnesses)){
 let mask=0n;
 for(const s of w.steps||[]){const i=idToRule.get(s.id);if(i!==undefined)mask|=bdd.bits[i];}
 if(!mask)continue;
 for(const branch of w.branchIds||[]){
  const t=temp.get(branch);if(!t)continue;
  witnessChecks++;
  if(mask&~t.mask){witnessConflicts++;flag(branch,{kind:"WITNESS_ACTION_OUTSIDE",witness:id,source:w.source});}
  else if(!bdd.accepts(t.root,mask)){subsetConflicts++;flag(branch,{kind:"WITNESS_SUBSET_OUTSIDE",witness:id,source:w.source});}
 }
}
const groups=[],groupMap=new Map(),records=[];let pairExclusions=0,rejected=0,modeled=0;
for(const id of p.branches){
 const t=temp.get(id),fallback=bad.has(id),mask=fallback?full:t.mask,root=fallback?1:t.root;
 const gk=JSON.stringify([mask.toString(16),root]);let gi=groupMap.get(gk);
 if(gi===undefined){gi=groups.length;groupMap.set(gk,gi);groups.push({mask:mask.toString(16),bddRoot:root,branches:[],allowedRules:rules.filter((_,i)=>mask&bdd.bits[i]).map(r=>r.id)});}
 groups[gi].branches.push(id);
 const excluded=rules.filter((_,i)=>!(mask&bdd.bits[i])).map(r=>({rule:r.id,requires:r.requires,reasons:r.requires.map(k=>t.a.explain(k)).filter(Boolean)}));
 rejected+=excluded.length;if(!fallback)modeled++;
 records.push({branch:id,group:gi,commitments:t.commitments,fallback,fallbackCount:bad.get(id)||0,
  activeForbidden:t.a.forbidden,processedForbidden:t.a.impossibleP,conflicts:t.a.conflicts,excluded,
  possibleFlags:Buffer.from(t.a.yes).toString("base64")});
}
for(const x of bdd.conflicts)pairExclusions+=x.toString(2).replace(/0/g,"").length;
assert.equal(pairExclusions%2,0);
const identity=key([db.sourceMetadataSha256,v.sha256,hashes,p.branches,records.map(x=>[x.branch,x.group,x.commitments,x.fallback])]);
const summary={branches:p.branches.length,origins:p.origins.length,pairCount:p.branches.length*p.origins.length,ruleCount:rules.length,
 independentMasks:groups.length,modeledBranches:modeled,failOpenBranches:bad.size,excludedBranchRulePairs:rejected,
 researchTopics:model.ids.length,acquisitionAlternatives:model.edges.length,unknownPrerequisites:model.unknownInputs.length,
 bddNodes:bdd.nodes.length-2,permanentActionPairExclusions:pairExclusions/2,historyChecks,historyConflicts,witnessChecks,witnessConflicts,subsetConflicts,
 metrics:model.metrics,elapsedMs:Math.round(performance.now()-start),globalCompleted:0,globalImpossible:0};
const result={schemaVersion:1,kind:"POPULATION_RESEARCH_NECESSARY_CONSTRAINT",identity,sourceMetadataSha256:db.sourceMetadataSha256,sourceD3Sha256:v.sha256,hashes,
 branches:p.branches,origins:p.origins,rules:rules.map(r=>r.id),topics:model.ids,
 alternatives:model.alternatives,unknownInputs:model.unknownInputs,bdd:{nodes:bdd.nodes,conflictMasks:bdd.conflicts.map(m=>m.toString(16))},
 records,groups,summary,issues,scope:{
  semantics:"Indexed zero-start research model. P=ever processed, A=ever active. Positive-cost branch commitments justify reciprocal lifetime disable constraints. Zero-cost queue can process disabled topics. Self-disabled choices remain processed.",
  relaxed:["resources, time, event RNG and negative gates","unknown-source and free-reward acquisition","protected auto-queue ordering","zero-cost disabled processing","unobserved branch-compatible research histories"],
  exclusions:"Only necessary conditions in the declared model. No claim of complete chronology, real game impossibility or sufficient reachability. A contradiction with existing data fails open."
 }};
const out=arg("out","public/data/soldier-population-research-constraints.json.gz");
fs.writeFileSync(out+".tmp",gzipSync(Buffer.from(JSON.stringify(result)),{level:6}));fs.renameSync(out+".tmp",out);
console.log(JSON.stringify({file:out,sha256:sha(fs.readFileSync(out)),bytes:fs.statSync(out).size,summary,issues:issues.slice(0,5)}));
