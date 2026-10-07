import crypto from "node:crypto";
import {splitPresentationResources} from "./data-normalize.mjs";

function arr(x){return Array.isArray(x)?x:[]}
function uniq(xs){return[...new Set(xs)]}
function num(x,fallback=0){const n=Number(x);return Number.isFinite(n)?n:fallback}
function named(id,tr){return{id,koName:tr(id,"ko"),enName:tr(id,"en")}}
function flatStrings(x){
  if(Array.isArray(x))return x.flatMap(flatStrings);
  return typeof x==="string"?[x]:[];
}
function ownerId(entry,index){
  if(!entry||typeof entry!=="object")return "#"+index;
  for(const k of ["type","name","id","article","race","category","region","deployment","missionName","script","eventScript"]){
    if(typeof entry[k]==="string")return entry[k];
  }
  return "#"+index;
}
function collectRequiredBaseFuncs(value,path=[],out=[]){
  if(Array.isArray(value)){value.forEach((v,i)=>collectRequiredBaseFuncs(v,[...path,String(i)],out));return out;}
  if(!value||typeof value!=="object")return out;
  for(const [k,v] of Object.entries(value)){
    if(k==="requiresBaseFunc"||k==="requiresBuyBaseFunc"){
      for(const id of flatStrings(v))out.push({id,path:[...path,k].join(".")});
    }else collectRequiredBaseFuncs(v,[...path,k],out);
  }
  return out;
}
function formatMonths(x){
  if(x==null||!Number.isFinite(Number(x)))return null;
  return Math.round(Number(x)*10)/10;
}

export function buildFacilityData({effectiveMerged,sourceHistory,tr}){
  const facilities=arr(effectiveMerged.facilities).filter(x=>x&&typeof x.type==="string");
  const research=arr(effectiveMerged.research).filter(x=>x&&typeof x.name==="string");
  const facilityById=new Map(facilities.map(x=>[x.type,x]));
  const researchById=new Map(research.map(x=>[x.name,x]));
  const facilityIds=new Set(facilityById.keys());

  const directResearchDeps=new Map();
  for(const r of research){
    directResearchDeps.set(r.name,uniq([...arr(r.dependencies),...arr(r.requires)].filter(x=>researchById.has(x))));
  }
  const researchCatalog={};
  function researchNode(id){
    if(researchCatalog[id])return researchCatalog[id];
    const r=researchById.get(id)||{};
    return researchCatalog[id]={
      id,koName:tr(id,"ko"),enName:tr(id,"en"),cost:r.cost??null,points:r.points??null,
      dependencies:arr(r.dependencies).filter(x=>researchById.has(x)),
      requires:arr(r.requires).filter(x=>researchById.has(x)),
      requiresBaseFunc:flatStrings(r.requiresBaseFunc),
      needItem:Boolean(r.needItem),destroyItem:Boolean(r.destroyItem),
      disables:arr(r.disables).filter(x=>typeof x==="string").map(x=>named(x,tr)),
      reenables:arr(r.reenables).filter(x=>typeof x==="string").map(x=>named(x,tr))
    };
  }
  function researchPlan(rootIds){
    const roots=uniq(rootIds.filter(x=>researchById.has(x)));
    const seen=new Set(),visiting=new Set(),nodeIds=[];
    function visit(id){
      if(seen.has(id)||visiting.has(id))return;
      visiting.add(id);
      for(const dep of directResearchDeps.get(id)||[])visit(dep);
      visiting.delete(id);seen.add(id);researchNode(id);nodeIds.push(id);
    }
    roots.forEach(visit);
    const totalCost=nodeIds.reduce((sum,id)=>{
      const c=researchCatalog[id]?.cost;
      return sum+(Number.isFinite(Number(c))?Number(c):0);
    },0);
    const branchGates=nodeIds.filter(id=>{
      const x=researchCatalog[id];return Boolean(x?.disables?.length||x?.reenables?.length);
    });
    const sampleGates=nodeIds.filter(id=>researchCatalog[id]?.needItem);
    const baseFuncs=uniq(nodeIds.flatMap(id=>researchCatalog[id]?.requiresBaseFunc||[]));
    return{roots,nodeIds,totalCost,branchGates,sampleGates,baseFuncs};
  }

  const providerMap=new Map();
  for(const f of facilities){
    for(const func of flatStrings(f.provideBaseFunc)){
      const xs=providerMap.get(func)||[];xs.push(f.type);providerMap.set(func,uniq(xs));
    }
  }

  const consumerMap=new Map();
  function addConsumer(func,entry){
    const xs=consumerMap.get(func)||[];
    const key=entry.section+"\u0000"+entry.owner+"\u0000"+entry.path;
    if(!xs.some(x=>x.key===key))xs.push({...entry,key});
    consumerMap.set(func,xs);
  }
  for(const [section,value] of Object.entries(effectiveMerged)){
    if(Array.isArray(value)){
      value.forEach((entry,i)=>{
        const owner=ownerId(entry,i);
        for(const hit of collectRequiredBaseFuncs(entry))addConsumer(hit.id,{section,owner,path:hit.path});
      });
    }else if(value&&typeof value==="object"){
      for(const hit of collectRequiredBaseFuncs(value))addConsumer(hit.id,{section,owner:section,path:hit.path});
    }
  }

  const facilityRefs=Object.fromEntries([...facilityIds].map(id=>[id,[]]));
  function walkRefs(value,ctx,path=[]){
    if(typeof value==="string"){
      if(facilityIds.has(value))facilityRefs[value].push({...ctx,path:path.join(".")});
      return;
    }
    if(Array.isArray(value)){value.forEach((v,i)=>walkRefs(v,ctx,[...path,String(i)]));return;}
    if(value&&typeof value==="object")for(const [k,v] of Object.entries(value))walkRefs(v,ctx,[...path,k]);
  }
  for(const [section,value] of Object.entries(effectiveMerged)){
    if(Array.isArray(value))value.forEach((entry,i)=>walkRefs(entry,{section,owner:ownerId(entry,i)},[]));
    else if(value&&typeof value==="object")walkRefs(value,{section,owner:section},[]);
  }
  function refsFor(id){
    const groups=new Map();
    for(const r of facilityRefs[id]||[]){
      if(r.section==="facilities"&&r.owner===id&&r.path==="type")continue;
      const key=r.section+"\u0000"+r.owner;
      const g=groups.get(key)||{section:r.section,owner:r.owner,koName:tr(r.owner,"ko"),enName:tr(r.owner,"en"),paths:[]};
      if(!g.paths.includes(r.path))g.paths.push(r.path);
      groups.set(key,g);
    }
    return [...groups.values()].sort((a,b)=>(a.section+a.owner).localeCompare(b.section+b.owner));
  }

  const startingCounts=new Map();
  for(const f of arr(effectiveMerged.startingBase?.facilities)){
    if(typeof f?.type==="string")startingCounts.set(f.type,(startingCounts.get(f.type)||0)+1);
  }

  const allFieldKeys=uniq(facilities.flatMap(x=>Object.keys(x))).sort();
  const baseFunctions=uniq([
    ...facilities.flatMap(x=>flatStrings(x.provideBaseFunc)),
    ...facilities.flatMap(x=>flatStrings(x.requiresBaseFunc)),
    ...consumerMap.keys()
  ]).sort();

  const rows=[],details={};
  for(const f of facilities){
    const id=f.type,bucket=crypto.createHash("sha1").update(id).digest("hex")[0];
    const size=Math.max(1,num(f.size,1)),area=size*size;
    const buildCost=f.buildCost??null,monthlyCost=f.monthlyCost??null;
    const available=!flatStrings(f.requires).includes("STR_UNAVAILABLE");
    const stateOnly=!available||/_DAMAGED|_HARVEST$/.test(id)||id==="STR_RUBBLE";
    const buildCostItems=f.buildCostItems&&typeof f.buildCostItems==="object"&&!Array.isArray(f.buildCostItems)?f.buildCostItems:{};
    const buildItems=Object.entries(buildCostItems).map(([itemId,v])=>{
      const o=v&&typeof v==="object"&&!Array.isArray(v)?v:{build:v};
      return{...named(itemId,tr),build:o.build??0,refund:o.refund??0};
    });
    const provided=flatStrings(f.provideBaseFunc),required=flatStrings(f.requiresBaseFunc);
    const requires=flatStrings(f.requires);
    const plan=researchPlan(requires);
    const capacities={
      personnel:num(f.personnel),storage:num(f.storage),labs:num(f.labs),workshops:num(f.workshops),
      psiLabs:num(f.psiLabs),trainingRooms:num(f.trainingRooms),aliens:num(f.aliens),crafts:num(f.crafts)
    };
    const roles=[];
    if(capacities.personnel>0)roles.push("housing");
    if(capacities.storage>0)roles.push("storage");
    if(capacities.labs>0)roles.push("research");
    if(capacities.workshops>0)roles.push("workshop");
    if(capacities.psiLabs>0)roles.push("psi");
    if(capacities.trainingRooms>0)roles.push("training");
    if(capacities.aliens>0)roles.push("containment");
    if(capacities.crafts>0)roles.push("hangar");
    if(num(f.radarRange)>0||num(f.sightRange)>0)roles.push("detection");
    if(num(f.defense)>0||f.mind===true)roles.push("defense");
    if(num(f.sickBayAbsoluteBonus)!==0||num(f.sickBayRelativeBonus)!==0||provided.includes("MED"))roles.push("medical");
    if(monthlyCost!=null&&Number(monthlyCost)<0)roles.push("income");
    if(provided.length&&!roles.length)roles.push("special");

    const monthlyIncome=monthlyCost!=null&&Number(monthlyCost)<0?-Number(monthlyCost):0;
    const paybackMonths=monthlyIncome>0&&Number.isFinite(Number(buildCost))?formatMonths(Number(buildCost)/monthlyIncome):null;
    const rawSplit=splitPresentationResources(f);
    const rawCore={...rawSplit.core},omittedLayoutFields=[];
    for(const k of ["storageTiles","mapName"]){
      if(Object.prototype.hasOwnProperty.call(rawCore,k)){delete rawCore[k];omittedLayoutFields.push(k);}
    }
    const detail={
      id,bucket,koName:tr(id,"ko"),enName:tr(id,"en"),size,area,available,stateOnly,
      startingCount:startingCounts.get(id)||0,
      buildCost,buildTime:f.buildTime??null,monthlyCost,monthlyIncome,paybackMonths,
      refundValue:f.refundValue??null,removalTime:f.removalTime??null,maxAllowedPerBase:f.maxAllowedPerBase??null,
      capacities,efficiency:{
        storagePerTile:capacities.storage/area,personnelPerTile:capacities.personnel/area,labsPerTile:capacities.labs/area,
        workshopsPerTile:capacities.workshops/area,trainingPerTile:capacities.trainingRooms/area,
        buildCostPerTile:buildCost==null?null:Number(buildCost)/area
      },
      manaRecoveryPerDay:f.manaRecoveryPerDay??0,
      sickBayAbsoluteBonus:f.sickBayAbsoluteBonus??0,sickBayRelativeBonus:f.sickBayRelativeBonus??0,
      radarRange:f.radarRange??0,radarChance:f.radarChance??0,sightRange:f.sightRange??0,hyper:Boolean(f.hyper),
      defense:f.defense??0,hitRatio:f.hitRatio??0,mind:Boolean(f.mind),mindPower:f.mindPower??0,missileAttraction:f.missileAttraction??null,
      prisonType:f.prisonType??null,rightClickActionType:f.rightClickActionType??null,
      requires:requires.map(x=>named(x,tr)),researchPlan:plan,
      provideBaseFunc:provided,requiresBaseFunc:required,
      buildItems,
      destroyedFacility:typeof f.destroyedFacility==="string"?named(f.destroyedFacility,tr):null,
      leavesBehindOnSell:flatStrings(f.leavesBehindOnSell).map(x=>named(x,tr)),
      buildOverFacilities:flatStrings(f.buildOverFacilities).map(x=>named(x,tr)),
      roles:uniq(roles),references:refsFor(id),
      sourceFiles:sourceHistory["type:"+id]||[],raw:rawCore,omittedLayoutFields,resourceFieldCount:rawSplit.resources.length
    };
    details[id]=detail;
    const searchText=[
      id,detail.koName,detail.enName,...roles,...provided,...required,
      ...requires.flatMap(rid=>[rid,tr(rid,"ko"),tr(rid,"en")]),
      ...buildItems.flatMap(x=>[x.id,x.koName,x.enName])
    ].filter(Boolean).join(" ").toLowerCase();
    rows.push({
      id,bucket,koName:detail.koName,enName:detail.enName,size,area,available,stateOnly,startingCount:detail.startingCount,
      buildCost,buildTime:detail.buildTime,monthlyCost,monthlyIncome,paybackMonths,
      personnel:capacities.personnel,storage:capacities.storage,labs:capacities.labs,workshops:capacities.workshops,
      psiLabs:capacities.psiLabs,trainingRooms:capacities.trainingRooms,aliens:capacities.aliens,crafts:capacities.crafts,
      radarRange:detail.radarRange,radarChance:detail.radarChance,defense:detail.defense,manaRecoveryPerDay:detail.manaRecoveryPerDay,
      provideBaseFunc:provided,requiresBaseFunc:required,roles:detail.roles,researchCost:plan.totalCost,
      storagePerTile:detail.efficiency.storagePerTile,labsPerTile:detail.efficiency.labsPerTile,
      workshopsPerTile:detail.efficiency.workshopsPerTile,trainingPerTile:detail.efficiency.trainingPerTile,
      searchText
    });
  }
  rows.sort((a,b)=>(num(facilityById.get(a.id)?.listOrder,999999)-num(facilityById.get(b.id)?.listOrder,999999))||a.koName.localeCompare(b.koName,"ko"));

  const baseFunctionMeta=Object.fromEntries(baseFunctions.map(id=>[id,{
    id,
    providers:(providerMap.get(id)||[]).map(fid=>named(fid,tr)),
    consumers:(consumerMap.get(id)||[]).map(({key,...x})=>({...x,koName:tr(x.owner,"ko"),enName:tr(x.owner,"en")}))
  }]));

  return{
    counts:{
      facilities:rows.length,
      available:rows.filter(x=>x.available).length,
      stateOnly:rows.filter(x=>x.stateOnly).length,
      startingTypes:rows.filter(x=>x.startingCount>0).length,
      income:rows.filter(x=>x.monthlyIncome>0).length,
      baseFunctions:baseFunctions.length
    },
    fieldKeys:allFieldKeys,baseFunctions,baseFunctionMeta,researchCatalog,index:rows,details
  };
}
