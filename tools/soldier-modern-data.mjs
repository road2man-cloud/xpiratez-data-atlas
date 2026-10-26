import {splitPresentationResources} from "./data-normalize.mjs";

export const SOLDIER_STAT_KEYS=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];

export const SOLDIER_STAT_LABELS={
  tu:"TU",stamina:"기력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",
  throwing:"투척",strength:"근력",psiStrength:"Psi 강도",psiSkill:"Psi 기술",melee:"근접",mana:"Mana"
};

function zeroStats(){return Object.fromEntries(SOLDIER_STAT_KEYS.map(k=>[k,0]));}
function readStats(x){
  const out=zeroStats();
  if(x&&typeof x==="object")for(const k of SOLDIER_STAT_KEYS){
    const v=Number(x[k]); if(Number.isFinite(v))out[k]=v;
  }
  return out;
}
function addStats(a,b){
  const out={};
  for(const k of SOLDIER_STAT_KEYS)out[k]=(Number(a?.[k])||0)+(Number(b?.[k])||0);
  return out;
}
function clampStats(a){
  const out={};
  for(const k of SOLDIER_STAT_KEYS)out[k]=Math.max(k==="health"?1:0,Number(a?.[k])||0);
  return out;
}
function averageRange(min,max){
  const avg={};
  for(const k of SOLDIER_STAT_KEYS)avg[k]=k==="psiSkill"?min[k]:(min[k]+max[k])/2;
  return avg;
}
function baseRange(rule){
  const min=readStats(rule.minStats),max=readStats(rule.maxStats);
  // OXCE Soldier constructor rolls every listed stat except psiSkill; psiSkill starts at minStats.psiSkill.
  max.psiSkill=min.psiSkill;
  return{min,avg:averageRange(min,max),max};
}
function templateStatRange(rule,override){
  const range=baseRange(rule);
  const changes=override&&typeof override==="object"?override:{};
  for(const k of SOLDIER_STAT_KEYS){
    if(!Object.hasOwn(changes,k))continue;
    const value=Number(changes[k]);
    // OXCE UnitStats::templateMerge: zero means PRESERVE rolled stat,
    // -1 means explicitly RESET to zero, nonzero replaces the roll.
    // previous code treated zero as a forced-zero override.
    if(!Number.isFinite(value)||value===0)continue;
    const v=value===-1?0:value;
    range.min[k]=v;range.avg[k]=v;range.max[k]=v;
  }
  return range;
}
function effectiveCapStats(rule,bonus){
  const raw=readStats(rule.statCaps),effective=addStats(raw,bonus);
  for(const k of SOLDIER_STAT_KEYS)effective[k]=Math.max(0,Number(effective[k])||0);
  if((Number(raw.psiSkill)||0)<=0)effective.psiSkill=raw.psiSkill;
  return{raw,effective};
}
function flatRange(prefix,range){
  const out={};
  for(const k of SOLDIER_STAT_KEYS){
    out[prefix+"Min_"+k]=range.min[k];
    out[prefix+"Avg_"+k]=range.avg[k];
    out[prefix+"Max_"+k]=range.max[k];
  }
  return out;
}

export function buildSoldierData({effectiveMerged,sourceHistory,tr}){
  const resourceDetails={};
  // OXCE Mod.h defaults, optionally overridden by globals.
  const woundThresholds={health:Number(effectiveMerged.health?.woundThreshold??100),
    mana:Number(effectiveMerged.mana?.woundThreshold??200)};
  const soldierList=(Array.isArray(effectiveMerged.soldiers)?effectiveMerged.soldiers:[]).filter(x=>x&&typeof x.type==="string");
  const soldierByType=new Map(soldierList.map(x=>[x.type,x]));
  const soldierIds=new Set(soldierByType.keys());
  const bonuses=(Array.isArray(effectiveMerged.soldierBonuses)?effectiveMerged.soldierBonuses:[]).filter(x=>x&&typeof x.name==="string");
  const bonusByName=new Map(bonuses.map(x=>[x.name,x]));
  const transformations=(Array.isArray(effectiveMerged.soldierTransformation)?effectiveMerged.soldierTransformation:[]).filter(x=>x&&typeof x.name==="string");
  const events=(Array.isArray(effectiveMerged.events)?effectiveMerged.events:[]);

  const saintEvent=events.find(x=>x?.name==="STR_SAINTS_REINFORCEMENTS");
  const saintSlots=Array.isArray(saintEvent?.randomItemList)?saintEvent.randomItemList:[];
  const saintCounts=new Map();
  for(const x of saintSlots)saintCounts.set(x,(saintCounts.get(x)||0)+1);

  function bonusNames(template){
    const src=template?.transformationBonuses;
    if(!src||typeof src!=="object"||Array.isArray(src))return[];
    // The save map stores counts, but Soldier::getBonuses() resolves unique RuleSoldierBonus pointers.
    // Therefore a bonus is applied once when present, regardless of a stored count > 1.
    return Object.keys(src).filter(k=>src[k]&&bonusByName.has(k));
  }
  function bonusStats(names){
    let out=zeroStats();
    for(const name of [...new Set(names)]){
      const b=bonusByName.get(name);
      if(b?.stats)out=addStats(out,readStats(b.stats));
    }
    return out;
  }
  function applyBonuses(range,bonus){
    const out={};
    for(const band of ["min","avg","max"]){
      const base=range[band],raw=addStats(base,bonus);
      // OXCE does not allow soldier bonuses to unlock psi skill from a base value <= 0.
      if((Number(base.psiSkill)||0)<=0)raw.psiSkill=base.psiSkill;
      out[band]=clampStats(raw);
    }
    return out;
  }
  function bonusDetails(names){
    return [...new Set(names)].map(name=>{
      const b=bonusByName.get(name)||{};
      return{
        id:name,koName:tr(name,"ko"),enName:tr(name,"en"),stats:readStats(b.stats),
        frontArmor:b.frontArmor??0,sideArmor:b.sideArmor??0,rearArmor:b.rearArmor??0,underArmor:b.underArmor??0,
        visibilityAtDark:b.visibilityAtDark??0,recovery:b.recovery??null
      };
    });
  }
  function baseRecord(rule){
    const range=baseRange(rule),rawSplit=splitPresentationResources(rule);
    if(rawSplit.resources.length)resourceDetails[rule.type]={id:rule.type,effective:rawSplit.resources};
    return{
      id:rule.type,koName:tr(rule.type,"ko"),enName:tr(rule.type,"en"),
      minStats:range.min,avgStats:range.avg,maxStats:range.max,
      statCaps:readStats(rule.statCaps),trainingStatCaps:readStats(rule.trainingStatCaps),
      costBuy:rule.costBuy??0,costSalary:rule.costSalary??0,monthlyBuyLimit:rule.monthlyBuyLimit??null,
      transferTime:rule.transferTime??null,requires:Array.isArray(rule.requires)?rule.requires:[],
      armor:rule.armor??null,allowPromotion:rule.allowPromotion??true,
      sourceFiles:sourceHistory["type:"+rule.type]||["Piratez.rul"],raw:rawSplit.core,resourceFieldCount:rawSplit.resources.length,
      ...flatRange("base",range)
    };
  }

  const soldiers=soldierList.map(baseRecord).sort((a,b)=>a.koName.localeCompare(b.koName,"ko"));

  function saintMeta(sourceId){
    if(!sourceId?.endsWith("_RECRUITMENT"))return{saintSlots:0,saintProbability:0,saintItem:null};
    const item=sourceId.slice(0,-"_RECRUITMENT".length);
    const slots=saintCounts.get(item)||0;
    return{saintSlots:slots,saintProbability:saintSlots.length?slots/saintSlots.length:0,saintItem:slots?item:null};
  }

  function spawnProfile(sourceType,sourceId,entry){
    const soldier=soldierByType.get(entry.spawnedPersonType); if(!soldier)return null;
    const template=entry.spawnedSoldier&&typeof entry.spawnedSoldier==="object"?entry.spawnedSoldier:{};
    const current=templateStatRange(soldier,template.currentStats);
    const initial=templateStatRange(soldier,template.initialStats);
    const traitNames=bonusNames(template),traitStats=bonusStats(traitNames);
    const effective=applyBonuses(current,traitStats);
    const caps=effectiveCapStats(soldier,traitStats);
    const saint=saintMeta(sourceId);
    const direct=sourceType==="direct";
    return{
      id:sourceType+":"+sourceId,sourceType,sourceId,soldierType:soldier.type,
      soldierKoName:tr(soldier.type,"ko"),soldierEnName:tr(soldier.type,"en"),
      sourceKoName:direct?("직접 고용 · "+tr(soldier.type,"ko")):tr(sourceId,"ko"),
      sourceEnName:direct?("Direct hire · "+tr(soldier.type,"en")):tr(sourceId,"en"),
      spawnedPersons:sourceType==="event"?(entry.spawnedPersons??1):1,
      cost:direct?(soldier.costBuy??0):(entry.cost??null),
      salary:direct?(soldier.costSalary??0):null,
      time:direct?(soldier.transferTime??null):(entry.time??null),
      monthlyBuyLimit:direct?(soldier.monthlyBuyLimit??null):null,
      requires:Array.isArray(entry.requires)?entry.requires:[],
      requiresBaseFunc:Array.isArray(entry.requiresBaseFunc)?entry.requiresBaseFunc:[],
      initialStatsBeforeTraits:initial,currentStatsBeforeTraits:current,
      traitNames,traits:bonusDetails(traitNames),traitStats,
      effectiveStats:effective,rawStatCaps:caps.raw,effectiveStatCaps:caps.effective,trainingStatCaps:readStats(soldier.trainingStatCaps),
      initialStatsOverride:template.initialStats??null,currentStatsOverride:template.currentStats??null,
      previousTransformations:template.previousTransformations??{},
      armor:template.armor??soldier.armor??null,rank:template.rank??0,nationality:template.nationality??null,
      ...saint,
      sourceFiles:direct?(sourceHistory["type:"+soldier.type]||["Piratez.rul"]):(sourceHistory["name:"+sourceId]||[]),
      ...flatRange("effective",effective)
    };
  }

  const profiles=[];
  // Direct-hire profile: a normal random soldier bought from the personnel screen.
  for(const soldier of soldierList){
    const req=Array.isArray(soldier.requires)?soldier.requires:[];
    if((Number(soldier.costBuy)||0)>0&&!req.includes("STR_UNAVAILABLE")){
      const entry={spawnedPersonType:soldier.type,requires:req};
      const p=spawnProfile("direct",soldier.type,entry);if(p)profiles.push(p);
    }
  }
  for(const x of (Array.isArray(effectiveMerged.manufacture)?effectiveMerged.manufacture:[])){
    if(soldierIds.has(x?.spawnedPersonType)){const p=spawnProfile("manufacture",x.name,x);if(p)profiles.push(p);}
  }
  for(const x of events){
    if(soldierIds.has(x?.spawnedPersonType)&&(x.spawnedPersons??1)>0){const p=spawnProfile("event",x.name,x);if(p)profiles.push(p);}
  }
  profiles.sort((a,b)=>(a.soldierKoName+a.sourceKoName).localeCompare(b.soldierKoName+b.sourceKoName,"ko"));

  const transformationIndex=transformations.map(t=>{
    const flat=readStats(t.flatOverallStatChange);
    const trait=t.soldierBonusType&&bonusByName.has(t.soldierBonusType)?t.soldierBonusType:null;
    const traitStats=trait?readStats(bonusByName.get(trait).stats):zeroStats();
    return{
      id:t.name,koName:tr(t.name,"ko"),enName:tr(t.name,"en"),
      requires:Array.isArray(t.requires)?t.requires:[],
      requiresBaseFunc:Array.isArray(t.requiresBaseFunc)?t.requiresBaseFunc:[],
      allowedSoldierTypes:Array.isArray(t.allowedSoldierTypes)?t.allowedSoldierTypes:[],
      requiredPreviousTransformations:Array.isArray(t.requiredPreviousTransformations)?t.requiredPreviousTransformations:[],
      forbiddenPreviousTransformations:Array.isArray(t.forbiddenPreviousTransformations)?t.forbiddenPreviousTransformations:[],
      requiredMinStats:readStats(t.requiredMinStats),
      requiredMaxStats:t.requiredMaxStats??null,
      includeBonusesForMinStats:t.includeBonusesForMinStats??false,
      includeBonusesForMaxStats:t.includeBonusesForMaxStats??false,
      requiredCommendations:t.requiredCommendations??{},
      requiredItems:t.requiredItems??{},minRank:t.minRank??0,
      allowsLiveSoldiers:t.allowsLiveSoldiers??false,
      allowsWoundedSoldiers:t.allowsWoundedSoldiers??false,
      allowsDeadSoldiers:t.allowsDeadSoldiers??false,
      needsCorpseRecovered:t.needsCorpseRecovered??true,
      producedSoldierType:t.producedSoldierType??null,producedSoldierArmor:t.producedSoldierArmor??null,
      producedItem:t.producedItem??null,keepSoldierArmor:t.keepSoldierArmor??false,
      reset:t.reset??false,resetRank:t.resetRank??false,
      removeTransformations:Array.isArray(t.removeTransformations)?t.removeTransformations:[],
      soldierBonusType:trait,
      flatOverallStatChange:flat,flatMin:readStats(t.flatMin),flatMax:readStats(t.flatMax),
      percentOverallStatChange:readStats(t.percentOverallStatChange),
      percentGainedStatChange:readStats(t.percentGainedStatChange),
      percentMin:readStats(t.percentMin),percentMax:readStats(t.percentMax),
      percentGainedMin:readStats(t.percentGainedMin),percentGainedMax:readStats(t.percentGainedMax),
      rerollStats:t.rerollStats??null,
      lowerBoundAtMinStats:t.lowerBoundAtMinStats??true,
      upperBoundAtMaxStats:t.upperBoundAtMaxStats??false,
      upperBoundAtStatCaps:t.upperBoundAtStatCaps??false,
      upperBoundType:t.upperBoundType??0,
      traitStats,
      fixedEffectiveDelta:addStats(flat,traitStats),
      cost:t.cost??0,transferTime:t.transferTime??0,recoveryTime:t.recoveryTime??0,createsClone:t.createsClone??false,
      sourceFiles:sourceHistory["name:"+t.name]||["Piratez_Transformations.rul"]
    };
  }).sort((a,b)=>a.koName.localeCompare(b.koName,"ko"));

  const bonusIndex=bonuses.map(b=>({
    id:b.name,koName:tr(b.name,"ko"),enName:tr(b.name,"en"),stats:readStats(b.stats),
    frontArmor:b.frontArmor??0,sideArmor:b.sideArmor??0,rearArmor:b.rearArmor??0,underArmor:b.underArmor??0,
    visibilityAtDark:b.visibilityAtDark??0,recovery:b.recovery??null,
    sourceFiles:sourceHistory["name:"+b.name]||[]
  })).sort((a,b)=>a.koName.localeCompare(b.koName,"ko"));

  const profileCounts={
    direct:profiles.filter(x=>x.sourceType==="direct").length,
    manufacture:profiles.filter(x=>x.sourceType==="manufacture").length,
    event:profiles.filter(x=>x.sourceType==="event").length,
    saintUnique:profiles.filter(x=>x.saintSlots>0).length,
    saintSlots:saintSlots.length
  };

  // This cross-index preserves the research exclusivity graph and all known
  // purchase/manufacture routes for items used by transformations. It does not
  // assume that a research topic or a material is automatically obtainable.
  const researchRules=Object.fromEntries((Array.isArray(effectiveMerged.research)?effectiveMerged.research:[])
    .filter(x=>typeof x?.name==='string').map(x=>[x.name,{
      requires:Array.isArray(x.requires)?x.requires:[],
      dependencies:Array.isArray(x.dependencies)?x.dependencies:[],
      disables:Array.isArray(x.disables)?x.disables:[],
      reenables:Array.isArray(x.reenables)?x.reenables:[],
      unlocks:Array.isArray(x.unlocks)?x.unlocks:[],
      getOneFree:Array.isArray(x.getOneFree)?x.getOneFree:[],
      getOneFreeProtected:x.getOneFreeProtected??{},
      needItem:x.needItem??false,neededItem:x.neededItem??x.name,
      requiresBaseFunc:Array.isArray(x.requiresBaseFunc)?x.requiresBaseFunc:[],
      cost:x.cost??0
    }]));
  // A worn armor contributes exactly one Armor::stats record, not a sum
  // of every item a soldier can eventually unlock. Record only armors with
  // explicit player-soldier type eligibility; all acquisition claims stay
  // conditional until storeItem's research and supply route are resolved.
  const armorCatalog=(Array.isArray(effectiveMerged.armors)?effectiveMerged.armors:[])
    .filter(x=>typeof x?.type==="string"&&Array.isArray(x.units)&&x.units.some(id=>soldierIds.has(id)))
    .map(x=>({
      id:x.type,koName:tr(x.type,"ko"),enName:tr(x.type,"en"),
      soldierTypes:x.units.filter(id=>soldierIds.has(id)),
      storeItem:x.storeItem??null,requires:Array.isArray(x.requires)?x.requires:[],
      stats:readStats(x.stats),weight:x.weight??null,
      frontArmor:x.frontArmor??0,sideArmor:x.sideArmor??0,
      rearArmor:x.rearArmor??0,underArmor:x.underArmor??0,
      sourceFiles:sourceHistory["type:"+x.type]||[]
    }));
  const commendationIndex=Object.fromEntries((Array.isArray(effectiveMerged.commendations)?effectiveMerged.commendations:[])
    .filter(x=>typeof x?.type==="string").map(x=>[x.type,{
      koName:tr(x.type,"ko"),enName:tr(x.type,"en"),
      bonusLevels:Array.isArray(x.soldierBonusTypes)?x.soldierBonusTypes:[],
      criteria:x.criteria??{},killCriteria:x.killCriteria??{},
      missionTypeFilter:x.missionTypeFilter??[]
    }]));
  const neededItems=new Set([
    ...transformationIndex.flatMap(x=>Object.keys(x.requiredItems||{})),
    ...armorCatalog.map(x=>x.storeItem).filter(id=>id&&id!=="STR_NONE")
  ]);
  const baseFacilityFunctions=Object.fromEntries((Array.isArray(effectiveMerged.facilities)?effectiveMerged.facilities:[])
    .filter(x=>typeof x?.type==="string")
    .map(x=>[x.type,{
      provides:Array.isArray(x.provideBaseFunc)?x.provideBaseFunc:[],
      requires:Array.isArray(x.requiresBaseFunc)?x.requiresBaseFunc:[],
      research:Array.isArray(x.requires)?x.requires:[]
    }]));
  const itemSupply={};
  for(const id of neededItems){
    const it=(Array.isArray(effectiveMerged.items)?effectiveMerged.items:[]).find(x=>x?.type===id);
    const recipes=(Array.isArray(effectiveMerged.manufacture)?effectiveMerged.manufacture:[])
      .filter(x=>Number(x?.producedItems?.[id])>0)
      .map(x=>({id:x.name,quantity:x.producedItems[id],requires:x.requires??[],
        requiresBaseFunc:x.requiresBaseFunc??[],requiredItems:x.requiredItems??{},cost:x.cost??0}));
    itemSupply[id]={exists:!!it,buyCost:it?.costBuy??0,
      buyRequires:it?.requires??[],buyRequirements:it?.buyRequirements??[],
      manufacture:recipes};
  }
  return{
    statKeys:SOLDIER_STAT_KEYS,statLabels:SOLDIER_STAT_LABELS,
    soldiers,profiles,transformations:transformationIndex,bonuses:bonusIndex,profileCounts,resourceDetails,researchRules,itemSupply,armorCatalog,commendationIndex,baseFacilityFunctions,woundThresholds,
    counts:{soldiers:soldiers.length,soldierProfiles:profiles.length,soldierTransformations:transformationIndex.length,soldierBonuses:bonusIndex.length,soldierArmors:armorCatalog.length,soldierMedals:Object.keys(commendationIndex).length,soldierResourceFields:Object.values(resourceDetails).reduce((s,x)=>s+x.effective.length,0)}
  };
}
