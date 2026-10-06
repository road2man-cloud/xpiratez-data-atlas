let DATA=null,PROG=null;
const ASSET_VERSION="soldiers-20261007-finalbuilds3-type-conversions";
const versioned=url=>url+(url.includes("?")?"&":"?")+"v="+encodeURIComponent(ASSET_VERSION);
const PLAN_BUCKETS=new Map(),PLAN_CACHE=new Map(),TRANSFORM_BY_ID=new Map(),BUILD_SET_BY_ID=new Map(),BONUS_BY_ID=new Map(),SOLDIER_BY_ID=new Map();
let RESEARCH_TOPICS=null,FINAL_ROWS=[];
let sort={key:"firing",dir:-1},finalPage=0;
const FINAL_PAGE_SIZE=200;

const $=q=>document.querySelector(q);
const fmt=n=>n==null||Number.isNaN(Number(n))?"—":Number(n).toLocaleString("ko-KR",{maximumFractionDigits:1});
const pct=n=>n==null?"—":(Number(n)*100).toFixed(2)+"%";
const statOrder=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];
const sourceLabel={direct:"직접 고용",manufacture:"제조/Recruitment",event:"이벤트"};

async function load(){
  const res=await fetch(versioned("../data/soldiers-index.json"));
  if(!res.ok)throw new Error("병종 데이터 HTTP "+res.status);
  DATA=await res.json();
  for(const t of DATA.transformations||[])TRANSFORM_BY_ID.set(t.id,t);
  for(const s of DATA.enhancementBuildSets||[])BUILD_SET_BY_ID.set(s.id,s);
  for(const b of DATA.bonuses||[])BONUS_BY_ID.set(b.id,b);
  for(const s of DATA.soldiers||[])SOLDIER_BY_ID.set(s.id,s);
  FINAL_ROWS=buildFinalRows();
  try{
    const [prog,research]=await Promise.all([
      fetch(versioned("../data/progression.json")),
      fetch(versioned("../data/progression-research.json"))
    ]);
    if(prog.ok)PROG=await prog.json();
    if(research.ok)RESEARCH_TOPICS=(await research.json()).topics||[];
  }catch(err){console.warn("Progression data is not published yet.",err)}
  renderSummary();
  render();
}
function renderSummary(){
  const pc=DATA.profileCounts||{};
  $("#summary").innerHTML=[
    ["실제 획득형",DATA.profiles.length+"개","직접 "+(pc.direct||0)+" · 제조 "+(pc.manufacture||0)+" · 이벤트 "+(pc.event||0)],
    ["기본 바디 규칙",DATA.soldiers.length+"종","내부 RuleSoldier / 성장 규칙"],
    ["Saint 지원군",pc.saintUnique+"종","고유 결과 · 가중 슬롯 "+pc.saintSlots+"칸"],
    ["변신·훈련",DATA.transformations?.length+"개","초기 획득 후 파생 루트"],
    ["최종 강화 조합",FINAL_ROWS.length+"개","상호배타·선행순서 검증 완료"]
  ].map(x=>'<article class="metric card"><strong>'+x[0]+' '+x[1]+'</strong><span>'+x[2]+'</span></article>').join("");
}
function addStatsObj(a,b){
  const out={};
  for(const k of statOrder)out[k]=(Number(a?.[k])||0)+(Number(b?.[k])||0);
  return out;
}
function obeyMinimum(stats){
  const out={};
  for(const k of statOrder)out[k]=Math.max(k==="health"?1:0,Number(stats?.[k])||0);
  return out;
}
function randomBand(a,b,band,k){
  const x=Number(a?.[k])||0,y=Number(b?.[k])||0,lo=Math.min(x,y),hi=Math.max(x,y);
  return band==="min"?lo:band==="max"?hi:(lo+hi)/2;
}
function percentInt(base,percent){return Math.trunc((Number(base)||0)*(Number(percent)||0)/100);}
function transformDelta(rawCurrent,rawInitial,t,band,soldier){
  const out={};
  for(const k of statOrder){
    let change=(Number(t.flatOverallStatChange?.[k])||0)+randomBand(t.flatMin,t.flatMax,band,k);
    const overallPct=(Number(t.percentOverallStatChange?.[k])||0)+randomBand(t.percentMin,t.percentMax,band,k);
    const gainedPct=(Number(t.percentGainedStatChange?.[k])||0)+randomBand(t.percentGainedMin,t.percentGainedMax,band,k);
    change+=percentInt(rawCurrent?.[k],overallPct);
    change+=percentInt((Number(rawCurrent?.[k])||0)-(Number(rawInitial?.[k])||0),gainedPct);
    if(k==="bravery"){
      const sign=change<0?-1:1;
      change=Math.trunc((change+sign*5)/10)*10;
    }
    if(t.lowerBoundAtMinStats){
      change=Math.max(change,(Number(soldier?.minStats?.[k])||0)-(Number(rawCurrent?.[k])||0));
    }
    if(t.upperBoundAtMaxStats||t.upperBoundAtStatCaps){
      const upper=t.upperBoundAtMaxStats?(Number(soldier?.maxStats?.[k])||0):(Number(soldier?.statCaps?.[k])||0);
      const soft=Number(t.upperBoundType??0)!==2;
      if(soft){
        if(change>0)change=(Number(rawCurrent?.[k])||0)<=upper?Math.min(change,upper-(Number(rawCurrent?.[k])||0)):0;
      }else change=Math.min(change,upper-(Number(rawCurrent?.[k])||0));
    }
    out[k]=change;
  }
  return out;
}
function uniqueBonusIds(profile,combo){
  const ids=[...(profile.traitNames||[])];
  for(const id of combo.transformationIds||[]){
    const b=TRANSFORM_BY_ID.get(id)?.soldierBonusType;
    if(b&&!ids.includes(b))ids.push(b);
  }
  return ids;
}
function bonusStatsFor(ids){
  let out={};
  for(const id of new Set(ids||[]))out=addStatsObj(out,BONUS_BY_ID.get(id)?.stats||{});
  return out;
}
function effectiveStats(raw,bonusIds){
  const out=obeyMinimum(addStatsObj(raw,bonusStatsFor(bonusIds)));
  if((Number(raw?.psiSkill)||0)<=0&&out.psiSkill>0)out.psiSkill=Number(raw?.psiSkill)||0;
  return out;
}
function finalSoldierTypeFor(profile,combo){
  let type=profile.soldierType;
  for(const id of combo.transformationIds||[]){
    const t=TRANSFORM_BY_ID.get(id);
    if(t?.producedSoldierType)type=t.producedSoldierType;
  }
  return type;
}
function capForBonusIds(profile,bonusIds,soldierType=profile.soldierType){
  const raw=SOLDIER_BY_ID.get(soldierType)?.statCaps||profile.rawStatCaps||{},bonus=bonusStatsFor(bonusIds),out={};
  for(const k of statOrder){
    out[k]=Math.max(0,(Number(raw[k])||0)+(Number(bonus[k])||0));
    if(k==="psiSkill"&&(Number(raw[k])||0)<=0)out[k]=Number(raw[k])||0;
  }
  return out;
}
function finalCapFor(profile,combo){return capForBonusIds(profile,uniqueBonusIds(profile,combo),finalSoldierTypeFor(profile,combo));}
function simulateFinalStats(profile,combo,band){
  let currentSoldierType=profile.soldierType;
  let soldier=SOLDIER_BY_ID.get(currentSoldierType);
  const initial={...(profile.initialStats?.[band]||profile.currentStatsBeforeTraits?.[band]||{})};
  let raw={...(profile.currentStatsBeforeTraits?.[band]||{})};
  const bonusIds=[...(profile.traitNames||[])],preGrowth=Object.fromEntries(statOrder.map(k=>[k,0]));
  for(const id of combo.transformationIds||[]){
    const t=TRANSFORM_BY_ID.get(id);if(!t)continue;
    if(t.allowedSoldierTypes?.length&&!t.allowedSoldierTypes.includes(currentSoldierType))return{valid:false,failedAt:id,failedType:currentSoldierType};
    if(t.forbiddenSoldierTypes?.includes(currentSoldierType))return{valid:false,failedAt:id,failedType:currentSoldierType};
    const minCheck=t.includeBonusesForMinStats?effectiveStats(raw,bonusIds):raw;
    const rawCap=soldier?.statCaps||profile.rawStatCaps||{};
    for(const k of statOrder){
      const req=Number(t.requiredMinStats?.[k])||0;
      if(k==="psiSkill"&&req===0)continue;
      const cur=Number(minCheck?.[k])||0;
      if(cur>=req)continue;
      const need=req-cur,growCeiling=Math.max(Number(raw?.[k])||0,Number(rawCap?.[k])||0);
      if((Number(raw?.[k])||0)+need>growCeiling)return{valid:false,failedAt:id,failedStat:k,required:req,current:cur};
      raw[k]=(Number(raw[k])||0)+need;
      preGrowth[k]=(Number(preGrowth[k])||0)+need;
    }
    const maxCheck=t.includeBonusesForMaxStats?effectiveStats(raw,bonusIds):raw;
    for(const k of statOrder){
      const max=Number(t.requiredMaxStats?.[k]);
      if(Number.isFinite(max)&&(Number(maxCheck?.[k])||0)>max)return{valid:false,failedAt:id,failedStat:k,requiredMax:max,current:Number(maxCheck?.[k])||0};
    }
    raw=addStatsObj(raw,transformDelta(raw,initial,t,band,soldier));
    if(t.soldierBonusType&&!bonusIds.includes(t.soldierBonusType))bonusIds.push(t.soldierBonusType);
    if(t.producedSoldierType){
      currentSoldierType=t.producedSoldierType;
      soldier=SOLDIER_BY_ID.get(currentSoldierType)||soldier;
    }
  }
  return{valid:true,raw,effective:effectiveStats(raw,bonusIds),bonusIds,preGrowth,finalSoldierType:currentSoldierType};
}
const DYNAMIC_BUILD_SET_CACHE=new Map();
function dynamicEnhancementBuildSet(soldierType,previousTransformations={}){
  const prior=new Set(Object.entries(previousTransformations||{}).filter(([,v])=>v).map(([id])=>id));
  const cacheKey=soldierType+"|"+[...prior].sort().join(",");
  if(DYNAMIC_BUILD_SET_CACHE.has(cacheKey))return DYNAMIC_BUILD_SET_CACHE.get(cacheKey);
  const transformations=DATA.transformations||[];
  const hasPositiveStat=x=>statOrder.some(k=>(Number(x?.[k])||0)>0);
  const isOneShot=t=>(t.forbiddenPreviousTransformations||[]).includes(t.id);
  const isEnhancementTarget=t=>!t.producedSoldierType&&!t.createsClone&&(
    t.soldierBonusType||(isOneShot(t)&&(hasPositiveStat(t.fixedEffectiveDelta)||hasPositiveStat(t.percentGainedStatChange)))
  );
  const applies=t=>!t.producedSoldierType&&!t.createsClone&&
    (!(t.allowedSoldierTypes||[]).length||(t.allowedSoldierTypes||[]).includes(soldierType))&&
    !(t.forbiddenSoldierTypes||[]).includes(soldierType);

  function prerequisiteClosure(id,trail=new Set()){
    if(prior.has(id))return new Set();
    if(trail.has(id))return null;
    const t=TRANSFORM_BY_ID.get(id);
    if(!t||!applies(t))return null;
    if((t.forbiddenPreviousTransformations||[]).some(x=>prior.has(x)))return null;
    const nextTrail=new Set(trail);nextTrail.add(id);
    const out=new Set([id]);
    for(const req of t.requiredPreviousTransformations||[]){
      if(prior.has(req))continue;
      const c=prerequisiteClosure(req,nextTrail);
      if(!c)return null;
      for(const x of c)out.add(x);
    }
    return out;
  }

  const targets=[];
  for(const t of transformations){
    if(!isEnhancementTarget(t)||!applies(t)||prior.has(t.id))continue;
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
    const ids=[...transformSet].sort(),key=ids.join("|");
    if(sequenceCache.has(key))return sequenceCache.get(key);
    const pending=new Set(ids),applied=new Set(prior),bad=new Set();
    function dfs(order){
      if(!pending.size)return order;
      const state=[...pending].sort().join("|");
      if(bad.has(state))return null;
      const choices=[...pending].filter(id=>{
        const t=TRANSFORM_BY_ID.get(id);
        return t&&
          (t.requiredPreviousTransformations||[]).every(req=>applied.has(req))&&
          !(t.forbiddenPreviousTransformations||[]).some(f=>applied.has(f));
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

  let combinations;
  if(!targets.length){
    combinations=[{id:"B0",targetIds:[],transformationIds:[],traitIds:[],fixedDelta:{},capDelta:{},percentGainedChange:{},growthSensitive:false,cost:0,recoveryTime:0}];
  }else{
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
      const transforms=unionClosures(sorted),sequence=sequenceFor(transforms);
      if(sequence){valid.push({targets:sorted,transforms:[...transforms].sort(),sequence});return;}
      if(sorted.length<=1)return;
      for(let i=0;i<sorted.length;i++)salvage(sorted.filter((_,j)=>j!==i));
    }
    for(const clique of cliques)salvage(clique);
    const maximal=valid.filter((x,i)=>!valid.some((y,j)=>
      i!==j&&x.targets.length<y.targets.length&&x.targets.every(id=>y.targets.includes(id))
    ));
    const unique=[...new Map(maximal.map(x=>[x.transforms.join("|"),x])).values()];
    combinations=unique.map((x,index)=>{
      const tx=x.sequence.map(id=>TRANSFORM_BY_ID.get(id)).filter(Boolean);
      const traitIds=[...new Set(tx.map(t=>t.soldierBonusType).filter(Boolean))];
      const sumField=field=>tx.reduce((out,t)=>addStatsObj(out,t[field]||{}),{});
      return{
        id:"B"+index,targetIds:x.targets,transformationIds:x.sequence,traitIds,
        fixedDelta:sumField("fixedEffectiveDelta"),capDelta:sumField("traitStats"),
        percentGainedChange:sumField("percentGainedStatChange"),
        growthSensitive:tx.some(t=>statOrder.some(k=>(Number(t.percentGainedStatChange?.[k])||0)!==0)),
        cost:tx.reduce((n,t)=>n+(Number(t.cost)||0),0),
        recoveryTime:tx.reduce((n,t)=>n+(Number(t.recoveryTime)||0),0)
      };
    }).sort((a,b)=>b.targetIds.length-a.targetIds.length||b.transformationIds.length-a.transformationIds.length||
      a.transformationIds.join("|").localeCompare(b.transformationIds.join("|"),"en")
    ).map((x,i)=>({...x,id:"B"+i}));
  }
  const set={id:"DYN:"+cacheKey,soldierType,previousTransformations:[...prior].sort(),combinations};
  DYNAMIC_BUILD_SET_CACHE.set(cacheKey,set);
  return set;
}
function dynamicConversionRoutes(profile){
  const prior=new Set(Object.entries(profile.previousTransformations||{}).filter(([,v])=>v).map(([id])=>id));
  const routes=[];
  for(const t of DATA.transformations||[]){
    if(!t.producedSoldierType||t.createsClone||prior.has(t.id))continue;
    if((t.allowedSoldierTypes||[]).length&&!(t.allowedSoldierTypes||[]).includes(profile.soldierType))continue;
    if((t.forbiddenSoldierTypes||[]).includes(profile.soldierType))continue;
    if((t.requiredPreviousTransformations||[]).some(x=>!prior.has(x)))continue;
    if((t.forbiddenPreviousTransformations||[]).some(x=>prior.has(x)))continue;
    const nextPrior=new Set(prior);
    for(const id of t.removeTransformations||[])nextPrior.delete(id);
    nextPrior.add(t.id);
    const previousTransformations=Object.fromEntries([...nextPrior].map(id=>[id,1]));
    routes.push({
      id:"DYN-C"+routes.length,
      transformationIds:[t.id],
      finalSoldierType:t.producedSoldierType,
      dynamicBuildSet:dynamicEnhancementBuildSet(t.producedSoldierType,previousTransformations)
    });
  }
  return routes;
}
function buildFinalRows(){
  const rows=[];
  function materializeCombo(prefixIds,baseCombo,routeId){
    const transformationIds=[...(prefixIds||[]),...(baseCombo.transformationIds||[])];
    const transformations=transformationIds.map(id=>TRANSFORM_BY_ID.get(id)).filter(Boolean);
    const traitIds=[...new Set(transformations.map(t=>t.soldierBonusType).filter(Boolean))];
    const sumField=field=>transformations.reduce((out,t)=>addStatsObj(out,t[field]||{}),{});
    return{
      ...baseCombo,
      id:routeId+":"+baseCombo.id,
      transformationIds,
      targetIds:[...new Set([...(prefixIds||[]),...(baseCombo.targetIds||[])])],
      traitIds,
      fixedDelta:sumField("fixedEffectiveDelta"),
      capDelta:sumField("traitStats"),
      percentGainedChange:sumField("percentGainedStatChange"),
      growthSensitive:transformations.some(t=>statOrder.some(k=>(Number(t.percentGainedStatChange?.[k])||0)!==0)),
      cost:transformations.reduce((n,t)=>n+(Number(t.cost)||0),0),
      recoveryTime:transformations.reduce((n,t)=>n+(Number(t.recoveryTime)||0),0)
    };
  }
  for(const profile of DATA.profiles||[]){
    const routes=[
      {id:"BASE",transformationIds:[],finalSoldierType:profile.soldierType,enhancementBuildSetId:profile.enhancementBuildSetId},
      ...((profile.conversionRoutes||[]).length?profile.conversionRoutes:dynamicConversionRoutes(profile))
    ];
    for(const route of routes){
      const set=BUILD_SET_BY_ID.get(route.enhancementBuildSetId)||route.dynamicBuildSet;if(!set)continue;
      for(const baseCombo of set.combinations||[]){
        const combo=materializeCombo(route.transformationIds,baseCombo,route.id);
        const transformations=(combo.transformationIds||[]).map(id=>TRANSFORM_BY_ID.get(id)).filter(Boolean);
        const enhancementNames=transformations.map(t=>t.koName);
        const timingSensitive=transformations.some(t=>statOrder.some(k=>
          (Number(t.percentOverallStatChange?.[k])||0)||(Number(t.percentGainedStatChange?.[k])||0)||
          (Number(t.percentMin?.[k])||0)||(Number(t.percentMax?.[k])||0)||
          (Number(t.percentGainedMin?.[k])||0)||(Number(t.percentGainedMax?.[k])||0)
        )||t.upperBoundAtMaxStats||t.upperBoundAtStatCaps);
        const randomSensitive=transformations.some(t=>statOrder.some(k=>
          (Number(t.flatMin?.[k])||0)!==(Number(t.flatMax?.[k])||0)||
          (Number(t.percentMin?.[k])||0)!==(Number(t.percentMax?.[k])||0)||
          (Number(t.percentGainedMin?.[k])||0)!==(Number(t.percentGainedMax?.[k])||0)
        ));
        const addedTraitIds=[...new Set(combo.traitIds||[])];
        const addedTraitNames=addedTraitIds.map(id=>BONUS_BY_ID.get(id)?.koName||id);
        const startTraitNames=profile.traits?.map(t=>t.koName)||[];
        const finalTraitNames=[...new Set([...startTraitNames,...addedTraitNames])];
        const simulations={
          min:simulateFinalStats(profile,combo,"min"),
          avg:simulateFinalStats(profile,combo,"avg"),
          max:simulateFinalStats(profile,combo,"max")
        };
        if(Object.values(simulations).some(x=>!x.valid))continue;
        const finalType=simulations.avg.finalSoldierType||route.finalSoldierType||profile.soldierType;
        const finalSoldier=SOLDIER_BY_ID.get(finalType);
        const finalStats={min:simulations.min.effective,avg:simulations.avg.effective,max:simulations.max.effective};
        const preGrowthByBand={min:simulations.min.preGrowth,avg:simulations.avg.preGrowth,max:simulations.max.preGrowth};
        const preGrowthTotal=statOrder.reduce((n,k)=>n+(Number(preGrowthByBand.avg?.[k])||0),0);
        const base=profile.effectiveStats||{};
        const deltaByBand={};
        for(const band of ["min","avg","max"]){
          deltaByBand[band]={};
          for(const k of statOrder)deltaByBand[band][k]=(Number(finalStats[band]?.[k])||0)-(Number(base[band]?.[k])||0);
        }
        rows.push({
          id:"final:"+profile.id+":"+route.id+":"+set.id+":"+baseCombo.id,_mode:"final",
          _name:finalSoldier?.koName||profile.soldierKoName,_id:finalType,
          _route:[profile.sourceKoName,...enhancementNames].join(" "),
          profile,combo,enhancementNames,addedTraitNames,finalTraitNames,finalSoldierType:finalType,
          finalStats,finalCap:finalCapFor(profile,combo),deltaByBand,preGrowthByBand,preGrowthTotal,
          enhancementCount:combo.transformationIds?.length||0,
          targetCount:combo.targetIds?.length||0,
          totalTraitCount:finalTraitNames.length,
          cost:combo.cost||0,recoveryTime:combo.recoveryTime||0,
          growthSensitive:!!combo.growthSensitive,timingSensitive:timingSensitive||preGrowthTotal>0,randomSensitive,
          sourceId:profile.sourceId,sourceEnName:profile.sourceEnName
        });
      }
    }
  }
  return rows;
}
function dataset(){
  const mode=$("#dataset").value;
  if(mode==="final")return FINAL_ROWS;
  if(mode==="soldiers"){
    return DATA.soldiers.map(x=>({...x,_mode:"soldier",_name:x.koName,_id:x.id,_route:(x.requires||[]).join(", ")}));
  }
  if(mode==="transformations"){
    return (DATA.transformations||[]).map(x=>({...x,_mode:"transformation",_name:x.koName,_id:x.id,_route:(x.allowedSoldierTypes||[]).join(", ")}));
  }
  return DATA.profiles.map(x=>({...x,_mode:"profile",_name:x.soldierKoName,_id:x.soldierType,_route:x.sourceKoName}));
}
function cap(s){return s.charAt(0).toUpperCase()+s.slice(1)}
function statValue(row,key,band){
  if(row._mode==="soldier")return row["base"+cap(band)+"_"+key];
  if(row._mode==="profile")return row["effective"+cap(band)+"_"+key];
  if(row._mode==="final")return row.finalStats?.[band]?.[key]??0;
  if(row._mode==="transformation")return row.fixedEffectiveDelta?.[key]??0;
  return 0;
}
function growthCapValue(row,key){
  if(row._mode==="soldier")return row.statCaps?.[key]??0;
  if(row._mode==="profile")return row.effectiveStatCaps?.[key]??row.rawStatCaps?.[key]??0;
  if(row._mode==="final")return row.finalCap?.[key]??0;
  return 0;
}
function sortValue(row,key,band){
  if(!statOrder.includes(key))return row[key]??0;
  if(row._mode==="transformation")return statValue(row,key,band);
  return $("#sortMetric").value==="cap"?growthCapValue(row,key):statValue(row,key,band);
}
function searchBlob(row){
  return [
    row._name,row._id,row._route,row.sourceId,row.sourceEnName,row.soldierBonusType,row.producedSoldierType,
    ...(row.traitNames||[]),...(row.traits||[]).flatMap(t=>[t.koName,t.enName,t.id]),
    ...(row.requires||[]),...(row.allowedSoldierTypes||[]),...(row.requiredPreviousTransformations||[]),
    ...(row.forbiddenPreviousTransformations||[]),...(row.enhancementNames||[]),...(row.addedTraitNames||[]),...(row.finalTraitNames||[])
  ].filter(Boolean).join(" ").toLowerCase();
}
function filtered(){
  const q=$("#search").value.trim().toLowerCase();
  const traitsOnly=!$("#traitsOnly").disabled&&$("#traitsOnly").checked;
  let a=dataset().filter(r=>(!q||searchBlob(r).includes(q))&&(!traitsOnly||r._mode==="profile"&&r.traitNames.length));
  const band=$("#band").value;
  a.sort((x,y)=>{
    let av,bv;
    if(statOrder.includes(sort.key)){av=sortValue(x,sort.key,band);bv=sortValue(y,sort.key,band)}
    else if(sort.key==="name"){return x._name.localeCompare(y._name,"ko")*sort.dir}
    else{av=x[sort.key]??0;bv=y[sort.key]??0}
    return ((Number(av)||0)-(Number(bv)||0))*sort.dir;
  });
  return a;
}
function th(label,key,sub=""){
  const on=sort.key===key?" sort-on":"";
  const arrow=sort.key===key?(sort.dir>0?" ▲":" ▼"):"";
  return '<th data-sort="'+key+'" class="'+on+'">'+label+arrow+(sub?'<small class="th-sub">'+sub+'</small>':'')+'</th>';
}
function render(){
  if(!DATA)return;
  const mode=$("#dataset").value,band=$("#band").value;
  $("#traitsOnly").disabled=mode!=="profiles";
  $("#band").disabled=mode==="transformations";
  $("#sortMetric").disabled=mode==="transformations";
  $("#tableTitle").textContent=
    mode==="profiles"?"실제 획득형 — 초기 특성 포함 실전 스펙":
    mode==="final"?"최종 강화 조합 — 상호배타 규칙·선행 순서 적용":
    mode==="soldiers"?"기본 바디 규칙 — 내부 RuleSoldier 29종":
    "변신·훈련 루트 — 고정 변화량";
  let head;
  if(mode==="profiles"){
    head=[
      th("획득형","name"),'<th>획득 루트·자동 특성</th>',th("비용","cost"),th("시간","time"),
      ...statOrder.map(k=>th(DATA.statLabels[k],k,"능력 / 성장캡"))
    ].join("");
  }else if(mode==="final"){
    head=[
      th("획득형","name"),'<th>유효 최종 강화 조합</th>',th("특성","totalTraitCount"),th("강화비용","cost"),
      ...statOrder.map(k=>th(DATA.statLabels[k],k,"최종 / 성장캡"))
    ].join("");
  }else if(mode==="soldiers"){
    head=[
      th("기본 바디","name"),'<th>해금 조건</th>',th("구매가","costBuy"),th("월급","costSalary"),
      ...statOrder.map(k=>th(DATA.statLabels[k],k,"능력 / 성장캡"))
    ].join("");
  }else{
    head=[
      th("변신/훈련","name"),'<th>적용 대상·특성</th>',th("비용","cost"),th("회복","recoveryTime"),
      ...statOrder.map(k=>th("Δ "+DATA.statLabels[k],k))
    ].join("");
  }
  $("#soldierTable thead").innerHTML="<tr>"+head+"</tr>";
  const rows=filtered();
  let shown=rows;
  if(mode==="final"){
    const pages=Math.max(1,Math.ceil(rows.length/FINAL_PAGE_SIZE));
    finalPage=Math.max(0,Math.min(finalPage,pages-1));
    shown=rows.slice(finalPage*FINAL_PAGE_SIZE,(finalPage+1)*FINAL_PAGE_SIZE);
    $("#pager").innerHTML='<button data-page="'+(finalPage-1)+'" '+(finalPage<=0?"disabled":"")+'>← 이전</button><span>'+(finalPage+1)+' / '+pages+'</span><button data-page="'+(finalPage+1)+'" '+(finalPage>=pages-1?"disabled":"")+'>다음 →</button>';
    $("#pager").querySelectorAll("button[data-page]").forEach(b=>b.addEventListener("click",()=>{finalPage=Number(b.dataset.page)||0;render()}));
  }else $("#pager").innerHTML="";
  $("#rowCount").textContent=rows.length+"개"+(mode==="transformations"?" · 고정 변화량(Flat + SoldierBonus)":mode==="final"?" · "+({min:"최소",avg:"평균",max:"최대"}[band])+" 기준 · "+($("#sortMetric").value==="cap"?"성장캡":"최종 능력치")+" 정렬 · 페이지 "+(finalPage+1):" · "+({min:"최소",avg:"평균",max:"최대"}[band])+" 능력치 · "+($("#sortMetric").value==="cap"?"성장캡":"현재 능력치")+" 정렬");
  $("#soldierTable tbody").innerHTML=shown.map(r=>rowHtml(r,band)).join("");
  document.querySelectorAll("th[data-sort]").forEach(el=>el.addEventListener("click",()=>{
    const key=el.dataset.sort;
    if(sort.key===key)sort.dir*=-1;else sort={key,dir:key==="name"?1:-1};
    finalPage=0;render();
  }));
  document.querySelectorAll("tbody tr").forEach(el=>el.addEventListener("click",()=>openDetail(el.dataset.row)));
}
function sourceBadges(r){
  let s='<span class="tag">'+(sourceLabel[r.sourceType]||r.sourceType)+'</span>';
  if(r.saintSlots>0)s+=' <span class="tag saint">Saint '+r.saintSlots+'/31 · '+pct(r.saintProbability)+'</span>';
  return s;
}
function rowHtml(r,band){
  const id=encodeURIComponent(r.id);
  let second,c1,c2;
  if(r._mode==="profile"){
    const traits=(r.traits||[]).map(t=>'<span class="trait">'+t.koName+'</span>').join("");
    second=sourceBadges(r)+'<br><span class="route">'+r.sourceKoName+'</span><br>'+traits;
    c1=fmt(r.cost);c2=fmt(r.time);
  }else if(r._mode==="final"){
    const shown=(r.enhancementNames||[]).slice(0,8).map(x=>'<span class="trait">'+esc(x)+'</span>').join("");
    const more=(r.enhancementNames||[]).length>8?' <span class="tag">+'+((r.enhancementNames||[]).length-8)+'개</span>':"";
    const growth=r.timingSensitive?' <span class="tag growth-warn">적용 시점 영향</span>':"";
    second=sourceBadges(r.profile)+'<br><span class="route">'+esc(r.profile.sourceKoName)+'</span><br>'+shown+more+growth;
    c1=fmt(r.totalTraitCount);c2=fmt(r.cost);
  }else if(r._mode==="soldier"){
    second=(r.requires||[]).length?'<span class="route">'+r.requires.join("<br>")+'</span>':'<span class="muted">직접 조건 없음/특수</span>';
    c1=fmt(r.costBuy);c2=fmt(r.costSalary);
  }else{
    const trait=r.soldierBonusType?'<span class="trait">'+r.soldierBonusType+'</span>':'';
    const produced=r.producedSoldierType?'<span class="tag">→ '+r.producedSoldierType+'</span>':'';
    second='<span class="route">적용 '+(r.allowedSoldierTypes?.length||0)+'종</span><br>'+trait+' '+produced;
    c1=fmt(r.cost);c2=fmt(r.recoveryTime);
  }
  return '<tr data-row="'+id+'"><td><span class="name">'+r._name+'</span><span class="id">'+r._id+'</span></td><td>'+second+'</td><td>'+c1+'</td><td>'+c2+'</td>'+
    statOrder.map(k=>{
      const v=statValue(r,k,band);
      if(r._mode==="transformation"){
        const cls=v>0?"delta-pos":v<0?"delta-neg":"";
        const shown=v>0?"+"+fmt(v):fmt(v);
        return '<td><span class="'+cls+'">'+shown+'</span></td>';
      }
      const capV=growthCapValue(r,k);
      const d=r._mode==="profile"?(r.traitStats?.[k]||0):r._mode==="final"?(r.deltaByBand?.[band]?.[k]||0):0;
      const over=Number(v)>Number(capV)?" over-cap":"";
      const prefix=r._mode==="final"?"강화 ":"특성 ";
      const dc=d>0?'<small class="delta-pos">'+prefix+'+'+fmt(d)+'</small>':d<0?'<small class="delta-neg">'+prefix+fmt(d)+'</small>':'';
      return '<td><div class="stat-pair'+over+'"><span class="stat-current">'+fmt(v)+'</span><span class="stat-slash">/</span><span class="stat-cap">'+fmt(capV)+'</span></div>'+dc+'</td>';
    }).join("")+'</tr>';
}
function findRow(encoded){
  const id=decodeURIComponent(encoded);
  return dataset().find(x=>x.id===id);
}
function statsGrid(title,range,bonus=null){
  const band=$("#band").value;
  const vals=range?.[band]||{};
  return '<h3>'+title+'</h3><div class="stats-grid">'+statOrder.map(k=>{
    const d=bonus?.[k]||0;
    const delta=d>0?'<small class="delta-pos">특성 +'+fmt(d)+'</small>':d<0?'<small class="delta-neg">특성 '+fmt(d)+'</small>':'';
    return '<div class="statbox"><small>'+DATA.statLabels[k]+'</small><b>'+fmt(vals[k])+'</b>'+delta+'</div>';
  }).join("")+'</div>';
}
function statsCapGrid(title,row){
  const band=$("#band").value;
  const current=row.effectiveStats?.[band]||{};
  return '<h3>'+title+'</h3><div class="stats-grid">'+statOrder.map(k=>{
    const cur=current[k]??0;
    const raw=row.rawStatCaps?.[k]??0;
    const training=row.trainingStatCaps?.[k]??0;
    const trait=row.traitStats?.[k]??0;
    const eff=row.effectiveStatCaps?.[k]??raw;
    const over=Number(cur)>Number(eff)?' over-cap':'';
    return '<div class="statbox'+over+'"><small>'+DATA.statLabels[k]+'</small><b>'+fmt(cur)+' / '+fmt(eff)+'</b><small>본체 성장캡 '+fmt(raw)+' · 훈련캡 '+fmt(training)+(trait?' · 특성 '+(trait>0?'+':'')+fmt(trait):'')+'</small></div>';
  }).join("")+'</div><p class="muted">앞 숫자는 선택한 생성값, 뒤 숫자는 자동 특성까지 포함한 실효 성장캡입니다. 시작값이 캡보다 높은 특수 생성형은 그대로 유지되지만 일반 성장으로 더 오르지는 않습니다.</p>';
}
function finalStatsGrid(row){
  const band=$("#band").value,current=row.finalStats?.[band]||{},base=row.profile?.effectiveStats?.[band]||{};
  return '<h3>최종 강화 능력치 / 성장캡</h3><div class="stats-grid">'+statOrder.map(k=>{
    const cur=current[k]??0,capV=row.finalCap?.[k]??0,delta=(Number(cur)||0)-(Number(base[k])||0);
    const over=Number(cur)>Number(capV)?' over-cap':'';
    const dc=delta>0?'<small class="delta-pos">강화 +'+fmt(delta)+'</small>':delta<0?'<small class="delta-neg">강화 '+fmt(delta)+'</small>':'';
    return '<div class="statbox'+over+'"><small>'+DATA.statLabels[k]+'</small><b>'+fmt(cur)+' / '+fmt(capV)+'</b>'+dc+'</div>';
  }).join("")+'</div>';
}
function deltaGrid(title,stats){
  return '<h3>'+title+'</h3><div class="stats-grid">'+statOrder.map(k=>{
    const v=stats?.[k]||0;
    const cls=v>0?"delta-pos":v<0?"delta-neg":"muted";
    return '<div class="statbox"><small>'+DATA.statLabels[k]+'</small><b class="'+cls+'">'+(v>0?"+":"")+fmt(v)+'</b></div>';
  }).join("")+'</div>';
}
function openDetail(encoded){
  const r=findRow(encoded);if(!r)return;
  let html='<p class="eyebrow">'+(r._mode==="profile"?"실제 획득형":r._mode==="final"?"최종 강화 조합":r._mode==="soldier"?"기본 바디 규칙":"변신·훈련 루트")+'</p><h2>'+r._name+'</h2><p class="muted">'+r._id+'</p>';
  if(r._mode==="profile"){
    html+='<div class="detail-grid"><div class="box"><strong>획득 루트</strong>'+sourceBadges(r)+'<br>'+r.sourceKoName+'<br><small>'+r.sourceId+'</small></div><div class="box"><strong>비용 / 시간</strong>'+fmt(r.cost)+' / '+fmt(r.time)+'</div><div class="box"><strong>내부 바디</strong>'+r.soldierType+'<br><small>장갑 '+String(r.armor||"—")+'</small></div></div>';
    html+=statsGrid("특성 적용 전 생성 스펙",r.currentStatsBeforeTraits);
    html+=statsCapGrid("자동 특성 포함 능력치 / 성장캡",r);
    html+='<h3>생성 시 자동 특성</h3><div class="traits">'+(r.traits.length?r.traits.map(t=>'<div class="trait-card"><strong>'+t.koName+'</strong><small>'+t.id+'</small><div>'+statOrder.filter(k=>t.stats[k]).map(k=>DATA.statLabels[k]+" "+(t.stats[k]>0?"+":"")+t.stats[k]).join(" · ")+'</div></div>').join(""):'<span class="muted">없음</span>')+'</div>';
    html+='<h3>획득 템플릿</h3><div class="detail-grid"><div class="box"><strong>currentStats 덮어쓰기</strong><pre>'+esc(JSON.stringify(r.currentStatsOverride,null,2))+'</pre></div><div class="box"><strong>이전 변환</strong><pre>'+esc(JSON.stringify(r.previousTransformations,null,2))+'</pre></div><div class="box"><strong>필요 연구/조건</strong>'+(r.requires||[]).map(x=>'<span class="tag">'+x+'</span>').join(" ")+'</div></div>';
  }else if(r._mode==="final"){
    const p=r.profile;
    html+='<div class="detail-grid"><div class="box"><strong>획득 루트</strong>'+sourceBadges(p)+'<br>'+esc(p.sourceKoName)+'<br><small>'+esc(p.sourceId)+'</small></div><div class="box"><strong>최종 특성 / 추가 강화</strong>'+fmt(r.totalTraitCount)+' / '+fmt(r.enhancementCount)+'</div><div class="box"><strong>추가 비용 / 회복 합계</strong>'+fmt(r.cost)+' / '+fmt(r.recoveryTime)+'일</div></div>';
    html+='<div class="compat-ok"><strong>공존 검증 통과</strong><span>requiredPreviousTransformations와 forbiddenPreviousTransformations를 실제 실행 순서대로 검사한 조합입니다.</span></div>';
    html+=finalStatsGrid(r);
    if(r.preGrowthTotal>0)html+=deltaGrid("강화 조건 충족을 위한 최소 선성장 (평균 생성값 기준)",r.preGrowthByBand?.avg);
    html+='<h3>시작 시 자동 특성</h3><div class="traits">'+((p.traits||[]).length?(p.traits||[]).map(t=>'<div class="trait-card"><strong>'+esc(t.koName)+'</strong><small>'+esc(t.id)+'</small></div>').join(""):'<span class="muted">없음</span>')+'</div>';
    html+='<h3>추가 강화 실행 순서</h3><div class="traits">'+((r.combo.transformationIds||[]).length?(r.combo.transformationIds||[]).map((id,i)=>{const t=TRANSFORM_BY_ID.get(id);if(!t)return"";const bonus=t.soldierBonusType?(BONUS_BY_ID.get(t.soldierBonusType)?.koName||t.soldierBonusType):"특성 없음";const changes=statOrder.filter(k=>t.fixedEffectiveDelta?.[k]).map(k=>DATA.statLabels[k]+" "+(t.fixedEffectiveDelta[k]>0?"+":"")+fmt(t.fixedEffectiveDelta[k])).join(" · ");return '<div class="trait-card"><strong>'+(i+1)+'. '+esc(t.koName)+'</strong><small>'+esc(id)+' · '+esc(bonus)+'</small><div>'+(changes||'<span class="muted">고정 능력치 변화 없음</span>')+'</div></div>'}).join(""):'<span class="muted">추가 강화 없음</span>')+'</div>';
    html+='<div class="growth-note"><strong>OXCE 실제 변환식 기준</strong><span>각 단계의 requiredMinStats를 만족하지 못하면 현재 성장캡 안에서 필요한 최소치만큼 먼저 성장한 뒤 강화합니다. 이후 Flat 변화, 현재값 비례 변화, 성장분 비례 변화, 랜덤 범위, min/max/statCaps 상·하한을 OXCE 순서대로 적용합니다. 성장캡으로 요구조건에 도달할 수 없는 조합은 표에서 제외합니다.</span></div>';
    if(r.growthSensitive)html+=deltaGrid("성장분 비례 변화 합계",r.combo.percentGainedChange);
    if(r.randomSensitive)html+='<p class="muted">랜덤 변화 범위가 있는 강화가 포함되어 최소/평균/최대 탭의 결과가 달라집니다.</p>';
  }else if(r._mode==="soldier"){
    html+='<div class="detail-grid"><div class="box"><strong>구매 / 월급</strong>'+fmt(r.costBuy)+' / '+fmt(r.costSalary)+'</div><div class="box"><strong>월 고용 제한</strong>'+fmt(r.monthlyBuyLimit)+'</div><div class="box"><strong>기본 장갑</strong>'+String(r.armor||"—")+'</div></div>';
    html+=statsGrid("기본 생성 최소", {min:r.minStats,avg:r.minStats,max:r.minStats});
    html+=statsGrid("기본 생성 평균", {min:r.avgStats,avg:r.avgStats,max:r.avgStats});
    html+=statsGrid("기본 생성 최대", {min:r.maxStats,avg:r.maxStats,max:r.maxStats});
    html+='<h3>성장 상한</h3><div class="stats-grid">'+statOrder.map(k=>'<div class="statbox"><small>'+DATA.statLabels[k]+'</small><b>'+fmt(r.statCaps[k])+'</b><small>훈련 '+fmt(r.trainingStatCaps[k])+'</small></div>').join("")+'</div>';
  }else{
    html+='<div class="detail-grid"><div class="box"><strong>비용 / 회복</strong>'+fmt(r.cost)+' / '+fmt(r.recoveryTime)+'일</div><div class="box"><strong>적용 병종</strong>'+(r.allowedSoldierTypes||[]).length+'종</div><div class="box"><strong>생산 Soldier Type</strong>'+String(r.producedSoldierType||"유지")+'</div></div>';
    deltaGrid("직접 Flat 스탯 변화",r.flatOverallStatChange);
    deltaGrid("부여 특성의 스탯",r.traitStats);
    deltaGrid("고정 실효 변화량 합계",r.fixedEffectiveDelta);
    html+='<h3>성장분 비례 변화</h3><p class="muted">아래 percentGainedStatChange는 현재 총 스탯이 아니라 “초기치 이후 성장한 양”에 적용되므로 실제 최종 변화량은 병사마다 다릅니다.</p>';
    deltaGrid("percentGainedStatChange",r.percentGainedStatChange);
    html+='<div class="detail-grid"><div class="box"><strong>필요 연구</strong>'+(r.requires||[]).map(x=>'<span class="tag">'+x+'</span>').join(" ")+'</div><div class="box"><strong>필수 이전 변환</strong>'+(r.requiredPreviousTransformations||[]).map(x=>'<span class="tag">'+x+'</span>').join(" ")+'</div><div class="box"><strong>금지 이전 변환</strong>'+(r.forbiddenPreviousTransformations||[]).map(x=>'<span class="tag">'+x+'</span>').join(" ")+'</div></div>';
  }
  html+=renderProgression(r._id);
  $("#detailBody").innerHTML=html;
  $("#detailDialog").showModal();
}
function esc(s){return String(s).replace(/[&<>]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[m]))}
function planById(id){return PROG?.plans?.[id]||null}
function topicByIndex(i){return Number.isInteger(i)?RESEARCH_TOPICS?.[i]:i}
function planSummary(plan,title="해금 연구 트리"){
  if(!plan)return'<div class="route-card muted">연구 경로 없음</div>';
  const roots=(plan.roots||[]).map(topicByIndex).filter(Boolean).map(x=>'<span class="tag">'+esc(x.koName||x.id)+'</span>').join(" ");
  const gates=(plan.branchGates||[]).map(topicByIndex).filter(Boolean).map(x=>'<span class="trait">'+esc(x.koName||x.id)+'</span>').join(" ");
  return '<div class="route-card"><strong>'+title+'</strong><div class="route-metrics"><span>명목 누적 연구량 <b>'+fmt(plan.totalCost)+'</b></span><span>연구 노드 <b>'+fmt(plan.topicCount)+'</b></span><span>표본 조건 <b>'+fmt(plan.needItemCount)+'</b></span></div><div class="route-line"><small>루트 시작</small> '+roots+'</div>'+(gates?'<div class="route-line warn"><small>분기 연구</small> '+gates+'</div>':'')+'<button class="plan-load" data-plan="'+plan.id+'">전체 연구 노드 보기</button><div class="plan-body" data-plan-body="'+plan.id+'"></div></div>';
}
async function loadPlan(id){
  if(PLAN_CACHE.has(id))return PLAN_CACHE.get(id);
  const b=id[0];
  if(!PLAN_BUCKETS.has(b)){
    const r=await fetch(versioned("../data/progression-plans/"+b+".json"));
    PLAN_BUCKETS.set(b,(await r.json()).plans);
  }
  if(!RESEARCH_TOPICS){
    const r=await fetch(versioned("../data/progression-research.json"));
    RESEARCH_TOPICS=(await r.json()).topics||[];
  }
  const compact=PLAN_BUCKETS.get(b)[id]||{topics:[]};
  const p={...compact,topics:(compact.topics||[]).map(i=>RESEARCH_TOPICS[i]).filter(Boolean)};
  PLAN_CACHE.set(id,p);return p;
}
function entityLabel(x){return esc(typeof x==="string"?x:(x?.koName||x?.enName||x?.id||"—"))}
function compactValue(v){
  if(Array.isArray(v))return v.map(compactValue).join(", ");
  if(v&&typeof v==="object")return Object.entries(v).filter(([,x])=>x!==false&&x!=null).map(([k,x])=>x===true?k:(k+"="+compactValue(x))).join(", ");
  return String(v);
}
function eventConditions(s){
  const c=s?.conditions||{},bits=[],labels={firstMonth:"시작 월",lastMonth:"종료 월",minDifficulty:"최소 난이도",maxDifficulty:"최대 난이도",executionOdds:"발생 확률",minFunds:"최소 자금",maxFunds:"최대 자금",minScore:"최소 점수",maxScore:"최대 점수"};
  for(const [k,label] of Object.entries(labels))if(c[k]!=null)bits.push(label+" "+esc(compactValue(c[k])));
  for(const [k,v] of Object.entries(c))if(/Triggers$/.test(k)&&k!=="researchTriggers")bits.push(esc(k)+" "+esc(compactValue(v)));
  if((s?.researchTriggers||[]).length)bits.push("필요 연구 "+s.researchTriggers.map(entityLabel).join(", "));
  return bits.length?'<div class="route-line"><small>이벤트 조건</small> '+bits.join(" · ")+'</div>':'<div class="route-line"><small>이벤트 조건</small> 추가 조건 없음</div>';
}
function planTable(p){
  const rows=(p.topics||[]).map(t=>'<tr><td>'+esc(t.koName)+'</td><td>'+fmt(t.cost)+'</td><td>'+((t.prerequisites||[]).map(x=>esc(DATA?.researchNames?.[x]||x)).join("<br>")||"—")+'</td><td>'+(t.needItem?(t.destroyItem?"필요·소모":"필요"):"—")+'</td><td>'+((t.requiresBaseFunc||[]).join(", ")||"—")+'</td><td>'+((t.disables||[]).map(entityLabel).join("<br>")||"—")+'</td></tr>').join("");
  return '<div class="plan-table"><table><thead><tr><th>연구</th><th>량</th><th>직접 선행</th><th>표본</th><th>기지 기능</th><th>이 선택으로 닫히는 연구/루트</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function eventById(id){return PROG?.events?.[id]||null}
function eventScript(eventId,scriptId){return (eventById(eventId)?.scripts||[]).find(s=>s.id===scriptId)||null}
function acquisitionHtml(p){
  if(p.kind==="buy")return '<div class="acq-card"><strong>직접 고용</strong><span>비용 '+fmt(p.cost)+'</span>'+planSummary(planById(p.researchPlanId))+'</div>';
  if(p.kind==="event"){
    const e=eventById(p.eventId);if(!e)return"";
    const variants=(p.variants||[]).map(v=>'<details><summary>이벤트 발생 조건과 전체 연구 루트</summary>'+eventConditions(eventScript(p.eventId,v.scriptId))+planSummary(planById(v.researchPlanId),"이벤트 포함 연구 트리")+'</details>').join("");
    return '<div class="acq-card"><strong>이벤트 획득 · '+esc(e.koName)+'</strong><span class="id">'+esc(e.id)+' · 생성 '+fmt(p.spawnedPersons)+'명</span>'+planSummary(planById(p.baseResearchPlanId),"이벤트 기본 연구 조건")+variants+'</div>';
  }
  const r=PROG?.recipes?.[p.recipeId];if(!r)return"";
  const items=(r.requiredItems||[]).map(i=>'<div class="req-item"><b>'+esc(i.koName)+'</b> × '+fmt(i.qty)+(i.eventSources||[]).map(src=>{const ev=eventById(src.eventId);return ev?'<div class="event-box"><span class="tag">이벤트</span> '+esc(ev.koName)+' '+(ev.scripts||[]).map(s=>eventConditions(s)).join("")+'</div>':""}).join("")+'</div>').join("");
  const variants=(r.eventVariants||[]).map(v=>{const ev=eventById(v.eventId);return '<details><summary>'+esc(ev?.koName||v.eventId)+' 경유 실제 루트</summary>'+eventConditions(eventScript(v.eventId,v.scriptId))+planSummary(planById(v.researchPlanId),"이벤트 포함 연구 트리")+'</details>'}).join("");
  return '<div class="acq-card"><strong>'+esc(r.koName)+'</strong><span>비용 '+fmt(r.cost)+' · 시간 '+fmt(r.time)+' · 작업장 '+fmt(r.space)+'</span>'+planSummary(planById(r.baseResearchPlanId),"기본 제조/전환 연구")+(items?'<h4>필요 아이템</h4>'+items:'')+variants+'</div>';
}
function trainingHtml(t){
  const stats={...(t.bonus?.stats||{}),...(t.flatOverallStatChange||{})};
  const bonuses=Object.entries(stats).filter(([,v])=>v).map(([k,v])=>'<span class="trait">'+esc(DATA.statLabels[k]||k)+' '+(v>0?"+":"")+fmt(v)+'</span>').join(" ");
  return '<div class="acq-card"><strong>'+esc(t.koName)+'</strong><span class="id">'+esc(t.id)+'</span><div>'+bonuses+'</div>'+planSummary(planById(t.researchPlanId),"훈련 해금 연구")+'</div>';
}
function renderProgression(soldierId){
  const p=PROG?.soldiers?.[soldierId];if(!p)return"";
  const gates=(p.summary?.commonBranchGates||[]).map(x=>'<span class="trait">'+esc(x.koName)+'</span>').join(" ");
  return '<section class="progression"><h3>획득 방식 · 루트 · 연구량</h3><div class="detail-grid"><div class="box"><strong>확인된 획득 경로</strong>'+fmt(p.summary?.pathCount)+'</div><div class="box"><strong>명목 누적 연구량*</strong>'+fmt(p.summary?.nominalMinResearch)+'</div><div class="box"><strong>공통 분기</strong>'+(gates||"없음")+'</div></div><div class="routes">'+((p.acquisitionPaths||[]).map(acquisitionHtml).join("")||'<span class="muted">직접 추적 가능한 획득 경로 없음</span>')+'</div><h3>특수 훈련 / 후기 강화</h3><div class="routes">'+((p.trainingRoutes||[]).map(trainingHtml).join("")||'<span class="muted">별도 특수 훈련 없음</span>')+'</div><p class="muted">* 명목 연구량은 dependencies+requires 중복 제거 합계입니다. unlocks/getOneFree/이벤트 직접 지급으로 실제 최소량은 더 작아질 수 있습니다.</p></section>';
}

["search","dataset","band","sortMetric","traitsOnly"].forEach(id=>$("#"+id).addEventListener(id==="search"?"input":"change",()=>{finalPage=0;render()}));
$("#closeDialog").addEventListener("click",()=>$("#detailDialog").close());
$("#detailDialog").addEventListener("click",async e=>{
  if(e.target.id==="detailDialog"){e.currentTarget.close();return}
  const b=e.target.closest(".plan-load");if(!b)return;
  b.disabled=true;b.textContent="불러오는 중…";
  try{
    const p=await loadPlan(b.dataset.plan);
    const target=b.closest(".route-card")?.querySelector('[data-plan-body="'+b.dataset.plan+'"]');
    if(target)target.innerHTML=planTable(p);
    b.remove();
  }catch(err){b.disabled=false;b.textContent="연구트리 로드 실패";console.error(err)}
});
load().catch(err=>{$("#summary").innerHTML='<article class="card metric"><strong>데이터 로드 실패</strong><span>'+err.message+'</span></article>';console.error(err)});
