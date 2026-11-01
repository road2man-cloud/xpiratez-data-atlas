// Permanent research locks between transformations. Evidence comes from
// reciprocal RuleResearch.disables in the installed X-Piratez 2.1 graph.
// Do not infer symmetric locks from directional forbidden previous training.
const locks=[
  {a:"STR_HERO_RED_TRAINING",b:"STR_HERO_GREEN_TRAINING",from:"STR_CODEX_RED",to:"STR_CODEX_GREEN"},
  {a:"STR_HERO_RED_TRAINING",b:"STR_HERO_GOLD_TRAINING",from:"STR_CODEX_RED",to:"STR_CODEX_GOLD"},
  {a:"STR_HERO_GREEN_TRAINING",b:"STR_HERO_GOLD_TRAINING",from:"STR_CODEX_GREEN",to:"STR_CODEX_GOLD"},
  {a:"STR_HERO_RED_TRAINING",b:"STR_GREEN_BEAUTY",from:"STR_CODEX_RED",to:"STR_CODEX_GREEN"},
  {a:"STR_HERO_GOLD_TRAINING",b:"STR_GREEN_BEAUTY",from:"STR_CODEX_GOLD",to:"STR_CODEX_GREEN"},
  {a:"STR_RED_KNIGHT",b:"STR_RED_FANATIC",from:"STR_RED_KNIGHT_PREQ",to:"STR_PEOPLES_ARMY_PREQ"}
];
const arr=x=>Array.isArray(x)?x:[];
// 83 transformations x direct requires are audited against the complete
// research disables graph, not just the named Codex/knight examples below.
const reenabledCache=new WeakMap();
function reenableTargets(rules){
  let set=reenabledCache.get(rules);
  if(set)return set;
  set=new Set(Object.values(rules).flatMap(rule=>arr(rule.reenables)));
  reenabledCache.set(rules,set);
  return set;
}
export function directResearchTransformLocks(history,candidate,data){
  const rules=data.researchRules||{};
  const all=new Map((data.transformations||[]).map(t=>[t.id,t]));
  const current=all.get(candidate);
  if(!current)return [];
  const prior=history instanceof Map||history instanceof Set?
    [...history.keys()]:arr(history);
  const revived=reenableTargets(rules);
  const blockers=new Set();
  for(const historic of prior){
    const prev=all.get(historic);
    if(!prev)continue;
    for(const a of arr(prev.requires)){
      for(const b of arr(current.requires)){
        if(a===b||revived.has(a)||revived.has(b))continue;
        if(arr(rules[a]?.disables).includes(b)&&
          arr(rules[b]?.disables).includes(a))
          blockers.add("서로 재획득할 수 없는 양방향 연구 배제: "+
            historic+" / "+candidate+" ("+a+" ↔ "+b+")");
      }
    }
  }
  return [...blockers];
}

export function permanentResearchTransformLocks(history,candidate,rules={}){
  const selected=history instanceof Map||history instanceof Set?
    new Set(history.keys()):new Set(arr(history));
  const blockers=[];
  for(const x of locks){
    if(![x.a,x.b].includes(candidate))continue;
    const other=candidate===x.a?x.b:x.a;
    if(!selected.has(other))continue;
    const lhs=rules[x.from],rhs=rules[x.to];
    if(!arr(lhs?.disables).includes(x.to)||
       !arr(rhs?.disables).includes(x.from))continue;
    blockers.push("영구 연구 분기 상호배제: "+other+
      " ↔ "+candidate+" ("+x.from+" ↔ "+x.to+")");
  }
  return blockers;
}
export function nominalResearchTransformRisks(history,candidate){
  const selected=history instanceof Map||history instanceof Set?
    new Set(history.keys()):new Set(arr(history));
  if((candidate==="STR_PURE_MAIDEN_TRAINING"&&
      selected.has("STR_REVOLUTIONARY_TRAINING"))||
     (candidate==="STR_REVOLUTIONARY_TRAINING"&&
      selected.has("STR_PURE_MAIDEN_TRAINING")))
    return ["순결한 처녀와 혁명가의 선행 연구 분기 충돌: 파티·의식·농민 혁명 선행과 이벤트 지급 우회 가능성은 별도 시간순 증명 필요"];
  return [];
}
export const RESEARCH_LOCK_CASES=locks.map(x=>({...x}));
