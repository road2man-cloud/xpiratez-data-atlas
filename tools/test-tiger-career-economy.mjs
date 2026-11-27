// Regression on a fully replayed madgal route. The reward is retained in
// exact world replay and omitted only from the scoped soldier objective.
import fs from "node:fs";
import assert from "node:assert/strict";
import {gunzipSync} from "node:zlib";
import {createSharedCareerReplay} from "./population-shared-lifecycle-replay.mjs";
import {createBodyCareerScope as oldScope} from "./atlas-body-career-scope-v3-passive-armor.mjs";
import {createBodyCareerScope,TIGER_POLICY} from "./atlas-body-career-scope-v4-tiger-economy.mjs";
import {exactWorld,member} from "./population-growth-replay-core.mjs";
const j=p=>JSON.parse(fs.readFileSync(p)),gz=p=>JSON.parse(gunzipSync(fs.readFileSync("public/data/"+p+".json.gz")));
const d=gz("branch-soldier-results"),l=gz("soldier-population-missing-origin-career"),data={...j("public/data/soldiers-modern-index.json"),originRows:j("public/data/soldier-acquisition-progression-20261102.json").rows,sourceItemIds:new Set(j("public/data/soldier-source-catalog.json").itemIds)};
const replay=createSharedCareerReplay(data,l.summary),scope=createBodyCareerScope(data,d.branches,replay);
const gid="608e53930f171e69afad37252866f35729bebba448ae073010576c3bb13c5794",g=l.graphs[gid],i=47,stack=[];let n=i;
while(n){stack.push(g.nodes[n].steps);n=g.nodes[n].parent;}
const w=replay.replay([...g.birthActions,...stack.reverse().flat()]),s=member(w).state,f=replay.finish(w),b=d.branches.find(x=>x.id===g.branch);
assert.equal(exactWorld(w),g.nodes[i].stateHash);
const inputs={body:f.body,history:new Set(s.history.keys()),historyKnown:s.historyKnown!==false,active:new Set([...w.researched].filter(k=>!w.disabled.has(k))),raw:f.raw,capRaw:f.capRaw,finite:d.careerCompletion.materialBudget.finite,consumed:{}};
const prior=oldScope(data,d.branches,replay).assess(inputs,b,w);
assert(prior.open.some(x=>x.id==="STR_TIGER_TOURS"));
const q=scope.assess(inputs,b,w),t=q.repeats.find(x=>x.id==="STR_TIGER_TOURS");
assert(t?.evidence?.economicReward?.policy===TIGER_POLICY);
assert.equal(t.evidence.economicReward.netFunds,90000);
assert.equal(t.evidence.economicReward.transferHours,2400);
assert(q.possibleExact);
const cycle=scope.proveCapCycle(inputs,b,w);
console.log(JSON.stringify({open:q.open.map(x=>x.id),repeat:q.repeats.map(x=>x.id),tiger:t.evidence.economicReward,cycle:cycle&&{states:cycle.states.length,edges:cycle.edges.length,allSuccessorsCovered:cycle.allSuccessorsCovered,rewardEdges:cycle.edges.filter(x=>x.economicReward).length},stats:scope.stats}));
assert(cycle?.allSuccessorsCovered);
const altered=structuredClone(inputs);altered.openGrowth=true;altered.raw[0]--;
assert(scope.assess(altered,b).openGrowth);
console.log("Tiger fixed-body cycle and growth gate passed");
