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
  if(!p.currentStatsBeforeTraits?.avg)throw new Error("Missing currentStatsBeforeTraits.avg for "+p.id);
  for(const k of d.statKeys){
    if(!Number.isFinite(Number(p.effectiveStats.avg[k])))throw new Error(`Bad effective stat ${p.id} ${k}`);
    if(!Number.isFinite(Number(p.currentStatsBeforeTraits.avg[k])))throw new Error(`Bad current pre-trait stat ${p.id} ${k}`);
  }
}

console.log(`OK soldiers: ${d.soldiers.length} base rules, ${d.profiles.length} acquisition profiles, ${d.transformations.length} transformations`);
