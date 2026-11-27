// Source-backed eligibility for career commendations earned with a soldier's
// current armor's built-in weapon. Combat success is still conditional.
// No arbitrary weapon acquisition, inventory change, or unsupported criterion.
import fs from "node:fs";
import {key} from "./population-research-career-core.mjs";
export const intrinsicMedalSources=["armor-raw-chunks","weapon-details"].flatMap(dir=>Array.from("0123456789abcdef",x=>"public/data/"+dir+"/"+x+".json"));
export function createIntrinsicMedalCatalog(data){
 const armor=new Map(),weapons=new Map();
 for(const path of intrinsicMedalSources){
  const details=JSON.parse(fs.readFileSync(path,"utf8")).details;
  for(const [id,entry] of Object.entries(details||{})){
   const raw=path.includes("armor-raw-chunks")?entry.raw:entry.rule;
   if(raw?.type!==id)continue;
   if(path.includes("armor-raw-chunks"))armor.set(id,{raw,path});
   else weapons.set(id,{raw,path});
  }
 }
 const byArmor=new Map();
 function forArmor(body,id){
  const cacheKey=key([body,id]);
  if(byArmor.has(cacheKey))return byArmor.get(cacheKey);
  const out=[],a=armor.get(id);
  if(!a?.raw.units?.includes(body)){byArmor.set(cacheKey,out);return out;}
  const builtIn=new Set(a.raw.builtInWeapons||[]);
  for(const [medal,m] of Object.entries(data.commendationIndex||{})){
   if(Object.keys(m.criteria||{}).length!==1||!Array.isArray(m.criteria.killsWithCriteriaCareer)||m.missionTypeFilter?.length||!Array.isArray(m.bonusLevels)||!Array.isArray(m.killCriteria))continue;
   const proofs=[];
   for(const alternative of m.killCriteria){
    // Exactly one hostile kill using a named weapon. A single qualifying
    // alternative is sufficient; never combine conjunctive requirements.
    if(!Array.isArray(alternative)||alternative.length!==1)continue;
    const [n,tags]=alternative[0];
    if(n!==1||!Array.isArray(tags)||tags.length!==3||new Set(tags).size!==3||!tags.includes("FACTION_HOSTILE")||!tags.includes("STATUS_DEAD"))continue;
    const weapon=tags.find(t=>builtIn.has(t)),w=weapons.get(weapon);
    if(!weapon||!w?.raw.fixedWeapon||w.raw.battleType!==3||!w.raw.costMelee||w.raw.damageType===0)continue;
    proofs.push({body,armor:id,weapon,armorSource:a.path,weaponSource:w.path,criterion:alternative,armorRuleHash:key(a.raw),weaponRuleHash:key(w.raw)});
   }
   if(!proofs.length)continue;
   out.push({id:medal,criterion:"killsWithCriteriaCareer",proofs,levels:m.bonusLevels.map((bonus,level)=>({bonus,level,threshold:m.criteria.killsWithCriteriaCareer[level]})).filter(x=>Number.isSafeInteger(x.threshold)&&x.threshold>=0)});
  }
  byArmor.set(cacheKey,out);return out;
 }
 return {forArmor};
}
