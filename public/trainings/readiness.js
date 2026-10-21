// Optional, local-only observations for a real campaign and one soldier.
// Unknown observations are NEVER interpreted as zero stock, missing medals,
// absent base functions, or a permanent research exclusion.
const ids=x=>Array.isArray(x)?x:[];
const has=(map,key)=>map instanceof Map?map.has(key):Object.prototype.hasOwnProperty.call(map||{},key);
const get=(map,key)=>map instanceof Map?map.get(key):map?.[key];
const value=(map,key)=>{if(!has(map,key))return null;const current=get(map,key);return current==null||current===""||!Number.isFinite(Number(current))?null:Number(current);};

export function parseQuantifiedEvidence(source){
  const result=new Map();
  const text=String(source||"").trim();
  if(!text)return result;
  for(const term of text.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean)){
    const match=term.match(/^([A-Za-z0-9_][A-Za-z0-9_.:-]*)\s*(?:=|:)\s*(\d+)$/);
    if(!match)throw new Error("입력 형식: ID=보유수량 (예: STR_GLAMOUR=6). 오류: "+term.slice(0,55));
    const [,id,raw]=match,qty=Number(raw);
    if(!Number.isSafeInteger(qty))throw new Error("너무 큰 수량: "+id);
    if(result.has(id))throw new Error("동일 ID를 중복 입력했습니다: "+id);
    result.set(id,qty);
  }
  return result;
}

export function assessTrainingReadiness(t,proof={}){
  const result=[];
  const put=(kind,id,needed,observed,status,label)=>result.push({kind,id,needed,observed,status,label});
  const research=proof.research||null;
  const roots=[...new Set(ids(t.researchRoots))];
  for(const id of roots){
    const completed=research?.completed?.has(id)===true;
    const disabled=research?.disabled?.has(id)===true;
    const status=!research?"unknown":completed&&disabled?"conflict":disabled?"blocked":completed?"met":"missing";
    put("research",id,1,completed?1:disabled?0:null,status,id);
  }
  const baseFuncs=proof.baseFuncs||null;
  for(const id of ids(t.requiresBaseFunc)){
    const seen=value(baseFuncs,id);
    put("facility",id,1,seen,seen==null?"unknown":seen>=1?"met":"missing",id);
  }
  const items=proof.items||null;
  for(const req of ids(t.requiredItems)){
    const seen=value(items,req.id),needed=Number(req.amount)||0;
    put("item",req.id,needed,seen,seen==null?"unknown":seen>=needed?"met":"missing",req.koName||req.id);
  }
  const medals=proof.medals||null;
  for(const req of ids(t.requiredCommendations)){
    const seen=value(medals,req.id),needed=Number(req.amount)||0;
    // A listed 0 is explicitly an acquired level-0 commendation; absence is unknown.
    put("medal",req.id,needed,seen,seen==null?"unknown":seen>=needed?"met":"missing",req.koName||req.id);
  }
  const unitKnown=proof.unitValid!==false;
  if(t.minRank!=null){
    const actual=unitKnown&&Number.isInteger(proof.rank)&&proof.rank>=0?proof.rank:null;
    const needed=Number(t.minRank);
    put("rank","rank",needed,actual,actual==null?"unknown":actual>=needed?"met":"missing","계급");
  }
  for(const [key,needed] of Object.entries(t.requiredMinStats||{})){
    if(!Number.isFinite(Number(needed))||Number(needed)<=0)continue;
    const actual=unitKnown?value(proof.stats,key):null;
    put("stat-min",key,Number(needed),actual,actual==null?"unknown":actual>=Number(needed)?"met":"missing",key);
  }
  for(const [key,needed] of Object.entries(t.requiredMaxStats||{})){
    if(!Number.isFinite(Number(needed))||Number(needed)>=9999)continue;
    const actual=unitKnown?value(proof.stats,key):null;
    put("stat-max",key,Number(needed),actual,actual==null?"unknown":actual<=Number(needed)?"met":"missing",key);
  }
  if(proof.condition==="dead"&&(t.needsCorpseRecovered===true||t.rawRule?.needsCorpseRecovered===true)){
    const observed=proof.corpseRecovered==null?null:proof.corpseRecovered?1:0;
    put("corpse","corpse",1,observed,observed==null?"unknown":observed?"met":"missing","시체 회수");
  }
  const researchRows=result.filter(x=>x.kind==="research");
  const blocked=result.filter(x=>x.status==="blocked");
  const conflicts=result.filter(x=>x.status==="conflict");
  const missing=result.filter(x=>x.status==="missing");
  const unknown=result.filter(x=>x.status==="unknown");
  const met=result.filter(x=>x.status==="met");
  const researchKind=!research?"not-loaded":!researchRows.length?"no-research":
    conflicts.some(x=>x.kind==="research")?"conflict":
    blocked.length?"blocked":researchRows.some(x=>x.status==="missing")?"missing":"met";
  return {all:result,researchRows,blocked,conflicts,missing,unknown,met,researchKind,
    directMissing:missing.filter(x=>x.kind!=="research"),
    directUnknown:unknown.filter(x=>x.kind!=="research")};
}
