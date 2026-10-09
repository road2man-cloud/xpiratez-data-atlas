// Cross-system, source-grounded research context used by the editorial generator.
// A research topic may be a hub, a choice gate, and a manufacturing unlock at once.
// Do not infer "event reward on research completion" from a false event trigger.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const arr=x=>Array.isArray(x)?x:[];
const unique=xs=>[...new Set(xs.filter(Boolean))];
const limitNames=(ids,name,limit)=>ids.slice(0,limit).map(name).join("·")+
  (ids.length>limit?" 외 "+(ids.length-limit)+"개":"");
const categoryDefs=[
  ["branch-choice","분기·선택",["branch-choice"]],
  ["soldier-training","병사 훈련",["soldier-training"]],
  ["facility","기지·시설",["facility"]],
  ["recruitment","병종·고용",["recruitment"]],
  ["purchase","구매·상인",["purchase"]],
  ["mission","미션·이벤트",["mission","event-unlock","event-research-link"]],
  ["research-grant","연구·플래그 지급",["research-grant","research-unlock","event-grant"]],
  ["manufacture","제조·자원",["manufacture","item-gate"]],
  ["craft","기체",["craft"]],
  ["other","그 밖의 연구",[]]
];
const roleLabels={
  manufacture:"제조",purchase:"구매",facility:"시설",craft:"기체",
  recruitment:"고용", "soldier-training":"병사 훈련",
  "branch-choice":"상호배타 분기","event-unlock":"이벤트 해금",
  "event-grant":"이벤트 지급","event-research-link":"이벤트 게이트",
  "research-grant":"추가 연구 지급","research-unlock":"후속 연구",
  "research-granted-by":"다른 연구 보상","item-reward":"아이템 지급",
  "item-gate":"아이템 조건",mission:"임무"
};

export function makeResearchContextEngine({research,insightIndex,worldDir,ko,topic,detailFor}){
  const byId=new Map(research.map(x=>[x.id,x]));
  const byInsight=new Map(insightIndex.map(x=>[x.id,x]));
  const eventIndexPath=path.join(worldDir,"events-index.json.gz");
  if(!fs.existsSync(eventIndexPath))throw new Error("Missing event index for contextual research editorials: "+eventIndexPath);
  const eventRows=JSON.parse(zlib.gunzipSync(fs.readFileSync(eventIndexPath))).index||[];
  const eventIndex=new Map(eventRows.map(x=>[x.id,x]));
  const eventCache=new Map();
  function event(id){
    const x=eventIndex.get(id);if(!x)return null;
    if(!eventCache.has(x.bucket)){
      const file=path.join(worldDir,"event-chunks",x.bucket+".json.gz");
      eventCache.set(x.bucket,JSON.parse(zlib.gunzipSync(fs.readFileSync(file))).details);
    }
    return eventCache.get(x.bucket)[id]||null;
  }
  const manufactureIndexPath=path.join(worldDir,"manufacture-index.json");
  if(!fs.existsSync(manufactureIndexPath))throw new Error("Missing manufacturing index for contextual research editorials: "+manufactureIndexPath);
  const manufactureRows=JSON.parse(fs.readFileSync(manufactureIndexPath,"utf8")).index||[];
  const manufactureIndex=new Map(manufactureRows.map(x=>[x.id,x]));
  const manufactureCache=new Map();
  function manufacture(id){
    const x=manufactureIndex.get(id);if(!x)return null;
    if(!manufactureCache.has(x.bucket)){
      manufactureCache.set(x.bucket,JSON.parse(fs.readFileSync(path.join(worldDir,"manufacture-chunks",x.bucket+".json"),"utf8")).details);
    }
    return manufactureCache.get(x.bucket)[id]||null;
  }
  function productionFor(insight){
    const ids=unique(arr(insight.semanticReferences).filter(x=>x.kind==="manufacture").map(x=>x.id));
    const matches=ids.map(manufacture).filter(Boolean);
    if(!matches.length)return null;
    const first=matches[0];
    const label=ko(first.id);
    const inputs=arr(first.requiredItems).slice(0,4).map(x=>ko(x.id)+" ×"+x.qty).join("·");
    const outputs=arr(first.deterministicOutputs).slice(0,4).map(x=>ko(x.id)+" ×"+x.qty).join("·");
    const random=arr(first.randomOutputs).length;
    const time=Number(first.time||0),cash=Number(first.cost||0),econ=first.economics||{};
    const bits=["대표 제조식 "+label,inputs?"실물 투입 "+inputs:"별도 실물 재료 없음"];
    if(outputs)bits.push("확정 결과 "+outputs);
    if(random)bits.push("가중치 랜덤 산출 후보 "+random+"개");
    if(first.spawnedPersonTypeName)bits.push("생성 병종 "+first.spawnedPersonTypeName);
    if(first.craftOutput)bits.push("기체 "+ko(first.craftOutput.id));
    bits.push("제조비 "+cash.toLocaleString("ko-KR")+", 기술자-시간 "+time.toLocaleString("ko-KR"));
    if(arr(first.baseFuncDetails).length)bits.push("필요 기지 기능 "+arr(first.baseFuncDetails).map(x=>x.koName).join("·"));
    if(econ.economicComparable&&Number.isFinite(econ.opportunityNet)){
      const n=Math.round(econ.opportunityNet),sign=n>0?"+":"";
      bits.push("판매가·재료 기회비용 기준 제조 1회 순가치 "+sign+n.toLocaleString("ko-KR")+"(추정)");
    }
    const caveat=random?" 이는 반복 시행 기대값이지 1회 보장이 아니다.":" 이 수치는 전투·연구 가치까지 합한 것이 아니다.";
    const context="연구 후 실제 제조 결과: "+bits.join(" / ")+"."+caveat;
    const overview="제조식 "+label+"에 연결되고 "+(random?
      "재료 "+(inputs||"없음")+"을 투입해 "+random+"개 가중치 후보 중 결과를 얻는 무작위 제조를 가능하게 한다.":
      outputs?"제조를 통해 "+outputs+"를 실제 산출하는 경로다.":"별도 제조 단계가 남는다.");
    const action="연구 뒤 제조 메뉴의 "+label+"에서 "+(inputs?"실물 재료 "+inputs+" 및 ":"")+"제조 현금비 "+cash.toLocaleString("ko-KR")+"을 준비해 실제 생산해야 한다."+
      (random?" 확률·기대 환금성을 개별 결과 보장과 구분해야 한다.":"");
    const decision=econ.economicComparable&&Number.isFinite(econ.opportunityNet)?
      "제조 1회 판매가 기준 순가치는 "+(econ.opportunityNet>=0?"+":"")+Math.round(econ.opportunityNet).toLocaleString("ko-KR")+
      "으로 추정된다. 입력품의 재조달 비용과 전투·연구 병목 가치를 포함하지 않은 기회비용 추정치다."+
      (random?" 랜덤 결과가 있는 만큼 단발 손익과 평균은 다르다.":""):
      "이 제조식은 아이템 판매가만으로 전략 가치를 확정할 수 없다. 실제 산출물·희귀 재료 소모를 목표와 함께 평가해야 한다.";
    return{context,overview,action,decision,random,recipeCount:matches.length,representative:first.id};
  }
  function groupForId(id){
    const roles=arr(byInsight.get(id)?.insightKinds);
    return categoryDefs.find(([,key,types])=>types.some(t=>roles.includes(t)))?.[1]||"그 밖의 연구";
  }
  function nextOf(id){
    const row=byId.get(id);
    return row?arr(detailFor(row)?.requiredBy).filter(x=>byId.has(x)&&x!==id):[];
  }
  const descendantsCache=new Map();
  function connections(id){
    if(descendantsCache.has(id))return descendantsCache.get(id);
    const direct=unique(nextOf(id)),groups=[];
    for(const [,label] of categoryDefs){
      const xs=direct.filter(x=>groupForId(x)===label);
      if(xs.length)groups.push({label,ids:xs});
    }
    const second=new Set(direct);
    for(const child of direct)for(const n of nextOf(child))if(n!==id)second.add(n);
    const all={direct,groups,twoHopCount:second.size};
    descendantsCache.set(id,all);return all;
  }
  function getEventGates(row,insight){
    const out=[],seen=new Set();
    for(const ref of arr(insight.semanticReferences).filter(x=>x.section==="events")){
      for(const script of arr(ref.scripts).concat(ref.scriptGate?[ref.scriptGate]:[])){
        const triggers=script.researchTriggers||{},own=triggers[row.id];
        if(own!==true&&own!==false)continue;
        const key=ref.id+"|"+script.id+"|"+own;
        if(seen.has(key))continue;seen.add(key);
        const evt=event(ref.id);
        out.push({
          eventId:ref.id,eventName:ko(ref.id),scriptId:script.id,value:own,
          otherTrue:Object.entries(triggers).filter(([id,v])=>id!==row.id&&v===true).map(([id])=>id),
          otherFalse:Object.entries(triggers).filter(([id,v])=>id!==row.id&&v===false).map(([id])=>id),
          firstMonth:script.conditions?.firstMonth??null,
          lastMonth:script.conditions?.lastMonth??null,
          executionOdds:script.conditions?.executionOdds??null,
          rewardsResearch:arr(evt?.effects?.researchRewards).map(x=>x.id),
          rewardsItems:arr(evt?.effects?.guaranteedItems).map(x=>({id:x.id,qty:x.qty})),
          points:evt?.effects?.points||0,
          funds:evt?.effects?.funds||0,
          interrupts:evt?.effects?.interruptResearch||null,
          oneTimeRandom:evt?.scripts?.some(s=>arr(s.oneTimeRandomEvents?.entries).some(e=>e.eventId===ref.id))||false
        });
      }
    }
    return out;
  }
  function consequentialGate(g,topicId){
    return g.value===false&&(
      g.interrupts===topicId||g.rewardsResearch.some(x=>x!==topicId)||
      g.rewardsItems.length>0||g.points!==0||g.funds!==0);
  }
  function gateTiming(g){
    if(g.firstMonth!=null&&g.lastMonth!=null&&g.firstMonth===g.lastMonth)return "게임 월 "+g.firstMonth;
    if(g.firstMonth!=null&&g.lastMonth!=null)return "게임 월 "+g.firstMonth+"~"+g.lastMonth;
    if(g.lastMonth!=null)return "게임 월 "+g.lastMonth+"까지";
    if(g.firstMonth!=null)return "게임 월 "+g.firstMonth+"부터";
    return "월 제한이 확인되지 않은";
  }
  function rewardSummary(g){
    const bits=[];
    if(g.rewardsResearch.length)bits.push("연구/플래그 "+limitNames(g.rewardsResearch,ko,3));
    if(g.rewardsItems.length)bits.push("확정 아이템 "+g.rewardsItems.slice(0,3).map(x=>ko(x.id)+" ×"+x.qty).join("·"));
    if(g.funds)bits.push("자금 "+(g.funds>0?"+":"")+g.funds.toLocaleString("ko-KR"));
    if(g.points)bits.push("점수 "+(g.points>0?"+":"")+g.points.toLocaleString("ko-KR"));
    return bits.join(", ");
  }
  function categoryText(graph,perGroup=3,maxGroups=7){
    return graph.groups.slice(0,maxGroups).map(g=>g.label+"("+limitNames(g.ids,ko,perGroup)+")").join(" / ")+
      (graph.groups.length>maxGroups?" / 기타 "+(graph.groups.length-maxGroups)+"개 범주":"");
  }
  function analyze(row,detail,insight){
    const graph=connections(row.id),gates=getEventGates(row,insight),production=productionFor(insight);
    const bad=gates.filter(g=>consequentialGate(g,row.id));
    const noHas=gates.filter(g=>g.value===false);
    const has=gates.filter(g=>g.value===true);
    const roles=arr(insight.roles).filter(x=>x!=="ufopaedia"&&x!=="other");
    const manyRoles=roles.length>=2;
    const hub=graph.direct.length>=5;
    const complex=hub||manyRoles||bad.length>0;
    const units=graph.direct.length;
    const consequences=bad.slice(0,2).map(g=>{
      const others=g.otherTrue.length?"다른 필수 연구 "+limitNames(g.otherTrue,ko,3)+" 보유와 함께 ":"";
      const extra=g.otherFalse.length?"·"+limitNames(g.otherFalse,ko,2)+" 미보유 등":"";
      const reward=rewardSummary(g);
      const stop=g.interrupts===row.id?" 발생하면 이 연구를 중단하는 interruptResearch 규칙도 있다.":"";
      return gateTiming(g)+" "+g.eventName+"은 "+others+ko(row.id)+" 미보유"+extra+"를 요구한다."+
        (reward?" 그 이벤트의 직접 결과는 "+reward+"이다.":"")+
        " 지금 이 연구를 완료하면 그 스크립트의 미보유 조건은 성립하지 않는다."+
        stop;
    });
    const info={
      directCount:units,twoHopCount:graph.twoHopCount,groups:graph.groups.map(x=>({label:x.label,count:x.ids.length,ids:x.ids})),
      multiRole:manyRoles,hub,hasNegativeGate:bad.length>0,
      negativeGateCount:noHas.length,positiveGateCount:has.length,
      consequentialEvents:bad.map(x=>x.eventId)
    };
    const parts=[];
    if(units){
      parts.push("직접 후속 연구 "+units+"개"+(units>=5?"(2단계까지 구조상 "+graph.twoHopCount+"개)":"")+"가 이 연구를 선행으로 참조한다.");
      parts.push("후속 갈래: "+categoryText(graph,units<=20?9:3)+".");
      parts.push("이는 경로상 선행 관계다. 후속 연구마다 다른 필요 연구·선택지·실물·시설 조건이 남아 있어 한꺼번에 즉시 열리는 것은 아니다.");
    }else{
      const refs=arr(insight.semanticReferences).filter(x=>x.kind!=="ufopaedia");
      const kindCount=new Map();for(const x of refs)kindCount.set(x.kind,(kindCount.get(x.kind)||0)+1);
      const types=[...kindCount].map(([k,n])=>(roleLabels[k]||k)+" "+n+"곳");
      const outcomes=[];
      if(arr(insight.spawnedItems).length)outcomes.push("직접 생성 아이템 "+limitNames(insight.spawnedItems,ko,3));
      if(arr(insight.explicitUnlocks).length)outcomes.push("명시 해금 연구 "+limitNames(insight.explicitUnlocks,ko,3));
      if(arr(insight.freeResearch).length)outcomes.push("getOneFree 지급 연구 "+limitNames(insight.freeResearch,ko,3));
      if(arr(insight.transformations).length)outcomes.push("실제 병사 훈련/변신 "+limitNames(insight.transformations.map(x=>x.id),ko,3));
      parts.push("다른 연구의 직접 선행 목록에는 나타나지 않지만"+
        (outcomes.length?", 이 연구의 원본 결과는 "+outcomes.join(" / ")+"이다.":" 직접 효과는 별도 연구·제조·이벤트 역참조를 기준으로 판단해야 한다."));
      if(types.length)parts.push("확인된 연결 시스템: "+types.slice(0,5).join("·")+". 완료 플래그와 최종 보상 획득은 다른 단계일 수 있다.");
    }
    if(production)parts.push(production.context+(production.recipeCount>1?" 나머지 제조 연결 "+(production.recipeCount-1)+"개는 별도 제조식에서 비교해야 한다.":""));
    if(units&&arr(insight.freeResearch).length)parts.push("완료에 따른 별도 getOneFree 지급 연구는 "+limitNames(insight.freeResearch,ko,3)+"이다. 이는 아이템 즉시 지급과 다르다.");
    if(consequences.length)parts.push("연구 보유 여부에 따라 달라지는 별도 이벤트: "+consequences.join(" "));
    else if(has.length)parts.push("보유 조건으로 연결되는 이벤트: "+has.slice(0,3).map(g=>g.eventName+"("+gateTiming(g)+")").join("·")+". 연구 보유 외의 별도 조건을 충족해야 후보가 된다.");
    const context=parts.join("\n");
    let core=null,action=null,watch=null;
    if(hub){
      core=topic(ko(row.id))+" "+units+"개 후속 연구가 직접 요구하는 캠페인 진행 허브다. "+
        "주요 갈래는 "+categoryText(graph,2,4)+"이며"+
        (arr(insight.semanticReferences).some(x=>x.kind==="manufacture")?" 직접 연결된 제조식은 전체 역할 중 일부다.":" 단일 해금품만으로 가치를 판단하면 안 된다.");
      action="연구 전후에 "+categoryText(graph,2,4)+" 중 실제 목표를 먼저 정하고 각 후속의 남은 다른 선행 조건을 확인해야 한다. "+
        "한 번의 연구로 모든 갈래가 자동 해금되는 것은 아니다.";
    }else if(units>=2&&insight.primaryRole==="ufopaedia"){
      core=topic(ko(row.id))+" 단순 UFOPEDIA 정보 해금으로 끝나지 않고 "+units+"개 후속 연구의 선행 관문이다. "+categoryText(graph,2,3)+"의 다른 조건과 함께 살펴야 한다.";
    }else if(manyRoles){
      core=topic(ko(row.id))+" "+roles.map(x=>roleLabels[x]||x).slice(0,4).join("·")+
        "에 동시에 연결된 복합 관문이다. 첫 제조식이나 단일 항목만으로 연구의 실제 역할을 대표시키면 안 된다.";
    }
    if(!hub&&production&&insight.primaryRole==="manufacture")action=production.action;
    if(bad.length){
      const g=bad[0];
      const helpful=bad.some(x=>x.rewardsResearch.some(id=>id!==row.id)||x.rewardsItems.some(y=>y.qty>0)||x.funds>0||x.points>0);
      action="연구를 완료하기 전에 "+((g.firstMonth!=null||g.lastMonth!=null)?gateTiming(g)+"의 ":gateTiming(g)+" ")+g.eventName+" 조건부터 판단해야 한다. "+
        (helpful?"미연구 상태에서만 가능한 긍정적 이벤트 보상과 후속 연구의 조기 진입 중 무엇이 필요한지 비교한다. ":"이 이벤트는 점수·자금 손실 또는 연구 중단처럼 불리할 수 있다. 연구를 먼저 끝내면 해당 미보유 경로가 막히는지 확인한다. ")+
        (action||"연구 뒤에는 연결 후속을 실제로 진행해야 한다.");
      watch=bad.slice(0,2).map(g=>gateTiming(g)+" "+g.eventName+"은 "+ko(row.id)+" 미보유(false)를 요구하며, 먼저 연구를 완료하면 해당 경로가 닫힌다."+(g.interrupts===row.id?" 발생 시 이 연구를 중단하는 규칙도 있다.":"")).join(" ")+" executionOdds는 스크립트 실행 확률 값이지 전체 이벤트 최종 발생 보장률이 아니다.";
    }else if(noHas.length){
      watch=gateTiming(noHas[0])+" "+noHas[0].eventName+"에는 "+ko(row.id)+" 미보유(false) 조건이 있다. "+
        "지급 이벤트의 중복 실행 방지 조건일 수도 있으므로 별도의 즉시 연구 보상으로 해석하면 안 된다.";
    }
    return{info,core,context,action,watch,badGates:bad,production};
  }
  return{analyze};
}
