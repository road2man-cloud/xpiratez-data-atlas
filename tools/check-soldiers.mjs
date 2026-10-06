import fs from "node:fs";
import path from "node:path";

const args=process.argv.slice(2);
const i=args.indexOf("--data");
const dataDir=path.resolve(i>=0&&args[i+1]?args[i+1]:"public/data");
const file=path.join(dataDir,"soldiers-index.json");
const d=JSON.parse(fs.readFileSync(file,"utf8"));

if(!Array.isArray(d.soldiers)||!d.soldiers.length)throw new Error("No soldiers generated");
if(!Array.isArray(d.profiles)||!d.profiles.length)throw new Error("No soldier acquisition profiles generated");
if(!Array.isArray(d.transformations)||!d.transformations.length)throw new Error("No soldier transformations generated");
if(!Array.isArray(d.statKeys)||!d.statKeys.length)throw new Error("No soldier stat keys");

const expected={soldiers:29,profiles:72,transformations:83};
if(d.soldiers.length!==expected.soldiers)throw new Error(`Expected soldiers=${expected.soldiers}, got ${d.soldiers.length}`);
if(d.profiles.length!==expected.profiles)throw new Error(`Expected profiles=${expected.profiles}, got ${d.profiles.length}`);
if(d.transformations.length!==expected.transformations)throw new Error(`Expected transformations=${expected.transformations}, got ${d.transformations.length}`);

if(d.soldiers.length!==new Set(d.soldiers.map(x=>x.id)).size)throw new Error("Duplicate soldier ids");

const direct=Number(d.profileCounts?.direct??0);
const manufacture=Number(d.profileCounts?.manufacture??0);
const event=Number(d.profileCounts?.event??0);
if(direct+manufacture+event!==d.profiles.length)throw new Error("Soldier acquisition profile count mismatch");

const saintUnique=d.profiles.filter(x=>Number(x.saintSlots)>0).length;
if(Number(d.profileCounts?.saintUnique??0)!==saintUnique)throw new Error("Saint unique profile count mismatch");

for(const p of d.profiles){
  if(!p.effectiveStats?.avg)throw new Error("Missing effectiveStats.avg for "+p.id);
  if(!p.initialStats?.avg)throw new Error("Missing initialStats.avg for "+p.id);
  if(!p.currentStatsBeforeTraits?.avg)throw new Error("Missing currentStatsBeforeTraits.avg for "+p.id);
  for(const k of d.statKeys){
    if(!Number.isFinite(Number(p.effectiveStats.avg[k])))throw new Error(`Bad effective stat ${p.id} ${k}`);
    if(!Number.isFinite(Number(p.currentStatsBeforeTraits.avg[k])))throw new Error(`Bad current pre-trait stat ${p.id} ${k}`);
  }
}


if(!Array.isArray(d.enhancementBuildSets)||!d.enhancementBuildSets.length)throw new Error("No soldier final enhancement build sets");
const transformById=new Map(d.transformations.map(x=>[x.id,x]));
const transformStatFields=["flatOverallStatChange","flatMin","flatMax","percentOverallStatChange","percentMin","percentMax","percentGainedStatChange","percentGainedMin","percentGainedMax","traitStats"];
for(const t of d.transformations)for(const field of transformStatFields)for(const k of d.statKeys)if(!Number.isFinite(Number(t[field]?.[k])))throw new Error(`Bad transformation stat ${t.id} ${field} ${k}`);
const buildSetById=new Map(d.enhancementBuildSets.map(x=>[x.id,x]));
if(buildSetById.size!==d.enhancementBuildSets.length)throw new Error("Duplicate enhancement build set ids");

let finalBuildRows=0;
for(const p of d.profiles){
  const set=buildSetById.get(p.enhancementBuildSetId);
  if(!set)throw new Error("Missing enhancement build set for "+p.id);
  if(set.soldierType!==p.soldierType)throw new Error("Enhancement build set soldier type mismatch "+p.id);
  finalBuildRows+=set.combinations.length;
}
if(d.enhancementBuildSets.length!==48)throw new Error(`Expected enhancement build sets=48, got ${d.enhancementBuildSets.length}`);
if(finalBuildRows!==1841)throw new Error(`Expected final enhancement rows=1841, got ${finalBuildRows}`);

for(const set of d.enhancementBuildSets){
  if(!Array.isArray(set.combinations)||!set.combinations.length)throw new Error("Empty enhancement build set "+set.id);
  const prior=new Set(set.previousTransformations||[]);
  const seen=new Set();
  for(const build of set.combinations){
    if(!Array.isArray(build.transformationIds))throw new Error("Missing transformation sequence "+set.id+" "+build.id);
    const signature=build.transformationIds.join("|");
    if(seen.has(signature))throw new Error("Duplicate final enhancement build "+set.id+" "+signature);
    seen.add(signature);
    if(build.transformationIds.length!==new Set(build.transformationIds).size)throw new Error("Repeated transformation in final build "+set.id+" "+build.id);
    const applied=new Set(prior);
    for(const id of build.transformationIds){
      const t=transformById.get(id);
      if(!t)throw new Error("Unknown final-build transformation "+id);
      if(t.producedSoldierType||t.createsClone)throw new Error("Type-changing/clone transformation in final build "+id);
      if(t.allowedSoldierTypes?.length&&!t.allowedSoldierTypes.includes(set.soldierType))throw new Error("Transformation not allowed for final build "+set.id+" "+id);
      if(t.forbiddenSoldierTypes?.includes(set.soldierType))throw new Error("Forbidden soldier type in final build "+set.id+" "+id);
      for(const req of t.requiredPreviousTransformations||[])if(!applied.has(req))throw new Error(`Missing previous transformation ${req} before ${id} in ${set.id}`);
      for(const forbid of t.forbiddenPreviousTransformations||[])if(applied.has(forbid))throw new Error(`Mutually exclusive transformation coexistence ${forbid} -> ${id} in ${set.id}`);
      applied.add(id);
    }
    for(const id of build.targetIds||[])if(!applied.has(id))throw new Error("Final build target absent from sequence "+set.id+" "+id);
    const ids=new Set(build.transformationIds);
    for(const [a,b] of [["STR_MILITARY_DRILL_TRAINING","STR_CHARMY_DANCE_TRAINING"],["STR_NEPOTISM","STR_PERSON_OF_CULTURE_TRAINING"],["STR_BREAD_AND_FISHES_TRAINING","STR_GUN_KATA_TRAINING"]])if(ids.has(a)&&ids.has(b))throw new Error(`Known mutually exclusive transformations coexist ${a} + ${b} in ${set.id}`);
    for(const repeatable of ["STR_TIGER_TOURS","STR_DREAMLINK_TRAINING"])if((build.targetIds||[]).includes(repeatable))throw new Error(`Repeatable stat project exposed as final trait target ${repeatable} in ${set.id}`);
    for(const stats of [build.fixedDelta,build.capDelta,build.percentGainedChange]){
      for(const k of d.statKeys)if(!Number.isFinite(Number(stats?.[k])))throw new Error(`Bad final build stat ${set.id} ${build.id} ${k}`);
    }
  }
}

console.log(`OK soldiers: ${d.soldiers.length} base rules, ${d.profiles.length} acquisition profiles, ${d.transformations.length} transformations, ${d.enhancementBuildSets.length} enhancement build sets, ${finalBuildRows} final builds`);
