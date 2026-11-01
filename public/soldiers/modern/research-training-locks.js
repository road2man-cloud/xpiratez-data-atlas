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
const paired=(one,two,a,b)=>(one===a&&two===b)||(one===b&&two===a);
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
