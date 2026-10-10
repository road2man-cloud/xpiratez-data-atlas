// Concise, source-grounded decision cards for every Atlas catalog.
// Regenerates from committed derived data; never invents missing game rules.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import vm from "node:vm";
import assert from "node:assert/strict";

const root=path.resolve("public");
const out=path.join(root,"data","play-guide");
fs.mkdirSync(out,{recursive:true});
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const unzip=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,p))).toString("utf8"));
const exists=p=>fs.existsSync(path.join(root,p));
const ary=x=>Array.isArray(x)?x:[];
const fmt=x=>Number(x).toLocaleString("ko-KR",{maximumFractionDigits:2});
const val=(x,fallback="확인된 값 없음")=>x==null||x===""?fallback:String(x);
const names=(xs,max=5)=>ary(xs).map(x=>typeof x==="string"?x:x?.koName||x?.id).filter(Boolean).slice(0,max).join(" · ");
const statsKo={tu:"TU",stamina:"기력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"Psi 강도",psiSkill:"Psi 기술",melee:"근접",mana:"Freshness/마나"};
const pick=(o,top=8)=>Object.entries(o||{}).filter(([,v])=>typeof v==="number"&&v!==0).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,top).map(([k,v])=>(statsKo[k]||k)+" "+(v>0?"+":"")+fmt(v)).join(" · ");
const sign=v=>(Number(v)>0?"+":"")+fmt(v);
const brief=(s,max=230)=>{
  const clean=String(s||"").replace(/\s+/g," ").trim();
  if(!clean)return "";
  if(clean.length<=max)return clean;
  const split=clean.split(/(?<=[.!?。])\s+/).filter(Boolean);
  let output="";
  for(const part of split){if((output+" "+part).trim().length>max)break;output=(output+" "+part).trim();}
  if(output)return output;
  const cut=clean.slice(0,max),at=cut.lastIndexOf(" ");
  return (at>max*.6?cut.slice(0,at):cut).trim()+"…";
};
const any=(...x)=>x.find(v=>v!=null&&v!==""&&v!=="—")||"";
const link=(kind,id,label)=>id?{kind,id,label:label||id}:null;
const summary=(name,id,title,effect,gates,action,decision,watch,source,links=[])=>({
  id, name:name||id, title:brief(title,230)||"이 항목의 구체적 역할은 원본 상세 참조로 확인",
  effect:brief(effect,370)||"직접 효과가 명시되지 않아 상세 원본을 확인해야 합니다.",
  gates:brief(gates,370)||"추가 해금 조건은 상세 원본 또는 세이브 상태에서 확인해야 합니다.",
  action:brief(action,350)||"목록의 상세 규칙에서 실행 가능 여부와 다음 단계 확인.",
  decision:brief(decision,350)||"현재 목표에 필요한 효과와 재료·선행 충족 여부를 비교하십시오.",
  watch:brief(watch,320)||"표시값은 룰셋 정적 조건이며 현재 세이브의 해금·보유 여부와는 다릅니다.",
  source,
  links:links.filter(Boolean).slice(0,5)
});
const save=(key,rows)=>{
  const cards=Object.create(null);
  for(const row of rows){assert.ok(row.id,key+" card missing id");assert.ok(!cards[row.id],key+" duplicate "+row.id);cards[row.id]=row;}
  const full=JSON.stringify({version:1,kind:key,count:rows.length,source:"published XPiratez v.o1.1.1 ruleset-derived DB / editorial sidecars",cards});
  const short=JSON.stringify({version:1,kind:key,count:rows.length,titles:Object.fromEntries(rows.map(r=>[r.id,r.title]))});
  fs.writeFileSync(path.join(out,key+".json.gz"),zlib.gzipSync(Buffer.from(full,"utf8"),{level:9}));
  fs.writeFileSync(path.join(out,key+".teasers.json.gz"),zlib.gzipSync(Buffer.from(short,"utf8"),{level:9}));
  // Keep a single compressed canonical artifact; old uncompressed guides
  // inflated Pages and made GitHub API publishing unnecessarily expensive.
  for(const legacy of [key+".json",key+".teasers.json"]){
    const obsolete=path.join(out,legacy);
    if(fs.existsSync(obsolete))fs.unlinkSync(obsolete);
  }
  console.log(key+": "+rows.length+" cards");
};
const bucketLoader=(base,suffix=".json")=>{
  const cache=new Map();
  return bucket=>{
    if(!cache.has(bucket)){
      const p=base+"/"+bucket+suffix;
      cache.set(bucket,exists(p)?(suffix.endsWith(".gz")?unzip(p):read(p)).details||{}:{});
    }
    return cache.get(bucket);
  };
};
const iRoot="items/data";
const entityNames=read(iRoot+"/entities.json").names||{};
const friendly=id=>entityNames[id]?.[0]||id;
const keyed=(xs)=>ary(xs).map(x=>typeof x==="string"?friendly(x):x?.koName||friendly(x?.id)).filter(Boolean).slice(0,6).join(" · ");
const makeEditor=base=>bucketLoader(base);
const itemEditorial=makeEditor(iRoot+"/item-editorial-chunks"),resEditorial=makeEditor(iRoot+"/research-editorial-chunks");
const resInsight=makeEditor(iRoot+"/research-insight-chunks");
const resIndex=read(iRoot+"/research-index.json").index;
const resRowById=new Map(resIndex.map(r=>[r.id,r]));
const eventCatalog=unzip("data/events-index.json.gz").index;
const eventDetails=bucketLoader("data/event-chunks",".json.gz");
const rewardEventsByResearch=new Map();
// Only actual effects.researchRewards count as research grants. A research
// trigger on an event is NOT proof that the event awards that research.
for(const eventRow of eventCatalog){
  const detail=eventDetails(eventRow.bucket)[eventRow.id];
  if(!detail)continue;
  for(const reward of ary(detail.effects?.researchRewards)){
    if(!reward?.id)continue;
    if(!rewardEventsByResearch.has(reward.id))rewardEventsByResearch.set(reward.id,[]);
    rewardEventsByResearch.get(reward.id).push({eventRow,detail});
  }
}
function eventGrantGate(id){
  const grants=rewardEventsByResearch.get(id)||[];
  if(!grants.length)return "";
  const chosen=grants.find(e=>e.detail.scripts?.some(s=>s.triggerMaps?.researchTriggers?.length))||grants[0];
  const source=chosen.eventRow,script=chosen.detail.scripts?.[0]||{};
  const conditions=script.conditions||{},maps=script.triggerMaps||{};
  const flags=ary(maps.researchTriggers);
  const positives=flags.filter(x=>x.value===true).map(x=>x.koName||researchName(x.id));
  const negatives=flags.filter(x=>x.value===false).map(x=>x.id===id?"해당 연구 미완료":(x.koName||researchName(x.id))+" 미완료");
  const facility=ary(maps.facilityTriggers).filter(x=>x.value===true).map(x=>x.koName||x.id);
  const bits=[
    positives.length?"필수 연구/선택 "+positives.slice(0,5).join("·")+(positives.length>5?" 외 "+(positives.length-5)+"개":""):"",
    facility.length?"시설 "+facility.slice(0,3).join("·"):"",
    negatives.length?"미보유/금지 "+negatives.slice(0,3).join("·"):"",
    conditions.firstMonth!=null?"게임월 "+conditions.firstMonth+"부터":"",
    conditions.lastMonth!=null?"게임월 "+conditions.lastMonth+"까지":"",
    conditions.minScore!=null?"최소 점수 "+fmt(conditions.minScore):""
  ].filter(Boolean);
  return "이벤트 지급 "+grants.length+"경로"+(grants.length>1?"(대안 경로 전체는 이벤트 DB 참조)":"")+
    ": "+(source.koName||source.id)+" → "+bits.join(" / ");
}
const resNames=new Map(resIndex.map(r=>[r.id,r.koName]));
const researchName=id=>resNames.get(id)||friendly(id);
const nameList=ids=>ary(ids).slice(0,6).map(researchName).join(" · ");
const resRows=resIndex.map(r=>{
  const e=resEditorial(r.bucket)[r.id]||{},s=resInsight(r.bucket)[r.id]?.insight||{};
  const training=ary(s.transformations),t=training[0];
  const role=s.primaryRole||"";
  const automatic=s.automaticEffect===false;
  const researchGate=[
    r.needItem?"실물 표본 필요"+(r.destroyItem?"·소모":"·비소모"):"",
    ary(s.researchRequirements?.requiresBaseFunc).length?"연구 기능 "+keyed(s.researchRequirements.requiresBaseFunc):"",
    ary(s.disables).length?"비활성화 "+nameList(s.disables):""
  ].filter(Boolean).join(" / ");
  const effects=training.length?
    "연구는 훈련 해금, 병사에게 자동 적용되지 않음. "+training.map(x=>{
      const bits=pick(x.flatOverallStatChange);
      const b=x.soldierBonus?.stats?pick(x.soldierBonus.stats):"";
      return [x.koName||friendly(x.id),bits?"본체 "+bits:"",b?"영구 특성 "+b:""].filter(Boolean).join(" / ");
    }).join(" ; "):
    e.effect||s.summary||"";
  const title=any(e.core,s.summary,r.koName);
  const gates=[eventGrantGate(r.id),researchGate,e.route||((r.dependencyCount?"직접 선행 "+r.dependencyCount+"개":""))].filter(Boolean).join(" / ");
  const act=any(e.action,automatic?"연구 완료 후 병사별 특수훈련 실행. 비용·병종 제한은 훈련 DB 확인.":"");
  const watch=any(e.watch,automatic?"연구 완료와 개별 병사 강화는 별개.":"");
  const links=[link("research",r.id,"전체 연구 상세")];
  if(t?.id)links.push(link("trainings",t.id,"실제 훈련"));
  if(r.id==="STR_CAPTAINS_11"){
    return summary(r.koName,r.id,
      "도둑 선장 전용 Captain's 11. 연구 자체가 강화가 아니라, 이벤트에서 11회 분량의 특수훈련을 해금합니다.",
      "병사마다 SoldierBonus 영구 능력 보너스. 훈련 상세의 TU·기력·용기·마나·회복 보너스를 각각 확인.",
      "도둑 선장(STR_CAPTAIN_THIEF) + 선장일지 #1 + 선장 계급 2 + 도박 트로피 + 현상금 C 배지. 이벤트 조건을 모두 충족해야 함.",
      "조건 충족 → Captain's 11 이벤트 → 전용 토큰 11개 수령 → 병사별 특수훈련. 병사당 토큰 1개·Glamour 21·$100,000·500시간.",
      "소수 정예 11명에게 투자하는 영구 보너스형. 다른 훈련과 충돌하지 않아 조합 가치가 높음.",
      "도둑 외 선장은 이벤트를 열 수 없음. 토큰 11개가 병사당 소모되어 재훈련 무제한이 아님.",
      "Piratez_Events.rul, Piratez_Transformations.rul, Piratez_Bonuses.rul",links);
  }
  return summary(r.koName,r.id,title,effects,gates,act,
    any(e.decision,role==="branch-choice"?"선택과 동시에 닫히는 연구/보상을 비교.":""),watch,
    "research ruleset + editorial (rule-derived context)",links);
});
save("research",resRows);

const itemRows=read(iRoot+"/items-index.json").index.map(r=>{
  const e=itemEditorial(r.bucket)[r.id]||{};
  const extra=[];
  if(Number(r.monthlyMaintenance)<0)extra.push("월 유지비 음수: 보유 월수익 "+sign(-r.monthlyMaintenance)+" (원본 적용 확인 필요)");
  else if(Number(r.monthlyMaintenance)>0)extra.push("월 유지비 "+fmt(r.monthlyMaintenance));
  if(Number(r.monthlySalary))extra.push("월 급여/수익 필드 "+sign(r.monthlySalary));
  return summary(r.koName,r.id,e.overview||r.koName,
    any(e.effect,(r.power!=null?"위력 "+fmt(r.power):"")+(r.weight!=null?" · 무게 "+fmt(r.weight):"")),
    e.acquisition||((r.researchCount||0)+"개 연구 연결"),
    e.uses||"아이템을 획득/보유한 뒤 실제 제조·훈련의 실물 소비 여부 확인.",
    [extra.join(" / "),e.decision].filter(Boolean).join(" / "),
    any(e.watch,e.progression),
    "item effective rules + editorial", [link("items",r.id,"아이템 상세")]);
});
save("items",itemRows);

const train=read("data/trainings-index.json");
const trainBonus=train.bonuses||{};
const trainName=new Map(ary(train.transformations).map(t=>[t.id,t.koName]));
const requiredName=ids=>ary(ids).slice(0,7).map(id=>trainName.get(id)||researchName(id)).join(" · ");
const trainRows=train.transformations.map(t=>{
  const b=trainBonus[t.soldierBonusType]||{},extras=[];
  for(const [key,label] of [["frontArmor","전면 장갑"],["sideArmor","측면 장갑"],["rearArmor","후면 장갑"],["underArmor","하부 장갑"],["visibilityAtDark","암시야"]])if(Number(b[key]))extras.push(label+" "+sign(b[key]));
  for(const [key,label] of [["energy","기력 회복"],["stun","기절 회복"],["morale","사기 회복"]]){
    const v=b.recovery?.[key]?.flatOne;
    if(typeof v==="number"&&v!==0)extras.push(label+" "+sign(v));
  }
  const stats=pick(t.flatOverallStatChange),bonusStats=pick(b.stats);
  const effect=[stats?"직접(본체) "+stats:"",bonusStats?"영구특성 "+bonusStats:"",extras.length?extras.slice(0,8).join(" · "):"",t.producedSoldierType?"병종 변환 "+friendly(t.producedSoldierType):"",t.createsClone?"새 병사 생성":""].filter(Boolean).join(" / ");
  const items=ary(t.requiredItems).slice(0,7).map(x=>(x.koName||friendly(x.id))+" ×"+fmt(x.amount)).join(" · ");
  const tokens=ary(t.requiredCommendations).map(x=>x.koName+" ×"+fmt(x.amount)).join(" · ");
  const req=ary(t.requires).map(researchName).join(" · ");
  const gates=[...ary(t.requires).map(eventGrantGate).filter(Boolean),req?"연구/플래그 "+req:"",ary(t.requiresBaseFunc).length?"기지 기능 "+keyed(t.requiresBaseFunc):"",items?"재료 "+items:"",tokens?"훈장 "+tokens:"",ary(t.requiredPreviousTransformations).length?"필수 선행 훈련 "+requiredName(t.requiredPreviousTransformations):"",ary(t.allowedSoldierTypes).length?"허용 병종 "+t.allowedSoldierTypes.length+"종":"",pick(t.requiredMinStats)?"최소 능력 "+pick(t.requiredMinStats):""].filter(Boolean).join(" / ");
  const time=t.transferTime!=null?fmt(t.transferTime)+"시간":t.recoveryTime!=null?fmt(t.recoveryTime)+"일": "원본에 별도 기간 미기재";
  const forbidden=ary(t.forbiddenPreviousTransformations).filter(id=>id!==t.id);
  const blocksLater=ary(train.transformations).filter(x=>x.id!==t.id&&ary(x.forbiddenPreviousTransformations).includes(t.id));
  const warnings=[
    forbidden.length?"이전에 "+requiredName(forbidden)+" 훈련을 받았으면 불가 (방향성 배제).":"",
    blocksLater.length?"이 훈련 후 "+requiredName(blocksLater.map(x=>x.id))+(blocksLater.length>7?" 외 "+(blocksLater.length-7)+"개":"")+" 훈련이 금지됨.":"",
    ary(t.forbiddenPreviousTransformations).includes(t.id)?"동일 훈련 반복 금지.":"",
    t.allowsWoundedSoldiers===false?"부상병 불가.":"",
    t.upperBoundAtStatCaps===true?"직접 성장치는 성장 상한의 영향을 받을 수 있음.":"",
    "플래너의 가능 판정은 연구·재료·기지 보유까지 증명하지 않음."
  ].filter(Boolean).join(" ");
  const decision=bonusStats||extras.length?
    "별도 SoldierBonus가 추가되는 훈련. 단순 성장캡 훈련과 구분하고, 재료·병종·선장 루트를 충족할 때 주력병에 우선 검토.":
    t.producedSoldierType?"병종 자체를 바꾸므로 변환 전후 성장상한·기본 장갑·기존 특성을 비교.":"실제 직접 스탯 변화·상한·선행훈련을 충족할 수 있을 때 선택.";
  if(t.id==="STR_CAPTAINS_11")return summary(t.koName,t.id,
    "도둑 선장 전용. 11회 한정 사용 가능한 영구 능력/회복 특성 강화. 다른 훈련과 배제하지 않음.",
    effect,
    "도둑 선장(STR_CAPTAIN_THIEF) · 선장 일지 #1 · 선장 계급 2 · 도박 트로피 · 현상금 사냥 C 배지 완료 → 전용 이벤트에서 토큰 11개 지급. 허용 병종 "+t.allowedSoldierTypes.length+"종 · 부상병 불가.",
    "전용 이벤트 발생 후 병사별 특수훈련 → 토큰 1개·글래머 21개·$100,000 소모 → 500시간. 토큰 11개를 모두 쓰면 추가 훈련 불가.",
    "소수 정예 11명에 TU +10·Freshness +20·회복 +2 등 SoldierBonus를 영구 부여. 성장캡 훈련 뒤에도 추가 혜택.",
    "같은 병사에게 반복 불가. 다른 선장 루트는 해금 이벤트가 없음. 세뇌/특수 병종 등 허용 19종 외 대상 불가.",
    "Piratez_Events.rul + Piratez_Transformations.rul + Piratez_Bonuses.rul",[link("trainings",t.id,"훈련 원본 상세"),link("research",t.id,"해금 연구")]);
  return summary(t.koName,t.id,
    t.producedSoldierType?"병종 전환: "+t.koName:t.soldierBonusType?"영구 특성 강화: "+t.koName:"병사 훈련/개조: "+t.koName,
    effect||"원본에 명시된 직접 스탯/영구특성 변화 없음. 상세 변환 효과 확인.",
    gates,
    "기지의 병사 특수훈련/변신에서 적격 병사 선택 → $"+fmt(t.cost||0)+" 지불 → "+time+" 적용. "+(items?"필요 재료를 먼저 확보.":"") ,
    decision,warnings,"Piratez_Transformations.rul + soldierBonuses (effective)",[link("trainings",t.id,"훈련 조건 상세"),...ary(t.requires).slice(0,3).map(id=>link("research",id,"선행 연구"))]);
});
save("trainings",trainRows);
const transformed=new Map(trainRows.map(x=>[x.id,x]));

const manufacture=read("data/manufacture-index.json").index;
const manufactureEditor=makeEditor("data/manufacture-editorial-chunks");
save("manufacture",manufacture.map(r=>{
  const e=manufactureEditor(r.bucket)[r.id]||{};
  const gain=r.economicComparable?"판매가 기준 순가치 "+sign(r.opportunityNet)+" / 기술자-시간당 "+sign(r.opportunityNetPerEngineerHour):
    "병사·기체 또는 비교불가 산출이 있어 금전 순이익 계산에서 제외";
  return summary(r.koName,r.id,e.overview||r.roleKo||"제조식",any(e.inputsOutputs,r.outputSummary),
    any(e.unlock,"직접 연구 "+fmt(r.directResearchCount||0)+"개 · baseFunc "+(ary(r.baseFuncs).join(", ")||"없음")),
    any(e.execution,"제조비 "+fmt(r.cost)+" · 기술자-시간 "+fmt(r.time)),
    gain+" / "+brief(e.decision,180),
    any(e.caution,r.randomOptionCount?"랜덤 산출의 상대 가중치가 실제 사용 결과를 결정하므로 기대값에 유의":""),
    "manufacture rules/economics + editorial",[link("manufacture",r.id,"제조 상세")]);
}));

const facilities=read("data/facilities-index.json").index;
save("facilities",facilities.map(r=>{
  const provides=ary(r.provideBaseFunc),requirements=ary(r.requiresBaseFunc);
  const caps=[["인원",r.personnel],["창고",r.storage],["연구실",r.labs],["작업장",r.workshops],["훈련실",r.trainingRooms],["기지방어",r.defense],["탐지 범위",r.radarRange],["탐지 확률",r.radarChance]].filter(([,v])=>Number(v)>0).map(([k,v])=>k+" "+fmt(v));
  const income=r.monthlyCost<0?"월 순수익 "+fmt(-r.monthlyCost):"월 유지비 "+fmt(r.monthlyCost??0);
  return summary(r.koName,r.id,
    "기지 "+(ary(r.roles).join("·")||"시설")+" 기능 / "+r.area+"칸 점유",
    caps.slice(0,8).join(" · ")||"직접 수용량·전투 스탯 증가 없음",
    [requirements.length?"필요 기능 "+requirements.join("·"):"",r.researchCost?"명목 연구량 "+fmt(r.researchCost):""].filter(Boolean).join(" / "),
    "해금 후 기지 공간 "+r.area+"칸과 건설비 "+fmt(r.buildCost??0)+", 건설 "+fmt(r.buildTime??0)+"일 확보. "+(provides.length?"완공 후 "+provides.join("·")+" 기능 제공.":""),
    income+(r.area?" · 면적당 연구/작업장/창고 효율을 비교":""),
    "레이더 탐지·기지방어·지상 교전 효과는 서로 다르며, 건설 자체가 즉시 전투 승리를 보장하지 않습니다.",
    "facility effective rules",[link("facilities",r.id,"시설 상세")]);
}));

const armor=read("data/armors-index.json").index;
save("armors",armor.map(r=>{
  const resist=[["AP",r.ap],["화염",r.incendiary],["HE",r.he],["레이저",r.laser],["플라즈마",r.plasma],["근접",r.meleeResist]].filter(([,x])=>Number.isFinite(x)&&x!==1).map(([k,x])=>k+" ×"+x).slice(0,5);
  const changed=pick(Object.fromEntries(Object.keys(statsKo).map(k=>[k,r[k]])));
  return summary(r.koName,r.id,
    r.hasStoreItem?"착용 가능한 방어구":"유닛 전용 Armor 정의 (직접 구매 불가 가능)",
    "방어 전/좌/우/후/하 "+[r.frontArmor,r.leftArmor,r.rightArmor,r.rearArmor,r.underArmor].map(fmt).join("/")+(changed?" / 능력 "+changed:"")+(resist.length?" / 피해 배율 "+resist.join(" · "):""),
    "획득 "+(ary(r.acquisitionKinds).join("·")||"정규 경로 미확인")+" / 명목 연구량 "+fmt(r.mainResearchCost??0),
    r.hasStoreItem?"장비 아이템 확보 → 병사에게 장착. 연구·제조·구매 조건은 방어구 상세 확인.":"원본에서 직접 착용 가능 여부와 지정 유닛을 확인.",
    "기본 방어와 피해배율(×1 중립, ×0.5 피해 절반)은 별도 평가. 무게·TU 페널티까지 동시 비교.",
    r.mainResearchHasUnlockBypassCandidates?"unlocks 우회 후보 존재: 표시된 연구량은 최소 연구 경로가 아님.":"방어구 원본 저항값의 피해유형별 차이를 단순 장갑합으로 환산하지 마십시오.",
    "armors effective rules",[link("armors",r.id,"방어구 상세")]);
}));

const weapons=read("data/weapons-index.json");
const weaponRows=[];
const weaponGroups=["shooting","melee","throwing"];
for(const key of weaponGroups){
  for(const rel of ary(weapons.sectionChunks?.[key])) for(const r of ary(read("data/"+rel).rows)){
    const v=Number(r.power??r.basePower),tu=Number(r.tu??r.tuCost);
    const effect=["위력 "+(Number.isFinite(v)?fmt(v):"원본/탄약에 따라 다름"),
      r.accuracy!=null?"명중 "+fmt(r.accuracy):"",
      Number.isFinite(tu)&&tu>0?"TU "+fmt(tu):"",
      r.maxRange!=null?"사거리 "+fmt(r.maxRange):""].filter(Boolean).join(" · ");
    const id=r.id||r.rowId||r.weaponId;
    if(!id)continue;
    weaponRows.push(summary(r.koName||r.name||friendly(id),id,
      ({"shooting":"사격","melee":"근접","throwing":"투척"}[key])+" 공격 프로필",
      effect,"탄약/사격 모드/무기 상태·기준 캐릭터에 따라 유효 화력이 달라집니다.",
      "무기 선택 → 호환 탄약 확보 → 사격 모드 및 대상 적 장갑을 지정해 실제 위력/TU 비교.",
      "명목 위력보다 실제 대상 장갑을 적용한 효율과 탄약 공급 안정성이 중요.",
      "위력·명중은 원본 기본값과 기준 캐릭터 보정이 다를 수 있습니다. 대상별 비교 결과를 우선하십시오.",
      "weapons index / character-aware simulation",[link("weapons",id,"무기 비교")]));
  }
}
const weaponUnique=[...new Map(weaponRows.map(x=>[x.id,x])).values()];
save("weapons",weaponUnique);

const craftWeapons=read("data/craft-weapons-index.json").index;
save("craft-weapons",craftWeapons.map(r=>summary(r.koName,r.id,
  "기체 "+(ary(r.roles).join("·")||"지원")+" 장비 / "+(r.typeLabel||"weaponType "+r.weaponType),
  "위력 "+val(r.damage)+" · 사거리 "+val(r.range)+" · 명중 "+val(r.accuracy)+" · 탄약 "+val(r.ammoMax),
  "장착 weaponType "+r.weaponType+"을 허용하는 기체 슬롯 필요. 호환 기체 "+fmt(r.compatibleCraftCount||0)+"종.",
  "기체 슬롯·launcher·clip 확보 → 장비 장착 → 탄약/재보급률 "+val(r.rearmRate)+" 확인.",
  r.sharedTactical?"개인 전술무기와 launcher 자원 공용. 개인 무기 재고도 확인.":"기체 전용 장비. 같은 이름의 개인 무기와 자동으로 동일 성능이라고 가정하지 마십시오.",
  "명목 위력은 직접 대미지·방어/센서 지원 효과를 하나의 점수로 비교할 수 없습니다.",
  "craftWeapon effective rules",[link("craft-weapons",r.id,"기체 무장 상세")])));

const progression=read("data/progression.json");
save("crafts",ary(progression.crafts).map(r=>summary(r.koName,r.id,
  "탈것/기체 운용 · 병력 "+fmt(r.soldiers||0)+"명, 무장 슬롯 "+fmt(r.weapons||0)+"개",
  "속도 "+fmt(r.speedMax||0)+" / 연료 "+fmt(r.fuelMax||0)+" / 내구 "+fmt(r.damageMax||0)+" / 레이더 "+fmt(r.radarRange||0),
  "명목 연구량 "+fmt(r.summary?.nominalMinResearch??0)+(ary(r.summary?.commonBranchGates).length?" / 필수 공통 분기 "+names(r.summary.commonBranchGates):""),
  "해금 연구 → 구매 또는 제조 → 조종사·승무원·기체무장·탄약까지 갖춰 출격.",
  "현 세이브의 병력 수송 병목과 체공·기동·화력 중 무엇을 해결하는지 기준으로 평가.",
  "해금 ≠ 실물 보유. 명목 연구량은 무료·이벤트·분기 우회로 실제 최소 비용과 다를 수 있습니다.",
  "craft progression & acquisition paths",[link("crafts",r.id,"기체 상세")])));

const soldier=read("data/soldiers-index.json");
const soldierRows=[];
for(const p of ary(soldier.profiles)){
  const bonus=ary(p.traits).map(t=>t.koName||friendly(t.id)).slice(0,6);
  soldierRows.push(summary(p.sourceKoName||p.koName,p.id,
    "실제 병종 획득형 → "+friendly(p.soldierType),
    "자동 특성 "+(bonus.join(" · ")||"별도 지정 없음")+" / 생성 스탯·성장캡은 해당 획득형 상세 확인.",
    "획득 방식 "+val(p.sourceType)+" · 제공원 "+friendly(p.sourceId),
    "동명 일반 병종이 아닌 실제 고용/제조/이벤트 획득형으로 진입하고, 자동 특성 포함 스탯 확인.",
    "기본 바디가 같아도 자동 부여 특성·성장캡·유지비가 다를 수 있어 획득 경로끼리 비교.",
    "최종 강화 조합은 실제 분기 배제와 이전 변신 기록을 모두 충족해야 합니다.",
    "soldier spawn/acquisition profiles",[link("soldiers",p.id,"병종 상세")]));
}
for(const s of ary(soldier.soldiers)){
  soldierRows.push(summary(s.koName,s.id,"기본 병종 바디 · "+s.koName,
    "기초 능력 범위·성장캡·유지비는 원본 병종 상세의 별도 값.",
    "기본 구매/획득/전환 경로가 필요. 획득형에 따라 시작 특성이 달라질 수 있음.",
    "실제 획득형 탭에서 자동 특성 포함 실효치를 확인하고 훈련 조합기에서 가능한 순서를 선택.",
    "기본 스탯만으로 최종 강화 병종의 우열을 판단할 수 없음.",
    "기본 RuleSoldier와 실제 생성 템플릿은 다를 수 있습니다.","soldier rules",[link("soldiers",s.id,"병종 상세")]));
}
for(const t of ary(soldier.transformations)){
  if(transformed.has(t.id))soldierRows.push({...transformed.get(t.id),source:"soldierTransformation + training rules"});
}
save("soldiers",soldierRows);

const starting=read("data/starting-bonuses.json");
const startGroups=new Map();
for(const e of [...ary(starting.regions),...ary(starting.countries)]){
  const id=ary(e.triggerIds).length?e.triggerIds.join("|"):"__NONE__";
  if(!startGroups.has(id))startGroups.set(id,[]);
  startGroups.get(id).push(e);
}
save("starting",[...startGroups].map(([id,es])=>{
  const items=new Map(),research=new Set(),units=[],sum={funds:0,points:0};
  for(const e of es){
    sum.funds+=Number(e.funds||0);sum.points+=Number(e.points||0);
    for(const i of ary(e.items))items.set(i.id,(items.get(i.id)||0)+Number(i.qty||0));
    for(const r of ary(e.research))research.add(r);
    if(e.spawnedPersonType)units.push(friendly(e.spawnedPersonType)+" ×"+fmt(e.spawnedPersons||0));
  }
  const itemText=[...items].slice(0,8).map(([x,q])=>friendly(x)+" ×"+fmt(q)).join(" · ");
  return summary(id==="__NONE__"?"기타/기본 국가":friendly(es[0]?.triggerIds?.[0]||id),id,
    "첫날(Month 0) 지역/국가 보너스. 이벤트 "+es.length+"건 중첩 집계.",
    "자금 "+sign(sum.funds)+" · 점수 "+sign(sum.points)+(itemText?" / 지급 "+itemText:"")+(units.length?" / 병력 "+units.join(" · "):""),
    id==="__NONE__"?"특정 국가 조건을 충족하지 않는 경우의 fallback.":"시작 기지 위치가 "+id+" 지역/국가 조건을 만족해야 함.",
    "시작 위치를 정하면 첫달 이벤트로 보너스 지급. 아이템형 인원권은 후속 제조/고용식이 필요한지 상세 확인.",
    "즉시 지급과 변환·제조로 얻는 병력을 나눠 평가. 이후 기지 입지와 별도 비교.",
    "스타팅 지역·국가 보너스가 둘 다 적용되면 중첩될 수 있음. 분류 이벤트와 단순 지급은 구분.",
    "Piratez_Events.rul (firstMonth=lastMonth=0)",[link("starting",id,"시작 보너스 상세")]);
}));

const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,"captains","captain-rows.js"),"utf8"),sandbox,{timeout:2000,filename:"captain-rows.js"});
const captains=ary(sandbox.window.CAPTAIN_ROWS);
save("captains",captains.map(r=>summary(r.name,r.id,
  r.summary||"선장 분기 "+r.code,
  [r.route,"매월 이벤트 현금 기대값 "+r.evText].filter(Boolean).join(" · "),
  r.from+" / 단계 "+r.stageName,
  "영구 선택·분기 DB에서 진입 경로를 먼저 검토 → 분기 시 닫히는 훈련·시설·Saint 공급을 확인한 다음 선택.",
  [r.summary,"특수 훈련: "+[r.bread==="yes"?"Bread & Fishes":"",r.military==="yes"?"Military Drill":"",r.charmy==="yes"?"Charmy Dance":""].filter(Boolean).join("·")].filter(Boolean).join(" / "),
  ary(r.notes).slice(0,2).join(" "),
  "captain-rows.js annotated choice matrix",[link("captains",r.id,"선장 분기 상세")])));

const events=unzip("data/events-index.json.gz").index;
const eventEditor=bucketLoader("data/event-editorial-chunks",".json.gz");
save("events",events.map(r=>{
  const e=eventEditor(r.bucket)[r.id]||{};
  return summary(r.koName,r.id,
    any(e.overview,e.identity,e.core,r.primaryRoleKo,r.koName),
    any(e.result,e.effect,e.rewards,
      "보상 연구 "+fmt(r.researchRewardCount)+"·확정 아이템 "+fmt(r.guaranteedItemCount)+"·랜덤 "+fmt(r.randomRewardCount)+" / 자금 "+sign(r.funds||0)+"·점수 "+sign(r.points||0)),
    any(e.trigger,e.conditions,
      "기간 "+val(r.earliestMonth)+"~"+val(r.latestMonth)+"월 / 참 조건 "+fmt(r.positiveTriggerCount)+"·거짓 조건 "+fmt(r.negativeTriggerCount)),
    any(e.action,"원본 이벤트 연구·시설·아이템·기간 조건을 충족해 발생 판정을 대기. 이벤트 자체 발생 조건을 연구 완료와 구분."),
    any(e.value,e.decision,r.primaryRoleKo),
    any(e.missRisk,e.caution,
      "조건부 executionOdds "+val(r.minExecutionOdds)+"%는 전체 캠페인 발생확률이 아님. 놓침 위험 "+val(r.missRisk)),
    "event scripts + generated editorial",[link("events",r.id,"이벤트 상세")]);
}));

const forces=unzip("data/enemy-forces-index.json.gz").index;
const forceEditor=bucketLoader("data/enemy-force-editorial-chunks",".json.gz");
save("forces",forces.map(r=>{
  const e=forceEditor(r.bucket)[r.id]||{};
  return summary(r.koName,r.id,
    any(e.overview,e.identity,e.core,"적 작전·부대"+(r.hasGround?" / 지상 임무":"")),
    any(e.encounter,e.composition,e.effect,
      "임무 스크립트 "+fmt(r.scriptCount||0)+"·웨이브 "+fmt(r.waveCount||0)+"·종족 후보 "+fmt(r.raceCount||0)+"·지상배치 "+fmt(r.deploymentCount||0)),
    any(e.spawn,e.triggers,"연구·지역·시간·이벤트에서 작전/웨이브 생성이 결정됨."),
    any(e.action,"전투 직전 난이도와 종족·배치 후보를 확인해 무장·병력·기체를 편성."),
    any(e.threat,e.decision,"웨이브/편제·최대속도 "+val(r.maxSpeed)+"를 바탕으로 교전 가능성과 손실 위험을 비교."),
    any(e.caution,e.watch,"raceWeights 비중은 조건부 표 안의 상대비율이며 전체 조우확률과 다름."),
    "enemy mission/wave/race/deployment rules",[link("forces",r.id,"적부대 상세")]);
}));
