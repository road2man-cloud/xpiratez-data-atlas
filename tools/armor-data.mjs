import crypto from "node:crypto";
import {splitPresentationResources} from "./data-normalize.mjs";

export const ARMOR_STAT_KEYS=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];

function arr(x){return Array.isArray(x)?x:[]}
function obj(x){return x&&typeof x==="object"&&!Array.isArray(x)?x:{}}
function num(x,fallback=0){const n=Number(x);return Number.isFinite(n)?n:fallback}
function uniq(a){return[...new Set(a)]}
function named(id,tr){return{id,koName:tr(id,"ko"),enName:tr(id,"en")}}

function formatHours(hours){
  if(hours==null||!Number.isFinite(Number(hours)))return null;
  const h=Math.max(0,Number(hours));
  if(h<24)return `${h}시간`;
  const d=Math.floor(h/24),r=h%24;
  return r?`${d}일 ${r}시간`:`${d}일`;
}

function containsId(value,id){
  if(value===id)return true;
  if(Array.isArray(value))return value.some(v=>containsId(v,id));
  if(value&&typeof value==="object")return Object.values(value).some(v=>containsId(v,id));
  return false;
}

function ownerId(entry,index){
  if(!entry||typeof entry!=="object")return "#"+index;
  for(const k of ["type","name","id","article","race","category","region","deployment","missionName","script","eventScript"]){
    if(typeof entry[k]==="string")return entry[k];
  }
  return "#"+index;
}

function buildTargetRefs(effectiveMerged,targetIds){
  const refs=Object.fromEntries([...targetIds].map(id=>[id,[]]));
  function walk(value,ctx,path=[]){
    if(typeof value==="string"){
      if(targetIds.has(value))refs[value].push({...ctx,path:path.join(".")});
      return;
    }
    if(Array.isArray(value)){value.forEach((v,i)=>walk(v,ctx,[...path,String(i)]));return;}
    if(value&&typeof value==="object")for(const [k,v] of Object.entries(value))walk(v,ctx,[...path,k]);
  }
  for(const [section,value] of Object.entries(effectiveMerged)){
    if(!Array.isArray(value))continue;
    value.forEach((entry,i)=>walk(entry,{section,owner:ownerId(entry,i)},[]));
  }
  return refs;
}

function groupRefs(refs,id,tr){
  const groups=new Map();
  for(const r of refs[id]||[]){
    const key=r.section+"\u0000"+r.owner;
    const g=groups.get(key)||{section:r.section,owner:r.owner,koName:tr(r.owner,"ko"),enName:tr(r.owner,"en"),paths:[]};
    if(!g.paths.includes(r.path))g.paths.push(r.path);
    groups.set(key,g);
  }
  return [...groups.values()].sort((a,b)=>(a.section+a.owner).localeCompare(b.section+b.owner));
}

export function buildArmorData({effectiveMerged,sourceHistory,tr,damageKeys=[]}){
  const armorList=arr(effectiveMerged.armors).filter(x=>x&&typeof x.type==="string");
  const itemList=arr(effectiveMerged.items).filter(x=>x&&typeof x.type==="string");
  const researchList=arr(effectiveMerged.research).filter(x=>x&&typeof x.name==="string");
  const manufactureList=arr(effectiveMerged.manufacture).filter(x=>x&&typeof x.name==="string");
  const eventList=arr(effectiveMerged.events).filter(x=>x&&typeof x.name==="string");

  const itemById=new Map(itemList.map(x=>[x.type,x]));
  const researchById=new Map(researchList.map(x=>[x.name,x]));
  const manufactureById=new Map(manufactureList.map(x=>[x.name,x]));

  const directDeps=new Map(),researchCatalog={};
  for(const r of researchList){
    const deps=uniq([...arr(r.dependencies),...arr(r.requires)].filter(x=>researchById.has(x)));
    directDeps.set(r.name,deps);
  }
  function catalogResearch(id){
    if(researchCatalog[id])return researchCatalog[id];
    const rule=researchById.get(id)||{};
    return researchCatalog[id]={id,koName:tr(id,"ko"),enName:tr(id,"en"),cost:rule.cost??null,points:rule.points??null,needItem:Boolean(rule.needItem),destroyItem:Boolean(rule.destroyItem)};
  }

  function researchClosure(rootIds){
    const roots=uniq(rootIds.filter(x=>researchById.has(x)));
    const seen=new Set(),visiting=new Set(),nodeIds=[];
    function dfs(id){
      if(seen.has(id)||visiting.has(id))return;
      visiting.add(id);
      for(const d of directDeps.get(id)||[])dfs(d);
      visiting.delete(id);seen.add(id);catalogResearch(id);nodeIds.push(id);
    }
    roots.forEach(dfs);
    const totalCost=nodeIds.reduce((s,id)=>{const c=researchCatalog[id]?.cost;return s+(Number.isFinite(Number(c))?Number(c):0)},0);
    return{roots,nodeIds,totalCost,totalTimeOneScientist:formatHours(totalCost),totalTimeTenScientists:formatHours(Math.ceil(totalCost/10))};
  }

  function manufactureProduces(m,itemId){
    if(m.name===itemId)return true;
    const p=m.producedItems;
    if(Array.isArray(p))return p.includes(itemId)||p.some(x=>x&&typeof x==="object"&&containsId(x,itemId));
    return p&&typeof p==="object"&&Object.prototype.hasOwnProperty.call(p,itemId);
  }

  function manufactureRoutes(itemId){
    return manufactureList.filter(m=>manufactureProduces(m,itemId)).map(m=>{
      const requires=arr(m.requires).filter(x=>typeof x==="string");
      const research=researchClosure(requires);
      const producedQty=m.producedItems&&typeof m.producedItems==="object"&&!Array.isArray(m.producedItems)?m.producedItems[itemId]??1:1;
      return{
        id:m.name,koName:tr(m.name,"ko"),enName:tr(m.name,"en"),
        time:m.time??null,timeOneEngineer:formatHours(m.time??null),timeTenEngineers:m.time==null?null:formatHours(Math.ceil(num(m.time)/10)),
        cost:m.cost??null,space:m.space??null,producedQty,
        requiredItems:obj(m.requiredItems),requires,requiresBaseFunc:arr(m.requiresBaseFunc),
        research,sourceFiles:sourceHistory["name:"+m.name]||[]
      };
    });
  }

  function researchRewardRoutes(itemId){
    return researchList.filter(r=>arr(r.getOneFree).includes(itemId)||containsId(r.getOneFreeProtected,itemId)).map(r=>({
      id:r.name,koName:tr(r.name,"ko"),enName:tr(r.name,"en"),cost:r.cost??null,needItem:Boolean(r.needItem),destroyItem:Boolean(r.destroyItem),path:researchClosure([r.name])
    }));
  }

  function eventRoutes(itemId){
    return eventList.filter(e=>containsId(e,itemId)).map(e=>({
      id:e.name,koName:tr(e.name,"ko"),enName:tr(e.name,"en"),firstMonth:e.firstMonth??null,lastMonth:e.lastMonth??null,spawnedPersons:e.spawnedPersons??null,
      sourceFiles:sourceHistory["name:"+e.name]||[]
    }));
  }

  const storeIds=new Set(armorList.map(a=>a.storeItem).filter(x=>typeof x==="string"));
  const refs=buildTargetRefs(effectiveMerged,storeIds);
  const damageTypes=damageKeys.map((key,id)=>({id,key,ko:tr(key,"ko"),en:tr(key,"en")}));
  const acquisitionCatalog={research:researchCatalog,manufacture:{},buy:{},researchRewards:{},events:{}};

  const index=[],details={},rawDetails={},resourceDetails={};
  for(const a of armorList){
    const id=a.type,bucket=crypto.createHash("sha1").update(id).digest("hex")[0],storeItemId=typeof a.storeItem==="string"?a.storeItem:null,item=storeItemId?itemById.get(storeItemId):null;
    const front=num(a.frontArmor),right=num(a.sideArmor),left=right+num(a.leftArmorDiff),rear=num(a.rearArmor),under=num(a.underArmor);
    const stats=Object.fromEntries(ARMOR_STAT_KEYS.map(k=>[k,num(a.stats?.[k])]));
    const damageModifier=damageTypes.map(({id})=>{
      const v=Array.isArray(a.damageModifier)?a.damageModifier[id]:null;
      return v==null?1:num(v,1);
    });
    const manufacture=storeItemId?manufactureRoutes(storeItemId):[];
    const buy=item&&num(item.costBuy)>0?{
      costBuy:num(item.costBuy),transferTime:item.transferTime??24,
      requires:arr(item.requiresBuy),requiresCountry:item.requiresBuyCountry??null,requiresBaseFunc:arr(item.requiresBuyBaseFunc),
      research:researchClosure(arr(item.requiresBuy))
    }:null;
    const equipRequires=typeof a.requires==="string"?[a.requires]:arr(a.requires).filter(x=>typeof x==="string");
    const equipResearch=researchClosure(equipRequires);
    const rewardResearch=storeItemId?researchRewardRoutes(storeItemId):[];
    const events=storeItemId?eventRoutes(storeItemId):[];
    const references=storeItemId?groupRefs(refs,storeItemId,tr):[];
    for(const m of manufacture)acquisitionCatalog.manufacture[m.id]=m;
    if(buy&&storeItemId)acquisitionCatalog.buy[storeItemId]=buy;
    if(rewardResearch.length&&storeItemId)acquisitionCatalog.researchRewards[storeItemId]=rewardResearch;
    for(const ev of events)acquisitionCatalog.events[ev.id]=ev;
    const acquisitionKinds=[];
    if(manufacture.length)acquisitionKinds.push("제조");
    if(buy)acquisitionKinds.push("구매");
    if(rewardResearch.length)acquisitionKinds.push("연구 보상");
    if(events.length)acquisitionKinds.push("이벤트 참조");
    if(storeItemId&&!acquisitionKinds.length)acquisitionKinds.push("전리품/특수");
    if(!storeItemId)acquisitionKinds.push("유닛 전용/비장비");

    const shortestManufacture=manufacture.slice().sort((x,y)=>num(x.research.totalCost)+num(x.time)-num(y.research.totalCost)-num(y.time))[0]||null;
    const mainResearchCost=shortestManufacture?.research.totalCost??buy?.research.totalCost??equipResearch.totalCost??0;
    const mainManufactureTime=shortestManufacture?.time??null;
    const mainAcquireHours=shortestManufacture?(num(shortestManufacture.research.totalCost)+num(shortestManufacture.time)):buy?.transferTime??null;

    const rawSplit=splitPresentationResources(a);
    const detail={
      id,bucket,koName:tr(storeItemId||id,"ko"),armorKoName:tr(id,"ko"),enName:tr(storeItemId||id,"en"),armorEnName:tr(id,"en"),
      storeItemId,hasStoreItem:Boolean(storeItemId&&item),isArmorItem:Boolean(item?.categories?.includes("STR_BAT_CAT_ARMORS")),
      frontArmor:front,leftArmor:left,rightArmor:right,rearArmor:rear,underArmor:under,weight:a.weight??item?.weight??0,
      stats,damageModifier,meleeDodge:obj(a.meleeDodge),meleeDodgeBackPenalty:a.meleeDodgeBackPenalty??0,
      recovery:obj(a.recovery),visibilityAtDark:a.visibilityAtDark??0,visibilityAtDay:a.visibilityAtDay??0,
      camouflageAtDay:a.camouflageAtDay??0,camouflageAtDark:a.camouflageAtDark??0,antiCamouflageAtDay:a.antiCamouflageAtDay??0,antiCamouflageAtDark:a.antiCamouflageAtDark??0,
      heatVision:a.heatVision??0,psiVision:a.psiVision??0,psiCamouflage:a.psiCamouflage??0,
      allowsRunning:a.allowsRunning??null,allowsStrafing:a.allowsStrafing??null,allowsSneaking:a.allowsSneaking??null,allowsKneeling:a.allowsKneeling??null,
      builtInWeapons:arr(a.builtInWeapons),units:arr(a.units),specialWeapon:a.specialWeapon??null,
      item:item?{id:item.type}:null,
      acquisition:{
        kinds:acquisitionKinds,
        buyKey:buy&&storeItemId?storeItemId:null,
        manufactureRefs:manufacture.map(x=>({id:x.id,bucket:crypto.createHash("sha1").update(x.id).digest("hex")[0]})),
        researchRewardKey:rewardResearch.length&&storeItemId?storeItemId:null,
        eventIds:events.map(x=>x.id),
        equipRequires:equipRequires.map(id=>named(id,tr)),equipResearch
      },
      mainResearchCost,mainManufactureTime,mainAcquireHours,
      sourceFiles:sourceHistory["type:"+id]||[],resourceFieldCount:rawSplit.resources.length
    };
    rawDetails[id]={id,bucket,raw:rawSplit.core,references};
    if(rawSplit.resources.length)resourceDetails[id]={id,bucket,effective:rawSplit.resources};
    details[id]=detail;
    index.push({
      id,bucket,koName:detail.koName,enName:detail.enName,storeItemId,hasStoreItem:detail.hasStoreItem,isArmorItem:detail.isArmorItem,
      frontArmor:front,leftArmor:left,rightArmor:right,rearArmor:rear,underArmor:under,weight:detail.weight,
      tu:stats.tu,stamina:stats.stamina,health:stats.health,bravery:stats.bravery,reactions:stats.reactions,firing:stats.firing,throwing:stats.throwing,strength:stats.strength,melee:stats.melee,
      ap:damageModifier[1]??1,incendiary:damageModifier[2]??1,he:damageModifier[3]??1,laser:damageModifier[4]??1,plasma:damageModifier[5]??1,stun:damageModifier[6]??1,meleeResist:damageModifier[7]??1,acid:damageModifier[8]??1,dt16:damageModifier[16]??1,
      manufactureCount:manufacture.length,buyable:Boolean(buy),researchRewardCount:rewardResearch.length,eventRefCount:events.length,
      acquisitionKinds,mainResearchCost,mainManufactureTime,mainAcquireHours,
      costBuy:item?.costBuy??null,costSell:item?.costSell??null
    });
  }

  index.sort((a,b)=>a.koName.localeCompare(b.koName,"ko"));
  return{
    statKeys:ARMOR_STAT_KEYS,damageTypes,index,details,rawDetails,resourceDetails,acquisitionCatalog,
    counts:{armors:index.length,equipable:index.filter(x=>x.hasStoreItem).length,armorItems:index.filter(x=>x.isArmorItem).length,manufacturable:index.filter(x=>x.manufactureCount>0).length,buyable:index.filter(x=>x.buyable).length,resourceFields:Object.values(resourceDetails).reduce((s,x)=>s+x.effective.length,0)}
  };
}
