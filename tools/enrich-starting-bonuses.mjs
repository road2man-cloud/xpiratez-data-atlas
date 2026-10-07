import fs from "node:fs";

const START="public/data/starting-bonuses.json";
const SOLDIERS="public/data/soldiers-index.json";
const PROGRESSION="public/data/progression.json";
const PERSON_REWARD_ITEMS=new Set([
  "STR_THEBAN_ASSAULT_CLONE_LICENSE",
  "CIVILIAN_YOUNG_UBER",
  "STR_TURANIAN_UBER",
  "STR_REVOLUTIONARY_GIRL",
  "STR_SLAVE",
  "STR_HERO",
  "STR_CATGIRL_VICTIM"
]);

const start=JSON.parse(fs.readFileSync(START,"utf8"));
const soldiers=JSON.parse(fs.readFileSync(SOLDIERS,"utf8"));
const progression=JSON.parse(fs.readFileSync(PROGRESSION,"utf8"));

const profiles=soldiers.profiles||[];
const eventProfiles=new Map(profiles.filter(p=>p.sourceType==="event").map(p=>[p.sourceId,p]));
const manufactureProfiles=new Map(profiles.filter(p=>p.sourceType==="manufacture").map(p=>[p.sourceId,p]));
const recipes=progression.recipes||{};
const recipesByItem=new Map();

for(const recipe of Object.values(recipes)){
  const profile=manufactureProfiles.get(recipe.id);
  if(!profile)continue;
  for(const item of recipe.requiredItems||[]){
    if(!PERSON_REWARD_ITEMS.has(item.id))continue;
    if(!recipesByItem.has(item.id))recipesByItem.set(item.id,[]);
    recipesByItem.get(item.id).push({profile,recipe,rewardItemQty:Number(item.qty)||1});
  }
}

function compactProfile(profile,{mode,rewardItemId=null,rewardQty=0,recipe=null,rewardItemQty=1}={}){
  return {
    id:profile.id,
    sourceType:profile.sourceType,
    sourceId:profile.sourceId,
    mode,
    rewardItemId,
    rewardQty,
    rewardItemQty,
    maxRuns:rewardItemId?Math.floor((Number(rewardQty)||0)/(Number(rewardItemQty)||1)):null,
    soldierType:profile.soldierType,
    soldierKoName:profile.soldierKoName,
    soldierEnName:profile.soldierEnName,
    sourceKoName:profile.sourceKoName,
    sourceEnName:profile.sourceEnName,
    spawnedPersons:profile.spawnedPersons,
    cost:profile.cost,
    time:profile.time,
    armor:profile.armor,
    rank:profile.rank,
    nationality:profile.nationality,
    initialStats:profile.initialStats,
    currentStatsBeforeTraits:profile.currentStatsBeforeTraits,
    effectiveStats:profile.effectiveStats,
    rawStatCaps:profile.rawStatCaps,
    effectiveStatCaps:profile.effectiveStatCaps,
    trainingStatCaps:profile.trainingStatCaps,
    traitNames:profile.traitNames||[],
    traits:profile.traits||[],
    traitStats:profile.traitStats||{},
    previousTransformations:profile.previousTransformations||{},
    recipe:recipe?{
      id:recipe.id,
      koName:recipe.koName,
      enName:recipe.enName,
      requiredItems:recipe.requiredItems||[],
      requiresBaseFunc:recipe.requiresBaseFunc||[]
    }:null
  };
}

function enrich(event){
  const out=[];
  const seen=new Set();
  const direct=eventProfiles.get(event.eventId);
  if(direct){
    seen.add(direct.id);
    out.push(compactProfile(direct,{
      mode:"즉시 지급 유닛",
      rewardQty:event.spawnedPersons||direct.spawnedPersons||1
    }));
  }
  for(const item of event.items||[]){
    for(const link of recipesByItem.get(item.id)||[]){
      if(seen.has(link.profile.id))continue;
      seen.add(link.profile.id);
      out.push(compactProfile(link.profile,{
        mode:"보상 아이템으로 고용/생성",
        rewardItemId:item.id,
        rewardQty:item.qty,
        rewardItemQty:link.rewardItemQty,
        recipe:link.recipe
      }));
    }
  }
  event.unitProfiles=out;
  return event;
}

start.regions=(start.regions||[]).map(enrich);
start.countries=(start.countries||[]).map(enrich);
start.meta.unitProfileCount=[...start.regions,...start.countries].reduce((n,e)=>n+(e.unitProfiles?.length||0),0);
start.meta.unitProfileSource="soldiers-index.json + progression.json";
fs.writeFileSync(START,JSON.stringify(start,null,2)+"\n");

const egypt=start.countries.find(e=>e.triggerIds?.includes("STR_EGYPT"));
if(!egypt?.unitProfiles?.some(p=>p.sourceId==="STR_THEBAN_ASSAULT_CLONE")){
  throw new Error("Egypt Assault Clone profile missing after enrichment");
}
console.log("OK starting unit profiles:",start.meta.unitProfileCount,"links; Egypt clone embedded");
