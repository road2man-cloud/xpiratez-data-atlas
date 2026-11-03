// Source-bound, non-certifying 12-stat comparison for Warrior Summoning.
 // Do NOT promote growth envelopes to save-verified simultaneous maxima.
import fs from "node:fs";
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {bonusStats} from "../public/soldiers/modern/eligibility.js";
import {createStatEnvelope} from "../public/soldiers/modern/stat-envelope.js";
import {growStatEnvelope as grow} from "../public/soldiers/modern/growth-envelope.js";
import {replayOriginWitness} from "../public/soldiers/modern/origin-witness.js";

const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const ORDER=["tu","stamina","health","bravery","reactions","firing","throwing",
  "melee","strength","psiStrength","psiSkill","mana"];
const SOURCES=[
  "manufacture:STR_ZONE_STALKER_RECRUITMENT",
  "manufacture:STR_OGRE_SPY_RECRUITMENT"
];
const pick=v=>Object.fromEntries(ORDER.map(k=>[k,Number(v?.[k]||0)]));
const sum=v=>ORDER.reduce((s,k)=>s+Number(v?.[k]||0),0);
const maxByStats=(bounds,state,data)=>{
  const traits=bonusStats(state,data);
  return Object.fromEntries(ORDER.map(k=>[k,Math.max(k==="health"?1:0,
    Number(bounds.high[k])+Number(traits[k]||0))]));
};
function calculateGrowth(state,origin,data){
  const source=createStatEnvelope(data,origin,{state});
  assert.equal(source.kind,"ready");
  const physical=grow(source,state,data,"@PHYS_TRAINING");
  assert.equal(physical.kind,"ready");
  const battle=grow(physical,state,data,"@BATTLE_GROWTH");
  assert.equal(battle.kind,"ready");
  return {start:pick(source.high),physical:pick(physical.high),
    upper:maxByStats(battle,state,data),traits:pick(bonusStats(state,data))};
}
export function buildSummonEndgameComparison(){
  const data=read("public/data/soldiers-modern-index.json");
  const registry=read("public/data/soldier-origin-candidates.json");
  const sourceCatalog=read("public/data/soldier-source-catalog.json");
  assert.equal(data.meta.mod.version,"v.o2");
  assert.equal(registry.sourceVersion,"v.o2");
  assert.deepEqual(data.meta.source.rules,registry.sourceHashes);
  assert.deepEqual(data.meta.source.rules,sourceCatalog.sourceHashes);
  assert.equal(registry.summary.certifiedMaxima,0);
  data.sourceItemIds=new Set(sourceCatalog.itemIds);
  data.originRows=registry.records.map(r=>r.sourceProof);
  const profiles=[];
  for(const id of SOURCES){
    const p=data.profiles.find(x=>x.id===id);
    const rec=registry.records.find(x=>x.profileId===id);
    assert(p&&rec&&rec.candidates.length>=1);
    const candidates=[];
    for(const c of rec.candidates){
      const replay=replayOriginWitness(c.steps,data);
      assert(replay.ok&&replay.exact&&replay.certifiedMaximum===false,
        id+" witness "+c.id+" failed");
      assert.deepEqual(replay.stats,c.stats);
      assert.equal(replay.total,c.total);
      const member=replay.world.soldiers.find(x=>x.id==="origin");
      assert(member);
      const growth=calculateGrowth(member.state,id,data);
      const effectiveBeforeGrowth=pick({
        ...replay.stats,mana:Number(member.state.currentStats.mana)+Number(growth.traits.mana)
      });
      candidates.push({
        witnessId:c.id,trainingSequence:c.transforms,
        researchSteps:c.researchCount,postTrainingBeforeGrowth:effectiveBeforeGrowth,
        conditionalPostTrainingGrowthUpper:growth.upper,
        conditional12Sum:sum(growth.upper),
        changeFromPostTraining:sum(growth.upper)-sum(effectiveBeforeGrowth),
        evidence:{researchSequenceComplete:c.researchSequenceComplete,
          researchWitnessExact:true,statGrowthExecuted:false,
          rngBirthMaxExplored:false,medalsAdded:false,finalMaximumCertified:false},
        requiredAssumptions:[
          "해당 출생처의 최저 생성값 벡터",
          "후속 체력훈련과 전투 경험치가 모든 능력치 상한에 유리하게 작동",
          "Psi/활력 경험치 성장 및 임무 획득 조건 충족 가정",
          "후속 훈련은 기록된 순서 이후로 추가하지 않음",
          "성장상한 동시 달성·원본 엔진 플레이 실측 및 전역 최대치 미증명"
        ]
      });
    }
    candidates.sort((a,b)=>b.conditional12Sum-a.conditional12Sum||
      a.trainingSequence.length-b.trainingSequence.length||
      a.witnessId.localeCompare(b.witnessId));
    const maxStarting=pick(p.effectiveStats.max);
    profiles.push({
      id,sourceName:p.sourceKoName||p.sourceEnName,
      soldierType:p.soldierType,traitNames:p.traitNames,
      alreadyCompletedTransformations:Object.keys(p.previousTransformations||{}),
      maxStarting,originBirthMinimum:pick(p.effectiveStats.min),
      rawCaps:pick(p.rawStatCaps),effectiveCaps:pick(p.effectiveStatCaps),
      candidateCount:candidates.length,
      bestWitnessCandidate:candidates[0],candidates,
      finalStats:null,finalSum:null,certifiedMaximum:false,
      warning:"기존 완결 연구 경로 후보에서 출생 최솟값으로 시작한 조건부 성장상계. 출생 상위 RNG, 다중 훈련 최적화, 훈장 및 병종 전환 전역 최적값 아님."
    });
  }
  const comparison=Object.fromEntries(ORDER.map(k=>[k,
    profiles[1].bestWitnessCandidate.conditionalPostTrainingGrowthUpper[k]-
    profiles[0].bestWitnessCandidate.conditionalPostTrainingGrowthUpper[k]
  ]));
  return {
    schemaVersion:1,kind:"WARRIOR_SUMMONING_12_STAT_CONDITIONAL_GROWTH_COMPARISON",
    ruleset:"X-Piratez v.o2 / OXCE 8.7.1",
    sourceHashes:data.meta.source.rules,
    registrySourceHash:registry.sourceHash,
    statOrder:ORDER,scope:"REPLAYED_MIN_BIRTH_RESEARCH_WITNESSES_PLUS_FUTURE_GROWTH_ENVELOPE",
    profiles,ogreMinusZone:comparison,
    conditional12SumDifference:sum(profiles[1].bestWitnessCandidate.conditionalPostTrainingGrowthUpper)-
      sum(profiles[0].bestWitnessCandidate.conditionalPostTrainingGrowthUpper),
    certifiedFinalStats:null,certifiedMaxima:0,
    limitations:[
      "Only pre-existing research-chronology-complete origin witnesses are used; no new research flags are fabricated",
      "Growth is an upper envelope and is NOT a replayed sequence of actual battles, experience or training days",
      "The minimum birth band is the only exact branch replayed; the maximum birth RNG band is not optimized",
      "Only existing one-training candidate routes are compared; multi-training permutations, medals and death/body conversion are outside this bounded analysis",
      "The selected best witness can differ from the globally best possible training route; do not advertise a certified maximum",
      "12th stat mana is recomputed from the same final soldier bonus and OXCE growth envelope, not stitched from another cap table"
    ]
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(buildSummonEndgameComparison(),null,2)+"\n");
