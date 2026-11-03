import assert from "node:assert/strict";
import fs from "node:fs";
import {buildSummonEndgameComparison} from "./build-soldier-summon-endgame-compare.mjs";

const fromDisk=JSON.parse(fs.readFileSync(
  "public/data/soldier-summon-endgame-compare.json","utf8"));
const recalculated=buildSummonEndgameComparison();
assert.deepEqual(fromDisk,recalculated,
  "Conditional 12-stat comparison must exactly reproduce from current source rules");
assert.equal(fromDisk.schemaVersion,1);
assert.equal(fromDisk.profiles.length,2);
assert.equal(fromDisk.statOrder.length,12);
assert(new Set(fromDisk.statOrder).size===12);
assert.equal(fromDisk.certifiedMaxima,0);
assert.equal(fromDisk.certifiedFinalStats,null);
const [zone,ogre]=fromDisk.profiles;
assert.equal(zone.id,"manufacture:STR_ZONE_STALKER_RECRUITMENT");
assert.equal(ogre.id,"manufacture:STR_OGRE_SPY_RECRUITMENT");
assert(zone.alreadyCompletedTransformations.includes("STR_LONE_WOLF"));
for(const profile of fromDisk.profiles){
  assert.equal(profile.candidateCount,profile.candidates.length);
  assert(profile.candidateCount>=3);
  assert.equal(profile.finalStats,null);
  assert.equal(profile.finalSum,null);
  assert.equal(profile.certifiedMaximum,false);
  for(const c of profile.candidates){
    assert.equal(c.evidence.researchSequenceComplete,true);
    assert.equal(c.evidence.researchWitnessExact,true);
    assert.equal(c.evidence.statGrowthExecuted,false);
    assert.equal(c.evidence.finalMaximumCertified,false);
    assert.equal(c.conditional12Sum,
      fromDisk.statOrder.reduce((s,k)=>s+c.conditionalPostTrainingGrowthUpper[k],0));
  }
  assert.equal(profile.bestWitnessCandidate.conditional12Sum,
    Math.max(...profile.candidates.map(c=>c.conditional12Sum)));
}
assert.equal(zone.bestWitnessCandidate.conditional12Sum,1237);
assert.equal(ogre.bestWitnessCandidate.conditional12Sum,1351);
assert.equal(fromDisk.conditional12SumDifference,114);
assert.equal(fromDisk.ogreMinusZone.health,66);
assert.equal(fromDisk.ogreMinusZone.strength,60);
assert.equal(fromDisk.ogreMinusZone.mana,-51);
assert.equal(fromDisk.ogreMinusZone.psiSkill,-40);
console.log("PASS source-checked Warrior Summoning 12-stat comparison:",
  zone.bestWitnessCandidate.conditional12Sum,ogre.bestWitnessCandidate.conditional12Sum,
  "both conditional, 0 false maxima.");
