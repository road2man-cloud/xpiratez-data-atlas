import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import yaml from "js-yaml";

const args=process.argv.slice(2);
const arg=(name,fallback=null)=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:fallback};
const source=arg("--source",process.env.XPIRATEZ_MOD_PATH);
const outDir=path.resolve(arg("--out","public/data"));
const repoRoot=path.resolve(arg("--repo","."));
if(!source){console.error("Usage: node tools/build-event-data.mjs --source <.../Piratez> [--out public/data]");process.exit(2)}
const modRoot=path.resolve(source),rulesDir=path.join(modRoot,"Ruleset"),langDir=path.join(modRoot,"Language");
const read=p=>fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"");
const loadJson=p=>JSON.parse(fs.readFileSync(path.resolve(repoRoot,p),"utf8"));
const loadYaml=p=>{const docs=[];yaml.loadAll(read(p),d=>{if(d)docs.push(d)},{json:true});return docs};

function deepMerge(a,b){
  if(a&&b&&typeof a==="object"&&b&&typeof b==="object"&&!Array.isArray(a)&&!Array.isArray(b)){
    const out={...a};for(const [k,v] of Object.entries(b))out[k]=k in out?deepMerge(out[k],v):v;return out;
  }
  return b;
}
const identityKeys=["type","name","id","article","race","category","region","deployment","missionName","script","eventScript","cutscene","commendation"];
function identityOf(x){if(!x||typeof x!=="object"||Array.isArray(x))return null;for(const k of identityKeys)if(typeof x[k]==="string")return k+":"+x[k];return null}
function mergeSection(oldValue,newValue){
  if(!Array.isArray(oldValue)||!Array.isArray(newValue))return deepMerge(oldValue,newValue);
  const out=[...oldValue],pos=new Map();out.forEach((x,i)=>{const id=identityOf(x);if(id)pos.set(id,i)});
  for(const x of newValue){
    if(x&&typeof x==="object"&&!Array.isArray(x)&&typeof x.delete==="string"){
      const idx=out.findIndex(y=>y&&typeof y==="object"&&Object.values(y).includes(x.delete));if(idx>=0)out.splice(idx,1);
      continue;
    }
    const id=identityOf(x);if(id&&pos.has(id)){const i=pos.get(id);out[i]=deepMerge(out[i],x)}else{out.push(x);if(id)pos.set(id,out.length-1)}
  }
  return out;
}
function resolveRefNode(value,depth=0){
  if(!value||typeof value!=="object"||Array.isArray(value))return value;
  if(depth>32)throw new Error("refNode nesting exceeded 32 levels");
  const child={...value},parent=child.refNode;delete child.refNode;
  return parent&&typeof parent==="object"&&!Array.isArray(parent)?deepMerge(resolveRefNode(parent,depth+1),child):child;
}
const merged={},sourceHistory={};
for(const file of fs.readdirSync(rulesDir).filter(f=>f.toLowerCase().endsWith(".rul")).sort()){
  for(const doc of loadYaml(path.join(rulesDir,file))){
    for(const [section,value] of Object.entries(doc)){
      merged[section]=section in merged?mergeSection(merged[section],value):value;
      if(Array.isArray(value))for(const entry of value){const id=identityOf(entry);if(id){const a=sourceHistory[id]||=[];if(a.at(-1)!==file)a.push(file)}}
    }
  }
}
const effective={...merged};
for(const section of ["events","eventScripts"])if(Array.isArray(merged[section]))effective[section]=merged[section].map(v=>resolveRefNode(v));

function locale(code){const p=path.join(langDir,code+".yml");if(!fs.existsSync(p))return{};const d=yaml.load(read(p),{json:true})||{};return d[code]||d}
const ko=locale("ko"),en=locale("en-US");
function tr(id,which="ko"){if(typeof id!=="string")return String(id??"");const a=which==="ko"?ko:en,b=which==="ko"?en:ko;const v=a[id]??b[id]??id;return Array.isArray(v)?v.join(" / "):String(v).replaceAll("{NEWLINE}"," ").replace(/\s+/g," ").trim()}
function arr(v){return Array.isArray(v)?v:(v==null?[]:[v])}
function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function num(v){return Number.isFinite(Number(v))?Number(v):0}
function bucket(id){return crypto.createHash("sha1").update(id).digest("hex")[0]}
function fmt(v){return Number(v||0).toLocaleString("ko-KR",{maximumFractionDigits:2})}
function named(id){return{id,koName:tr(id,"ko"),enName:tr(id,"en")}}
function compactNames(xs,limit=5){const a=xs.filter(Boolean);return a.slice(0,limit).join(" · ")+(a.length>limit?" 외 "+(a.length-limit)+"개":"")}
function hasBatchim(s){const t=String(s||"").trim();for(let i=t.length-1;i>=0;i--){const c=t.charCodeAt(i);if(c>=0xac00&&c<=0xd7a3)return(c-0xac00)%28!==0;if(/[A-Za-z0-9]/.test(t[i]))return false}return false}
function topic(s){const v=String(s||"").trim();return v+(hasBatchim(v)?"은":"는")}
function expanded(text,fallback){const t=String(text||"").trim(),base=t.length>=55?t:[t,fallback].filter(Boolean).join(" ");return base.length>=55?base:base+" 직접 결과가 적은 이벤트도 후속 연구·이벤트 스크립트에서 다시 조건으로 쓰이는지 함께 확인해야 한다."}
function findPaths(v,target,prefix="",out=[]){
  if(v===target){out.push(prefix||"(root)");return out}
  if(Array.isArray(v)){v.forEach((x,i)=>findPaths(x,target,prefix?prefix+"."+i:String(i),out));return out}
  if(v&&typeof v==="object")for(const [k,x] of Object.entries(v)){
    const p=prefix?prefix+"."+k:k;
    if(k===target)out.push(p+"{key}");
    findPaths(x,target,p,out);
  }
  return out;
}
function eventRefsForScript(s){
  const out=new Set();
  for(const group of Object.values(obj(s.eventWeights)))for(const id of Object.keys(obj(group)))if(eventNameSet.has(id))out.add(id);
  for(const id of Object.keys(obj(s.oneTimeRandomEvents)))if(eventNameSet.has(id))out.add(id);
  for(const id of arr(s.oneTimeSequentialEvents))if(typeof id==="string"&&eventNameSet.has(id))out.add(id);
  return[...out];
}
function selectionPaths(s,target){
  const out=[];
  for(const [group,map] of Object.entries(obj(s.eventWeights)))if(Object.prototype.hasOwnProperty.call(obj(map),target))out.push("eventWeights."+group+"."+target+"{key}");
  if(Object.prototype.hasOwnProperty.call(obj(s.oneTimeRandomEvents),target))out.push("oneTimeRandomEvents."+target+"{key}");
  arr(s.oneTimeSequentialEvents).forEach((id,i)=>{if(id===target)out.push("oneTimeSequentialEvents."+i)});
  return out;
}
function aggregateList(xs){const m=new Map();for(const id of arr(xs).filter(x=>typeof x==="string"))m.set(id,(m.get(id)||0)+1);return[...m].map(([id,qty])=>({...named(id),qty}))}
function aggregateMap(v){return Object.entries(obj(v)).filter(([id])=>typeof id==="string").map(([id,qty])=>({...named(id),qty:num(qty)}))}

const events=arr(effective.events).filter(x=>x&&typeof x.name==="string");
const scripts=arr(effective.eventScripts).filter(x=>x&&typeof x.type==="string");
const eventNameSet=new Set(events.map(x=>x.name));
const itemIndex=loadJson("public/items/data/items-index.json").index||[];
const researchIndex=loadJson("public/items/data/research-index.json").index||[];
const facilitiesIndex=loadJson("public/data/facilities-index.json").index||[];
const soldierIndex=loadJson("public/data/soldiers-index.json").index||[];
const itemMap=new Map(itemIndex.map(x=>[x.id,x]));
const researchMap=new Map(researchIndex.map(x=>[x.id,x]));
const facilityMap=new Map(facilitiesIndex.map(x=>[x.id,x]));
const soldierMap=new Map(soldierIndex.map(x=>[x.id,x]));
const eventMap=new Map(events.map(x=>[x.name,x]));

function entity(id,kind=""){
  const x=kind==="item"?itemMap.get(id):kind==="research"?researchMap.get(id):kind==="facility"?facilityMap.get(id):kind==="soldier"?soldierMap.get(id):null;
  return{id,koName:x?.koName||tr(id,"ko"),enName:x?.enName||tr(id,"en")};
}
const scalarConditionKeys=["firstMonth","lastMonth","minDifficulty","maxDifficulty","executionOdds","minFunds","maxFunds","minScore","maxScore","minLoyalty","maxLoyalty","minReputation","maxReputation","minTacticalScore","maxTacticalScore"];
const triggerLabels={
  researchTriggers:"연구",facilityTriggers:"시설",itemTriggers:"아이템",
  xcomBaseInRegionTriggers:"기지 지역",xcomBaseInCountryTriggers:"기지 국가",
  soldierTypeTriggers:"병종",soldierTransformationTriggers:"병사 변신",
  counterTriggers:"카운터",factionTriggers:"세력",regionTriggers:"지역",countryTriggers:"국가",
  missionTriggers:"미션",eventTriggers:"이벤트"
};
function triggerEntity(kind,id){
  if(kind==="researchTriggers")return entity(id,"research");
  if(kind==="facilityTriggers")return entity(id,"facility");
  if(kind==="itemTriggers")return entity(id,"item");
  if(kind==="soldierTypeTriggers")return entity(id,"soldier");
  return named(id);
}
function normalizeTriggerMaps(s){
  const out={};
  for(const [k,v] of Object.entries(s))if(/Triggers$/.test(k)&&v&&typeof v==="object"&&!Array.isArray(v)){
    out[k]=Object.entries(v).map(([id,value])=>({...triggerEntity(k,id),value}));
  }
  return out;
}
function scalarConditions(s){const out={};for(const k of scalarConditionKeys)if(s[k]!=null)out[k]=s[k];return out}
function choiceMap(v){
  const rows=[];
  for(const [bucketKey,map] of Object.entries(obj(v))){
    const entries=Object.entries(obj(map)).filter(([,w])=>Number.isFinite(Number(w))).map(([eventId,weight])=>({eventId,weight:num(weight)}));
    const total=entries.reduce((n,x)=>n+x.weight,0);
    rows.push({bucket:String(bucketKey),totalWeight:total,entries:entries.map(x=>({...x,relativeShare:total>0?x.weight/total:null}))});
  }
  return rows;
}
function oneTimeChoices(v){
  const entries=Object.entries(obj(v)).filter(([,w])=>Number.isFinite(Number(w))).map(([eventId,weight])=>({eventId,weight:num(weight)}));
  const total=entries.reduce((n,x)=>n+x.weight,0);
  return{totalWeight:total,entries:entries.map(x=>({...x,relativeShare:total>0?x.weight/total:null}))};
}
function scriptMeta(s){
  const eventIds=eventRefsForScript(s);
  return{
    id:s.type,eventIds,conditions:scalarConditions(s),triggerMaps:normalizeTriggerMaps(s),
    eventWeights:choiceMap(s.eventWeights),oneTimeRandomEvents:oneTimeChoices(s.oneTimeRandomEvents),
    oneTimeSequentialEvents:arr(s.oneTimeSequentialEvents).filter(x=>typeof x==="string"&&eventNameSet.has(x)),
    sourceFiles:sourceHistory["type:"+s.type]||[],raw:s
  };
}
const scriptMetas=scripts.map(scriptMeta),scriptsByEvent=new Map();
for(const sm of scriptMetas)for(const eid of sm.eventIds){if(!scriptsByEvent.has(eid))scriptsByEvent.set(eid,[]);scriptsByEvent.get(eid).push(sm)}

function guaranteedItems(e){
  const mergedMap=new Map();
  for(const x of aggregateList(e.everyItemList))mergedMap.set(x.id,(mergedMap.get(x.id)||0)+x.qty);
  for(const x of aggregateMap(e.everyMultiItemList))mergedMap.set(x.id,(mergedMap.get(x.id)||0)+x.qty);
  return[...mergedMap].map(([id,qty])=>({...entity(id,"item"),qty,costSell:itemMap.get(id)?.costSell??null}));
}
function randomItems(e){
  const list=aggregateList(e.randomItemList).map(x=>({...entity(x.id,"item"),weight:x.qty}));
  const total=list.reduce((n,x)=>n+x.weight,0);
  for(const x of list)x.relativeShare=total>0?x.weight/total:null;
  const multi=arr(e.randomMultiItemList).map((option,i)=>({index:i+1,items:aggregateMap(option).map(x=>({...entity(x.id,"item"),qty:x.qty}))}));
  return{list,totalWeight:total,multi,weightedRaw:e.weightedItemList??null};
}
function effectRoles(e,gItems,rItems){
  const roles=[];
  if(e.name.startsWith("STR_START_"))roles.push("starting");
  if(arr(e.researchList).length)roles.push("research-grant");
  if(gItems.length)roles.push("item-reward");
  if(rItems.list.length||rItems.multi.length||e.weightedItemList)roles.push("random-reward");
  if(typeof e.spawnedPersonType==="string"||num(e.spawnedPersons)>0)roles.push("recruitment");
  if(num(e.funds)!==0)roles.push(num(e.funds)>0?"funds-gain":"funds-loss");
  if(num(e.points)!==0)roles.push(num(e.points)>0?"score-gain":"score-loss");
  if(typeof e.interruptResearch==="string")roles.push("research-interrupt");
  if(!roles.length)roles.push("notice");
  return roles;
}
const roleLabels={
  starting:"스타팅/초기 이벤트","research-grant":"연구/진행 플래그 지급","item-reward":"아이템 지급",
  "random-reward":"랜덤 보상",recruitment:"병사/인원 지급","funds-gain":"자금 획득","funds-loss":"자금 손실",
  "score-gain":"점수 획득","score-loss":"점수 손실","research-interrupt":"연구 중단",notice:"정보/서사 이벤트"
};
const rolePriority=["starting","research-grant","recruitment","item-reward","random-reward","research-interrupt","funds-loss","funds-gain","score-loss","score-gain","notice"];
function triggerKinds(scriptRows){
  const kinds=new Set();
  for(const s of scriptRows){
    const c=s.conditions||{};
    if(c.firstMonth!=null||c.lastMonth!=null)kinds.add("time");
    if(c.minDifficulty!=null||c.maxDifficulty!=null)kinds.add("difficulty");
    if(c.executionOdds!=null&&num(c.executionOdds)<100)kinds.add("chance");
    if(c.minFunds!=null||c.maxFunds!=null)kinds.add("funds");
    if(c.minScore!=null||c.maxScore!=null)kinds.add("score");
    for(const k of Object.keys(s.triggerMaps||{}))kinds.add(k);
    if(s.oneTimeRandomEvents?.entries?.length)kinds.add("one-time-random");
    if(s.oneTimeSequentialEvents?.length)kinds.add("one-time-sequential");
    if(s.eventWeights?.length)kinds.add("weighted-event");
  }
  return[...kinds];
}
const triggerKindLabels={
  time:"월/기간",difficulty:"난이도",chance:"실행 확률",funds:"자금",score:"점수",
  researchTriggers:"연구",facilityTriggers:"시설",itemTriggers:"아이템",
  xcomBaseInRegionTriggers:"기지 지역",xcomBaseInCountryTriggers:"기지 국가",
  soldierTypeTriggers:"병종",soldierTransformationTriggers:"병사 변신",counterTriggers:"카운터",
  factionTriggers:"세력",regionTriggers:"지역",countryTriggers:"국가",missionTriggers:"미션",
  eventTriggers:"이벤트","one-time-random":"1회 랜덤 후보","one-time-sequential":"1회 순차 이벤트","weighted-event":"가중 이벤트 후보"
};
function summarizeTriggerMaps(scriptRows){
  const positive=[],negative=[],other=[];
  for(const s of scriptRows)for(const [kind,entries] of Object.entries(s.triggerMaps||{}))for(const x of entries){
    const row={scriptId:s.id,kind,label:triggerLabels[kind]||kind,...x};
    if(x.value===true)positive.push(row);else if(x.value===false)negative.push(row);else other.push(row);
  }
  return{positive,negative,other};
}
function monthSummary(scriptRows){
  const first=scriptRows.map(s=>s.conditions?.firstMonth).filter(v=>v!=null).map(Number);
  const last=scriptRows.map(s=>s.conditions?.lastMonth).filter(v=>v!=null).map(Number);
  const boundedScriptCount=scriptRows.filter(s=>s.conditions?.lastMonth!=null).length;
  return{earliest:first.length?Math.min(...first):null,latest:last.length?Math.max(...last):null,hasBounded:boundedScriptCount>0,allBounded:scriptRows.length>0&&boundedScriptCount===scriptRows.length,boundedScriptCount,unboundedScriptCount:scriptRows.length-boundedScriptCount};
}
function oddsSummary(scriptRows){
  const xs=scriptRows.map(s=>s.conditions?.executionOdds).filter(v=>v!=null).map(Number);
  return{min:xs.length?Math.min(...xs):null,max:xs.length?Math.max(...xs):null,hasChance:xs.some(x=>x<100)};
}
function eventSelectionRefs(eventId,scriptRows){
  const out=[];
  for(const s of scriptRows){
    for(const g of s.eventWeights||[])for(const x of g.entries||[])if(x.eventId===eventId)out.push({scriptId:s.id,kind:"eventWeights",bucket:g.bucket,weight:x.weight,totalWeight:g.totalWeight,relativeShare:x.relativeShare});
    for(const x of s.oneTimeRandomEvents?.entries||[])if(x.eventId===eventId)out.push({scriptId:s.id,kind:"oneTimeRandomEvents",bucket:null,weight:x.weight,totalWeight:s.oneTimeRandomEvents.totalWeight,relativeShare:x.relativeShare});
    (s.oneTimeSequentialEvents||[]).forEach((id,i)=>{if(id===eventId)out.push({scriptId:s.id,kind:"oneTimeSequentialEvents",bucket:String(i),weight:null,totalWeight:null,relativeShare:null})});
  }
  return out;
}
function primaryRole(roles){for(const x of rolePriority)if(roles.includes(x))return x;return roles[0]||"notice"}
function itemValue(items){let total=0,known=true;for(const x of items){if(x.costSell==null){known=false;continue}total+=num(x.costSell)*num(x.qty)}return{total,known}}
function detailForEvent(e){
  const id=e.name,b=bucket(id),scriptRows=scriptsByEvent.get(id)||[],gItems=guaranteedItems(e),rItems=randomItems(e);
  const roles=effectRoles(e,gItems,rItems),primary=primaryRole(roles),triggers=summarizeTriggerMaps(scriptRows),months=monthSummary(scriptRows),odds=oddsSummary(scriptRows),selectionRefs=eventSelectionRefs(id,scriptRows);
  const researchRewards=arr(e.researchList).filter(x=>typeof x==="string").map(id=>({...entity(id,"research"),cost:researchMap.get(id)?.cost??null,requiredByCount:researchMap.get(id)?.requiredByCount??null,primaryInsightKind:researchMap.get(id)?.primaryInsightKind??null}));
  const guaranteedValue=itemValue(gItems);
  const negativeGateCount=triggers.negative.length;
  const missRisk=months.allBounded?"high":months.hasBounded||negativeGateCount||selectionRefs.some(x=>x.kind==="oneTimeRandomEvents")?"medium":"low";
  return{
    id,bucket:b,koName:tr(id,"ko"),enName:tr(id,"en"),descriptionKey:e.description??null,
    roles,primaryRole:primary,primaryRoleKo:roleLabels[primary]||primary,
    scripts:scriptRows.map(s=>({
      id:s.id,conditions:s.conditions,triggerMaps:s.triggerMaps,
      eventRefs:s.eventIds,paths:selectionPaths(s.raw,id),eventWeights:s.eventWeights,oneTimeRandomEvents:s.oneTimeRandomEvents,
      oneTimeSequentialEvents:s.oneTimeSequentialEvents,sourceFiles:s.sourceFiles
    })),
    triggerSummary:{kinds:triggerKinds(scriptRows),positive:triggers.positive,negative:triggers.negative,other:triggers.other,months,odds,selectionRefs,missRisk},
    effects:{
      researchRewards,guaranteedItems:gItems,randomItems:rItems,
      funds:e.funds??0,points:e.points??0,interruptResearch:e.interruptResearch??null,
      spawnedPersonType:e.spawnedPersonType??null,spawnedPersonTypeName:e.spawnedPersonType?tr(e.spawnedPersonType,"ko"):null,
      spawnedPersons:e.spawnedPersons??null,spawnedSoldier:e.spawnedSoldier??null,
      regionList:arr(e.regionList).filter(x=>typeof x==="string").map(named),city:e.city??null,
      guaranteedItemSellValue:guaranteedValue.total,guaranteedItemSellCoverage:guaranteedValue.known
    },
    timer:e.timer??null,timerRandom:e.timerRandom??null,
    sourceFiles:sourceHistory["name:"+id]||[],raw:e
  };
}
function listTriggerBrief(d){
  const pos=d.triggerSummary.positive,neg=d.triggerSummary.negative,c=d.triggerSummary.months,o=d.triggerSummary.odds;
  const parts=[];
  if(c.earliest!=null||c.latest!=null)parts.push("월 조건 "+(c.earliest??"제한없음")+"~"+(c.latest??"제한없음"));
  if(o.min!=null)parts.push("executionOdds "+(o.min===o.max?fmt(o.min):fmt(o.min)+"~"+fmt(o.max))+"%");
  if(pos.length)parts.push("필수 조건 "+compactNames(pos.map(x=>x.koName+"="+String(x.value)),4));
  if(neg.length)parts.push("미보유/금지 조건 "+compactNames(neg.map(x=>x.koName+"="+String(x.value)),4));
  return parts.join(". ");
}
function resultBrief(d){
  const e=d.effects,parts=[];
  if(e.researchRewards.length)parts.push("연구/플래그 "+compactNames(e.researchRewards.map(x=>x.koName),5));
  if(e.guaranteedItems.length)parts.push("확정 아이템 "+compactNames(e.guaranteedItems.map(x=>x.koName+" ×"+fmt(x.qty)),5));
  if(e.randomItems.list.length||e.randomItems.multi.length||e.randomItems.weightedRaw)parts.push("랜덤 보상 후보 존재");
  if(e.spawnedPersonType)parts.push((e.spawnedPersonTypeName||e.spawnedPersonType)+" "+fmt(e.spawnedPersons||1)+"명");
  if(num(e.funds))parts.push("자금 "+(num(e.funds)>0?"+":"")+fmt(e.funds));
  if(num(e.points))parts.push("점수 "+(num(e.points)>0?"+":"")+fmt(e.points));
  if(e.interruptResearch)parts.push("연구 중단 "+tr(e.interruptResearch,"ko"));
  return parts.join(". ")||"확인된 직접 보상/손실 필드 없음";
}
function editorialFor(d){
  const e=d.effects,ts=d.triggerSummary,scriptCount=d.scripts.length;
  let overview=topic(d.koName)+" "+d.primaryRoleKo+" 성격의 이벤트다. 연결 eventScript는 "+fmt(scriptCount)+"개이며, 이벤트 본문과 발생 조건을 분리해 보면 실제 플레이에서 무엇을 준비해야 하는지 판단할 수 있다.";
  if(d.roles.length>1)overview+=" 동시에 "+compactNames(d.roles.filter(x=>x!==d.primaryRole).map(x=>roleLabels[x]||x),4)+" 효과도 갖는다.";

  let trigger=listTriggerBrief(d);
  if(!trigger)trigger="이 이벤트를 직접 참조하는 eventScript에서 별도 월·연구·시설·아이템 조건을 찾지 못했다.";
  else trigger+=".";
  if(ts.selectionRefs.length)trigger+=" 이 이벤트는 "+fmt(ts.selectionRefs.length)+"개 선택 테이블에 포함되며, 표시 가중치는 같은 테이블 안에서의 상대값이다.";

  let result=resultBrief(d)+".";
  if(e.guaranteedItems.length&&e.guaranteedItemSellCoverage)result+=" 확정 아이템의 현재 DB 판매가 합계는 "+fmt(e.guaranteedItemSellValue)+"이다.";
  if(e.randomItems.list.length)result+=" randomItemList는 중복 등장 횟수를 가중치로 보아 후보 "+fmt(e.randomItems.list.length)+"종을 분리 표시한다.";
  if(e.randomItems.multi.length)result+=" randomMultiItemList는 "+fmt(e.randomItems.multi.length)+"개 묶음 후보를 원본 그대로 보존한다.";

  const highImpactResearch=e.researchRewards.filter(x=>(x.requiredByCount||0)>0).sort((a,b)=>(b.requiredByCount||0)-(a.requiredByCount||0));
  let value;
  if(e.researchRewards.length){
    value="이 이벤트의 가장 중요한 가치는 연구/진행 플래그 지급이다. "+(highImpactResearch.length?highImpactResearch[0].koName+"은 후속 연구 "+fmt(highImpactResearch[0].requiredByCount||0)+"개와 연결되어 있어 단순 알림보다 진행 게이트 성격이 강하다.":"지급 플래그가 후속 연구나 다른 시스템의 조건으로 재사용될 수 있으므로 이벤트 자체보다 이후 해금 변화를 함께 보는 편이 중요하다.");
  }else if(e.spawnedPersonType){
    value="병사/인원을 직접 지급하므로 단순 판매가보다 획득 개체의 병종·방어구·transformationBonuses·초기 능력치가 핵심 가치다. spawnedSoldier 직접값이 있으면 일반 고용 개체와 동일하다고 가정하면 안 된다.";
  }else if(e.guaranteedItems.length||e.randomItems.list.length||e.randomItems.multi.length){
    value="아이템 획득 이벤트다. 판매가 합계는 환금성 참고값일 뿐이고, 연구 표본·희귀 제조 재료·장비 해금용 아이템이면 실제 전략 가치는 더 클 수 있다.";
  }else if(num(e.funds)||num(e.points)){
    value="직접 효과는 자금/점수 변화가 중심이다. 금액이나 점수 자체보다 이 변화가 다른 이벤트의 min/maxFunds·min/maxScore 조건을 넘기는지까지 봐야 연쇄 효과를 판단할 수 있다.";
  }else{
    value="직접 지급 자원은 적지만 정보·서사·진행 타이밍을 전달하는 이벤트로 보인다. 실제 영향은 후속 스크립트가 이 이벤트나 관련 연구 플래그를 다시 조건으로 쓰는지 확인해야 한다.";
  }
  if(e.researchRewards.length&&e.spawnedPersonType)value+=" 동시에 "+(e.spawnedPersonTypeName||e.spawnedPersonType)+" "+fmt(e.spawnedPersons||1)+"명을 직접 지급하므로 병사 획득 가치도 별도로 크다.";
  if(e.researchRewards.length&&e.guaranteedItems.length)value+=" 연구 플래그 외에도 확정 아이템 "+fmt(e.guaranteedItems.length)+"종을 함께 지급하므로 즉시 전력/표본 가치도 분리해서 봐야 한다.";
  if(num(e.funds))value+=" 자금 "+(num(e.funds)>0?"+":"")+fmt(e.funds)+" 변화가 동시에 적용되어 이후 자금 임계치 이벤트에도 영향을 줄 수 있다.";
  if(num(e.points))value+=" 점수 "+(num(e.points)>0?"+":"")+fmt(e.points)+" 변화도 있어 점수 조건 스크립트의 후속 상태가 달라질 수 있다.";

  const actions=[];
  const positives=ts.positive,negatives=ts.negative;
  if(positives.length)actions.push("필수 조건을 먼저 맞춘다: "+compactNames(positives.map(x=>x.koName+"("+x.label+")"),5)+".");
  if(negatives.length)actions.push("이벤트를 보고 싶다면 다음 조건이 false인 동안 기회를 확인한다: "+compactNames(negatives.map(x=>x.koName+"("+x.label+")"),5)+".");
  if(ts.months.latest!=null)actions.push("마지막 허용 월 "+fmt(ts.months.latest)+" 이전에 조건을 완성하는 것이 안전하다.");
  if(actions.length===0)actions.push("별도 명시 게이트가 적으므로 현재 세이브에서는 eventScript의 실행 주기와 선행 진행 플래그를 우선 확인한다.");
  if(e.researchRewards.length)actions.push("발생 후 연구 DB에서 지급된 플래그의 후속 연구·이벤트 연결을 확인한다.");
  const action=actions.join(" ");

  const risks=[];
  if(ts.months.allBounded)risks.push("연결된 모든 eventScript 경로에 lastMonth가 있어 시간 창을 지나면 확인된 발생 경로가 모두 닫힐 수 있다.");
  else if(ts.months.hasBounded)risks.push("일부 eventScript 경로에는 lastMonth가 있어 그 경로는 시간 창을 지나면 닫히지만, 다른 무기한 경로가 남아 있을 수 있다.");
  if(negatives.length)risks.push("false 트리거 "+fmt(negatives.length)+"개는 해당 상태가 true가 되면 현재 경로가 더 이상 성립하지 않을 수 있다.");
  if(ts.odds.hasChance)risks.push("조건을 만족해도 executionOdds가 100 미만인 스크립트가 있어 해당 체크에서 반드시 발생하는 것은 아니다.");
  if(ts.selectionRefs.some(x=>x.kind==="oneTimeRandomEvents"))risks.push("oneTimeRandomEvents 후보이므로 같은 후보군의 다른 이벤트와 경쟁할 수 있다.");
  if(!risks.length)risks.push("원본에서 뚜렷한 시간 제한·false 트리거·100 미만 실행 확률을 찾지 못해 상대적으로 놓침 위험이 낮다.");
  const miss=risks.join(" ");

  let verification=d.koName+"("+d.id+")의 직접 사실은 events 원본과 이 이벤트를 exact ID로 참조하는 eventScripts "+fmt(d.scripts.length)+"개에서 가져왔다. '놓침 위험', '플레이 가치', '준비 행동'은 그 사실을 조합한 GPT 편집 해석이다. executionOdds는 스크립트 실행 확률 직접값이고 eventWeights/oneTimeRandomEvents의 비율은 같은 표 안의 상대 가중치 파생값이므로 둘을 곱해 실제 최종 발생 확률이라고 단정하지 않는다.";
  if(d.scripts.length===0)verification+=" 이 이벤트를 직접 참조하는 eventScript를 찾지 못했으므로 다른 시스템·스크립트 경유 호출 가능성을 배제할 수 없다.";

  return{
    overview:expanded(overview,"이벤트의 역할은 결과 필드와 연결 스크립트를 함께 기준으로 분류했다."),
    trigger:expanded(trigger,"조건은 eventScript 직접값이며 true/false 트리거를 구분했다."),
    result:expanded(result,"보상과 손실은 event 룰 직접값을 기준으로 정리했다."),
    value:expanded(value,"전략 가치는 판매가·후속 해금·진행 게이트를 함께 고려해야 한다."),
    action:expanded(action,"현재 세이브에서 조건을 충족했는지 먼저 대조한 뒤 진행하는 편이 안전하다."),
    missRisk:expanded(miss,"시간 창과 false 조건은 특히 되돌리기 어려울 수 있으므로 먼저 확인해야 한다."),
    verification:expanded(verification,"원본 직접값과 파생 해석을 구분해 읽어야 한다.")
  };
}

const details={},editorials={},rows=[];
for(const e of events){
  const d=detailForEvent(e),b=d.bucket;(details[b]||={})[d.id]=d;(editorials[b]||={})[d.id]=editorialFor(d);
  const efx=d.effects,ts=d.triggerSummary;
  const search=[
    d.id,d.koName,d.enName,d.primaryRoleKo,...d.roles.map(x=>roleLabels[x]||x),
    ...d.scripts.map(x=>x.id),...ts.kinds.map(x=>triggerKindLabels[x]||x),
    ...ts.positive.flatMap(x=>[x.id,x.koName,x.enName,x.label]),...ts.negative.flatMap(x=>[x.id,x.koName,x.enName,x.label]),
    ...efx.researchRewards.flatMap(x=>[x.id,x.koName,x.enName]),
    ...efx.guaranteedItems.flatMap(x=>[x.id,x.koName,x.enName]),
    ...efx.randomItems.list.flatMap(x=>[x.id,x.koName,x.enName]),
    efx.spawnedPersonType,efx.spawnedPersonTypeName,efx.interruptResearch
  ].filter(Boolean).join(" ").toLowerCase();
  rows.push({
    id:d.id,bucket:b,koName:d.koName,enName:d.enName,roles:d.roles,primaryRole:d.primaryRole,primaryRoleKo:d.primaryRoleKo,
    scriptCount:d.scripts.length,triggerKinds:ts.kinds,triggerCount:ts.positive.length+ts.negative.length+ts.other.length,
    positiveTriggerCount:ts.positive.length,negativeTriggerCount:ts.negative.length,
    earliestMonth:ts.months.earliest,latestMonth:ts.months.latest,missRisk:ts.missRisk,
    minExecutionOdds:ts.odds.min,maxExecutionOdds:ts.odds.max,weightedSelectionCount:ts.selectionRefs.length,
    researchRewardCount:efx.researchRewards.length,guaranteedItemCount:efx.guaranteedItems.length,
    randomRewardCount:efx.randomItems.list.length+efx.randomItems.multi.length,
    funds:num(efx.funds),points:num(efx.points),hasRecruit:Boolean(efx.spawnedPersonType||efx.spawnedPersons),
    spawnedPersonType:efx.spawnedPersonType,interruptResearch:efx.interruptResearch,
    searchText:search
  });
}
rows.sort((a,b)=>a.koName.localeCompare(b.koName,"ko"));
function writeGzipJson(file,value){const raw=Buffer.from(JSON.stringify(value));fs.writeFileSync(file,zlib.gzipSync(raw,{level:9}))}
const eventChunkDir=path.join(outDir,"event-chunks"),eventEditorialDir=path.join(outDir,"event-editorial-chunks");
fs.rmSync(eventChunkDir,{recursive:true,force:true});fs.rmSync(eventEditorialDir,{recursive:true,force:true});
fs.mkdirSync(eventChunkDir,{recursive:true});fs.mkdirSync(eventEditorialDir,{recursive:true});
for(const [b,v] of Object.entries(details))writeGzipJson(path.join(eventChunkDir,b+".json.gz"),{details:v});
for(const [b,v] of Object.entries(editorials))writeGzipJson(path.join(eventEditorialDir,b+".json.gz"),{details:v});
const allKinds=[...new Set(rows.flatMap(x=>x.triggerKinds))].sort();
const allRoles=[...new Set(rows.flatMap(x=>x.roles))].sort();
const counts={
  events:rows.length,scripts:scripts.length,linkedScripts:rows.reduce((n,x)=>n+x.scriptCount,0),
  withScripts:rows.filter(x=>x.scriptCount).length,withoutScripts:rows.filter(x=>!x.scriptCount).length,
  researchRewards:rows.filter(x=>x.researchRewardCount).length,itemRewards:rows.filter(x=>x.guaranteedItemCount).length,
  randomRewards:rows.filter(x=>x.randomRewardCount).length,recruitment:rows.filter(x=>x.hasRecruit).length,
  boundedWindow:rows.filter(x=>x.latestMonth!=null).length,chance:rows.filter(x=>x.minExecutionOdds!=null&&x.minExecutionOdds<100).length,
  negativeGate:rows.filter(x=>x.negativeTriggerCount).length
};
fs.mkdirSync(outDir,{recursive:true});
writeGzipJson(path.join(outDir,"events-index.json.gz"),{
  schemaVersion:1,generatedAt:new Date().toISOString(),compression:"gzip",counts,roles:Object.fromEntries(allRoles.map(x=>[x,roleLabels[x]||x])),
  triggerKinds:Object.fromEntries(allKinds.map(x=>[x,triggerKindLabels[x]||x])),index:rows
});
fs.rmSync(path.join(outDir,"events-index.json"),{force:true});
console.log(JSON.stringify(counts));
