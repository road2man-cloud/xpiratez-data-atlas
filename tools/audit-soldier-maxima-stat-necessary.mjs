// Necessary stat-gate bounds for published maximum candidates.
// Overestimates by granting a soldier every stat cap at the start, and all
// other selected transformations in the most favourable order without needing
// the other gates. A deficit therefore means the ADVERTISED BUILD ALONE
// cannot satisfy a minimum; it may still be bridged by a separately proven
// medal, other unselected transformation, initial overcap, or non-modelled gain.
// Never use this as proof of an absolute campaign impossibility.
import fs from "node:fs";
import assert from "node:assert/strict";
const d=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const report=JSON.parse(fs.readFileSync("public/data/soldier-research-maxima-20261101.json","utf8"));
const KEYS=report.statKeys;
const bySoldier=new Map(d.soldiers.map(s=>[s.id,s]));
const byTraining=new Map(d.transformations.map(t=>[t.id,t]));
const byBonus=new Map(d.bonuses.map(b=>[b.id,b]));
const n=x=>Number(x||0);
function optimisticBound(soldier,selected,excluded,key){
  // Legitimate base gains are usually LESS than statCaps; using the cap
  // even for untrainable types makes this an intentionally generous limit.
  let raw=Math.max(n(soldier.statCaps?.[key]),n(soldier.maxStats?.[key]),
    n(soldier.trainingStatCaps?.[key]));
  const initial=raw;
  let gainedBonus=0, ignoredNegativeBonus=0;
  const withCandidateExcluded=selected.filter(t=>t.id!==excluded.id);
  // Sum a positive bonus at most once per underlying ID; negative bonuses
  // can only lower the upper bound and are ignored.
  const counted=new Set();
  for(const t of withCandidateExcluded){
    const bonus=t.soldierBonusType;
    if(bonus&&!counted.has(bonus)){
      counted.add(bonus);
      const b=n(byBonus.get(bonus)?.stats?.[key]);
      if(b>0)gainedBonus+=b;
      if(b<0)ignoredNegativeBonus+=b;
    }
  }
  // Compensate for all possible sequence orders: each rule is assigned a
  // positive delta at an inflated base cap, then all are summed.
  const inflation=withCandidateExcluded.reduce((sum,t)=>{
    const fixed=Math.max(0,n(t.flatOverallStatChange?.[key])+
      n(t.flatMax?.[key]));
    const percent=Math.max(0,n(t.percentOverallStatChange?.[key]))+
      Math.max(0,n(t.percentMax?.[key]))+
      Math.max(0,n(t.percentGainedStatChange?.[key]))+
      Math.max(0,n(t.percentGainedMax?.[key]));
    return sum+fixed+raw*percent/100;
  },0);
  const exaggeratedMagnitude=Math.max(raw+inflation,100);
  // Consider unbounded transforms first so capped ones cannot falsely add
  // above a cap; a bounded rule may recover to cap after a negative event.
  for(const t of withCandidateExcluded){
    if(t.rerollStats?.[key])raw=Math.max(raw,n(soldier.maxStats?.[key]));
    const fixed=Math.max(0,n(t.flatOverallStatChange?.[key])+n(t.flatMax?.[key]));
    const percent=Math.max(0,n(t.percentOverallStatChange?.[key]))+
      Math.max(0,n(t.percentMax?.[key]))+
      Math.max(0,n(t.percentGainedStatChange?.[key]))+
      Math.max(0,n(t.percentGainedMax?.[key]));
    // Pessimistic? No. Approximation MUST err toward a larger upper bound.
    const delta=fixed+Math.ceil(exaggeratedMagnitude*percent/100);
    if(t.upperBoundAtStatCaps||t.upperBoundAtMaxStats){
      const cap=t.upperBoundAtMaxStats?n(soldier.maxStats?.[key]):n(soldier.statCaps?.[key]);
      raw=Math.max(raw,Math.min(cap,raw+delta));
    }else raw+=delta;
  }
  const include=excluded.includeBonusesForMinStats!==false;
  // psiSkill special OXCE gate keeps effective skill=0 when base skill=0.
  const effective=include?
    key==="psiSkill"&&raw<=0?raw:raw+gainedBonus:raw;
  return {key,rawCeiling:raw,selectedBonusCeiling:gainedBonus,
    ignoredNegativeBonus,effectiveCeiling:effective,
    initialGenerousCeiling:initial,includesSoldierBonuses:include};
}
const rows=[];
for(const row of report.rows){
  const soldier=bySoldier.get(row.id);
  assert(soldier,"Missing base profile "+row.id);
  const selected=row.transformations.map(id=>{
    const t=byTraining.get(id);assert(t,"Missing source "+id);return t;
  });
  const deficits=[];
  for(const t of selected){
    for(const key of KEYS){
      const required=n(t.requiredMinStats?.[key]);
      if(!required)continue;
      const b=optimisticBound(soldier,selected,t,key);
      // The local proof should never be driven by optimistic percentage
      // estimation. The four current deficits involve zero percentage
      // changes, so the capped fixed-delta bound is unambiguous.
      const sources=selected.filter(other=>other.id!==t.id);
      const percentSafe=sources.every(other=>
        ["percentOverallStatChange","percentMax","percentGainedStatChange",
         "percentGainedMax"].every(field=>n(other[field]?.[key])===0));
      if(b.effectiveCeiling<required&&percentSafe)deficits.push({training:t.id,key,
        required,ceiling:b.effectiveCeiling,shortfall:required-b.effectiveCeiling,
        ...b,proof:"ZERO_PERCENT_AND_ALL_SELECTED_FIXED_GAINS_INCLUDED",
        reason:"ADVERTISED_TRANSFORMATIONS_ONLY"});
    }
    if(soldier.allowPromotion===false&&n(t.minRank)>0)
      deficits.push({training:t.id,key:"rank",required:n(t.minRank),
        ceiling:0,shortfall:n(t.minRank),
        reason:"SOLDIER_TYPE_DISABLES_PROMOTION"});
  }
  rows.push({id:row.id,score:row.score,
    noSelectedOnlyDeficitDetected:!deficits.length,
    selectionNeedsExternalStatSource:deficits.length>0,
    deficits});
}
const result={schemaVersion:1,kind:"SOLDIER_MAXIMA_NECESSARY_STAT_GATES",
  scope:"Generous cap-bounded, selected-transformations-only necessary test. No medals, armors, stat-raising unselected transformations, save evidence or actual research execution. A deficit is evidence of a MISSING EXTERNAL SOURCE, not a universal impossibility.",
  methods:["start at max(creationMax,statCaps,trainingStatCaps) for every stat, even where impractical",
    "grant every other chosen positive permanent bonus in advance, ignoring negative bonuses and required order",
    "grant every other chosen positive unbounded raw change and clamp cap-bound changes",
    "calculate all requiredMinStats including includeBonusesForMinStats, special psiSkill gate",
    "only report a shortfall if all other selected transformations have ZERO percent changes in the target stat",
    "no lower gate, random invalidation, event research, medal, item, history or rank progression certification"],
  summary:{classes:rows.length,externallyDependent:rows.filter(r=>r.selectionNeedsExternalStatSource).length,
    deficits:rows.reduce((n,x)=>n+x.deficits.length,0)},
  rows};
assert(rows.length===29);
if(process.argv.includes("--json"))process.stdout.write(JSON.stringify(result));
else{console.log("STAT NECESSARY GATES",JSON.stringify(result.summary));
  for(const row of rows.filter(x=>x.deficits.length))
    console.log(row.id,row.score,JSON.stringify(row.deficits.map(x=>({
      training:x.training,stat:x.key,required:x.required,generousCeiling:x.ceiling,shortfall:x.shortfall}))));
}
