import assert from "node:assert/strict";
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {createCareerParetoSearch} from "./population-career-pareto-search-v5.mjs";
const stats=n=>Object.fromEntries(STAT_KEYS.map(k=>[k,n])),v=n=>STAT_KEYS.map(()=>n);
const body={id:"BODY",statCaps:stats(10),minStats:stats(1),maxStats:stats(10)};
const r={id:"RULE",allowedSoldierTypes:["BODY"],requires:[],soldierBonusType:"BONUS",flatOverallStatChange:stats(1),upperBoundAtStatCaps:true};
const terminalRule={targets:[{id:"END",researchGoals:["FINISH"]}]},b={id:"BRANCH",blockedResearch:[]};
const g={origin:"ORIGIN",branch:b.id,allowedDifficulties:[0,1]},n={body:body.id,raw:v(2),traits:[],stateHash:"state"};
function make({value=15,goals=["END"],difficulties=[0,1],extraRules=[],rows=true}={}){
 const data={soldiers:[body],bonuses:[{id:"BONUS",stats:stats(1)},{id:"A",stats:stats(3)},{id:"B",stats:stats(5)}]},pair={origin:g.origin,branch:g.branch,body:body.id,difficulties},record={pairId:"P",current:v(value),cap:v(value),goals};
 return createCareerParetoSearch({db:{sourceMetadataSha256:"synthetic-test",careerCompletion:{rows:rows?[{id:"P",proofKind:"REPLAYED_RESEARCH_LINE_V1"}]:[],researchTraitSets:{pairs:{P:pair},records:{W:record}}}},data,byBody:new Map([[body.id,[r,...extraRules]]]),commit:()=>[],allChoice:new Set(),terminalRule});
}
const x={id:"GRAPH",g,b,n,r,i:0,projectedCap:v(11)};
const safe=make(),proof=safe.prove(x,stats(1),["END"]);
assert(proof);assert.equal(proof.witnesses[0].witness,"W");
assert.deepEqual(proof.witnesses[0].upper,v(11));
assert.equal(make({value:9}).prove(x,stats(1),["END"]),null);
assert.equal(make({difficulties:[0]}).prove(x,stats(1),["END"]),null);
assert.equal(make({rows:false}).prove(x,stats(1),["END"]),null);
const unbounded={id:"OPEN",allowedSoldierTypes:["BODY"],requires:[],flatOverallStatChange:stats(1)};
const open=make({extraRules:[unbounded]});
assert.equal(open.prove(x,stats(1),["END"]),null);assert.equal(open.metrics.openBounds,1);
const s=make();assert(s.score({...x,projectedCap:v(18)})>s.score(x));
console.log(JSON.stringify({boundedPrune:proof.witnesses[0],unboundedFailsOpen:open.metrics.openBounds,admittedOnly:true,missingDifficultyFailsOpen:true,priorityWorks:true}));

const a={id:"A_RULE",allowedSoldierTypes:["BODY"],requires:[],soldierBonusType:"A",forbiddenPreviousTransformations:["A_RULE","B_RULE"],upperBoundAtStatCaps:true};
const bRule={id:"B_RULE",allowedSoldierTypes:["BODY"],requires:[],soldierBonusType:"B",forbiddenPreviousTransformations:["A_RULE","B_RULE"],upperBoundAtStatCaps:true};
const mutual=make({value:16,extraRules:[a,bRule]});const m=mutual.prove(x,stats(1),["END"],[]);assert(m);assert.deepEqual(m.witnesses[0].upper,v(16));assert(mutual.metrics.mutualExclusionSavings>0);assert(mutual.reuse(m,x));assert.equal(mutual.reuse({...m,stateHash:"wrong"},x),false);
const reset={id:"RESET",allowedSoldierTypes:["BODY"],requires:[],reset:true,upperBoundAtStatCaps:true};assert.equal(make({value:16,extraRules:[a,bRule,reset]}).prove(x,stats(1),["END"],[]),null);
const history=make({value:14,extraRules:[a,bRule]});const h=history.prove(x,stats(1),["END"],["A_RULE"]);assert(h);assert.deepEqual(h.witnesses[0].upper,v(11));
console.log(JSON.stringify({mutualExclusionBound:m.witnesses[0].upper,resetFailsOpen:true,immutableHistoryBound:h.witnesses[0].upper,receiptReused:true}));

// Neither incumbent covers the combined coordinate-wise maximum, yet
// the union of the two incumbent orthants covers every relaxed option.
const {coverBonusProduct}=await import("./population-pareto-vector-cover.mjs");
const refs=[{id:"A",current:[16,10],cap:[16,10]},{id:"B",current:[10,16],cap:[10,16]}];
const args={base:[10,10],groups:[[[6,0],[0,6]]],refs,ceiling:[16,16],minimum:[0,0]};
const cover=coverBonusProduct(args);
assert(cover.covered);assert.equal(cover.proofs.length,2);
assert.equal(coverBonusProduct({...args,refs:refs.slice(0,1)}).covered,false);
assert.equal(coverBonusProduct({...args,maxVisits:1}).covered,false);
assert.equal(coverBonusProduct({...args,expired:()=>true}).covered,false);
const req={...a,id:"UNSEEDED",requiredPreviousTransformations:["MISSING"]};
const locked=make({value:11,extraRules:[req]});assert(locked.prove(x,stats(1),["END"],[]));assert(locked.metrics.missingHistoryExcluded>0);
console.log(JSON.stringify({splitCover:cover.proofs.map(p=>[p.witness.id,p.upper]),missingCornerFailsOpen:true,budgetFailsOpen:true,missingHistoryExcluded:locked.metrics.missingHistoryExcluded}));

const {coverHistoryDAG}=await import("./population-pareto-history-dag.mjs");
const aa={id:"A",soldierBonusType:"A",forbiddenPreviousTransformations:["A","B"]},bb={id:"B",soldierBonusType:"B",forbiddenPreviousTransformations:["A","B"]};
const dd={rules:[aa,bb],history:[],bonuses:[],rawStart:[10,10],bonusVector:id=>id==="A"?[6,0]:[0,6],minimum:[0,0],refs,transition:(r,v)=>v};
const dag=coverHistoryDAG(dd);assert(dag.covered);assert.equal(dag.metrics.states,3);
assert.equal(coverHistoryDAG({...dd,maxStates:2}).covered,false);
assert.equal(coverHistoryDAG({...dd,refs:refs.slice(0,1)}).covered,false);
const repeatRule={id:"R",forbiddenPreviousTransformations:[]};const rep=coverHistoryDAG({...dd,rules:[repeatRule],history:["R"],transition:(r,v)=>v.map(x=>x+1),maxRepeats:4});assert.equal(rep.reason,"REPEAT_NOT_FIXED");
const two={...dd,rules:[{id:"A"},{id:"B"}],bonusVector:()=>[0,0]};const both=coverHistoryDAG(two);assert(both.covered);assert.equal(both.metrics.merges,1);
console.log(JSON.stringify({dagStates:dag.metrics.states,merge:both.metrics.merges,repeatFailsOpen:rep.reason,missingWitnessFailsOpen:true,budgetFailsOpen:true}));

const live=make({value:9}),scoreBefore=live.score(x);
const candidate={id:"NEW_UNADMITTED",origin:g.origin,branch:g.branch,body:body.id,cap:v(30),current:v(30),goals:["END"],difficulties:[0,1]};
assert(live.learn(candidate));assert.equal(live.version(g.origin),1);assert(live.score(x)<scoreBefore);
assert.equal(live.prove(x,stats(1),["END"]),null,"Provisional priority data must never serve as a pruning witness");
assert.equal(live.learn(candidate),false);assert.equal(live.version(g.origin),1);
assert.equal(live.learn({...candidate,id:"WEAK",cap:v(8),current:v(8)}),false);
assert.equal(live.learn({...candidate,id:"CHORT",body:"STR_SOLDIER_CHORT"}),false);
console.log(JSON.stringify({livePriorityChanged:true,proofIsolation:true,duplicateIgnored:true,dominatedNotRescored:true,chortExcluded:true}));
