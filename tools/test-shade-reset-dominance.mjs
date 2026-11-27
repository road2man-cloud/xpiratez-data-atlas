// Source-bound regression using archived chronological witnesses.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync} from "node:zlib";
import {createSharedCareerReplay} from "./population-shared-lifecycle-replay.mjs";
import {createBodyCareerScope} from "./atlas-body-career-scope-v3-passive-armor.mjs";
import {createShadeResetProof} from "./atlas-shade-reset-dominance.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
const j=p=>JSON.parse(fs.readFileSync(p)),gz=p=>JSON.parse(gunzipSync(fs.readFileSync("public/data/"+p+".json.gz")));
const d=gz("branch-soldier-results"),l=gz("soldier-population-missing-origin-career"),data={...j("public/data/soldiers-modern-index.json"),originRows:j("public/data/soldier-acquisition-progression-20261102.json").rows,sourceItemIds:new Set(j("public/data/soldier-source-catalog.json").itemIds)};
const replay=createSharedCareerReplay(data,l.summary),scope=createBodyCareerScope(data,d.branches,replay),p=createShadeResetProof(data,replay,scope);
for(const [gid,i] of [["9a2734eb7f9dab3ded51a2b326df2e0b6c38f7fef80e8265960c787d0f2236e9",500],["44d40acc4f1c534c20e694ff285cc2c6c3087a51d8af74dd3cf12f580ab93acc",711]]){
 const g=l.graphs[gid],stack=[];let n=i;
 while(n){stack.push(g.nodes[n].steps);n=g.nodes[n].parent;}
 const w=replay.replay([...g.birthActions,...stack.reverse().flat()]),s=member(w).state,f=replay.finish(w),b=d.branches.find(x=>x.id===g.branch);
 assert.equal(exactWorld(w),g.nodes[i].stateHash);
 const inputs={body:f.body,history:new Set(s.history.keys()),historyKnown:s.historyKnown!==false,active:new Set([...w.researched].filter(k=>!w.disabled.has(k))),raw:f.raw,capRaw:f.capRaw,finite:d.careerCompletion.materialBudget.finite,consumed:{}};
 const q=scope.assess(inputs,b,w),proof=p.prove(q,inputs,b,w);
 assert(proof?.evidence.strictlyWorse&&proof.evidence.scalarBounds.every(x=>x.successorUpper<=x.max));
 assert(!p.canAttempt({...q,open:[...q.open,{id:"OTHER"}]},inputs));
 assert(!p.canAttempt({...q,openGrowth:true},inputs));
 assert(!p.canAttempt({...q,open:q.open.map(x=>({...x,missingResearch:["MISSING"]}))},inputs));
}
console.log(JSON.stringify({passed:2,stats:p.stats}));
