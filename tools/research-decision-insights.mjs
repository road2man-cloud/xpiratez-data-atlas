// Human-facing research decisions: causal gates, alternatives, and real net economic value.
// Keep the raw research graph unchanged. This layer explains how the graph is traversed.
const arr=x=>Array.isArray(x)?x:[];
const uniq=xs=>[...new Set(arr(xs).filter(x=>typeof x==="string"&&x))];
const n=x=>Number(x).toLocaleString("ko-KR");
const money=x=>"$"+n(x);
const preview=(ids,ko,limit=7)=>uniq(ids).slice(0,limit).map(ko).join("·")+
  (uniq(ids).length>limit?" 외 "+(uniq(ids).length-limit)+"개":"");

export function buildResearchDecisionInsight({
  row,detail,insight,analysis,detailOfId,unlockSources,ko
}){
  const direct=uniq(detail?.raw?.dependencies||detail?.dependencies);
  const requires=uniq(detail?.raw?.requires);
  const alternatives=uniq(unlockSources.get(row.id)||[]);
  const sampleRequired=Boolean(detail?.raw?.needItem);
  const sampleConsumed=sampleRequired&&Boolean(detail?.raw?.destroyItem);
  const pay=analysis?.production?.cashExtraction||null;
  const parts=[];
  if(direct.length){
    parts.push(direct.length<=6?
      "일반 경로 AND: "+preview(direct,ko,6)+" 모두 완료.":
      "일반 경로 AND: 직접 선행 "+direct.length+"개 모두 충족(아래 원본 목록 참조).");
  }
  if(alternatives.length){
    parts.push("대체 경로 OR: "+preview(alternatives,ko,4)+" 중 하나의 unlocks로 dependencies 우회(출처 자체의 조건은 별도).");
  }
  if(requires.length){
    parts.push("우회 불가 requires AND: "+preview(requires,ko,4)+" 모두 완료.");
  }
  const prerequisiteSamples=direct.filter(id=>{
    const research=detailOfId(id);
    return research&&research.needItem;
  });
  if(prerequisiteSamples.length){
    const consumed=prerequisiteSamples.filter(id=>detailOfId(id)?.destroyItem);
    parts.push("선행 연구 표본: "+preview(prerequisiteSamples,ko,4)+" 실물 필요."+
      (consumed.length?" 소모: "+preview(consumed,ko,4)+".":""));
  }
  // Explain synthetic gates that appear impossible when all their dependencies
  // are treated as mandatory, but have OR unlocks sources instead.
  const synthetic=direct.flatMap(id=>{
    const gate=detailOfId(id);
    const sources=uniq(unlockSources.get(id)||[]);
    if(!gate||Number.isFinite(gate.cost)||!sources.length)return [];
    return [{id,sources}];
  });
  for(const {id,sources} of synthetic.slice(0,3)){
    parts.push(ko(id)+"는 중간 플래그: "+preview(sources,ko,6)+
      " 중 한 경로로 충족(OR). 전부 완료할 필요는 없습니다.");
  }
  if(sampleRequired){
    parts.push("현재 연구 표본: "+ko(row.id)+" ×1 "+(sampleConsumed?"필요·소모.":"필요·비소모."));
  }else if(row.id==="STR_WINE"){
    parts.push("와인 실물은 이 연구의 필요조건이 아닙니다. 보유만으로 연구 불가.");
  }
  const baseFuncs=uniq(detail?.raw?.requiresBaseFunc);
  if(baseFuncs.length)parts.push("연구 기지 기능: "+preview(baseFuncs,ko,4)+".");
  // Default AND dependency listings are shown as links by the frontend.
  // Store text only for non-trivial gates and specimen exceptions to keep
  // 4,612 editorial sidecars compact and mobile-friendly.
  const hasExceptionalGate=alternatives.length>0||requires.length>0||
    synthetic.length>0||sampleRequired||prerequisiteSamples.length>0||
    baseFuncs.length>0||row.id==="STR_WINE";
  const unlockLogic=hasExceptionalGate?parts.join(" "):"";
  // Every downstream edge in requiredBy is a dependency edge, not a proof of
  // sufficient unlock or a guarantee that no alternate route exists.
  const downstream=uniq(detail?.requiredBy);
  const grants=uniq(detail?.unlocks);
  const next=[];
  if(downstream.length){
    next.push("후속 "+downstream.length+"개의 일반 선행"+
      (downstream.length<=3?": "+preview(downstream,ko,3):"")+"입니다. 이 연구만으로 충분조건이 아니며, 다른 선행과 requires도 필요합니다. 후속의 별도 unlocks 우회로가 있으면 필수 경유도 아닙니다.");
  }
  if(grants.length){
    next.push("명시 해금 unlocks: "+preview(grants,ko,3)+
      ". dependencies 우회 가능, requires·표본·기지 조건은 별도.");
  }
  // Every ordinary downstream relation is explained consistently at render time.
  // Only explicit unlocks and the representative OR-gate case need a
  // research-specific long-form downstream explanation in the sidecar.
  const downstreamLogic=grants.length||row.id==="STR_WINE"?next.join(" "):"";
  let verdict="",economics="",criticalCaution="";
  if(pay){
    const input=money(pay.inputSell),output=money(pay.outputSell),delta=pay.margin;
    verdict=ko(row.id)+" "+pay.inputsPerOpen+"개를 즉시 팔면 "+input+", 개봉 후 크레딧 칩을 팔면 "+
      output+"입니다. 제조 1회당 "+
      (delta>=0?"순매각 차익 +"+money(delta)+"가 생깁니다.":"매각가치가 "+money(Math.abs(delta))+" 감소합니다.");
    const details=["개봉당 투입 "+ko(row.id)+" ×"+pay.inputsPerOpen,"제조 현금비 "+money(pay.manufactureCashCost),
      "기술자 작업량 "+n(pay.time)];
    if(pay.specimenConsumed&&delta>0&&pay.additionalOpens!==null){
      details.push("연구에 소모한 표본 1개("+input+")을 회수하고도 순이익이 나려면 연구 후 "+
        n(pay.additionalOpens)+"개 이상 추가 개봉, 처음부터 총 "+
        n(pay.totalBags)+"개가 필요");
      details.push("회수까지 추가 제조 작업량 "+n(pay.engineerHoursToRecover));
    }else if(pay.specimenConsumed&&delta<=0){
      details.push("연구 표본 1개도 소모되므로 매각차익만으로는 그 손실을 회수할 수 없음");
    }else if(!pay.specimenConsumed&&delta>0){
      details.push("연구에서 표본 소모가 확인되지 않아 별도의 표본 회수 횟수 없음");
    }
    economics=details.join(" / ")+". 손익은 모든 칩을 표시 판매가로 매각한다고 가정하며, "+
      "연구력·기술자 생산기회비용 및 재조달 비용은 미반영합니다. "+
      "이미 연구가 완료됐다면 과거 연구 표본 소모는 현재 개봉의 한계비용이 아닙니다.";
  }else if(analysis?.production){
    // Do not give a numerical break-even point for randomized/incompletely
    // valued outputs, or for a recipe that is only indirectly related to a research.
    const p=analysis.production;
    if(p.random) economics="이 연구와 연결된 제조에는 랜덤 산출물이 있습니다. 표시된 결과는 기대값일 수 있으므로 매회 같은 판매액이 나온다고 가정하면 안 됩니다.";
  }
  if(!verdict){
    const roles=arr(insight?.roles);
    if(row.id==="STR_WINE"){
      verdict="와인 아이템을 갖고 있어도 바로 연구할 수 없습니다. 사과·보드카·불길 위를 걷다·생존 연구와 파티 관련 해금 경로 하나를 먼저 충족하세요.";
    }else if(roles.includes("soldier-training")){
      verdict="연구를 완료해도 병사의 능력치가 즉시 증가하지 않습니다. 해금된 병사 훈련을 실제 실행해야 합니다.";
    }else if(roles.includes("branch-choice")||arr(insight?.disables).length){
      verdict="이 연구는 배타적인 경로에 영향을 줄 수 있습니다. 먼저 포기되는 분기의 최종 보상을 비교하세요.";
    }else if(arr(insight?.spawnedItems).length){
      verdict="완료 시 "+preview(insight.spawnedItems,ko,4)+"를 직접 지급합니다. 다른 제조·연구는 별도입니다.";
    }else if(analysis?.production){
      verdict="연구는 제조를 가능하게 하는 단계입니다. 실제 결과물은 별도 재료·기술자·제조비를 투입한 뒤에 얻습니다.";
    }else if(downstream.length){
      verdict=ko(row.id)+"는 "+downstream.length+"개 후속 연구의 일반 선행조건 중 하나입니다. 이 연구만 완료한다고 후속이 모두 열리지는 않습니다.";
    }else{
      verdict="이 연구의 즉시 전력·경제 보상은 확정되지 않았습니다. 현재 목표에 필요한 연결이 있는지 확인한 뒤 우선순위를 정하세요.";
    }
  }
  if(arr(insight?.disables).length){
    criticalCaution="완료하면 양립할 수 없는 선택: "+preview(insight.disables,ko,5)+". 연구 전에 상호배제와 우회 경로를 확인하세요.";
  }else if(analysis?.badGates?.length){
    criticalCaution="이 연구를 갖지 않아야 성립하는 이벤트 조건이 존재합니다. 완료 전 해당 이벤트의 시기와 보상을 확인하세요.";
  }else if(sampleConsumed&&!pay){
    criticalCaution="표본 1개가 연구에 소모됩니다. 이 아이템이 희귀하거나 환금성이라면 대체 무료 지급 경로와 비교하세요.";
  }
  return {verdict,unlockLogic,downstreamLogic,economics,criticalCaution};
}

// Invariants deliberately exposed to regression tests.
export function minimumOpensToProfit(specimenSell,netPerOpen){
  if(!Number.isFinite(specimenSell)||specimenSell<0||!Number.isFinite(netPerOpen)||netPerOpen<=0)return null;
  return Math.floor(specimenSell/netPerOpen)+1;
}
