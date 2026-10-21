// Regression checks for the single integrated XPiratez weapon database.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const base=path.resolve(process.argv[2]||"public/data");
const read=file=>JSON.parse(fs.readFileSync(path.join(base,file),"utf8").replace(/^\uFEFF/,""));
const ranked=read("standard-evaluation.json");
const weaponIndex=read("weapons-index.json");
const all=[...ranked.ranged,...ranked.melee];
const failures=[];
function check(name,predicate){
  try {assert.ok(predicate,name);console.log("PASS",name)}
  catch(e){failures.push(name);console.error("FAIL",name)}
}
const actionRows={shooting:[],melee:[]};
for(const section of Object.keys(actionRows))
  for(const file of weaponIndex.sectionChunks[section])actionRows[section].push(...read(file).rows);
const shootPairs=new Set(actionRows.shooting.map(r=>r.itemId+"|"+r.ammoId));
const meleeIds=new Set(actionRows.melee.map(r=>r.itemId));
const unique=new Set(all.map(r=>r.key));

check("weapon DB and evaluation load",all.length>0&&actionRows.shooting.length>1000);
check("counts: ranged, melee and combined",ranked.counts.ranged===ranked.ranged.length&&ranked.counts.melee===ranked.melee.length&&ranked.counts.combined===all.length);
check("all weapon/ammo keys unique",unique.size===all.length);
check("all ranged pairs linked to canonical weapon DB",ranked.ranged.every(r=>shootPairs.has(r.weaponId+"|"+r.ammoId)));
check("all melee items linked to canonical weapon DB",ranked.melee.every(r=>meleeIds.has(r.weaponId)));
check("melee equipment limited to 1x2 or intrinsically unarmed",ranked.melee.every(r=>r.unarmed||r.width*r.height<=2&&r.width<=2&&r.height<=2));
check("required punch and kung-fu both present",["STR_UNARMED_BASIC","STR_KUNG_FU"].every(id=>ranked.melee.some(r=>r.weaponId===id)));
const kung=ranked.melee.find(r=>r.weaponId==="STR_KUNG_FU");
check("kung-fu punch, kick and five-strike flurry",kung?.actions?.length===3&&kung.actions.some(a=>a.mode==="발차기")&&kung.actions.some(a=>a.mode==="5연타"&&a.shots===5));
check("punch and kung-fu have ranked 0-100 scores",["STR_UNARMED_BASIC","STR_KUNG_FU"].every(id=>Number.isFinite(ranked.melee.find(r=>r.weaponId===id)?.score)));
check("range scenarios present 4,14,28",ranked.ranged.every(r=>[4,14,28].every(d=>r.scenarios.some(s=>s.distance===d))));
check("armor profiles have light, medium, heavy and special",ranked.ranged.every(r=>r.scenarios.every(s=>["경장갑","중간 장갑","중장갑","특수내성"].every(k=>Object.hasOwn(s.armor,k)))));
check("all numerical scores in 0 to 100",all.every(r=>[r.score,r.combatScore].every(n=>n==null||Number.isFinite(n)&&n>=0&&n<=100)));
check("missing economics do not become zero-price",ranked.ranged.filter(r=>r.costPerShot==null).every(r=>r.economicsScore==null&&r.score==null));
check("valid stage evidence",all.every(r=>typeof r.stageEvidence==="string"&&r.stageEvidence.length>0));
check("save provenance and counts available",ranked.meta.saveFile?.endsWith(".sav")&&ranked.meta.researchCompleted>0&&ranked.meta.observedGalCount>0);
check("manufacture economics explicitly record uncertainty",all.filter(r=>r.manufactureEconomics).every(r=>r.manufactureEconomics.economicTotal!=null||typeof r.manufactureEconomics.completeness==="string"));
check("16.sav X-Grog alternative-profit rate uses active production",Math.abs(ranked.meta.engineerOpportunityHourly-(4999-200)/220)<0.001);
check("manufacture batch cost includes materials and engineer opportunity",all.every(r=>[r.manufactureEconomics,r.ammoManufactureEconomics].filter(Boolean).every(m=>{
  if(m.ingredients.some(x=>x.unitOpportunity==null))return m.materialCost==null&&m.economicTotal==null;
  return m.economicTotal==null||Math.abs(m.economicTotal*m.producedQty-m.economicBatchTotal)<.1&&
    Math.abs(m.opportunityProfitLost-m.engineerHours*ranked.meta.engineerOpportunityHourly)<.1;
})));
const weaponHtml=fs.readFileSync("public/weapons/index.html","utf8");
const standardUi=fs.readFileSync("public/weapons/standard-ui.js","utf8");
const weaponApp=fs.readFileSync("public/weapons/app.js","utf8");
check("one unified weapon table offers standard scores and comparison",
  weaponHtml.includes('id="sortBy"')&&weaponHtml.includes('value="standardScore"')&&
  weaponHtml.includes('id="scoredOnly"')&&weaponHtml.includes('id="compareSelected"')&&
  !weaponHtml.includes('id="standardTab"')&&!weaponHtml.includes('id="standardPanel"')&&
  standardUi.includes("showComparison")&&standardUi.includes("renderDetail")&&
  weaponApp.includes("XPStandardEvaluation"));
check("SAV status and remaining research are not presented on weapons page",
  !weaponHtml.includes(".sav")&&!standardUi.includes("saveFile")&&
  !standardUi.includes("missingResearch")&&!weaponApp.includes("missingResearch"));
const featured18=["STR_MP","STR_PAINBRINGER","STR_SMG_10MM","STR_SMG_50CAL",
  "STR_MACHINEGUN","STR_MRSHAN_SHOTGUN","STR_MRSHAN_MINIGUN","STR_SAW",
  "STR_CHAINGUN","STR_MAMMOTH_SHOTGUN","STR_SAW_GYRO","STR_MP_AUTO_CANNON",
  "STR_HMG_ASSAULT","STR_ASMG","STR_LYNX","STR_SMG_SPIKED","STR_SMG_ADV","STR_ROTOGUN"];
check("all 18 requested ranged weapon IDs have canonical ammo combos",featured18.every(id=>
  ranked.ranged.some(r=>r.weaponId===id&&shootPairs.has(r.weaponId+"|"+r.ammoId))));
check("melee is supported in the main list and standard score lookup",
  weaponHtml.includes('value="melee"')&&standardUi.includes('"melee:"+raw.itemId')&&
  weaponApp.includes('section==="melee"'));
check("representative Tommygun and Mutant MG rows",["STR_TOMMYGUN","STR_MUTANT_MG"].every(id=>ranked.ranged.some(r=>r.weaponId===id)));
check("evidence warns probabilities are estimates",ranked.evidence.engine.includes("미검증")&&ranked.meta.simulation.hitModel.includes("대리지표"));
console.log(JSON.stringify({checked:all.length,ranged:ranked.ranged.length,melee:ranked.melee.length,scored:all.filter(x=>x.score!=null).length,unscored:all.filter(x=>x.score==null).length,failed:failures.length},null,2));
if(failures.length)process.exitCode=1;
