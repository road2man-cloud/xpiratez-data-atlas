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
function templateCurrentRange(rule,template){
  const range=baseRange(rule);
  const current=template?.currentStats&&typeof template.currentStats==="object"?template.currentStats:{};
  for(const k of SOLDIER_STAT_KEYS){
    const v=Number(current[k]);
    if(Number.isFinite(v)){range.min[k]=v;range.avg[k]=v;range.max[k]=v;}
  }
  return range;
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
  const soldierList=(Array.isArray(effectiveMerged.soldiers)?effectiveMerged.soldiers:[]).filter(x=>x&&typeof x.type==="string");
  const soldierByType=new Map(soldierList.map(x=>[x.type,x]));
  const soldierIds=new Set(soldierByType.keys());
  const bonuses=(Array.isArray(effectiveMerged.soldierBonuses)?effectiveMerged.soldierBonuses:[]).filter(x=>x&&typeof x.name==="string");
  const bonusByName=new Map(bonuses.map(x=>[x.name,x]));

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
    const range=baseRange(rule);
    return{
      id:rule.type,koName:tr(rule.type,"ko"),enName:tr(rule.type,"en"),
      minStats:range.min,avgStats:range.avg,maxStats:range.max,
      statCaps:readStats(rule.statCaps),trainingStatCaps:readStats(rule.trainingStatCaps),
      costBuy:rule.costBuy??0,costSalary:rule.costSalary??0,monthlyBuyLimit:rule.monthlyBuyLimit??null,
      transferTime:rule.transferTime??null,requires:Array.isArray(rule.requires)?rule.requires:[],
      armor:rule.armor??null,allowPromotion:rule.allowPromotion??true,
      sourceFiles:sourceHistory["type:"+rule.type]||["Piratez.rul"],raw:rule,
      ...flatRange("base",range)
    };
  }

  const soldiers=soldierList.map(baseRecord).sort((a,b)=>a.koName.localeCompare(b.koName,"ko"));

  function spawnProfile(sourceType,sourceId,entry){
    const soldier=soldierByType.get(entry.spawnedPersonType); if(!soldier)return null;
    const template=entry.spawnedSoldier&&typeof entry.spawnedSoldier==="object"?entry.spawnedSoldier:{};
    const current=templateCurrentRange(soldier,template);
    const traitNames=bonusNames(template),traitStats=bonusStats(traitNames);
    const effective=applyBonuses(current,traitStats);
    return{
      id:sourceType+":"+sourceId,sourceType,sourceId,soldierType:soldier.type,
      soldierKoName:tr(soldier.type,"ko"),soldierEnName:tr(soldier.type,"en"),
      sourceKoName:tr(sourceId,"ko"),sourceEnName:tr(sourceId,"en"),
      spawnedPersons:sourceType==="event"?(entry.spawnedPersons??1):1,
      cost:entry.cost??null,time:entry.time??null,
      requires:Array.isArray(entry.requires)?entry.requires:[],
      requiresBaseFunc:Array.isArray(entry.requiresBaseFunc)?entry.requiresBaseFunc:[],
      currentStatsBeforeTraits:current,traitNames,traits:bonusDetails(traitNames),traitStats,
      effectiveStats:effective,
      initialStatsOverride:template.initialStats??null,currentStatsOverride:template.currentStats??null,
      previousTransformations:template.previousTransformations??{},
      armor:template.armor??soldier.armor??null,rank:template.rank??0,nationality:template.nationality??null,
      sourceFiles:sourceHistory["name:"+sourceId]||[],
      ...flatRange("effective",effective)
    };
  }

  const profiles=[];
  for(const x of (Array.isArray(effectiveMerged.manufacture)?effectiveMerged.manufacture:[])){
    if(soldierIds.has(x?.spawnedPersonType)){const p=spawnProfile("manufacture",x.name,x);if(p)profiles.push(p);}
  }
  for(const x of (Array.isArray(effectiveMerged.events)?effectiveMerged.events:[])){
    if(soldierIds.has(x?.spawnedPersonType)&&(x.spawnedPersons??1)>0){const p=spawnProfile("event",x.name,x);if(p)profiles.push(p);}
  }
  profiles.sort((a,b)=>(a.soldierKoName+a.sourceKoName).localeCompare(b.soldierKoName+b.sourceKoName,"ko"));

  const bonusIndex=bonuses.map(b=>({
    id:b.name,koName:tr(b.name,"ko"),enName:tr(b.name,"en"),stats:readStats(b.stats),
    frontArmor:b.frontArmor??0,sideArmor:b.sideArmor??0,rearArmor:b.rearArmor??0,underArmor:b.underArmor??0,
    visibilityAtDark:b.visibilityAtDark??0,recovery:b.recovery??null,
    sourceFiles:sourceHistory["name:"+b.name]||[]
  })).sort((a,b)=>a.koName.localeCompare(b.koName,"ko"));

  return{
    statKeys:SOLDIER_STAT_KEYS,statLabels:SOLDIER_STAT_LABELS,
    soldiers,profiles,bonuses:bonusIndex,
    counts:{soldiers:soldiers.length,soldierProfiles:profiles.length,soldierBonuses:bonusIndex.length}
  };
}
