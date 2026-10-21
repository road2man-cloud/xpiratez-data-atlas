import assert from "node:assert/strict";
import fs from "node:fs";
import {readSavePersonnel,facilityEvidence,inventoryEvidence,medalEvidence,
  effectiveSoldierStats} from "../public/trainings/save-personnel-core.js";
import {initialState,evaluate} from "../public/trainings/planner.js";
import {assessTrainingReadiness} from "../public/trainings/readiness.js";

const a=fs.readFileSync("public/data/trainings-index.json","utf8");
const t=JSON.parse(a),f=JSON.parse(fs.readFileSync("public/data/facilities-index.json","utf8"));
const trainings=new Map(t.transformations.map(row=>[row.id,row]));
const yaml=[
  "name: Smoke","engine: Extended","mods:","  - 'piratez ver: v.o1.1.1'","---",
  "difficulty: 2","funds: [100,200]","bases:",
  "  - lon: 0.4","    name: 'South: Outpost'",
  "    facilities:",
  "      - type: STR_LIBRARY","        x: 1","        y: 1",
  "      - type: STR_GYM_ROOM","        buildTime: 3",
  "    soldiers:",
  "      - type: STR_SOLDIER_SLAVE",
  "        id: 21","        name: Sample",
  "        rank: 2","        recovery: 5",
  "        currentStats:",
  "          tu: 60","          health: 45","          psiSkill: 0","          psiStrength: 47",
  "        previousTransformations:",
  "          STR_PERSON_OF_CULTURE_TRAINING: 1",
  "        transformationBonuses:",
  "          STR_THEBAN_ASSAULT_CLONE: 9",
  "        diary:",
  "          commendations:",
  "            - {commendationName: STR_MEDAL_UNCONSCIOUS_NAME,decorationLevel: 0}",
  "      - type: STR_SOLDIER_PEASANT","        id: 22","        name: Another","        rank: 0",
  "        currentStats: {psiStrength: 39,tu: 70}",
  "        diary:",
  "          missionIdList: [4,8]",
  "    items:",
  "      STR_GOVT_CORPSE: 5",
  "      STR_LEEK: 0",
  "    transfers:",
  "      - hours: 3","        itemId: STR_HANDLE","        itemQty: 99",
  "  - lon: 1","    name: Second","    facilities: []","    soldiers: []","    items: {}",
  "discovered: [STR_SIMPLETON_TRAINING]",
  "researchRuleStatus: {STR_PERSON_OF_CULTURE_TRAINING: 2}"
].join("\n")+"\n";
const parsed=readSavePersonnel(yaml);
assert.deepEqual(parsed.warnings,[]);
assert.equal(parsed.bases.length,2);
const home=parsed.bases[0];
assert.equal(home.name,"South: Outpost");
assert.equal(home.soldiers.length,2);
assert.equal(home.itemsComplete,true);
assert.equal(home.facilitiesComplete,true);
const s=home.soldiers[0];
assert.equal(s.id,21);
assert.equal(s.name,"Sample");
assert.equal(s.type,"STR_SOLDIER_SLAVE");
assert.equal(s.rank,2);
assert.equal(s.recovery,5);
assert.equal(s.medals.get("STR_MEDAL_UNCONSCIOUS_NAME"),0);
assert.equal(s.previousTransformations.STR_PERSON_OF_CULTURE_TRAINING,1);
assert.equal(s.transformationBonuses.STR_THEBAN_ASSAULT_CLONE,9);
const stats=effectiveSoldierStats(s,t.bonuses);
assert.equal(stats.complete,true);
assert.equal(stats.stats.get("tu"),70,"unique SoldierBonus applied once");
assert.equal(stats.stats.get("health"),55);
assert.equal(stats.stats.get("psiSkill"),0,"raw psi skill zero cannot be unlocked by bonus");
assert.equal(stats.stats.get("psiStrength"),47);
const unknown=effectiveSoldierStats({...s,transformationBonuses:{FAKE_TRAIT:1}},t.bonuses);
assert.equal(unknown.complete,false);
assert.equal(unknown.stats.size,0,"unknown traits cannot be counted as zero bonus");
const fac=facilityEvidence(home,f.index,["DOJO","LIB","MED"]);
assert.equal(fac.complete,true);
assert.equal(fac.functions.get("LIB"),1);
assert.equal(fac.functions.get("DOJO"),0,"under-construction gym must not count");
assert.equal(fac.functions.get("MED"),0);
const stock=inventoryEvidence(home,["STR_GOVT_CORPSE","STR_HANDLE","STR_LEEK"]);
assert.equal(stock.get("STR_GOVT_CORPSE"),5);
assert.equal(stock.get("STR_HANDLE"),0,"inbound transfer does not count as present inventory");
assert.equal(stock.get("STR_LEEK"),0);
const marks=medalEvidence(s,["STR_MEDAL_UNCONSCIOUS_NAME","STR_MEDAL_STATGAIN_NAME"]);
assert.equal(marks.get("STR_MEDAL_UNCONSCIOUS_NAME"),0,"a medal at level zero is acquired");
assert.equal(marks.get("STR_MEDAL_STATGAIN_NAME"),-1,"absent medal level zero is not acquired");
const noDiary=medalEvidence({...s,medals:new Map(),medalsComplete:false},["STR_MEDAL_STATGAIN_NAME"]);
assert.equal(noDiary.has("STR_MEDAL_STATGAIN_NAME"),false,"unparsed medal list must remain unknown");
const real=assessTrainingReadiness(trainings.get("STR_SIMPLETON_TRAINING"),{
  research:{completed:new Set(["STR_SIMPLETON_TRAINING"]),disabled:new Set()},
  items:stock,baseFuncs:fac.functions,stats:stats.stats,rank:s.rank,medals:marks,unitValid:true
});
assert.equal(real.researchKind,"met");
assert(real.missing.some(x=>x.kind==="item"&&x.id==="STR_GOVT_CORPSE"));
assert(real.missing.some(x=>x.kind==="item"&&x.id==="STR_HANDLE"));
const issues=evaluate(trainings.get("STR_SIMPLETON_TRAINING"),
  initialState({soldierType:s.type,previousTransformations:s.previousTransformations}));
assert(issues.some(x=>x.code==="forbidden"),"saved transformation history must block Simpleton");
const second=parsed.bases[1];
assert.equal(second.itemsComplete,true);
assert.equal(inventoryEvidence(second,["STR_HANDLE"]).get("STR_HANDLE"),0);
const incomplete=readSavePersonnel(yaml.replace("    items:\n      STR_GOVT_CORPSE: 5",
  "    items:\n      STR_GOVT_CORPSE: NaN"));
assert.equal(incomplete.bases[0].itemsComplete,false);
assert.equal(inventoryEvidence(incomplete.bases[0],["STR_HANDLE"]).has("STR_HANDLE"),false);
const noStock=readSavePersonnel(yaml.replace("    items:\n      STR_GOVT_CORPSE: 5\n      STR_LEEK: 0\n",""));
assert.equal(noStock.bases[0].itemsComplete,false,"absent stock is not an empty stock");
assert.equal(inventoryEvidence(noStock.bases[0],["STR_HANDLE"]).has("STR_HANDLE"),false);
const unknownFacility=facilityEvidence(home,[...f.index].filter(x=>x.id!=="STR_LIBRARY"),["LIB"]);
assert.equal(unknownFacility.complete,false);
assert.equal(unknownFacility.functions.has("LIB"),false);
for(const bad of ["\0","\uFFFD"])assert.throws(()=>readSavePersonnel(yaml+bad));
assert.throws(()=>readSavePersonnel(yaml.replace("bases:","bases: []\nbases:")),/중복/);
console.log("OK saved-personnel: multi-base scoped stock, current stats + unique bonus, medals (level 0), prior transformations, under-construction facilities, transfers excluded, incomplete data remains unknown");
