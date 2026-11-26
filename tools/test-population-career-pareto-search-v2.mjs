import assert from "node:assert/strict";
import {STAT_KEYS} from "../public/soldiers/modern/eligibility.js";
import {createCareerParetoSearch} from "./population-career-pareto-search-v2.mjs";
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
