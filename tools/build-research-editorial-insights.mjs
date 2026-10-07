import fs from "node:fs";
import path from "node:path";

const args=process.argv.slice(2);
const arg=(name,fallback=null)=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:fallback};
const dataDir=path.resolve(arg("--data","public/items/data"));
const outDir=path.resolve(arg("--out",dataDir));
const file=(...parts)=>path.join(dataDir,...parts);
const outFile=(...parts)=>path.join(outDir,...parts);
const readJson=(...parts)=>JSON.parse(fs.readFileSync(file(...parts),"utf8"));

const research=readJson("research-index.json").index||[];
const insightIndex=readJson("research-insight-index.json").index||[];
const entities=readJson("entities.json").names||{};
const insightIndexById=new Map(insightIndex.map(x=>[x.id,x]));
const researchById=new Map(research.map(x=>[x.id,x]));
const detailBuckets=new Map(),insightBuckets=new Map();

function detailFor(row){
  if(!detailBuckets.has(row.bucket))detailBuckets.set(row.bucket,readJson("research-chunks",row.bucket+".json").details);
  return detailBuckets.get(row.bucket)[row.id];
}
function insightFor(row){
  if(!insightBuckets.has(row.bucket))insightBuckets.set(row.bucket,readJson("research-insight-chunks",row.bucket+".json").details);
  return insightBuckets.get(row.bucket)[row.id]?.insight||null;
}
function ko(id){return entities[id]?.[0]||researchById.get(id)?.koName||id}
function names(ids,limit=3){
  const xs=[...new Set((ids||[]).filter(Boolean))].map(ko);
  if(!xs.length)return "";
  return xs.slice(0,limit).join("·")+(xs.length>limit?" 외 "+(xs.length-limit)+"개":"");
}
function num(v){return Number(v||0).toLocaleString("ko-KR")}
function list(v){return Array.isArray(v)?v:[]}
function uniq(v){return [...new Set(list(v).filter(Boolean))]}
function hasBatchim(s){
  const t=String(s||"").trim();if(!t)return false;
  for(let i=t.length-1;i>=0;i--){
    const c=t.charCodeAt(i);
    if(c>=0xac00&&c<=0xd7a3)return(c-0xac00)%28!==0;
    if(/[A-Za-z0-9]/.test(t[i]))return false;
  }
  return false;
}
function topic(s){return String(s)+(hasBatchim(s)?"은":"는")}
function object(s){return String(s)+(hasBatchim(s)?"을":"를")}
function subject(s){return String(s)+(hasBatchim(s)?"이":"가")}
function targets(row,ids,sameLabel="해당 대상",limit=3){
  const xs=[...new Set((ids||[]).filter(Boolean))];
  if(xs.length===1&&ko(xs[0])===row.koName)return sameLabel;
  return names(xs,limit);
}
function median(xs){
  const a=xs.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!a.length)return 0;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function sentence(parts){return parts.filter(Boolean).join(" ").replace(/\s+/g," ").trim()}
function roleRefs(insight,kind){return list(insight.semanticReferences).filter(x=>x.kind===kind)}
function eventHints(insight){
  const scripts=list(insight.semanticReferences).flatMap(x=>list(x.scripts).concat(x.scriptGate?[x.scriptGate]:[]));
  const odds=[...new Set(scripts.map(x=>x.conditions?.executionOdds).filter(Number.isFinite))];
  const months=[...new Set(scripts.flatMap(x=>[x.conditions?.firstMonth,x.conditions?.lastMonth]).filter(Number.isFinite))].sort((a,b)=>a-b);
  const facilities=[...new Set(scripts.flatMap(x=>Object.entries(x.facilityTriggers||{}).filter(([,v])=>v===true).map(([k])=>k)))];
  return{odds,months,facilities};
}
const statKo={tu:"TU",stamina:"기력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"Psi 강도",psiSkill:"Psi 기술",melee:"근접",mana:"Mana"};
function statText(o,limit=6){
  const xs=Object.entries(o||{}).filter(([,v])=>typeof v==="number"&&v!==0);
  if(!xs.length)return "";
  const shown=xs.slice(0,limit).map(([k,v])=>(statKo[k]||k)+" "+(v>0?"+":"")+v).join(", ");
  return shown+(xs.length>limit?" 외 "+(xs.length-limit)+"개":"");
}

const costsByRole=new Map();
for(const row of research){
  const ix=insightIndexById.get(row.id),role=ix?.primaryInsightKind||"other";
  if(Number.isFinite(row.cost))(costsByRole.get(role)||costsByRole.set(role,[]).get(role)).push(row.cost);
}
const roleMedian=new Map([...costsByRole].map(([k,v])=>[k,median(v)]));

function opening(row,d,i){
  const roles=list(i.roles),primary=i.primaryRole||roles[0]||"other";
  const refs=k=>roleRefs(i,k);
  const transforms=list(i.transformations);
  if(primary==="soldier-training"&&transforms.length){
    const t=transforms[0],req=[];
    if(t.cost)req.push("비용 "+num(t.cost));
    if(t.recoveryTime)req.push(num(t.recoveryTime)+"일");
    if(list(t.requiresBaseFunc).length)req.push(names(t.requiresBaseFunc,2)+" 기능");
    if(list(t.requiredItems).length)req.push("재료 "+t.requiredItems.slice(0,3).map(x=>ko(x.id)+" ×"+x.qty).join("·"));
    const stats=statText(t.flatOverallStatChange);
    const bonus=t.soldierBonus?.id?ko(t.soldierBonus.id):"";
    return sentence([
      topic(row.koName)+" 연구 자체가 즉시 버프를 주는 기술이 아니라 병사별 후속 훈련/변신을 여는 연구다.",
      req.length?"실제 적용 조건은 "+req.join(", ")+"다.":"",
      stats?"훈련의 직접 능력치 변화는 "+stats+"이고"+(bonus?", 여기에 "+bonus+" soldierBonus가 별도 레이어로 붙는다":"")+".":""
    ]);
  }
  if(roles.includes("item-reward")&&roles.includes("research-unlock")){
    const itemName=names(i.spawnedItems,3),unlockName=names(i.explicitUnlocks,3);
    return topic(row.koName)+" 단순 선행연구가 아니라 완료 즉시 "+object(itemName)+" 만들고, 동시에 "+unlockName+" 계통을 여는 복합 관문이다.";
  }
  if(primary==="manufacture"){
    const xs=refs("manufacture").map(x=>x.id),target=targets(row,xs,"동명의 제조식",3)||"관련 장비";
    return topic(row.koName)+" "+(target==="동명의 제조식"?target+"을":target+" 제조를")+" 여는 생산 기술이다. 연구 완료만으로 결과물이 생기는 것은 아니며 이후 실제 제조 단계가 남는다.";
  }
  if(primary==="craft"){
    const xs=refs("craft").map(x=>x.id),target=targets(row,xs,"동명의 기체",3)||"관련 기체";
    return topic(row.koName)+" "+target+(target==="동명의 기체"?" 획득·운용":"의 획득·운용")+" 조건을 여는 기체 계통 연구다. 연구를 끝낸 뒤에도 구매·제조·수리 같은 실제 확보 단계가 별도로 필요할 수 있다.";
  }
  if(primary==="facility"){
    const xs=refs("facility").map(x=>x.id);
    return topic(row.koName)+" "+(targets(row,xs,"동명의 시설",3)||"관련 시설")+" 건설 조건을 여는 기반 연구다. 직접 전투력보다 이후 연구·생산·이벤트가 요구하는 기지 기능을 확보하는 의미가 크다.";
  }
  if(primary==="recruitment"){
    const xs=refs("recruitment").map(x=>x.id);
    return topic(row.koName)+" "+(targets(row,xs,"동명의 병종",3)||"관련 병종")+"의 고용·획득 조건을 여는 병종 연구다. 연구 자체보다 실제 영입 경로와 그 병종의 기본 특성까지 같이 봐야 가치가 드러난다.";
  }
  if(primary==="event-grant"){
    const xs=refs("event-grant").map(x=>x.id);
    return topic(row.koName)+" 일반 연구실에서 밀어 얻는 기술이라기보다 "+(names(xs,3)||"관련 이벤트")+"에서 지급되는 진행 플래그 성격이 강하다. 따라서 연구량 숫자만 보고 직접 연구 우선순위를 정하면 실제 획득 구조를 잘못 읽을 수 있다.";
  }
  if(primary==="event-unlock"){
    const xs=refs("event-unlock").map(x=>x.id);
    return topic(row.koName)+" "+(names(xs,3)||"관련 이벤트")+"의 발생 조건을 충족시키는 진행 연구다. 완료했다고 이벤트가 즉시 뜨는 것은 아니며 시기·확률·시설·다른 연구 조건을 함께 만족해야 한다.";
  }
  if(primary==="purchase"){
    const xs=refs("purchase").map(x=>x.id);
    return topic(row.koName)+" "+(targets(row,xs,"동명의 아이템",3)||"관련 아이템")+"의 구매 가능 조건을 여는 상점 해금 연구다. 실제 전력 상승은 연구 완료가 아니라 구매 자금과 장비 운용 여건까지 갖췄을 때 발생한다.";
  }
  if(primary==="mission"){
    const xs=refs("mission").map(x=>x.id);
    return topic(row.koName)+" "+(targets(row,xs,"동명의 미션",3)||"관련 미션")+" 진행을 여는 스토리·미션 관문이다. 직접 보상보다 새로운 임무와 그 이후 연쇄 진행을 발생시키는 데 의미가 있다.";
  }
  if(primary==="research-grant"){
    const xs=list(i.freeResearch);
    return topic(row.koName)+" 완료 시 "+object(names(xs,4)||"추가 연구")+" getOneFree 계열로 함께 지급하는 연구다. 연구 하나로 여러 진행 플래그를 묶어 얻는 구조라면 개별 연구량보다 트리 압축 효과가 더 중요하다.";
  }
  if(primary==="branch-choice"){
    const choices=list(i.disables);
    return topic(row.koName)+" 상호배타 선택을 확정하는 분기 연구다. "+(choices.length?names(choices,4)+" 쪽과 동시에 유지할 수 없어":"다른 선택지와의 배타 관계가 있어")+" 단순 해금보다 되돌릴 수 없는 기회비용을 먼저 봐야 한다.";
  }
  if(primary==="item-reward"){
    return topic(row.koName)+" 완료 시 "+object(names(i.spawnedItems,4)||"특수 아이템")+" 직접 지급·생성하는 보상 연구다. 생성물이 다음 연구·제조의 실물 병목이면 표면상의 연구량보다 진행 가속 효과가 크다.";
  }
  if(primary==="item-gate"){
    const xs=refs("item-gate").map(x=>x.id);
    return topic(row.koName)+" "+(targets(row,xs,"동명의 아이템",3)||"관련 아이템")+"의 사용·등장 조건으로 소비되는 게이트 연구다. 연구 그 자체의 보상보다 어떤 장비가 이 플래그를 요구하는지를 보는 편이 실전적으로 중요하다.";
  }
  if(primary==="event-research-link"){
    const xs=refs("event-research-link").map(x=>x.id);
    return topic(row.koName)+" "+(names(xs,3)||"이벤트 스크립트")+"와 직접 연결된 이벤트 플래그다. 일반 연구 트리의 선후관계만으로는 의미가 잘 보이지 않으므로 발생 시기·확률·다른 트리거를 함께 봐야 한다.";
  }
  if(roles.includes("research-unlock")){
    return topic(row.koName)+" "+object(names(i.explicitUnlocks,3)||"후속 연구")+" 명시적으로 여는 연구 관문이다. 당장 눈에 보이는 보상이 작더라도 다음 계통으로 넘어가기 위한 열쇠로 보는 편이 정확하다.";
  }
  if(primary==="research-granted-by"){
    const xs=refs("research-granted-by").map(x=>x.id);
    return topic(row.koName)+" 직접 연구만이 아니라 "+(names(xs,3)||"다른 연구")+"의 getOneFree 계열 보상으로 들어올 수 있는 연구다. 무료 획득 경로가 가까우면 직접 연구에 연구력을 쓰지 않는 선택이 가능하다.";
  }
  if(primary==="ufopaedia"){
    return topic(row.koName)+" 현재 룰셋 역참조에서 주 용도가 정보·UFOPEDIA 해금으로 잡히는 연구다. 직접 전투·제조 효과가 확인되지 않는다면 실전 우선순위는 후속 연구나 다른 숨은 연결이 있는지에 달려 있다.";
  }
  if(primary==="progression"){
    return topic(row.koName)+" 즉시 보상보다 후속 연구를 연결하는 진행 플래그에 가깝다. 자체 효과보다 이 연구를 요구하는 다음 기술들이 무엇인지가 실제 가치 판단의 핵심이다.";
  }
  return topic(row.koName)+" 현재 자동 역참조상 단일한 전투·제조 효과로 설명하기 어려운 특수 연구다. 아래 연결과 원본 룰을 함께 보면 실제로 어떤 플래그나 조건으로 소비되는지 판단할 수 있다.";
}

function strategic(row,d,i){
  const roles=list(i.roles),parts=[],total=(i.prerequisite?.prerequisiteCost||0)+(row.cost||0);
  if(i.prerequisite?.topicCount){
    if(i.prerequisite.topicCount>=100)parts.push("재귀 선행 합집합은 "+num(i.prerequisite.topicCount)+"개·연구량 "+num(i.prerequisite.prerequisiteCost)+"이고 자체 연구량은 "+num(row.cost)+", 합계는 "+num(total)+"이다. 다만 이벤트 지급·우회·분기가 섞인 큰 트리에서는 이 값이 실제 최소 루트보다 크게 잡힐 수 있다.");
    else parts.push("명목상 선행 "+num(i.prerequisite.topicCount)+"개를 거치며, 선행 연구량은 "+num(i.prerequisite.prerequisiteCost)+", 자체 연구량은 "+num(row.cost)+", 합계는 "+num(total)+"이다.");
  }else if(Number.isFinite(row.cost)){
    parts.push("자체 연구량은 "+num(row.cost)+"이다.");
  }
  const med=roleMedian.get(i.primaryRole||roles[0]||"other")||0;
  if(med>0&&row.cost>=med*2&&row.cost>=10)parts.push("같은 주 역할 연구의 중앙값 "+num(med)+"보다 자체 비용이 큰 편이라, 바로 이어서 쓸 결과가 있을 때 투자 효율이 좋아진다.");
  else if(med>0&&row.cost>0&&row.cost<=Math.max(2,med*.5))parts.push("같은 주 역할의 전형적 비용보다 가벼운 편이라 필요한 계통이라면 부담 없이 병목을 제거하기 좋다.");

  if((i.primaryRole||roles[0])==="soldier-training")parts.push("대상 병사와 훈련 재료·시설이 이미 준비되어 있다면 즉시 전력 상승으로 연결되므로 우선순위가 높다. 반대로 연구만 끝내고 실제 훈련을 못 하면 단기 가치는 낮다.");
  else if((i.primaryRole||roles[0])==="manufacture")parts.push("작업장과 재료를 바로 투입할 수 있을 때 연구 가치가 즉시 실현된다. 생산 여력이 없으면 당장은 후속 관문에 가깝다.");
  else if((i.primaryRole||roles[0])==="facility")parts.push("건설 자금·기지 공간·완공 시간을 감당할 수 있을 때 우선순위가 올라간다. 연구 완료만으로 시설 기능이 생기지는 않는다.");
  else if(["event-unlock","event-grant","event-research-link"].includes(i.primaryRole||roles[0]))parts.push("연결 이벤트의 나머지 트리거가 가까워졌을 때 우선순위가 높다. 조건이 멀다면 연구량보다 이벤트 병목이 더 크다.");
  else if((i.primaryRole||roles[0])==="branch-choice")parts.push("즉시 보상보다 닫히는 반대 분기의 장기 보상이 더 중요하므로, 선택 전에 후속 병종·훈련·시설·연구를 비교해야 한다.");
  else if(["progression","research-unlock","ufopaedia"].includes(i.primaryRole||roles[0]))parts.push("직접 효과보다 목표 후속 연구로 가는 길을 여는 가치가 핵심이다. 목표 후속이 명확하지 않다면 직접 전력·경제 개선 연구보다 뒤로 미룰 수 있다.");

  if(row.requiredByCount>=8)parts.push("직접 후속 연구가 "+num(row.requiredByCount)+"개라 여러 갈래를 동시에 여는 허브이므로, 이 계통을 넓게 탈 계획이면 우선순위가 높다.");
  else if(row.requiredByCount>=3)parts.push("직접 후속 연구 "+num(row.requiredByCount)+"개에 연결되어 있어 단일 보상보다 트리 확장 가치가 크다.");
  else if(row.requiredByCount===0&&!roles.some(x=>["soldier-training","manufacture","craft","facility","recruitment","purchase","mission","item-reward","research-granted-by","event-grant","event-unlock","event-research-link","branch-choice","research-grant","research-unlock"].includes(x)))parts.push("확인된 직접 후속 연구가 없으므로 특정 이벤트·도감·플래그 목적이 아니라면 급하게 완료할 이유는 적다.");

  if(list(i.spawnedItems).length)parts.push("완료 시 "+object(names(i.spawnedItems,3))+" 직접 생성하므로, 그 물품이 다음 제작·연구의 병목이라면 체감 가치는 연구량 숫자보다 크다.");
  if(list(i.explicitUnlocks).length)parts.push("명시 해금은 "+names(i.explicitUnlocks,3)+"이다.");
  const usefulFree=list(i.freeResearch).filter(id=>!list(d.dependencies).includes(id));
  if(usefulFree.length&&i.primaryRole!=="research-grant")parts.push("완료 보상으로 "+names(usefulFree,3)+" 연구도 함께 지급된다.");
  if(!parts.length){
    if(row.cost==null)parts.push("연구량이 따로 명시되지 않은 플래그형 항목이라 비용 대비 효율보다 실제 획득 경로와 후속 연결을 확인하는 편이 정확하다.");
    else parts.push("현재 확인된 직접 연결이 제한적이므로 연구량 자체보다 이 플래그가 어떤 스크립트·도감·조건에서 소비되는지를 확인해야 우선순위를 판단할 수 있다.");
  }
  return parts.slice(0,4).join(" ");
}

function caution(row,d,i){
  const notes=[],roles=list(i.roles),h=eventHints(i);
  if(i.automaticEffect===false)notes.push("가장 중요한 함정은 ‘연구 완료 = 병사 강화 완료’가 아니라는 점이다.");
  if(roles.includes("item-reward")&&roles.includes("research-unlock"))notes.push("완료로 얻는 것은 중간 재료와 후속 연구 진입권이며, 최종 장비·기체가 자동으로 완성되는 것은 아니다.");
  if(i.researchRequirements?.needItem)notes.push(i.researchRequirements.destroyItem?"실물 표본이 필요하고 연구 과정에서 소모된다.":"실물 표본은 필요하지만 연구 과정에서 소모되지는 않는다.");
  if(list(i.researchRequirements?.requiresBaseFunc).length)notes.push("연구 자체에 "+names(i.researchRequirements.requiresBaseFunc,3)+" 기능이 필요하다.");
  if(list(i.disables).length&&i.primaryRole!=="branch-choice")notes.push(names(i.disables,3)+"와 배타 관계가 있으므로 먼저 찍고 되돌리는 식의 운용을 하면 안 된다.");
  if(roles.includes("research-granted-by"))notes.push("다른 연구의 무료 지급 경로가 있으므로 직접 연구 전에 우회 획득 가능성을 확인하는 편이 낫다.");
  if(h.odds.length)notes.push("연결 이벤트에는 발생 확률 "+h.odds.slice(0,3).map(x=>x+"%").join("·")+" 조건이 확인된다.");
  if(h.months.length)notes.push("이벤트 시기 조건에는 게임 월 "+h.months.slice(0,4).join("·")+"가 포함된다.");
  if(h.facilities.length)notes.push("이벤트 쪽에서 "+names(h.facilities,3)+" 시설을 요구하는 경로가 있다.");
  if(!notes.length&&roles.includes("manufacture"))notes.push("해금과 실제 보유는 다르므로 제조 재료·시설·시간까지 확보되어 있는지 같이 봐야 한다.");
  if(!notes.length&&roles.includes("craft"))notes.push("기체 해금 뒤 실제 확보 방식과 격납고·재료 같은 운영 조건을 따로 확인해야 한다.");
  if(!notes.length&&roles.includes("progression"))notes.push("직접 전투 효과를 기대하기보다 후속 트리의 병목을 제거하는 용도로 평가하는 것이 맞다.");
  if(!notes.length)notes.push("이 해설은 현재 룰셋의 직접·역참조 관계를 바탕으로 한 판단이므로, 스크립트에 숨은 조건이 새로 발견되면 우선순위 해석은 달라질 수 있다.");
  return notes.slice(0,2).join(" ");
}

function concreteEffect(row,d,i){
  const roles=list(i.roles),parts=[],transforms=list(i.transformations),refs=k=>roleRefs(i,k);
  if(transforms.length){
    const t=transforms[0],flat=statText(t.flatOverallStatChange),bonus=statText(t.soldierBonus?.stats),combined=statText(t.combinedFixedStatChange);
    if(flat)parts.push("훈련 직접 변화: "+flat+".");
    if(t.soldierBonus?.id)parts.push("별도 soldierBonus는 "+ko(t.soldierBonus.id)+(bonus?" ("+bonus+")":"")+"이며, 직접 능력치 변화와 같은 레이어가 아니다.");
    if(combined&&combined!==flat)parts.push("직접 변화와 보너스 수치의 단순 합산 잠재값은 "+combined+"이다. 다만 직접 변화분은 stat cap 때문에 실제 증가량이 더 작을 수 있다.");
    if(t.producedSoldierType)parts.push("변환 결과 병종은 "+ko(t.producedSoldierType)+"이다.");
  }
  if(list(i.spawnedItems).length)parts.push("연구 완료 시 "+object(names(i.spawnedItems,4))+" 직접 생성한다.");
  if(refs("manufacture").length)parts.push("직접 연결 제조식은 "+names(refs("manufacture").map(x=>x.id),4)+"이다.");
  if(refs("facility").length)parts.push("건설 조건이 열리는 시설은 "+names(refs("facility").map(x=>x.id),4)+"이다.");
  if(refs("craft").length)parts.push("기체 계통 연결은 "+names(refs("craft").map(x=>x.id),4)+"이다.");
  if(refs("recruitment").length)parts.push("병종/고용 연결은 "+names(refs("recruitment").map(x=>x.id),4)+"이다.");
  if(refs("purchase").length)parts.push("구매 해금 아이템은 "+names(refs("purchase").map(x=>x.id),4)+"이다.");
  if(list(i.freeResearch).length)parts.push("완료 시 getOneFree 계열로 "+object(names(i.freeResearch,4))+" 추가 지급한다.");
  if(list(i.explicitUnlocks).length)parts.push("명시적으로 여는 후속 연구는 "+names(i.explicitUnlocks,4)+"이다.");
  if(roles.includes("event-unlock")||roles.includes("event-grant")||roles.includes("event-research-link")){
    const ev=uniq(list(i.semanticReferences).filter(x=>String(x.kind).startsWith("event-")).map(x=>x.id));
    if(ev.length)parts.push("직접 연결 이벤트는 "+names(ev,4)+"이다.");
  }
  if(!parts.length&&list(d.requiredBy).length)parts.push("확인된 직접 효과보다 "+names(d.requiredBy,4)+" 등 후속 연구의 선행 플래그로 쓰이는 의미가 크다.");
  if(!parts.length)parts.push("현재 자동 역참조에서 즉시 적용되는 전투·제조·시설 효과는 뚜렷하지 않다. 이 경우 효과 자체보다 플래그 소비처를 보는 편이 정확하다.");
  return parts.slice(0,4).join(" ");
}

function nextAction(row,d,i){
  const primary=i.primaryRole||list(i.roles)[0]||"other",refs=k=>roleRefs(i,k),t=list(i.transformations)[0];
  if(primary==="soldier-training"&&t){
    const req=[];
    if(t.cost)req.push("비용 "+num(t.cost));
    if(t.recoveryTime)req.push(num(t.recoveryTime)+"일");
    if(list(t.requiresBaseFunc).length)req.push("기지 기능 "+names(t.requiresBaseFunc,3));
    if(list(t.requiredItems).length)req.push("재료 "+t.requiredItems.slice(0,4).map(x=>ko(x.id)+" ×"+x.qty).join("·"));
    return "연구 뒤 병사 상세에서 "+object(ko(t.id))+" 실제로 실행해야 한다. "+(req.length?"실행 조건은 "+req.join(", ")+"다. ":"")+(list(t.allowedSoldierTypes).length?"적용 가능 병종은 "+num(t.allowedSoldierTypes.length)+"종이다.":"");
  }
  if(primary==="manufacture"){const target=names(refs("manufacture").map(x=>x.id),4)||"연결 제조식";return "연구 완료 후 제조 메뉴에서 "+object(target)+" 실제 생산해야 결과물을 얻는다. 작업장·재료·제조시간이 다음 병목이다.";}
  if(primary==="facility")return "연구 완료 후 "+(names(refs("facility").map(x=>x.id),4)||"연결 시설")+"을 실제 건설해야 기능이 생긴다. 기지 공간·건설비·완공기간까지 확인해야 한다.";
  if(primary==="craft")return "연구 완료 후 "+(names(refs("craft").map(x=>x.id),4)||"연결 기체")+"의 구매·제조·수리 경로를 이어가야 실제 전력화된다. 격납고와 승무원/무장 조건도 별개다.";
  if(primary==="recruitment")return "연구 완료 후 "+(names(refs("recruitment").map(x=>x.id),4)||"연결 병종")+"의 실제 고용·획득 루트를 진행해야 한다. 연구 자체가 병사를 자동 생성하지는 않는다.";
  if(primary==="purchase")return "연구 완료 후 상점에서 "+(names(refs("purchase").map(x=>x.id),4)||"연결 아이템")+"의 구매 가능 여부와 가격을 확인해 실제 조달해야 한다.";
  if(primary==="event-unlock"||primary==="event-grant"||primary==="event-research-link")return "이 연구만 끝내고 기다리는 것이 아니라 아래 이벤트 스크립트의 시기·확률·시설·다른 연구 조건을 함께 맞춰야 한다. 이벤트 지급형이면 연구실에서 직접 밀 수 없는 경로인지도 먼저 확인해야 한다.";
  if(primary==="branch-choice")return "완료 전에 비활성화되는 "+(names(i.disables,4)||"반대 선택지")+"의 후속 보상까지 비교하고 장기 분기를 확정해야 한다.";
  if(primary==="item-reward")return "완료 직후 생성 아이템 "+(names(i.spawnedItems,4)||"보상")+"을 기지 보유품에서 확인하고, 다음 연구 표본·제조 재료·수리 재료 중 어디에 쓰이는지 이어서 확인해야 한다.";
  const next=list(i.explicitUnlocks).length?i.explicitUnlocks:d.requiredBy;
  if(list(next).length)return "이 연구 자체가 목표가 아니라면 완료 직후 "+names(next,4)+" 등 실제 목표 후속 연구로 이어가는 편이 효율적이다.";
  return "연구 완료 후 새로 열린 제조·시설·병종·이벤트가 없는지 역참조를 확인하고, 직접 소비처가 없다면 다음 목표를 위해 꼭 필요한 플래그인지 다시 판단해야 한다.";
}

function routeSummary(row,d,i){
  const p=i.prerequisite||{},rq=i.researchRequirements||{},parts=[],total=(p.prerequisiteCost||0)+(row.cost||0);
  if(Number.isFinite(row.cost))parts.push("자체 연구량 "+num(row.cost));
  else parts.push("자체 연구량이 명시되지 않은 이벤트/플래그형 항목");
  if(p.topicCount)parts.push("재귀 선행 "+num(p.topicCount)+"개·선행 연구량 "+num(p.prerequisiteCost)+"·명목 합계 "+num(total));
  if(p.sampleTopicCount)parts.push("선행망의 실물 표본 연구 "+num(p.sampleTopicCount)+"개");
  if(p.branchTopicCount)parts.push("선행망의 분기/배타 연구 "+num(p.branchTopicCount)+"개");
  if(rq.needItem)parts.push("이 연구 자체도 실물 표본 필요"+(rq.destroyItem?"·소모":"·비소모"));
  if(list(rq.requiresBaseFunc).length)parts.push("연구 기지 기능 "+names(rq.requiresBaseFunc,4));
  let out=parts.join(" / ")+". ";
  if((p.topicCount||0)>=100)out+="이 값은 dependencies+requires 재귀 합집합이므로 이벤트 직접 지급·getOneFree·선택 분기가 많은 후기 트리에서는 실제 최소 루트보다 크게 잡힐 수 있다.";
  else out+="이벤트 직접 지급·getOneFree 우회가 있으면 실제 최소 도달량은 이 명목값보다 작아질 수 있다.";
  return out;
}

function expanded(text,fallback){const t=String(text||"").trim();return t.length>=45?t:[t,fallback].filter(Boolean).join(" ")}
function editorialFor(row){
  const d=detailFor(row),i=insightFor(row);
  if(!d||!i)throw new Error("Missing research insight inputs "+row.id);
  const core=expanded(opening(row,d,i),"이 연구의 실제 가치는 이름보다 아래의 직접 연결과 후속 소비처를 함께 볼 때 더 정확히 판단할 수 있다.");
  const effect=expanded(concreteEffect(row,d,i),"직접 전투 효과가 없다면 후속 연구·이벤트·제조·시설을 여는 진행 플래그 자체가 이 연구의 실질적인 효과다.");
  const action=expanded(nextAction(row,d,i),"완료 후 자동으로 모든 보상이 적용된다고 가정하지 말고 새로 열린 메뉴·이벤트·후속 연구를 실제로 확인해야 한다.");
  const route=expanded(routeSummary(row,d,i),"명목 선행량은 재귀 합집합이므로 이벤트 지급·무료 획득·분기 우회가 있는 세이브에서는 실제 도달 비용과 달라질 수 있다.");
  const decision=expanded(strategic(row,d,i),"현재 세이브에서 바로 이어서 사용할 후속 보상이 없다면 같은 연구량의 직접 전력·경제 개선 연구와 우선순위를 비교할 필요가 있다.");
  const watchRaw=caution(row,d,i);
  const generic="이 해설은 현재 룰셋의 직접·역참조 관계를 바탕으로 한 판단이므로, 스크립트에 숨은 조건이 새로 발견되면 우선순위 해석은 달라질 수 있다.";
  const watch=expanded(watchRaw===generic?"":watchRaw,"직접 룰과 역참조만으로 보이지 않는 스크립트 예외가 있을 수 있으므로 아래 이벤트·원본 필드를 함께 확인하는 것이 안전하다.");
  return{core,effect,action,route,decision,watch};
}

const buckets={};
let totalChars=0;
for(const row of research){
  const editorial=editorialFor(row);
  totalChars+=Object.values(editorial).reduce((n,x)=>n+String(x||"").length,0);
  (buckets[row.bucket]||={})[row.id]=editorial;
}
const dir=outFile("research-editorial-chunks");
fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
for(const [bucket,details] of Object.entries(buckets))fs.writeFileSync(path.join(dir,bucket+".json"),JSON.stringify({details}));
const meta={
  version:2,
  generator:"GPT editorial synthesis v2",
  evidence:"ruleset-and-derived-links",
  generatedFrom:["research-index.json","research-chunks","research-insight-index.json","research-insight-chunks"],
  count:research.length,
  averageChars:Math.round(totalChars/Math.max(1,research.length))
};
fs.writeFileSync(outFile("research-editorial-meta.json"),JSON.stringify(meta,null,2));
console.log(JSON.stringify(meta));
