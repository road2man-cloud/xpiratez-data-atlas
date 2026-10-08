import fs from "node:fs";
import path from "node:path";

const args=process.argv.slice(2);
const i=args.indexOf("--data");
const dataDir=path.resolve(i>=0&&args[i+1]?args[i+1]:"public/data");
const read=(...parts)=>JSON.parse(fs.readFileSync(path.join(dataDir,...parts),"utf8"));
const db=read("craft-weapons-index.json");
const research=read("craft-weapon-research.json");
function assert(ok,msg){if(!ok)throw new Error(msg)}
assert(Array.isArray(db.index)&&db.index.length>0,"No craft weapons generated");
assert(db.index.length===new Set(db.index.map(x=>x.id)).size,"Duplicate craft weapon ids");
assert(db.counts?.craftWeapons===db.index.length,"Craft weapon count mismatch");
assert(db.typeMeta&&typeof db.typeMeta==="object","Missing craft weapon type metadata");
assert(research.researchCatalog&&typeof research.researchCatalog==="object","Missing craft weapon research catalog");

const buckets={};
let shared=0,attack=0,support=0;
for(const row of db.index){
  assert(typeof row.id==="string"&&row.id,"Craft weapon missing id");
  assert(typeof row.bucket==="string"&&row.bucket.length===1,"Craft weapon missing bucket "+row.id);
  buckets[row.bucket]??=read("craft-weapon-chunks",row.bucket+".json").details;
  const d=buckets[row.bucket]?.[row.id];
  assert(d,"Missing craft weapon detail "+row.id);
  assert(d.weaponType===row.weaponType,"weaponType mismatch "+row.id);
  assert(Array.isArray(d.roles)&&d.roles.length,"Missing roles "+row.id);
  assert(Array.isArray(d.compatibleCrafts),"Missing compatible crafts "+row.id);
  for(const plan of [d.profileResearch,d.launcherResearch,d.clipResearch,...(d.launcherRecipes||[]).map(r=>r.research),...(d.clipRecipes||[]).map(r=>r.research)])for(const rid of plan?.nodeIds||[])assert(research.researchCatalog[rid],"Missing craft weapon research node "+rid+" for "+row.id);
  assert(d.compatibleCrafts.length===row.compatibleCraftCount,"Compatible craft count mismatch "+row.id);
  if(row.sharedTactical){shared++;assert(d.launcher?.exists&&d.launcher?.tacticalUsable,"Bad tactical reuse "+row.id)}
  if(d.roles.includes("attack"))attack++;else support++;
}
assert(db.counts.sharedTactical===shared,"Shared tactical count mismatch");
assert(db.counts.attack===attack,"Attack count mismatch");
assert(db.counts.support===support,"Support count mismatch");

const pirate=db.index.find(x=>x.id==="STR_CRAFT_PIR_CANNON_UC");
assert(pirate,"Missing STR_CRAFT_PIR_CANNON_UC");
const pd=buckets[pirate.bucket].STR_CRAFT_PIR_CANNON_UC;
assert(pd.weaponType===8,"Pirate cannon weaponType regression");
assert(pd.launcher?.id==="STR_PIR_CANNON"&&pd.launcher?.tacticalUsable===true,"Pirate cannon tactical launcher reuse regression");
assert(pd.clip?.id==="STR_PIR_CANNONBALL"&&pd.clip?.exists===true&&pd.clip?.tacticalUsable===true,"Pirate cannon clip reuse regression");
assert(pd.sharedTactical===true,"Pirate cannon shared tactical classification regression");
assert(Number(pd.damage)===5&&Number(pd.range)===10&&Number(pd.accuracy)===15&&Number(pd.ammoMax)===20,"Pirate cannon craft profile stats regression");

console.log(`OK craft weapons: ${db.index.length} profiles, ${shared} tactical-weapon reuse, ${attack} attack, ${support} support, ${Object.keys(buckets).length} chunks`);
