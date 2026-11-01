// Audit ALL 29 source-bodies used as theoretical soldier maxima.
// A base soldier type in the ruleset is not necessarily directly recruitable:
// source event/manufacture and type-changing transformation can be required.
// The result lists candidate provenance; it does not certify mission, item,
// money, calendar, rank, or actual save completion.
import fs from "node:fs";
import assert from "node:assert/strict";
const d=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json","utf8"));
const max=JSON.parse(fs.readFileSync("public/data/soldier-research-maxima-20261101.json","utf8"));
const n=x=>Number(x||0);
const rows=max.rows.map(entry=>{
  const s=d.soldiers.find(x=>x.id===entry.id);
  assert(s,"Unknown source soldier "+entry.id);
  const profiles=d.profiles.filter(x=>x.soldierType===entry.id);
  const producers=d.transformations.filter(x=>x.producedSoldierType===entry.id&&!x.createsClone);
  const directPurchaseResearch=Array.isArray(s.requires)?s.requires:[];
  const rawDirectUnavailable=directPurchaseResearch.includes("STR_UNAVAILABLE");
  const bodySources=profiles.map(p=>{
    const inheritedHistory=Object.entries(p.previousTransformations||{})
      .filter(([,count])=>n(count)>0).map(([id,count])=>({id,count}));
    const inheritedBonuses=Object.entries(p.traitCounts||{})
      .filter(([,count])=>n(count)>0).map(([id,count])=>({id,count}));
    return {id:p.id,sourceType:p.sourceType,sourceId:p.sourceId,
      inheritedHistory,inheritedBonuses,availableSourceOnly:true};
  });
  const transformations=producers.map(t=>({
    id:t.id,koName:t.koName,requires:t.requires||[],
    allowedSourceTypes:t.allowedSoldierTypes||[],
    requiredMinStats:Object.fromEntries(Object.entries(t.requiredMinStats||{})
      .filter(([,v])=>n(v)>0)),
    requiredItems:t.requiredItems||{},
    requiredFacilities:t.requiresBaseFunc||[],
    requiredRank:t.minRank||0,
    forbiddenPreviousTransformations:t.forbiddenPreviousTransformations||[],
    reset:t.reset===true,previousHistoryRetained:t.reset!==true
  }));
  const onlyViaBodyChange=!profiles.length&&!!producers.length;
  const noSource=!profiles.length&&!producers.length;
  assert(!noSource,"No indexed way to acquire base class "+entry.id);
  const preAwardedChosen=bodySources.flatMap(p=>p.inheritedHistory
    .filter(h=>entry.transformations.includes(h.id))
    .map(h=>({profile:p.id,sourceId:p.sourceId,training:h.id,
      alreadyHasHistoryCount:h.count,doNotRepeat:true})));
  return {id:entry.id,name:s.koName,score:entry.score,
    directPurchaseResearch,directPurchaseBlockedByUnavailable:rawDirectUnavailable,
    acquisitionProfileCount:profiles.length,
    acquisitionProfiles:bodySources,
    incomingTypeChangeCount:producers.length,
    incomingTypeChanges:transformations,
    requiresTypeChange:onlyViaBodyChange,
    resetByIncomingTypeChange:onlyViaBodyChange&&producers.some(t=>t.reset===true),
    automaticallyPreAwardedSelectedTransformations:preAwardedChosen,
    sourceStatus:"INDEXED_SOURCE_ONLY_NOT_CAMPAIGN_PROVEN"};
});
const flagged=rows.filter(x=>x.requiresTypeChange);
assert.equal(flagged.length,5);
assert.deepEqual(flagged.map(x=>x.id).sort(),[
  "STR_SOLDIER_CHORT","STR_SOLDIER_NEKOMIMI_H","STR_SOLDIER_R",
  "STR_SOLDIER_SPECTRE","STR_SOLDIER_W"
]);
const resets=flagged.filter(x=>x.resetByIncomingTypeChange);
assert.deepEqual(resets.map(x=>x.id).sort(),[
  "STR_SOLDIER_CHORT","STR_SOLDIER_R","STR_SOLDIER_SPECTRE"
]);
const directBlocked=rows.filter(x=>x.directPurchaseBlockedByUnavailable);
assert.equal(directBlocked.length,9);
const hound=rows.find(x=>x.id==="STR_SOLDIER_BLOODOGE");
assert(hound.automaticallyPreAwardedSelectedTransformations.some(x=>
  x.profile==="event:STR_CODEX_BONUS_G5"&&
  x.training==="STR_HERO_RED_TRAINING"));
const report={schemaVersion:1,kind:"SOLDIER_MAXIMA_CLASS_ACQUISITION",
  source:"2.1 soldiers, 72 acquisition profiles, 83 transformations",
  status:"INDEXED_PROVENANCE_NOT_VERIFIED_ACQUISITION",
  summary:{classes:rows.length,
    noDirectAcquisitionProfiles:flagged.length,
    acquiredOnlyByTypeChange:flagged.length,
    typeChangeResetClasses:resets.length,
    cannotDirectlyRecruitDueUnavailable:directBlocked.length,
    noKnownAcquisitionSource:0,
    fullyProvenCampaignAcquisitions:0},
  caveats:[
    "Direct SoldierType requires STR_UNAVAILABLE does not prove the body unobtainable via manufacturing, mission or type-changing transformation.",
    "A listed direct acquisition profile is a ruleset source, not proof that the profile can be unlocked in the current campaign.",
    "A type-changing rule can reset transformation history and alter base stats. A theoretical body stat-cap starting point is not a simulated acquisition.",
    "Previously awarded source traits must not be re-applied; reward items and research branches still must be obtained.",
    "All 29 candidates still lack a complete real-campaign chronological acquisition and development witness."
  ],rows};
if(process.argv.includes("--json"))process.stdout.write(JSON.stringify(report));
else{
 console.log("BODY SOURCE AUDIT",JSON.stringify(report.summary));
 for(const x of flagged)
  console.log(x.id,x.name,"score="+x.score,"via="+x.incomingTypeChanges.map(t=>t.id).join(","),
    "historyReset="+x.resetByIncomingTypeChange);
}
