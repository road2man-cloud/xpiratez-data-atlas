// Lift an already closed CAP_TARGET graph to a larger, independent-stat
// partial-growth model by a forward simulation, NOT by enumerating the
// Cartesian product of intermediate stats. The resulting Pareto frontier
// is exact for this explicit model, not unrestricted actual gameplay.
import fs from "node:fs";
import zlib from "node:zlib";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {STAT_KEYS,statChangeEngineEstimate} from "../public/soldiers/modern/eligibility.js";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
import {createClosureModel,assertClosed} from "./population-closure-core.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex"),key=x=>sha(JSON.stringify(x)),decode=b=>JSON.parse(zlib.gunzipSync(b));
const arg=(k,d)=>process.argv.find(s=>s.startsWith("--"+k+"="))?.slice(k.length+3)??d;
const registry=decode(fs.readFileSync("public/data/branch-soldier-results.json.gz")),data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const sourcePath=arg("closure","population-closure.json.gz"),sourceBytes=fs.readFileSync(sourcePath),a=decode(sourceBytes),v=registry.populationSearch.versions.D3,snapBytes=fs.readFileSync("public/data/"+v.file);
assert.equal(sha(snapBytes),v.sha256);assert.equal(a.sourceD3Sha256,v.sha256);assert.equal(a.sourceMetadataSha256,registry.sourceMetadataSha256);assert.equal(data.meta.source.metadataSha256,a.sourceMetadataSha256);
const fileHash=p=>sha(fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"));
for(const [p,h] of Object.entries(a.hashes))assert.equal(fileHash(p),h,"Closure engine drift "+p);
const hashes={...a.hashes,"tools/build-population-partial-growth-proof.mjs":fileHash("tools/build-population-partial-growth-proof.mjs")};
const fingerprint=key(["PARTIAL_CAP_BOX_FORWARD_SIMULATION_V1",a.fingerprint,hashes]);
const model=createClosureModel(data,decode(snapBytes)),rules=model.rules,bodyMap=model.bodies;
assert.equal(a.rules.join(),rules.map(r=>r.id).join());
const bravery=STAT_KEYS.indexOf("bravery"),health=STAT_KEYS.indexOf("health");
const lattice=(i,x)=>i===bravery?x%10===0:true;
const floor=i=>i===health?1:0;
const object=v=>Object.fromEntries(STAT_KEYS.map((k,i)=>[k,v[i]]));
const started=performance.now(),metrics={closedGroups:0,certifiedGroups:0,blockedGroups:0,contexts:0,ruleContexts:0,scalarValues:0,engineEvaluations:0,tableHits:0,upperChecks:0,randomExcludedRuleContexts:0,coveredStateReferences:0};
// Structural facts used by the simulation. Required max defaults to 9999
// in current-mode gates. No selective erasers; presence quotient is unchanged.
assert(rules.every(r=>r.requiredMaxStats==null&&!r.includeBonusesForMaxStats),"Explicit upper-stat gates require separate simulation");
for(const b of data.soldiers)for(const k of ["minStats","maxStats","statCaps","trainingStatCaps"]){assert(Number.isSafeInteger(b[k].bravery)&&b[k].bravery%10===0,"Bravery lattice violated");}
for(const b of data.soldiers)for(const k of STAT_KEYS)assert(b.trainingStatCaps[k]<=b.statCaps[k],"Training cap exceeds combat cap");
for(const p of data.profiles)for(const root of model.initial(p))assert(root[5][bravery]%10===0&&root[6][bravery]%10===0);
const caps=STAT_KEYS.map((k,i)=>Math.max(floor(i),...data.soldiers.map(b=>b.statCaps[k])));
for(const g of a.groups)if(g.closed)for(const id of g.ids)for(let i=0;i<STAT_KEYS.length;i++)caps[i]=Math.max(caps[i],a.nodes[id].state[6][i]);
assert(caps.every((v,i)=>Number.isSafeInteger(v)&&v<=9999&&lattice(i,v)));
const tables=new Map();
// Each stat formula in statChangeEngineEstimate uses only the matching
// current/initial stat, body, and rule. A single vector evaluation samples
// twelve independent scalar functions simultaneously. For each reachable
// upper value x require f(x) >= f(y) for ALL y <= x on the valid lattice.
// This is weaker than global monotonicity and safe even for some oscillating
// functions. We use the actual numeric engine, not a separately rounded formula.
function table(body,ini,ri){
 const tk=key([body,ini,ri]);let t=tables.get(tk);if(t){metrics.tableHits++;return t;}
 const r=rules[ri],to=bodyMap.get(r.producedSoldierType||body);
 if(!to||!deterministicRule(r,[to])){tables.set(tk,{outside:true});return tables.get(tk);}
 const values=STAT_KEYS.map(()=>new Map()),maxima=STAT_KEYS.map(()=>-Infinity);
 const steps=Math.max(...caps.map((v,i)=>Math.floor((v-floor(i))/(i===bravery?10:1))));
 for(let j=0;j<=steps;j++){
  const xs=caps.map((v,i)=>Math.min(v,floor(i)+j*(i===bravery?10:1)));
  const est=statChangeEngineEstimate(r,{soldierType:body,currentStats:object(xs),initialStats:object(ini)},data);
  metrics.engineEvaluations++;
  for(let i=0;i<STAT_KEYS.length;i++){
   const x=xs[i];if(values[i].has(x))continue;
   const y=est.stats[STAT_KEYS[i]];assert(Number.isSafeInteger(y),"Noninteger transformation result");
   const previous=maxima[i];maxima[i]=Math.max(previous,y);
   values[i].set(x,maxima[i]-y);metrics.scalarValues++;
  }
 }
 t={outside:false,values};tables.set(tk,t);return t;
}
const proofs=[];
for(let gi=0;gi<a.groups.length;gi++){
 const g=a.groups[gi];if(!g.closed){proofs.push({group:gi,status:"OPEN_SOURCE_CLOSURE"});continue;}
 metrics.closedGroups++;
 assertClosed(g,a.nodes,model);
 const mask=BigInt("0x"+g.mask),contexts=new Map();
 for(const id of g.ids){
  const s=a.nodes[id].state,ck=key([s[0],s[5]]);let c=contexts.get(ck);
  if(!c){c={body:s[0],ini:s[5],values:STAT_KEYS.map(()=>new Set())};contexts.set(ck,c);}
  for(let i=0;i<STAT_KEYS.length;i++){
   assert(Number.isSafeInteger(s[6][i])&&s[6][i]>=floor(i)&&s[6][i]<=9999&&lattice(i,s[6][i]));
   c.values[i].add(s[6][i]);
  }
 }
 let blocked=null,checks=0,ruleContexts=0,outside=0;
 for(const c of contexts.values()){
  for(const ri of model.byBody.get(c.body)||[]){
   if(!(mask&model.bits[ri]))continue;
   const t=table(c.body,c.ini,ri);ruleContexts++;
   if(t.outside){outside++;continue;}
   for(let i=0;i<STAT_KEYS.length;i++)for(const x of c.values[i]){
    const gap=t.values[i].get(x);assert(Number.isSafeInteger(gap)&&gap>=0);
    checks++;
    if(gap>0&&!blocked)blocked={body:c.body,rule:rules[ri].id,stat:STAT_KEYS[i],initial:c.ini[i],upper:x,lowerOutputExceedsUpperBy:gap};
   }
  }
 }
 metrics.contexts+=contexts.size;metrics.ruleContexts+=ruleContexts;metrics.upperChecks+=checks;metrics.randomExcludedRuleContexts+=outside;
 const proof={group:gi,closureHash:g.closureHash,status:blocked?"SIMULATION_NOT_PROVED":"PARTIAL_CAP_BOX_PARETO_EXACT",contexts:contexts.size,ruleContexts,scalarUpperChecks:checks,excludedRandomRuleContexts:outside,blocker:blocked,frontierHash:key(g.frontier)};
 if(blocked)metrics.blockedGroups++;else{metrics.certifiedGroups++;metrics.coveredStateReferences+=g.ids.length;}
 proofs.push(proof);
}
const pairStatus=[],representatives=new Map(),pairReceipts=[];
let direct=0,equivalent=0,partial=0,unmodeled=0;
for(let pi=0;pi<a.pairGroups.length;pi++){
 const gs=a.pairGroups[pi];
 if(!gs.length){pairStatus.push("UNMODELED");unmodeled++;continue;}
 if(!gs.every(i=>proofs[i].status==="PARTIAL_CAP_BOX_PARETO_EXACT")){pairStatus.push("PARTIAL_OR_UNPROVED");partial++;continue;}
 const sig=gs.slice().sort((x,y)=>x-y).join(",");
 if(representatives.has(sig)){equivalent++;pairStatus.push("LIMITED_EQUIVALENT");}
 else{direct++;representatives.set(sig,pi);pairStatus.push("LIMITED_DIRECT");}
 pairReceipts.push([pi,gs,representatives.get(sig)]);
}
const scope={model:"PARTIAL_CAP_BOX_FORWARD_SIMULATION_V1",included:["observed fixed-active research","two original birth vectors","same deterministic healthy no-clone non-retiring transforms","any independent integer partial growth up to ordinary combat cap; bravery in increments of ten","unlimited conditional resources","unbounded action depth"],excluded:a.scope.excluded.filter(x=>x!=="partial combat growth and special training growth").concat(["growth overshoot and training beyond ordinary combat caps","actual event timing, rank, medals and resource feasibility"]),theorem:["Every partial-box growth successor is dominated by the full-cap successor of a dominating state with the same discrete state and initial vector.","All min-stat gates are monotone at fixed bonuses; no explicit max-stat gates exist and all upper representatives satisfy the default 9999 maximum.","At every reachable representative upper value, the actual deterministic transformation output dominates every lower lattice input. Bravery lattice is preserved by rounded changes, bounds and deterministic rerolls.","The full-cap graph is closed. By induction each reachable partial-growth state is dominated by a state of the closed graph with identical discrete fields and initial vector.","Full-cap actions are included in the partial box, so the closed graph is also a subset of the enlarged model. Its per-body nondominated effective vectors are exactly the enlarged model frontier."],notClaimed:"This proves a numerical model with independent within-cap growth, not actual attainable combat/training timing or full-game optimum."};
const summary={pairCount:a.summary.pairCount,fullCompleted:0,actualGameCertified:0,globalOptimalCertified:0,limitedDirect:direct,limitedEquivalent:equivalent,limitedClosed:direct+equivalent,partialOrUnproved:partial,unmodeled,groups:a.groups.length,certifiedGroups:metrics.certifiedGroups,blockedGroups:metrics.blockedGroups,openGroups:a.summary.openGroups,elapsedSeconds:(performance.now()-started)/1000,scalarTables:tables.size,metrics};
const out={schemaVersion:1,kind:"POPULATION_PARTIAL_GROWTH_PROOF",fingerprint,hashes,sourceMetadataSha256:a.sourceMetadataSha256,closureFingerprint:a.fingerprint,closureSha256:sha(sourceBytes),sourceD3Sha256:a.sourceD3Sha256,pairMapHash:a.pairMapHash,scope,proofs,pairStatus,pairReceipts,summary};
const output=arg("out","population-partial-growth-proof.json.gz");fs.writeFileSync(output+".tmp",zlib.gzipSync(Buffer.from(JSON.stringify(out)),{level:6}));fs.renameSync(output+".tmp",output);console.log(JSON.stringify(summary));
