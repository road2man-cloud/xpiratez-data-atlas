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
function readMaxRequirementStats(x){
  const out=Object.fromEntries(SOLDIER_STAT_KEYS.map(k=>[k,9999]));
  if(x&&typeof x==="object")for(const k of SOLDIER_STAT_KEYS){
    const v=Number(x[k]);if(Number.isFinite(v))out[k]=v;
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
function templateRange(rule,template,key){
  const range=baseRange(rule);
  const current=template?.[key]&&typeof template[key]==="object"?template[key]:{};
  for(const k of SOLDIER_STAT_KEYS){
    const v=Number(current[k]);
    if(Number.isFinite(v)){range.min[k]=v;range.avg[k]=v;range.max[k]=v;}
  }
  return range;
}
function templateCurrentRange(rule,template){return templateRange(rule,template,"currentStats");}
function templateInitialRange(rule,template){return templateRange(rule,template,"initialStats");}
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
    const initial=templateInitialRange(soldier,template);
    const current=templateCurrentRange(soldier,template);
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
      initialStats:initial,currentStatsBeforeTraits:current,traitNames,traits:bonusDetails(traitNames),traitStats,
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

  const transformationIndex=transformations.map((t,ruleOrder)=>{
    const flat=readStats(t.flatOverallStatChange);
    const trait=t.soldierBonusType&&bonusByName.has(t.soldierBonusType)?t.soldierBonusType:null;
    const traitStats=trait?readStats(bonusByName.get(trait).stats):zeroStats();
    return{
      id:t.name,koName:tr(t.name,"ko"),enName:tr(t.name,"en"),ruleOrder,
      requires:Array.isArray(t.requires)?t.requires:[],
      requiresBaseFunc:Array.isArray(t.requiresBaseFunc)?t.requiresBaseFunc:[],
      allowedSoldierTypes:Array.isArray(t.allowedSoldierTypes)?t.allowedSoldierTypes:[],
      forbiddenSoldierTypes:Array.isArray(t.forbiddenSoldierTypes)?t.forbiddenSoldierTypes:[],
      requiredPreviousTransformations:Array.isArray(t.requiredPreviousTransformations)?t.requiredPreviousTransformations:[],
      forbiddenPreviousTransformations:Array.isArray(t.forbiddenPreviousTransformations)?t.forbiddenPreviousTransformations:[],
      producedSoldierType:t.producedSoldierType??null,
      soldierBonusType:trait,
      flatOverallStatChange:flat,
      flatMin:readStats(t.flatMin),flatMax:readStats(t.flatMax),
      percentOverallStatChange:readStats(t.percentOverallStatChange),
      percentMin:readStats(t.percentMin),percentMax:readStats(t.percentMax),
      percentGainedStatChange:readStats(t.percentGainedStatChange),
      percentGainedMin:readStats(t.percentGainedMin),percentGainedMax:readStats(t.percentGainedMax),
      requiredMinStats:readStats(t.requiredMinStats),requiredMaxStats:readMaxRequirementStats(t.requiredMaxStats),
      lowerBoundAtMinStats:t.lowerBoundAtMinStats!==false,
      upperBoundAtMaxStats:Boolean(t.upperBoundAtMaxStats),
      upperBoundAtStatCaps:Boolean(t.upperBoundAtStatCaps),
      upperBoundType:Number.isFinite(Number(t.upperBoundType))?Number(t.upperBoundType):0,
      includeBonusesForMinStats:Boolean(t.includeBonusesForMinStats),
      includeBonusesForMaxStats:Boolean(t.includeBonusesForMaxStats),
      rerollStats:readStats(t.rerollStats),
      reset:Boolean(t.reset),removeTransformations:Array.isArray(t.removeTransformations)?t.removeTransformations:[],
      traitStats,
      fixedEffectiveDelta:addStats(flat,traitStats),
      cost:t.cost??0,recoveryTime:t.recoveryTime??0,createsClone:t.createsClone??false,
      sourceFiles:sourceHistory["name:"+t.name]||["Piratez_Transformations.rul"]
    };
  }).sort((a,b)=>a.koName.localeCompare(b.koName,"ko"));


  const transformationById=new Map(transformationIndex.map(t=>[t.id,t]));
  const hasPositiveStat=x=>SOLDIER_STAT_KEYS.some(k=>(Number(x?.[k])||0)>0);
  const hasAnyStat=x=>SOLDIER_STAT_KEYS.some(k=>(Number(x?.[k])||0)!==0);
  const isOneShot=t=>t.forbiddenPreviousTransformations.includes(t.id);
  const isEnhancementTarget=t=>!t.producedSoldierType&&!t.createsClone&&(
    t.soldierBonusType||(isOneShot(t)&&(hasPositiveStat(t.fixedEffectiveDelta)||hasPositiveStat(t.percentGainedStatChange)))
  );
  const transformationAppliesTo=(soldierType,t)=>
    !t.producedSoldierType&&!t.createsClone&&
    (!t.allowedSoldierTypes.length||t.allowedSoldierTypes.includes(soldierType))&&
    !t.forbiddenSoldierTypes.includes(soldierType);

  function buildEnhancementBuildSet(soldierType,previousTransformations){
    const prior=new Set(Object.entries(previousTransformations||{}).filter(([,v])=>v).map(([k])=>k));

    function prerequisiteClosure(id,trail=new Set()){
      if(prior.has(id))return new Set();
      if(trail.has(id))return null;
      const t=transformationById.get(id);
      if(!t||!transformationAppliesTo(soldierType,t))return null;
      if(t.forbiddenPreviousTransformations.some(x=>prior.has(x)))return null;
      const nextTrail=new Set(trail);nextTrail.add(id);
      const out=new Set([id]);
      for(const req of t.requiredPreviousTransformations){
        if(prior.has(req))continue;
        const c=prerequisiteClosure(req,nextTrail);
        if(!c)return null;
        for(const x of c)out.add(x);
      }
      return out;
    }

    const targets=[];
    for(const t of transformationIndex){
      if(!isEnhancementTarget(t)||!transformationAppliesTo(soldierType,t)||prior.has(t.id))continue;
      const closure=prerequisiteClosure(t.id);
      if(closure)targets.push({id:t.id,closure});
    }
    const targetById=new Map(targets.map(x=>[x.id,x]));
    const sequenceCache=new Map();

    function unionClosures(ids){
      const out=new Set();
      for(const id of ids)for(const x of targetById.get(id)?.closure||[])out.add(x);
      return out;
    }

    function sequenceFor(transformSet){
      const ids=[...transformSet].sort();
      const key=ids.join("|");
      if(sequenceCache.has(key))return sequenceCache.get(key);
      const pending=new Set(ids),applied=new Set(prior),bad=new Set();

      function dfs(order){
        if(!pending.size)return order;
        const state=[...pending].sort().join("|");
        if(bad.has(state))return null;
        const choices=[...pending].filter(id=>{
          const t=transformationById.get(id);
          return t&&
            t.requiredPreviousTransformations.every(r=>applied.has(r))&&
            !t.forbiddenPreviousTransformations.some(f=>applied.has(f));
        }).sort();
        for(const id of choices){
          pending.delete(id);applied.add(id);
          const result=dfs([...order,id]);
          if(result)return result;
          applied.delete(id);pending.add(id);
        }
        bad.add(state);return null;
      }

      const result=dfs([]);
      sequenceCache.set(key,result);
      return result;
    }

    if(!targets.length)return[{id:"B0",targetIds:[],transformationIds:[],traitIds:[],fixedDelta:zeroStats(),capDelta:zeroStats(),percentGainedChange:zeroStats(),growthSensitive:false,cost:0,recoveryTime:0}];

    const neighbors=new Map(targets.map(x=>[x.id,new Set()]));
    for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++){
      const a=targets[i].id,b=targets[j].id;
      if(sequenceFor(unionClosures([a,b]))){neighbors.get(a).add(b);neighbors.get(b).add(a);}
    }

    const cliques=[];
    function bronKerbosch(r,p,x){
      if(!p.size&&!x.size){cliques.push([...r]);return;}
      let pivot=null,pivotCount=-1;
      for(const u of new Set([...p,...x])){
        let n=0;for(const v of p)if(neighbors.get(u)?.has(v))n++;
        if(n>pivotCount){pivot=u;pivotCount=n;}
      }
      const candidates=[...p].filter(v=>!neighbors.get(pivot)?.has(v));
      for(const v of candidates){
        const nv=neighbors.get(v)||new Set();
        bronKerbosch(
          new Set([...r,v]),
          new Set([...p].filter(y=>nv.has(y))),
          new Set([...x].filter(y=>nv.has(y)))
        );
        p.delete(v);x.add(v);
      }
    }
    bronKerbosch(new Set(),new Set(targets.map(x=>x.id)),new Set());

    const valid=[],seenTargetSets=new Set();
    function salvage(ids){
      const sorted=[...ids].sort(),key=sorted.join("|");
      if(seenTargetSets.has(key))return;
      seenTargetSets.add(key);
      const transforms=unionClosures(sorted);
      const sequence=sequenceFor(transforms);
      if(sequence){valid.push({targets:sorted,transforms:[...transforms].sort(),sequence});return;}
      if(sorted.length<=1)return;
      for(let i=0;i<sorted.length;i++)salvage(sorted.filter((_,j)=>j!==i));
    }
    for(const clique of cliques)salvage(clique);

    const maximal=valid.filter((x,i)=>!valid.some((y,j)=>
      i!==j&&x.targets.length<y.targets.length&&x.targets.every(id=>y.targets.includes(id))
    ));
    const unique=[...new Map(maximal.map(x=>[x.transforms.join("|"),x])).values()];

    function summarize(x,index){
      let fixed=zeroStats(),capDelta=zeroStats(),percent=zeroStats(),cost=0,recoveryTime=0;
      const traitIds=[];
      for(const id of x.sequence){
        const t=transformationById.get(id);if(!t)continue;
        fixed=addStats(fixed,t.fixedEffectiveDelta);
        capDelta=addStats(capDelta,t.traitStats);
        percent=addStats(percent,t.percentGainedStatChange);
        cost+=Number(t.cost)||0;recoveryTime+=Number(t.recoveryTime)||0;
        if(t.soldierBonusType&&!traitIds.includes(t.soldierBonusType))traitIds.push(t.soldierBonusType);
      }
      return{
        id:"B"+index,targetIds:x.targets,transformationIds:x.sequence,traitIds,
        fixedDelta:fixed,capDelta,percentGainedChange:percent,growthSensitive:hasAnyStat(percent),
        cost,recoveryTime
      };
    }
    return unique.map(summarize).sort((a,b)=>
      b.targetIds.length-a.targetIds.length||
      b.transformationIds.length-a.transformationIds.length||
      a.transformationIds.join("|").localeCompare(b.transformationIds.join("|"),"en")
    ).map((x,i)=>({...x,id:"B"+i}));
  }

  const enhancementBuildSets=[],enhancementSetBySignature=new Map();
  function getEnhancementBuildSet(soldierType,previousTransformations){
    const prior=Object.entries(previousTransformations||{}).filter(([,v])=>v).map(([k])=>k).sort();
    const signature=soldierType+"|"+prior.join(",");
    let set=enhancementSetBySignature.get(signature);
    if(!set){
      set={
        id:"E"+enhancementBuildSets.length,
        soldierType,
        previousTransformations:prior,
        combinations:buildEnhancementBuildSet(soldierType,previousTransformations)
      };
      enhancementSetBySignature.set(signature,set);
      enhancementBuildSets.push(set);
    }
    return set;
  }

  function conversionRoutesFor(profile){
    const startPrior=new Set(Object.entries(profile.previousTransformations||{}).filter(([,v])=>v).map(([k])=>k));
    const routes=[],seen=new Set();
    function walk(currentType,prior,sequence){
      for(const t of transformationIndex){
        if(!t.producedSoldierType||t.createsClone||sequence.includes(t.id)||prior.has(t.id))continue;
        if(t.allowedSoldierTypes.length&&!t.allowedSoldierTypes.includes(currentType))continue;
        if(t.forbiddenSoldierTypes.includes(currentType))continue;
        if(t.requiredPreviousTransformations.some(x=>!prior.has(x)))continue;
        if(t.forbiddenPreviousTransformations.some(x=>prior.has(x)))continue;
        const nextPrior=new Set(prior);
        for(const id of t.removeTransformations||[])nextPrior.delete(id);
        nextPrior.add(t.id);
        const nextType=t.producedSoldierType;
        const nextSequence=[...sequence,t.id];
        const key=nextType+"|"+nextSequence.join("|")+"|"+[...nextPrior].sort().join(",");
        if(seen.has(key))continue;
        seen.add(key);
        const priorObject=Object.fromEntries([...nextPrior].map(id=>[id,1]));
        const set=getEnhancementBuildSet(nextType,priorObject);
        routes.push({
          id:"C"+routes.length,
          transformationIds:nextSequence,
          finalSoldierType:nextType,
          enhancementBuildSetId:set.id
        });
      }
    }
    walk(profile.soldierType,startPrior,[]);
    return routes;
  }

  for(const profile of profiles){
    profile.enhancementBuildSetId=getEnhancementBuildSet(profile.soldierType,profile.previousTransformations).id;
    profile.conversionRoutes=conversionRoutesFor(profile);
  }

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

  return{
    statKeys:SOLDIER_STAT_KEYS,statLabels:SOLDIER_STAT_LABELS,
    soldiers,profiles,transformations:transformationIndex,enhancementBuildSets,bonuses:bonusIndex,profileCounts,resourceDetails,
    counts:{soldiers:soldiers.length,soldierProfiles:profiles.length,soldierTransformations:transformationIndex.length,soldierEnhancementBuildSets:enhancementBuildSets.length,soldierFinalBuilds:profiles.reduce((n,p)=>{
      const base=enhancementBuildSets.find(x=>x.id===p.enhancementBuildSetId)?.combinations.length||0;
      const converted=(p.conversionRoutes||[]).reduce((m,r)=>m+(enhancementBuildSets.find(x=>x.id===r.enhancementBuildSetId)?.combinations.length||0),0);
      return n+base+converted;
    },0),soldierBonuses:bonusIndex.length,soldierResourceFields:Object.values(resourceDetails).reduce((s,x)=>s+x.effective.length,0)}
  };
}
