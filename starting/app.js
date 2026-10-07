const DATA_URL="../data/starting-bonuses.json";
const NAMES_URL="../items/data/entities.json";
const SOLDIERS_URL="../data/soldiers-index.json";
const PROGRESSION_URL="../data/progression.json";
const ALIAS={
  STR_ARCTIC:"북극",STR_ANTARCTICA:"남극",STR_SIBERIA:"시베리아",STR_NORTH_ATLANTIC:"북대서양",
  STR_EUROPE:"유럽",STR_NORTH_AMERICA:"북아메리카",STR_SOUTH_AMERICA:"남아메리카",
  STR_NORTH_AFRICA:"북아프리카",STR_SOUTHERN_AFRICA:"남부 아프리카",STR_CENTRAL_ASIA:"중앙아시아",
  STR_SOUTH_EAST_ASIA:"동남아시아",STR_AUSTRALASIA:"오세아니아",STR_PACIFIC:"태평양",
  STR_USA:"미국",STR_RUSSIA:"러시아",STR_UK:"영국",STR_FRANCE:"프랑스",STR_GERMANY:"독일",
  STR_ITALY:"이탈리아",STR_SPAIN:"스페인",STR_CHINA:"중국",STR_JAPAN:"일본",STR_AUSTRALIA:"호주",
  STR_NIGERIA:"나이지리아",STR_INDIA:"인도",STR_SOUTH_AFRICA:"남아프리카",STR_EGYPT:"이집트",
  STR_CANADA:"캐나다",STR_NCR:"NCR",STR_BRAZIL:"브라질",STR_LATIN_EMPIRE:"라틴 제국",
  STR_TECHNOCRACY:"테크노크라시",STR_INDONESIA:"인도네시아",STR_TURAN:"투란",STR_CHILE:"칠레",
  STR_VENEZUELA:"베네수엘라"
};
const PERSON_REWARD_ITEMS=new Set(["STR_THEBAN_ASSAULT_CLONE_LICENSE","CIVILIAN_YOUNG_UBER","STR_TURANIAN_UBER","STR_REVOLUTIONARY_GIRL","STR_SLAVE","STR_HERO","STR_CATGIRL_VICTIM"]);
const STAT_ORDER=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];
const STAT_LABEL={tu:"TU",stamina:"기력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"Psi 강도",psiSkill:"Psi 기술",melee:"근접",mana:"Mana"};
let DATA=null,NAMES={},SOLDIER_DATA=null,PROGRESSION=null,PROFILE_BY_EVENT=new Map(),UNIT_PROFILES_BY_ITEM=new Map();

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const fmt=n=>new Intl.NumberFormat("ko-KR").format(Number(n)||0);
const signed=n=>{n=Number(n)||0;return n>0?"+"+fmt(n):fmt(n)};
function rawName(id){
  const x=NAMES[id];
  return Array.isArray(x)?(x[0]||x[1]||id):id;
}
function human(id){
  if(!id)return "—";
  const translated=rawName(id);
  const alias=ALIAS[id];
  if(alias&&translated&&translated!==id&&translated!==alias)return alias+" · "+translated;
  return alias||translated||id;
}
function group(list,kind){
  const m=new Map();
  list.forEach((e,index)=>{
    const key=e.triggerIds?.length?e.triggerIds.join("|"):"__NONE__";
    if(!m.has(key))m.set(key,{key,kind,index,events:[],excluded:e.excludedTriggerIds||[]});
    m.get(key).events.push(e);
  });
  return [...m.values()].map(g=>{
    const itemMap=new Map(),research=new Set(),spawns=[];
    let points=0,funds=0;
    for(const e of g.events){
      points+=Number(e.points)||0;funds+=Number(e.funds)||0;
      for(const x of e.items||[])itemMap.set(x.id,(itemMap.get(x.id)||0)+(Number(x.qty)||0));
      for(const id of e.research||[])research.add(id);
      if(e.spawnedPersonType&&e.spawnedPersons)spawns.push({
        eventId:e.eventId,type:e.spawnedPersonType,count:e.spawnedPersons,soldier:e.spawnedSoldier||{}
      });
    }
    return{...g,points,funds,items:[...itemMap].map(([id,qty])=>({id,qty})),research:[...research],spawns};
  });
}
function titleOf(g){
  if(g.key==="__NONE__")return "기타 / 지정 국가 외";
  return human(g.key.split("|")[0]);
}
function internalIdOf(g){return g.key==="__NONE__"?"NO_LISTED_COUNTRY":g.key}
function searchable(g){
  const ids=[g.key,...g.excluded,...g.events.flatMap(e=>[e.eventId,e.descriptionId]),...g.items.map(x=>x.id),...g.research,...g.spawns.flatMap(s=>[
    s.type,s.soldier?.armor,...Object.keys(s.soldier?.transformationBonuses||{}),
    ...Object.keys(s.soldier?.previousTransformations||{})
  ])].filter(Boolean);
  return [titleOf(g),...ids,...ids.map(human)].join(" ").toLowerCase();
}
function rewardChip(x){
  return '<span class="chip" title="'+esc(x.id)+'"><b>'+esc(human(x.id))+'</b><em>×'+fmt(x.qty)+'</em></span>';
}
function researchChip(id){
  return '<span class="chip" title="'+esc(id)+'"><b>'+esc(human(id))+'</b></span>';
}
function soldierText(s){
  const p=s.soldier||{},bits=[];
  if(p.rank!=null)bits.push("rank "+p.rank);
  if(p.armor)bits.push("방어구 "+human(p.armor));
  const traits=Object.keys(p.transformationBonuses||{});
  if(traits.length)bits.push("특성 "+traits.map(human).join(", "));
  const prev=Object.keys(p.previousTransformations||{});
  if(prev.length)bits.push("이전 변환 "+prev.map(human).join(", "));
  const stats=Object.entries(p.currentStats||{}).map(([k,v])=>(STAT_LABEL[k]||k)+" "+v);
  if(stats.length)bits.push("고정 능력 "+stats.join(" · "));
  return bits.join(" · ");
}
function eventRow(e){
  const timer=e.timer==null?"—":fmt(e.timer)+(e.timerRandom?" + random "+fmt(e.timerRandom):"");
  return '<div class="event-row"><b>'+esc(e.eventId)+'</b><small>발동 100% · Month 0 · timer '+esc(timer)+' · points '+signed(e.points)+' · funds '+signed(e.funds)+'</small></div>';
}
function sameRange(stats,key){
  const a=stats?.min?.[key],b=stats?.avg?.[key],c=stats?.max?.[key];
  return a===b&&b===c;
}
function statText(profile,key){
  const s=profile.effectiveStats||profile.initialStats||{};
  if(sameRange(s,key))return fmt(s.min?.[key]);
  return fmt(s.min?.[key])+" / "+fmt(s.avg?.[key])+" / "+fmt(s.max?.[key]);
}
function unitProfileCard(profile,meta={}){
  if(!profile)return "";
  const traits=(profile.traits||[]).map(t=>human(t.id||t)).join(", ");
  const caps=profile.effectiveStatCaps||profile.rawStatCaps||{};
  const fixed=STAT_ORDER.every(k=>sameRange(profile.effectiveStats||profile.initialStats,k));
  const statCells=STAT_ORDER.map(k=>
    '<div class="unit-stat"><span>'+esc(STAT_LABEL[k]||k)+'</span><b>'+esc(statText(profile,k))+'</b>'+
    (caps[k]!=null?'<small>성장캡 '+fmt(caps[k])+'</small>':"")+'</div>'
  ).join("");
  const sourceBits=[];
  if(meta.rewardQty)sourceBits.push(meta.recipe?"스타팅 재료 "+fmt(meta.rewardQty)+"개":"지급 "+fmt(meta.rewardQty)+"명");
  if(profile.cost!=null)sourceBits.push("생성비 "+fmt(profile.cost));
  if(profile.time!=null)sourceBits.push("작업량 "+fmt(profile.time));
  if(profile.rank!=null)sourceBits.push("rank "+fmt(profile.rank));
  let recipeInfo="";
  if(meta.recipe&&meta.rewardItemId){
    const own=(meta.recipe.requiredItems||[]).find(x=>x.id===meta.rewardItemId);
    const extras=(meta.recipe.requiredItems||[]).filter(x=>x.id!==meta.rewardItemId);
    const uses=Math.max(1,Number(own?.qty)||1);
    const maxRuns=Math.floor((Number(meta.rewardQty)||0)/uses);
    recipeInfo='<div class="unit-recipe"><b>전환 조건</b> '+esc(human(meta.rewardItemId))+' ×'+fmt(uses)+' / 1회'+
      (maxRuns?' · 스타팅 물량 기준 최대 '+fmt(maxRuns)+'회':"")+
      (extras.length?'<br><span>추가 재료: '+extras.map(x=>esc(human(x.id))+' ×'+fmt(x.qty)).join(" · ")+'</span>':"")+
      ((meta.recipe.requiresBaseFunc||[]).length?'<br><span>시설: '+meta.recipe.requiresBaseFunc.map(human).map(esc).join(", ")+'</span>':"")+'</div>';
  }
  const displayName=profile.sourceType==="event"?(profile.soldierKoName||profile.soldierType):(profile.sourceKoName||profile.soldierKoName||profile.sourceId);
  return '<div class="unit-profile">'+
    '<div class="unit-profile-head"><div><strong>'+esc(displayName)+'</strong>'+
    '<span class="id">'+esc(profile.sourceId||profile.id)+'</span></div>'+
    '<span class="unit-mode">'+esc(meta.mode||"지급 유닛")+'</span></div>'+
    '<p class="unit-summary">'+esc(profile.soldierKoName||profile.soldierType)+
    (profile.armor?' · 방어구 '+human(profile.armor):"")+
    (sourceBits.length?' · '+sourceBits.join(" · "):"")+'</p>'+
    '<div class="unit-stat-legend">'+(fixed?"고정 실전 능력치":"실전 능력치 최소 / 평균 / 최대")+' · 자동 특성 적용 후</div>'+
    '<div class="unit-stats">'+statCells+'</div>'+
    (traits?'<div class="unit-traits"><b>자동 특성</b> '+esc(traits)+'</div>':"")+
    recipeInfo+
  '</div>';
}
function unitProfilesForGroup(g){
  const out=[];
  const seen=new Set();
  for(const e of g.events){
    const p=PROFILE_BY_EVENT.get(e.eventId);
    if(p&&!seen.has(p.id)){seen.add(p.id);out.push({profile:p,mode:"즉시 지급 유닛",rewardQty:e.spawnedPersons||p.spawnedPersons||1});}
  }
  for(const item of g.items){
    for(const link of UNIT_PROFILES_BY_ITEM.get(item.id)||[]){
      const p=link.profile;
      if(seen.has(p.id))continue;
      seen.add(p.id);
      out.push({profile:p,recipe:link.recipe,mode:"보상 아이템으로 고용/생성",rewardQty:item.qty,rewardItemId:item.id});
    }
  }
  return out;
}
function unitSection(g){
  const units=unitProfilesForGroup(g);
  if(!units.length)return "";
  return '<div class="group unit-group"><span class="group-title">제공 유닛 실제 전투 능력치</span>'+
    '<p class="unit-note">병종 DB의 생성 프로필을 연결해 자동 특성까지 적용한 값입니다. 즉시 지급 병사와 인물/라이선스형 보상의 전환 병사만 표시하며, 일반 재료가 우연히 고용식에 들어가는 경우는 제외합니다.</p>'+
    units.map(x=>unitProfileCard(x.profile,x)).join("")+'</div>';
}
function card(g){
  const qty=g.items.reduce((n,x)=>n+x.qty,0);
  const spawned=g.spawns.reduce((n,x)=>n+Number(x.count||0),0);
  const pClass=g.points>0?"pos":g.points<0?"neg":"zero";
  const fClass=g.funds>0?"pos":g.funds<0?"neg":"zero";
  const fallback=g.key==="__NONE__"
    ? '<p class="fallback-note">목록의 23개 국가 트리거가 모두 false일 때 적용되는 fallback 국가 이벤트입니다.</p>'
    :"";
  const spawns=g.spawns.length?'<div class="group"><span class="group-title">지급 병종 / 인물</span>'+
    g.spawns.map(s=>'<div class="spawn"><strong>'+esc(human(s.type))+' ×'+fmt(s.count)+'</strong><span class="id">'+esc(s.type)+'</span><small>'+esc(soldierText(s)||"추가 지정 없음")+'</small></div>').join("")+'</div>':"";
  return '<article class="card" data-search="'+esc(searchable(g))+'">'+
    '<div class="card-head"><div><h3>'+esc(titleOf(g))+'</h3><span class="id">'+esc(internalIdOf(g))+'</span></div>'+
    '<div class="badges"><span class="badge '+g.kind+'">'+(g.kind==="region"?"지역":"국가")+'</span>'+
    (g.events.length>1?'<span class="badge multi">'+g.events.length+'개 이벤트 중첩</span>':"")+'</div></div>'+
    '<div class="metrics">'+
      '<div class="metric"><span>Points / Infamy</span><b class="'+pClass+'">'+signed(g.points)+'</b></div>'+
      '<div class="metric"><span>자금</span><b class="'+fClass+'">'+signed(g.funds)+'</b></div>'+
      '<div class="metric"><span>아이템 총수량</span><b>'+fmt(qty)+'</b></div>'+
      '<div class="metric"><span>지급 인물</span><b>'+fmt(spawned)+'</b></div>'+
    '</div>'+fallback+
    (g.items.length?'<div class="group"><span class="group-title">지급 아이템</span><div class="chips">'+g.items.map(rewardChip).join("")+'</div></div>':"")+
    (g.research.length?'<div class="group research"><span class="group-title">즉시 등록 / 연구 목록</span><div class="chips">'+g.research.map(researchChip).join("")+'</div></div>':"")+
    spawns+
    unitSection(g)+
    '<details><summary>원본 이벤트 '+g.events.length+'개 보기</summary>'+g.events.map(eventRow).join("")+'</details>'+
  '</article>';
}
function allGroups(){
  return [...group(DATA.regions||[],"region"),...group(DATA.countries||[],"country")];
}
function renderStats(groups){
  const region=groups.filter(x=>x.kind==="region").length,country=groups.filter(x=>x.kind==="country").length;
  document.querySelector("#stats").innerHTML=
    '<div class="stat"><span>지역 시작 선택</span><strong>'+region+'</strong></div>'+
    '<div class="stat"><span>국가 / fallback 선택</span><strong>'+country+'</strong></div>'+
    '<div class="stat"><span>원본 Month 0 이벤트</span><strong>'+fmt(DATA.meta.rawEventCount)+'</strong></div>'+
    '<div class="stat"><span>원본 파일</span><strong style="font-size:1rem">'+esc(DATA.meta.sourceFile)+'</strong></div>';
}
function render(){
  const q=document.querySelector("#search").value.trim().toLowerCase();
  const kind=document.querySelector("#kind").value,sort=document.querySelector("#sort").value;
  let groups=allGroups().filter(g=>(kind==="all"||g.kind===kind)&&(!q||searchable(g).includes(q)));
  if(sort==="points")groups.sort((a,b)=>b.points-a.points||a.index-b.index);
  if(sort==="items")groups.sort((a,b)=>b.items.reduce((n,x)=>n+x.qty,0)-a.items.reduce((n,x)=>n+x.qty,0)||a.index-b.index);
  if(sort==="events")groups.sort((a,b)=>b.events.length-a.events.length||a.index-b.index);
  document.querySelector("#resultCount").textContent="표시 "+groups.length+"개";
  document.querySelector("#cards").innerHTML=groups.length?groups.map(card).join(""):'<div class="empty">조건에 맞는 스타팅 보너스가 없습니다.</div>';
}
async function init(){
  const [data,names,soldiers,progression]=await Promise.all([
    fetch(DATA_URL).then(r=>{if(!r.ok)throw new Error("starting data "+r.status);return r.json()}),
    fetch(NAMES_URL).then(r=>r.ok?r.json():null).catch(()=>null),
    fetch(SOLDIERS_URL).then(r=>{if(!r.ok)throw new Error("soldier data "+r.status);return r.json()}),
    fetch(PROGRESSION_URL).then(r=>{if(!r.ok)throw new Error("progression data "+r.status);return r.json()})
  ]);
  DATA=data;NAMES=names?.names||{};SOLDIER_DATA=soldiers;PROGRESSION=progression;
  PROFILE_BY_EVENT=new Map((soldiers.profiles||[]).filter(p=>p.sourceType==="event").map(p=>[p.sourceId,p]));
  const manufactureBySource=new Map((soldiers.profiles||[]).filter(p=>p.sourceType==="manufacture").map(p=>[p.sourceId,p]));
  UNIT_PROFILES_BY_ITEM=new Map();
  for(const recipe of Object.values(progression.recipes||{})){
    const profile=manufactureBySource.get(recipe.id);if(!profile)continue;
    for(const item of recipe.requiredItems||[]){
      if(!PERSON_REWARD_ITEMS.has(item.id))continue;
      if(!UNIT_PROFILES_BY_ITEM.has(item.id))UNIT_PROFILES_BY_ITEM.set(item.id,[]);
      UNIT_PROFILES_BY_ITEM.get(item.id).push({profile,recipe});
    }
  }
  const groups=allGroups();renderStats(groups);render();
  for(const id of ["search","kind","sort"])document.querySelector("#"+id).addEventListener(id==="search"?"input":"change",render);
}
init().catch(err=>{
  console.error(err);
  document.querySelector("#cards").innerHTML='<div class="empty">스타팅 보너스 데이터를 불러오지 못했습니다: '+esc(err.message)+'</div>';
});
