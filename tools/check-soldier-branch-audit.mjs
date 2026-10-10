import assert from "node:assert/strict";
import fs from "node:fs";
import {auditSoldierBuild} from "../public/soldiers/branch-audit.js";

// Independent checks use existing v.o1.1.1 effective-raw research and event
// records, rather than trusting annotations on the generated build rows.
const soldiers=JSON.parse(fs.readFileSync("public/data/soldiers-index.json","utf8"));
const access=JSON.parse(fs.readFileSync("public/data/training-access.json","utf8"));
const researchDir="public/items/data/research-chunks";
const research=new Map();
for(const f of fs.readdirSync(researchDir).filter(f=>f.endsWith(".json"))){
  const chunk=JSON.parse(fs.readFileSync(researchDir+"/"+f,"utf8"));
  for(const o of Object.values(chunk.details||{}))research.set(o.id,o.raw);
}
assert.equal(research.size,4612);
const captainEleven=access.researchEvents.STR_CAPTAINS_11;
assert.equal(captainEleven.length,1);
assert(captainEleven[0].scripts.some(x=>x.researchTriggers.STR_CAPTAIN_THIEF===true));
assert(research.get("STR_BREAD_AND_FISHES_TRAINING").dependencies.includes("STR_CAPTAIN_PRIEST"));
assert(research.get("STR_MILITARY_DRILL_TRAINING").dependencies.includes("STR_CAPTAIN_RULER"));
assert(research.get("STR_REJECT_THE_POWER").disables.includes("STR_TINY_DRILL_INVESTIGATION"));
assert(research.get("STR_TINY_DRILL_INVESTIGATION").disables.includes("STR_REJECT_THE_POWER"));
assert(research.get("STR_BRIDES_TO_THE_QUEEN").dependencies.includes("STR_PSI_EXCESS"));
assert(research.get("STR_PSI_EXCESS").dependencies.includes("STR_CODEX_AWAKENED"));
assert(research.get("STR_PARIAH_TRAINING").dependencies.includes("STR_QUEEN_SAVAGE"));
for(const id of ["STR_HERO_GOLD_TRAINING","STR_HERO_GREEN_TRAINING","STR_HERO_RED_TRAINING"]){
  assert(research.get(id).dependencies.some(x=>x.startsWith("STR_CODEX_")&&x.endsWith("_AWAKENED")),id);
}
const byId=new Map(soldiers.transformations.map(x=>[x.id,x]));
const profile=soldiers.profiles.find(p=>p.saintSlots);
assert(profile);
const audit=ids=>auditSoldierBuild(profile,ids,byId);
assert.equal(audit(["STR_CAPTAINS_11"]).hard.length,0,
  "Saint pool item is not evidence the same item cannot be acquired outside Saint");
assert(audit(["STR_CAPTAINS_11"]).sourceWarnings.some(x=>x.code==="saint-thief"));
assert(audit(["STR_PARIAH_TRAINING"]).sourceWarnings.some(x=>x.code==="saint-queen"));
assert(audit(["STR_CAPTAINS_11","STR_BREAD_AND_FISHES_TRAINING"]).hard.some(x=>x.code==="captain-conflict"));
assert(audit(["STR_CAPTAINS_11","STR_MILITARY_DRILL_TRAINING"]).hard.some(x=>x.code==="captain-conflict"));
assert(audit(["STR_PARIAH_TRAINING","STR_BRIDES_TO_THE_QUEEN"]).hard.some(x=>x.code==="queen-codex-conflict"));
assert(audit(["STR_PARIAH_TRAINING","STR_HERO_RED_TRAINING"]).hard.some(x=>x.code==="queen-codex-conflict"));
assert(audit(["STR_THEBAN_ASSAULT_CLONE"]).hard.some(x=>x.code==="unavailable"));
assert.equal(audit(["STR_ASSIGN_STASIS_POD"]).hard.length,0,
  "Stasis pod allocation is an ordinary Sleeping Beauty research transformation, not STR_UNAVAILABLE");
assert.equal(audit(["STR_NEPOTISM","STR_BASIC_FIREARMS_TRAINING"]).hard.length,0);
let inspected=0,hard=0,unavailable=0,captain=0,queenCodex=0,saintEleven=0;
const bySet=new Map(soldiers.enhancementBuildSets.map(x=>[x.id,x]));
for(const p of soldiers.profiles){
  const set=bySet.get(p.enhancementBuildSetId);
  assert(set);
  for(const combo of set.combinations){
    inspected++;
    const a=auditSoldierBuild(p,combo.transformationIds,byId);
    if(a.hard.length)hard++;
    unavailable+=Number(a.hard.some(x=>x.code==="unavailable"));
    captain+=Number(a.hard.some(x=>x.code==="captain-conflict"));
    queenCodex+=Number(a.hard.some(x=>x.code==="queen-codex-conflict"));
    saintEleven+=Number(a.sourceWarnings.some(x=>x.code==="saint-thief"));
  }
}
assert.equal(inspected,1841);
assert(hard>1000&&unavailable>1000&&captain>500&&queenCodex>50,
  "Known impossible builds disappeared unexpectedly; recheck source and algorithm");
assert(saintEleven>0);
const markup=fs.readFileSync("public/soldiers/index.html","utf8");
const app=fs.readFileSync("public/soldiers/app.js","utf8");
assert(markup.includes('id="finalBranchFilter"')&&markup.includes('value="no-hard"'));
assert(markup.includes('type="module" src="app.js'));
assert(app.includes("auditSoldierBuild")&&app.includes("branchAudit")&&app.includes("sourceWarnings"));
console.log("OK soldiers branch audit: "+inspected+" generated source/build rows; "+hard+
  " definitive branch/internal-only conflicts ("+unavailable+" internal-only, "+captain+
  " mixed captain roots, "+queenCodex+" Savage vs Codex), "+saintEleven+
  " Saint-pool acquisitions conditionally incompatible with Thief's 11; non-exclusive item sources preserved");
