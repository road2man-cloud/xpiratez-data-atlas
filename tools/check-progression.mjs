import fs from "node:fs";
import path from "node:path";

const args=process.argv.slice(2);
const i=args.indexOf("--data");
const dataDir=path.resolve(i>=0&&args[i+1]?args[i+1]:"public/data");
const file=(...parts)=>path.join(dataDir,...parts);
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));

const progressionPath=file("progression.json");
const researchPath=file("progression-research.json");
if(!fs.existsSync(progressionPath))throw new Error("Missing progression.json");
if(!fs.existsSync(researchPath))throw new Error("Missing progression-research.json");

const progression=read(progressionPath);
const research=read(researchPath);
if(progression.crafts?.length!==96)throw new Error("Expected 96 crafts");
if(Object.keys(progression.soldiers||{}).length!==29)throw new Error("Expected progression for 29 soldiers");
if(!progression.recipes||!progression.events||!progression.plans)throw new Error("Normalized recipe/event/plan catalogs missing");
if(Object.keys(progression.plans).length!==progression.researchPlanCount)throw new Error("Plan summary catalog count mismatch");
if(!Array.isArray(research.topics)||research.topics.length!==4612)throw new Error("Expected 4612 research topics");

const maxCoreFile=2*1024*1024;
const maxPlanFile=512*1024;
for(const p of [progressionPath,researchPath]){
  if(fs.statSync(p).size>maxCoreFile)throw new Error("Progression core file exceeds 2 MiB: "+path.basename(p));
}
for(const [id,plan] of Object.entries(progression.plans)){
  for(const key of ["roots","branchGates"]){
    const refs=plan[key]||[];
    if(!Array.isArray(refs)||refs.some(x=>!Number.isInteger(x)||x<0||x>=research.topics.length)){
      throw new Error("Invalid compact "+key+" in plan "+id);
    }
  }
}

for(const s of Object.values(progression.soldiers))for(const p of s.acquisitionPaths||[]){
  if(p.kind==="manufacture"&&!progression.recipes[p.recipeId])throw new Error("Missing soldier recipe "+p.recipeId);
  if(p.kind==="event"&&!progression.events[p.eventId])throw new Error("Missing soldier event "+p.eventId);
}
for(const c of progression.crafts)for(const p of c.acquisitionPaths||[]){
  if(p.kind==="manufacture"&&!progression.recipes[p.recipeId])throw new Error("Missing craft recipe "+p.recipeId);
}
for(const r of Object.values(progression.recipes))for(const item of r.requiredItems||[])for(const src of item.eventSources||[]){
  if(!progression.events[src.eventId])throw new Error("Missing recipe event "+src.eventId);
}
function checkPlanRefs(v){
  if(!v||typeof v!=="object")return;
  for(const [k,x] of Object.entries(v)){
    if(/PlanId$/.test(k)&&x!=null&&!progression.plans[x])throw new Error("Missing plan summary "+x);
    if(x&&typeof x==="object")checkPlanRefs(x);
  }
}
checkPlanRefs({soldiers:progression.soldiers,crafts:progression.crafts,recipes:progression.recipes});

let planCount=0;
for(const b of "0123456789abcdef"){
  const p=file("progression-plans",b+".json");
  if(!fs.existsSync(p))continue;
  if(fs.statSync(p).size>maxPlanFile)throw new Error("Progression plan bucket exceeds 512 KiB: "+b);
  const plans=read(p).plans||{};
  for(const [id,plan] of Object.entries(plans)){
    planCount++;
    if(!Array.isArray(plan.topics)||plan.topics.some(x=>!Number.isInteger(x)||x<0||x>=research.topics.length)){
      throw new Error("Invalid compact plan "+id);
    }
  }
}
if(planCount!==progression.researchPlanCount)throw new Error("Research plan count mismatch: "+planCount+" != "+progression.researchPlanCount);

const littleBirdAssembly=research.topics.find(x=>x.id==="STR_LITTLE_BIRD_ASSEMBLY");
if(!littleBirdAssembly?.spawnedItems?.some(x=>x.id==="STR_HELICOPTER_WRECKAGE"))throw new Error("Little Bird assembly result item missing");
if(!littleBirdAssembly?.unlocks?.some(x=>x.id==="STR_OLD_AIRCRAFT_REPAIRED"))throw new Error("Little Bird assembly downstream unlock missing");

const schoolbus=progression.crafts.find(x=>x.id==="STR_SCHOOLBUS");
if(!schoolbus||schoolbus.soldiers!==11||schoolbus.speedMax!==500||schoolbus.fuelMax!==3000)throw new Error("Schoolbus stat smoke test failed");
if(!schoolbus.summary?.commonBranchGates?.some(x=>x.id==="STR_REJECT_THE_POWER"))throw new Error("Schoolbus reject-power branch missing");

const ogre=progression.soldiers.STR_SOLDIER_OGRE;
if(!ogre?.trainingRoutes?.some(x=>x.id==="STR_DESTRUCTOR_TRAINING"))throw new Error("Ogre Destructor training missing");

const hero=progression.soldiers.STR_SOLDIER_HERO;
const sevenHeroes=hero?.acquisitionPaths?.some(p=>{
  if(p.kind!=="manufacture")return false;
  const recipe=progression.recipes[p.recipeId];
  return recipe?.requiredItems?.some(item=>item.eventSources?.some(src=>src.eventId==="STR_THE_MAGNIFICIENT_SEVEN_EVENT"));
});
if(!sevenHeroes)throw new Error("Seven Heroes source missing");

console.log("OK progression: 29 soldiers, 96 crafts, "+Object.keys(progression.recipes).length+" recipes, "+Object.keys(progression.events).length+" events, "+planCount+" compact research plans");
