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
  return parts.slice(0,3).join(" ");
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

function editorialFor(row){
  const d=detailFor(row),i=insightFor(row);
  if(!d||!i)throw new Error("Missing research insight inputs "+row.id);
  const core=opening(row,d,i);
  const decision=strategic(row,d,i);
  const watch=caution(row,d,i);
  const generic="이 해설은 현재 룰셋의 직접·역참조 관계를 바탕으로 한 판단이므로, 스크립트에 숨은 조건이 새로 발견되면 우선순위 해석은 달라질 수 있다.";
  return{core,decision,watch:watch===generic?"":watch};
}

const buckets={};
let totalChars=0;
for(const row of research){
  const editorial=editorialFor(row);
  totalChars+=editorial.core.length+editorial.decision.length+editorial.watch.length;
  (buckets[row.bucket]||={})[row.id]=editorial;
}
const dir=outFile("research-editorial-chunks");
fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
for(const [bucket,details] of Object.entries(buckets))fs.writeFileSync(path.join(dir,bucket+".json"),JSON.stringify({details}));
const meta={
  version:1,
  generator:"GPT editorial synthesis v1",
  evidence:"ruleset-and-derived-links",
  generatedFrom:["research-index.json","research-chunks","research-insight-index.json","research-insight-chunks"],
  count:research.length,
  averageChars:Math.round(totalChars/Math.max(1,research.length))
};
fs.writeFileSync(outFile("research-editorial-meta.json"),JSON.stringify(meta,null,2));
console.log(JSON.stringify(meta));
