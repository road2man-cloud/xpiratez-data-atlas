let DATA=null;
const SECTION_CACHE={};
const DETAIL_CACHE={};
const ASSET_VERSION="20261008-enemy-search1";
let sort={key:"effPerTu",dir:-1};

const $=q=>document.querySelector(q);
const fmt=(n,d=1)=>n==null||!Number.isFinite(Number(n))?"—":Number(n).toLocaleString("ko-KR",{maximumFractionDigits:d});
const pct=n=>n==null?"—":fmt(n,1)+"%";
const esc=s=>String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m]));
const statLabels={tu:"TU",stamina:"기력",health:"체력",bravery:"용기",reactions:"반응",firing:"사격",throwing:"투척",strength:"근력",psiStrength:"Psi강도",psiSkill:"Psi기술",melee:"근접",mana:"Mana"};

async function loadSection(key){
  if(SECTION_CACHE[key])return SECTION_CACHE[key];
  const files=DATA.sectionChunks?.[key]||[];
  if(!files.length)throw new Error("무기 데이터 청크가 없습니다: "+key);
  const parts=await Promise.all(files.map(async rel=>{
    const res=await fetch("../data/"+rel+"?v="+ASSET_VERSION);
    if(!res.ok)throw new Error(rel+" 로드 실패: "+res.status);
    return res.json();
  }));
  SECTION_CACHE[key]=parts.flatMap(x=>Array.isArray(x.rows)?x.rows:[]);
  return SECTION_CACHE[key];
}
async function load(){
  DATA=await (await fetch("../data/weapons-index.json?v="+ASSET_VERSION)).json();
  fillCharacters();
  fillTargets(false);
  renderSummary();
  await render();
}
function renderSummary(){
  const c=DATA.counts;
  $("#summary").innerHTML=[
    ["사격 비교행",fmt(c.shooting,0)+"개","무기 × 탄종 × 사격모드"],
    ["근접 공격",fmt(c.melee,0)+"개","전용 근접 + 총기 보조공격"],
    ["투척 무기",fmt(c.throwing,0)+"개","수류탄·투척 카테고리"],
    ["기준 캐릭터",fmt(c.characters,0)+"개","기본 병종 + 실제 생성 프로필"],
    ["적 대상",fmt(c.targetProfiles,0)+"종","alienRaces 실제 편성 유닛 · 이름/ID 검색"]
  ].map(x=>'<article class="metric card"><strong>'+x[0]+' '+x[1]+'</strong><span>'+x[2]+'</span></article>').join("");
}
function fillCharacters(){
  const rec=DATA.characters.filter(x=>x.recommended);
  const base=DATA.characters.filter(x=>!x.recommended&&x.group==="기본 병종");
  const prof=DATA.characters.filter(x=>!x.recommended&&x.group!=="기본 병종");
  const group=(label,a)=>'<optgroup label="'+label+'">'+a.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.koName)+'</option>').join("")+'</optgroup>';
  $("#character").innerHTML=group("추천 기준",rec)+group("기본 병종",base)+group("실제 생성 프로필",prof);
  const assault=rec.find(x=>x.id==="profile:manufacture:STR_THEBAN_ASSAULT_CLONE");
  const lunatic=rec.find(x=>x.id==="base:STR_SOLDIER");
  $("#character").value=(assault||lunatic||rec[0]||DATA.characters[0]).id;
}
function targetSearchBlob(t){
  return [
    t.koName,t.enName,t.unitId,t.armorId,t.armorKoName,t.armorEnName,
    ...(t.races||[]).flatMap(x=>[x.id,x.koName,x.enName])
  ].filter(Boolean).join(" ").toLowerCase();
}
function fillTargets(preserve=true){
  const profiles=DATA.targetProfiles||[],q=($("#targetSearch")?.value||"").trim().toLowerCase();
  const current=preserve?$("#targetUnit")?.value:"";
  const filtered=profiles.filter(t=>!q||targetSearchBlob(t).includes(q));
  $("#targetUnit").innerHTML=filtered.map(t=>
    '<option value="'+esc(t.unitId)+'">'+esc(t.koName)+' · 전면 '+fmt(t.frontArmor,0)+' · '+esc(t.unitId)+'</option>'
  ).join("");
  const selected=filtered.find(x=>x.unitId===current)||filtered.find(x=>x.recommended)||filtered[0]||null;
  if(selected)$("#targetUnit").value=selected.unitId;
  return selected;
}
function character(){
  return DATA.characters.find(x=>x.id===$("#character").value)||DATA.characters[0];
}
function targetUnit(){
  const profiles=DATA.targetProfiles||[];
  return profiles.find(x=>x.unitId===$("#targetUnit").value)||null;
}
function stats(){
  const c=character(),band=$("#band").value;
  return c?.stats?.[band]||{};
}
function statTerm(name,s){
  const a=k=>Number(s?.[k])||0;
  switch(name){
    case"flatOne":return 1;case"flatHundred":return 100;
    case"strength":return a("strength");case"psi":return a("psiSkill")*a("psiStrength");
    case"psiSkill":return a("psiSkill");case"psiStrength":return a("psiStrength");case"throwing":return a("throwing");
    case"bravery":return a("bravery");case"firing":return a("firing");case"health":return a("health");
    case"mana":return a("mana");case"tu":return a("tu");case"reactions":return a("reactions");
    case"stamina":return a("stamina");case"melee":return a("melee");
    case"strengthMelee":return a("strength")*a("melee");case"strengthThrowing":return a("strength")*a("throwing");
    case"firingReactions":return a("firing")*a("reactions");
    case"strengthScaled":return a("strength")/100;case"psiScaled":return a("psiSkill")*a("psiStrength")/10000;
    case"psiSkillScaled":return a("psiSkill")/100;case"psiStrengthScaled":return a("psiStrength")/100;
    case"throwingScaled":return a("throwing")/100;case"braveryScaled":return a("bravery")/100;
    case"firingScaled":return a("firing")/100;case"healthScaled":return a("health")/100;
    case"manaScaled":return a("mana")/100;case"tuScaled":return a("tu")/100;
    case"reactionsScaled":return a("reactions")/100;case"staminaScaled":return a("stamina")/100;
    case"meleeScaled":return a("melee")/100;case"strengthMeleeScaled":return a("strength")*a("melee")/10000;
    case"strengthThrowingScaled":return a("strength")*a("throwing")/10000;case"firingReactionsScaled":return a("firing")*a("reactions")/10000;
    default:return null;
  }
}
function roundEngine(x){return x>=0?Math.floor(x+0.5):Math.ceil(x-0.5)}
function evalBonus(spec,s){
  if(!spec||spec.kind==="script")return null;
  let total=0;
  for(const [k,v] of Object.entries(spec.terms||{})){
    const st=statTerm(k,s);if(st==null)continue;
    const co=Array.isArray(v)?v:[v];let p=st,part=0;
    for(let i=0;i<Math.min(4,co.length);i++){part+=(Number(co[i])||0)*p;p*=st}
    total+=part;
  }
  return roundEngine(total);
}
function tuCost(r,s){
  const t=Number(r.cost?.time)||0;if(!t)return 0;
  return r.cost.flat?t:Math.max(1,Math.floor((Number(s.tu)||0)*t/100));
}
function baseAccuracy(r,s){
  const m=evalBonus(r.accuracyBonus,s);
  if(m==null)return null;
  return Math.trunc(m*(Number(r.baseAccuracy)||0)/100);
}
function accuracyAtDistance(r,s){
  let a=baseAccuracy(r,s);if(a==null)return null;
  if(r.section==="shooting"){
    if($("#kneel").checked)a=Math.trunc(a*(Number(r.kneelBonus)||115)/100);
    if($("#oneHandPenalty").checked&&r.twoHanded)a=Math.trunc(a*(Number(r.oneHandedPenalty)||80)/100);
  }
  const d=Math.max(0,Number($("#distance").value)||0);
  if(r.section==="shooting"){
    const hi=Number(r.effectiveRange)||0,lo=Number(r.minRange)||0,drop=Number(r.dropoff)||0;
    if(d>hi)a-=Math.floor((d-hi)*drop);
    else if(d<lo)a-=Math.floor((lo-d)*drop);
  }else if(r.section==="throwing"){
    const hi=Number(r.throwDropoffRange)||99,drop=Number(r.throwDropoff)||5;
    if(d>hi)a-=Math.floor((d-hi)*drop);
  }
  return Math.max(0,a);
}
function nominalPower(r,s){
  const b=evalBonus(r.damageBonus,s);
  return Math.max(0,(Number(r.basePower)||0)+(b??0));
}
function actionPower(r,s){
  const p=nominalPower(r,s);
  return p*Math.max(1,Number(r.shots)||1)*Math.max(1,Number(r.pellets)||1);
}
function distancePower(r,s,d,inRange){
  if(!inRange)return null;
  let p=nominalPower(r,s);
  if(r.section==="shooting"){
    p=Math.trunc(p-(Number(r.powerRangeReduction)||0)*Math.max(0,d-(Number(r.powerRangeThreshold)||0)));
  }
  return Math.max(0,p);
}
function throwPhysicalRange(weight,strength){
  weight=Math.max(.01,Number(weight)||0);strength=Math.max(.01,Number(strength)||0);
  let curZ=.5,dz=1,dist=0;
  while(dist<4000){
    dist+=8;
    if(dz<-1)curZ-=8;else curZ+=dz*8;
    if(curZ<0&&dz<0){dz=Math.max(dz,-1);if(Math.abs(dz)>1e-10)dist-=curZ/dz;break}
    dz-=(50*weight/strength)/100;
    if(dz<=-2)break;
  }
  return (dist+8)/16;
}
function computed(r){
  const s=stats(),tu=tuCost(r,s),power=nominalPower(r,s),total=actionPower(r,s);
  const d=Math.max(0,Number($("#distance").value)||0);
  const phys=r.section==="throwing"?Math.min(Number(r.throwRange)||200,throwPhysicalRange(r.weight,s.strength)):null;
  const hardMax=r.section==="shooting"?(Number.isFinite(Number(r.maxRange))?Number(r.maxRange):200):r.section==="throwing"?phys:null;
  const inRange=r.section==="melee"||hardMax==null||d<=hardMax;
  const rangePower=distancePower(r,s,d,inRange);
  const rangeActionPower=rangePower==null?null:rangePower*Math.max(1,Number(r.shots)||1)*Math.max(1,Number(r.pellets)||1);
  const acc=inRange?accuracyAtDistance(r,s):null;
  const damageMeta=DATA.damageProfiles?.[r.id]||null;
  const out={
    ...r,damageProfile:damageMeta,actualDamageScripted:Boolean(damageMeta?.scripted),
    effPower:power,actionPower:total,rangePower,rangeActionPower,tu,
    effPerTu:tu&&rangeActionPower!=null?rangeActionPower/tu:null,
    nominalPerTu:tu?total/tu:null,effAccuracy:acc,inRange,hardMaxRange:hardMax,
    physicalThrowRange:phys,costEnergy:Number(r.cost?.energy)||0,requiresText:(r.requires||[]).join(" · ")
  };
  const actual=actualAgainstTarget(out);
  return {
    ...out,actualPower:actual.value,actualApprox:actual.approx,
    actualPerTu:tu&&actual.value!=null?actual.value/tu:null,targetUnitId:actual.target?.unitId??null
  };
}
function sectionRows(){
  return SECTION_CACHE[$("#section").value]||[];
}
function searchBlob(r){
  return [r.koName,r.enName,r.itemId,r.ammoKoName,r.ammoEnName,r.ammoId,r.damageTypeKo,...(r.requires||[]),...(r.categories||[])].filter(Boolean).join(" ").toLowerCase();
}
function rows(){
  const q=$("#search").value.trim().toLowerCase(),mode=$("#mode").value;
  let a=sectionRows().filter(r=>(!q||searchBlob(r).includes(q))&&(!mode||r.mode===mode)).map(computed);
  a.sort((x,y)=>{
    const av=x[sort.key],bv=y[sort.key];
    if(typeof av==="string"||typeof bv==="string")return String(av??"").localeCompare(String(bv??""),"ko")*sort.dir;
    const aa=av==null?NaN:Number(av),bb=bv==null?NaN:Number(bv);
    return ((Number.isFinite(aa)?aa:-Infinity)-(Number.isFinite(bb)?bb:-Infinity))*sort.dir;
  });
  return a;
}
function th(label,key){
  const on=sort.key===key?" sort-on":"",arrow=sort.key===key?(sort.dir>0?" ▲":" ▼"):"";
  return '<th data-sort="'+key+'" class="'+on+'">'+label+arrow+"</th>";
}
function reqHtml(r){return (r.requires||[]).length?'<span class="req">'+r.requires.map(x=>esc(x)).join("<br>")+"</span>":'<span class="muted">—</span>'}
function scriptMark(r){return r.damageBonus?.kind==="script"||r.accuracyBonus?.kind==="script"?'<span class="script">SCRIPT*</span>':""}
function rangeNum(r,v,d=1){return r.inRange?fmt(v,d):'<span class="muted">사거리 밖</span>'}
function rangePct(r,v){return r.inRange?pct(v):'<span class="muted">사거리 밖</span>'}
function rangeText(r,v,d=1){return r.inRange?fmt(v,d):"사거리 밖"}
function resolvedRandomType(p){
  let rt=Number(p?.randomType)||0;
  if(rt!==0)return rt;
  const resist=Number(p?.resistType)||0;
  if(resist===0||resist===9)return 5;
  if(resist===2)return 4;
  if(resist===3)return 9;
  return 8;
}
const HEALTH_EXPECT_CACHE=new Map();
const DAMAGE_EXPECT_CACHE=new Map();
function expectedFinalHealth(damage,profile){
  if(!(damage>0))return 0;
  const factor=Number(profile?.toHealth);
  if(!Number.isFinite(factor)||factor===0)return 0;
  if(!profile?.randomHealth)return roundEngine(damage*factor);
  const key=damage+"|"+factor;
  if(HEALTH_EXPECT_CACHE.has(key))return HEALTH_EXPECT_CACHE.get(key);
  let sum=0;
  for(let x=0;x<=damage;x++)sum+=roundEngine(x*factor);
  const value=sum/(damage+1);
  HEALTH_EXPECT_CACHE.set(key,value);
  return value;
}
function expectedHealthPerHit(power,profile,target){
  power=Math.max(0,Math.trunc(Number(power)||0));
  if(!(power>0)||!profile||!target)return 0;
  const resist=Number(profile.resistType)||0;
  const mod=Number(target.damageModifier?.[resist]??1);
  const armorEff=Number(profile.armorEffectiveness);
  const armor=armorEff>0?(Number(target.frontArmor)||0)*armorEff:0;
  const rt=resolvedRandomType(profile);
  const key=[
    power,rt,resist,mod,armor,profile.toHealth,profile.randomHealth?1:0
  ].join("|");
  if(DAMAGE_EXPECT_CACHE.has(key))return DAMAGE_EXPECT_CACHE.get(key);
  const finalFor=raw=>{
    let damage=Math.floor(raw*mod);
    if(armorEff>0)damage=Math.trunc(damage-armor);
    return damage>0?expectedFinalHealth(damage,profile):0;
  };
  let total=0,weight=0;
  const uniform=(lo,hi)=>{
    lo=Math.trunc(lo);hi=Math.trunc(hi);
    for(let raw=lo;raw<=hi;raw++){total+=finalFor(raw);weight++}
  };
  if(rt===3)uniform(power,power);
  else if(rt===4)uniform(5,10);
  else if(rt===5){total=0;weight=1}
  else if(rt===6){
    const denom=(power+1)*(power+1);
    for(let raw=0;raw<=2*power;raw++){
      const count=raw<=power?raw+1:2*power-raw+1;
      total+=finalFor(raw)*count;
    }
    weight=denom;
  }else if(rt===2||rt===9)uniform(Math.trunc(power*50/100),Math.trunc(power*150/100));
  else if(rt===7)uniform(Math.trunc(power/2),power*2);
  else uniform(0,power*2);
  const value=weight?total/weight:0;
  DAMAGE_EXPECT_CACHE.set(key,value);
  return value;
}
function actualAgainstTarget(r){
  const t=targetUnit();
  if(!t)return {value:null,approx:Boolean(r.actualDamageScripted),target:null};
  if(!r.inRange)return {value:null,approx:Boolean(r.actualDamageScripted)||Boolean(t.scripted),target:t};
  const power=r.section==="shooting"?r.rangePower:r.effPower;
  const mult=Math.max(1,Number(r.shots)||1)*Math.max(1,Number(r.pellets)||1);
  const value=expectedHealthPerHit(power,r.damageProfile,t)*mult;
  return {value,approx:Boolean(r.actualDamageScripted)||Boolean(t.scripted),target:t};
}
function actualHtml(r,v,d=1){
  if(!r.inRange)return '<span class="muted">사거리 밖</span>';
  if(v==null)return '<span class="muted">—</span>';
  return (r.actualApprox?"≈ ":"")+fmt(v,d);
}
async function render(){
  if(!DATA)return;
  const section=$("#section").value;
  if(!SECTION_CACHE[section]){
    $("#rowCount").textContent="데이터 불러오는 중…";
    $("#weaponTable tbody").innerHTML="";
    await loadSection(section);
    if(section!==$("#section").value)return;
  }
  const s=stats(),c=character(),band=$("#band").value;
  $("#characterTitle").textContent=c.koName+" · "+({avg:"평균",min:"최소",max:"최대"}[band]);
  $("#characterStats").innerHTML=["tu","firing","melee","throwing","strength","reactions"].map(k=>'<div class="stat-chip"><small>'+statLabels[k]+'</small><b>'+fmt(s[k])+'</b></div>').join("");
  const target=targetUnit();
  $("#targetSummary").innerHTML=target?'<small>선택 적 · 전면 기준</small><b>'+esc(target.koName)+'</b><span>전/측/후/하 '+[target.frontArmor,target.sideArmor,target.rearArmor,target.underArmor].map(x=>fmt(x,0)).join(" / ")+'</span><span class="subtle">'+esc(target.unitId)+' · '+esc(target.armorKoName||target.armorId)+(target.scripted?' · 스크립트 갑옷':'')+'</span>':"";
  $(".mode-filter").style.display=section==="shooting"?"grid":"none";
  $("#kneel").parentElement.style.display=section==="shooting"?"flex":"none";
  $("#oneHandPenalty").parentElement.style.display=section==="shooting"?"flex":"none";
  $(".distance").style.display=section==="melee"?"none":"grid";
  $("#tableTitle").textContent={shooting:"사격 무기 — 무기 × 탄종 × 모드",melee:"근접 공격",throwing:"투척 무기"}[section];
  const h=section==="shooting"?[
    th("무기","koName"),th("탄약","ammoKoName"),th("모드","modeKo"),th("피해","damageTypeKo"),th("1타 명목위력","effPower"),th("총 명목위력","actionPower"),
    th("실제위력","actualPower"),th("실제위력/TU","actualPerTu"),th("총위력@거리","rangeActionPower"),th("TU","tu"),th("위력/TU@거리","effPerTu"),th("ACC@거리","effAccuracy"),th("기본 ACC","baseAccuracy"),th("유효거리","effectiveRange"),th("최대사거리","maxRange"),th("Drop","dropoff"),
    th("발수","shots"),th("펠릿","pellets"),th("탄창","clipSize"),th("탄약가","ammoCostBuy"),th("무게","weight"),th("구매가","costBuy"),th("해금","requiresText")
  ]:section==="melee"?[
    th("무기","koName"),th("피해","damageTypeKo"),th("명목위력","effPower"),th("실제위력","actualPower"),th("실제위력/TU","actualPerTu"),th("TU","tu"),th("위력/TU","effPerTu"),th("ACC","effAccuracy"),
    th("기본 위력","basePower"),th("기본 ACC","baseAccuracy"),th("에너지","costEnergy"),th("무게","weight"),th("구매가","costBuy"),th("해금","requiresText")
  ]:[
    th("무기","koName"),th("피해","damageTypeKo"),th("명목위력","effPower"),th("실제위력","actualPower"),th("실제위력/TU","actualPerTu"),th("TU","tu"),th("위력/TU@거리","effPerTu"),th("ACC@거리","effAccuracy"),
    th("물리 최대거리","physicalThrowRange"),th("규칙 최대거리","throwRange"),th("무게","weight"),th("폭발반경","blastRadius"),th("프라임","primeCost"),th("구매가","costBuy"),th("해금","requiresText")
  ];
  $("#weaponTable thead").innerHTML="<tr>"+h.join("")+"</tr>";
  const a=rows();$("#rowCount").textContent=a.length+"개 · "+c.koName+" · 거리 "+($("#distance").value||0)+"칸";
  $("#weaponTable tbody").innerHTML=a.map(r=>rowHtml(r,section)).join("");
  document.querySelectorAll("th[data-sort]").forEach(el=>el.addEventListener("click",()=>{const k=el.dataset.sort;if(sort.key===k)sort.dir*=-1;else sort={key:k,dir:k==="koName"?1:-1};void render()}));
  document.querySelectorAll("tbody tr").forEach(el=>el.addEventListener("click",()=>{void openDetail(decodeURIComponent(el.dataset.id))}));
}
function rowHtml(r,section){
  const first='<td><span class="name">'+esc(r.koName)+'</span><span class="id">'+esc(r.itemId)+'</span>'+scriptMark(r)+"</td>";
  if(section==="shooting")return '<tr data-id="'+encodeURIComponent(r.id)+'">'+first+
    '<td><span class="ammo">'+esc(r.ammoKoName)+'</span><span class="id">'+esc(r.ammoId)+'</span></td><td>'+esc(r.modeKo)+'</td><td class="damage">'+esc(r.damageTypeKo||"—")+'</td>'+
    '<td class="num-strong">'+fmt(r.effPower)+'</td><td class="num-strong good">'+fmt(r.actionPower)+'</td><td class="num-strong actual">'+actualHtml(r,r.actualPower)+'</td><td class="num-strong actual">'+actualHtml(r,r.actualPerTu,2)+'</td><td class="num-strong">'+rangeNum(r,r.rangeActionPower)+'</td><td>'+fmt(r.tu,0)+'</td><td class="num-strong">'+rangeNum(r,r.effPerTu,2)+'</td><td class="num-strong">'+rangePct(r,r.effAccuracy)+'</td>'+
    '<td>'+pct(r.baseAccuracy)+'</td><td>'+fmt(r.effectiveRange,0)+'</td><td>'+fmt(r.maxRange,0)+'</td><td>'+fmt(r.dropoff,0)+'</td><td>'+fmt(r.shots,0)+'</td><td>'+fmt(r.pellets,0)+'</td><td>'+fmt(r.clipSize,0)+'</td><td>'+fmt(r.ammoCostBuy,0)+'</td><td>'+fmt(r.weight)+'</td><td>'+fmt(r.costBuy,0)+'</td><td>'+reqHtml(r)+'</td></tr>';
  if(section==="melee")return '<tr data-id="'+encodeURIComponent(r.id)+'">'+first+
    '<td class="damage">'+esc(r.damageTypeKo||"—")+'</td><td class="num-strong">'+fmt(r.effPower)+'</td><td class="num-strong actual">'+actualHtml(r,r.actualPower)+'</td><td class="num-strong actual">'+actualHtml(r,r.actualPerTu,2)+'</td><td>'+fmt(r.tu,0)+'</td><td class="num-strong good">'+fmt(r.effPerTu,2)+'</td><td class="num-strong">'+pct(r.effAccuracy)+'</td>'+
    '<td>'+fmt(r.basePower)+'</td><td>'+pct(r.baseAccuracy)+'</td><td>'+fmt(r.cost?.energy,0)+'</td><td>'+fmt(r.weight)+'</td><td>'+fmt(r.costBuy,0)+'</td><td>'+reqHtml(r)+'</td></tr>';
  return '<tr data-id="'+encodeURIComponent(r.id)+'">'+first+
    '<td class="damage">'+esc(r.damageTypeKo||"—")+'</td><td class="num-strong">'+fmt(r.effPower)+'</td><td class="num-strong actual">'+actualHtml(r,r.actualPower)+'</td><td class="num-strong actual">'+actualHtml(r,r.actualPerTu,2)+'</td><td>'+fmt(r.tu,0)+'</td><td class="num-strong good">'+rangeNum(r,r.effPerTu,2)+'</td><td class="num-strong">'+rangePct(r,r.effAccuracy)+'</td>'+
    '<td class="num-strong">'+fmt(r.physicalThrowRange,1)+'</td><td>'+fmt(r.throwRange,0)+'</td><td>'+fmt(r.weight)+'</td><td>'+fmt(r.blastRadius,1)+'</td><td>'+fmt(r.primeCost,0)+'</td><td>'+fmt(r.costBuy,0)+'</td><td>'+reqHtml(r)+'</td></tr>';
}
function findRow(id){return sectionRows().find(x=>x.id===id)}
async function loadRuleDetail(itemId){
  if(!itemId)return null;
  const rel=DATA.detailIndex?.[itemId];
  if(!rel)return null;
  if(!DETAIL_CACHE[rel]){
    const res=await fetch("../data/"+rel+"?v="+ASSET_VERSION);
    if(!res.ok)throw new Error(rel+" 상세 룰 로드 실패: "+res.status);
    DETAIL_CACHE[rel]=await res.json();
  }
  return DETAIL_CACHE[rel]?.details?.[itemId]||null;
}
function bonusFormula(spec){
  if(!spec)return "0";
  if(spec.kind==="script")return "커스텀 OXCE 스크립트 — 정적 계산 불가\n"+spec.script;
  const parts=[];
  for(const [k,v] of Object.entries(spec.terms||{})){
    const a=Array.isArray(v)?v:[v];
    parts.push(a.map((c,i)=>(Number(c)||0)+"×"+k+(i?("^"+(i+1)):"")).join(" + "));
  }
  return parts.length?parts.join(" + "):"0";
}
function handUseLabel(r){
  if(r.blockBothHands)return "양손 점유";
  if(r.twoHanded)return "양손무기 · 한손 사용 시 페널티";
  return "한손무기";
}
function rawRuleHtml(detail,label){
  if(!detail?.rule)return '<details class="rule-dump"><summary>'+esc(label)+' — 데이터 없음</summary></details>';
  const rule=detail.rule,fieldCount=Object.keys(rule).length;
  return '<details class="rule-dump"><summary>'+esc(label)+' · '+fieldCount+'개 최상위 필드</summary>'+
    '<p class="subtle">룰셋의 중복 정의와 refNode 상속을 병합한 뒤 남은 유효 정의입니다. 아래 JSON은 필드를 선별하지 않고 전부 표시합니다.</p>'+
    '<pre class="rule-json">'+esc(JSON.stringify(rule,null,2))+'</pre></details>';
}
function objectRuleHtml(label,obj){
  if(!obj||typeof obj!=="object")return "";
  return '<h3>'+esc(label)+'</h3><pre class="formula rule-object">'+esc(JSON.stringify(obj,null,2))+'</pre>';
}
async function openDetail(id){
  const raw=findRow(id);if(!raw)return;const r=computed(raw),s=stats(),c=character();
  const detailIds=[r.itemId,r.ammoId,r.powerSourceId].filter(Boolean);
  const loaded=await Promise.all([...new Set(detailIds)].map(async itemId=>[itemId,await loadRuleDetail(itemId)]));
  const details=Object.fromEntries(loaded),itemDetail=details[r.itemId],ammoDetail=details[r.ammoId],powerDetail=details[r.powerSourceId];
  const itemRule=itemDetail?.rule||{},ammoRule=ammoDetail?.rule||{},powerRule=powerDetail?.rule||{};
  const bonus=evalBonus(r.damageBonus,s),accMult=evalBonus(r.accuracyBonus,s);
  const costRule=(r.cost?.flat?fmt(r.cost?.time,0)+" TU 고정":fmt(r.cost?.time,0)+"% TU")+" · 에너지 "+fmt(r.cost?.energy,0);
  const oneHand=r.twoHanded?pct(r.oneHandedPenalty):"해당 없음";
  const damageAlter=r.section==="melee"&&!r.standaloneMelee?itemRule.meleeAlter:(r.section==="shooting"?(ammoRule.damageAlter??powerRule.damageAlter??itemRule.damageAlter):itemRule.damageAlter);
  let html='<p class="eyebrow">'+({shooting:"사격",melee:"근접",throwing:"투척"}[r.section])+' 계산 상세</p><h2>'+esc(r.koName)+'</h2>'+
    '<p class="muted">'+esc(r.enName||"")+' · '+esc(r.itemId)+(r.ammoId&&r.ammoId!==r.itemId?" · 탄약 "+esc(r.ammoKoName)+" / "+esc(r.ammoId):"")+'</p>';

  html+='<h3>장비·손 사용</h3><div class="detail-grid">'+
    '<div class="box"><strong>손 사용</strong>'+esc(handUseLabel(r))+'</div>'+
    '<div class="box"><strong>twoHanded</strong>'+(r.twoHanded?"예":"아니오")+'</div>'+
    '<div class="box"><strong>blockBothHands</strong>'+(r.blockBothHands?"예 · 다른 손 점유 불가":"아니오")+'</div>'+
    '<div class="box"><strong>한손 사용 정확도 보정</strong>'+oneHand+'</div>'+
    '<div class="box"><strong>무게</strong>'+fmt(r.weight)+'</div>'+
    '<div class="box"><strong>구매 / 판매</strong>'+fmt(r.costBuy,0)+' / '+fmt(r.costSell,0)+'</div>'+
    '<div class="box"><strong>분류</strong>'+(r.categories?.length?r.categories.map(x=>'<span class="tag">'+esc(x)+'</span>').join(" "):"—")+'</div>'+
    '<div class="box"><strong>룰 파일</strong>'+esc((r.sourceFiles||[]).join(", ")||"—")+'</div></div>';

  const explicit=(key,render=v=>esc(v))=>Object.prototype.hasOwnProperty.call(itemRule,key)?render(itemRule[key]):'<span class="muted">룰 미명시</span>';
  html+='<h3>아이템 룰 속성</h3><div class="detail-grid">'+
    '<div class="box"><strong>인벤토리 크기</strong>'+(itemRule.invWidth!=null||itemRule.invHeight!=null?fmt(itemRule.invWidth,0)+' × '+fmt(itemRule.invHeight,0):'<span class="muted">룰 미명시</span>')+'</div>'+
    '<div class="box"><strong>지오 저장 크기(size)</strong>'+explicit("size",v=>fmt(v,3))+'</div>'+
    '<div class="box"><strong>내구/armor</strong>'+explicit("armor",v=>fmt(v,0))+'</div>'+
    '<div class="box"><strong>battleType</strong>'+explicit("battleType",v=>fmt(v,0))+'</div>'+
    '<div class="box"><strong>clipSize</strong>'+explicit("clipSize",v=>fmt(v,0))+'</div>'+
    '<div class="box"><strong>fixedWeapon</strong>'+explicit("fixedWeapon",v=>v?"예":"아니오")+'</div>'+
    '<div class="box"><strong>fixedWeaponShow</strong>'+explicit("fixedWeaponShow",v=>v?"예":"아니오")+'</div>'+
    '<div class="box"><strong>recover</strong>'+explicit("recover",v=>v?"예":"아니오")+'</div>'+
    '<div class="box"><strong>specialUseEmptyHand</strong>'+explicit("specialUseEmptyHand",v=>v?"예":"아니오")+'</div>'+
    '<div class="box"><strong>arcingShot</strong>'+explicit("arcingShot",v=>v?"예":"아니오")+'</div>'+
    '<div class="box"><strong>attraction</strong>'+explicit("attraction",v=>fmt(v,0))+'</div>'+
    '<div class="box"><strong>listOrder</strong>'+explicit("listOrder",v=>fmt(v,0))+'</div></div>';

  html+='<h3>공격 액션</h3><div class="detail-grid">'+
    '<div class="box"><strong>공격 모드</strong>'+esc(r.modeKo||r.mode||"—")+(r.section==="melee"?'<br><span class="subtle">'+(r.standaloneMelee?"전용 근접무기":"다른 무기의 보조 근접공격")+'</span>':"")+'</div>'+
    '<div class="box"><strong>기본 위력</strong>'+fmt(r.basePower)+'</div>'+
    '<div class="box"><strong>기본 정확도</strong>'+pct(r.baseAccuracy)+'</div>'+
    '<div class="box"><strong>TU / 에너지 룰</strong>'+costRule+'<br><span class="subtle">현재 캐릭터 실제 TU '+fmt(r.tu,0)+'</span></div>'+
    '<div class="box"><strong>타수 / 펠릿</strong>'+fmt(r.shots,0)+' / '+fmt(r.pellets,0)+'</div>'+
    '<div class="box"><strong>피해유형</strong>'+esc(r.damageTypeKo||"—")+'<br><span class="subtle">damageType '+fmt(r.damageType,0)+'</span></div>'+
    '<div class="box"><strong>1타 명목위력</strong>'+fmt(r.effPower)+'</div>'+
    '<div class="box"><strong>총 명목위력</strong>'+fmt(r.actionPower)+'</div></div>';

  const target=targetUnit();
  const resistType=Number(r.damageProfile?.resistType)||0;
  const resistMod=target?Number(target.damageModifier?.[resistType]??1):null;
  html+='<h3>선택 상대에 대한 실제위력</h3><div class="detail-grid">'+
    '<div class="box"><strong>상대 적</strong>'+esc(target?.koName||"—")+'<br><span class="subtle">'+esc(target?.unitId||"")+'</span></div>'+
    '<div class="box"><strong>방어구</strong>'+esc(target?.armorKoName||target?.armorId||"—")+'</div>'+
    '<div class="box"><strong>전/측/후/하 방어</strong>'+(target?[target.frontArmor,target.sideArmor,target.rearArmor,target.underArmor].map(x=>fmt(x,0)).join(" / "):"—")+'</div>'+
    '<div class="box"><strong>현재 피해저항</strong>'+(target?fmt(resistMod,2):"—")+'×</div>'+
    '<div class="box"><strong>실제위력 · 기대 HP 피해</strong>'+actualHtml(r,r.actualPower)+'</div>'+
    '<div class="box"><strong>실제위력/TU</strong>'+actualHtml(r,r.actualPerTu,2)+'</div>'+
    '<div class="box"><strong>ResistType</strong>'+fmt(resistType,0)+'</div>'+
    '<div class="box"><strong>계산 신뢰도</strong>'+(r.actualApprox?'≈ 정적 근사 · 스크립트 개입 가능':'정적 룰 계산')+'</div></div>'+
    (target?.races?.length?'<p class="subtle">등장 적군 분류: '+esc(target.races.slice(0,12).map(x=>x.koName||x.id).join(" · "))+'</p>':"");

  if(r.section==="shooting")html+='<h3>사격·탄약·사거리</h3><div class="detail-grid">'+
    '<div class="box"><strong>탄약</strong>'+esc(r.ammoKoName||"—")+'<br><span class="subtle">'+esc(r.ammoId||"—")+'</span></div>'+
    '<div class="box"><strong>위력 출처</strong>'+esc(r.powerSourceId||"—")+'</div>'+
    '<div class="box"><strong>탄창 / 탄약무게</strong>'+fmt(r.clipSize,0)+' / '+fmt(r.ammoWeight)+'</div>'+
    '<div class="box"><strong>탄약 구매 / 판매</strong>'+fmt(r.ammoCostBuy,0)+' / '+fmt(r.ammoCostSell,0)+'</div>'+
    '<div class="box"><strong>유효 / 최소 / 최대사거리</strong>'+fmt(r.effectiveRange,0)+' / '+fmt(r.minRange,0)+' / '+fmt(r.maxRange,0)+'</div>'+
    '<div class="box"><strong>명중 Dropoff</strong>'+fmt(r.dropoff,2)+'</div>'+
    '<div class="box"><strong>위력감쇠 시작</strong>'+fmt(r.powerRangeThreshold,0)+'칸</div>'+
    '<div class="box"><strong>거리당 위력감쇠</strong>'+fmt(r.powerRangeReduction,2)+'</div>'+
    '<div class="box"><strong>무릎 정확도 보정</strong>'+pct(r.kneelBonus)+'</div>'+
    '<div class="box"><strong>선택 거리 총위력</strong>'+esc(rangeText(r,r.rangeActionPower))+'</div>'+
    '<div class="box"><strong>선택 거리 정확도</strong>'+(r.inRange?pct(r.effAccuracy):"사거리 밖")+'</div>'+
    '<div class="box"><strong>선택 거리 위력/TU</strong>'+esc(rangeText(r,r.effPerTu,2))+'</div></div>';

  if(r.section==="throwing")html+='<h3>투척</h3><div class="detail-grid">'+
    '<div class="box"><strong>물리 최대거리</strong>'+fmt(r.physicalThrowRange,1)+'칸</div>'+
    '<div class="box"><strong>규칙 최대거리</strong>'+fmt(r.throwRange,0)+'칸</div>'+
    '<div class="box"><strong>Dropoff 시작 / 값</strong>'+fmt(r.throwDropoffRange,0)+' / '+fmt(r.throwDropoff,2)+'</div>'+
    '<div class="box"><strong>프라임 TU</strong>'+fmt(r.primeCost,0)+(r.primeFlat?" · 고정":" · %")+'</div>'+
    '<div class="box"><strong>폭발반경</strong>'+fmt(r.blastRadius,1)+'</div>'+
    '<div class="box"><strong>선택 거리 정확도</strong>'+(r.inRange?pct(r.effAccuracy):"사거리 밖")+'</div></div>';

  html+='<h3>계산식</h3><div class="formula">기본 위력 '+fmt(r.basePower)+' + 스탯 보너스 '+(bonus==null?"SCRIPT":fmt(bonus))+' = 1타 명목위력 '+fmt(r.effPower)+
    (r.section==="shooting"?'\n총 명목위력 = '+fmt(r.effPower)+' × '+fmt(r.shots,0)+'발 × '+fmt(r.pellets,0)+'펠릿 = '+fmt(r.actionPower)+'\n선택 거리 '+fmt(Number($("#distance").value)||0,0)+'칸 총위력 = '+rangeText(r,r.rangeActionPower):"")+
    '\n위력 보너스식: '+esc(bonusFormula(r.damageBonus))+
    '\n정확도 multiplier: '+esc(bonusFormula(r.accuracyBonus))+
    '\n캐릭터 보정 전/후 정확도: '+pct(r.baseAccuracy)+' → '+(r.inRange?pct(r.effAccuracy):"사거리 밖")+'</div>';

  html+='<h3>피해 보정</h3><div class="detail-grid">'+
    '<div class="box"><strong>RandomType · 유효값</strong>'+fmt(r.damageProfile?.randomType,0)+'</div>'+
    '<div class="box"><strong>ResistType · 유효값</strong>'+fmt(r.damageProfile?.resistType,0)+'</div>'+
    '<div class="box"><strong>ArmorEffectiveness · 유효값</strong>'+fmt(r.damageProfile?.armorEffectiveness,2)+'</div>'+
    '<div class="box"><strong>ToHealth · 유효값</strong>'+fmt(r.damageProfile?.toHealth,2)+'</div>'+
    '<div class="box"><strong>RandomHealth · 유효값</strong>'+(r.damageProfile?.randomHealth?"예":"아니오")+'</div>'+
    '<div class="box"><strong>명시 ToStun</strong>'+fmt(r.toStun,2)+'</div>'+
    '<div class="box"><strong>명시 ToTile</strong>'+fmt(r.toTile,2)+'</div>'+
    '<div class="box"><strong>커스텀 스크립트 영향</strong>'+(r.actualDamageScripted?"있음":"없음")+'</div></div>';
  html+=objectRuleHtml(r.section==="melee"&&!r.standaloneMelee?"meleeAlter 전체":"damageAlter 전체",damageAlter);

  const research=[...(r.research||[]),...(r.ammoResearch||[])],manufacture=[...(r.manufacture||[]),...(r.ammoManufacture||[])];
  html+='<h3>해금·획득</h3><div class="detail-grid">'+
    '<div class="box"><strong>직접 조건</strong>'+(r.requires?.length?r.requires.map(x=>'<span class="tag">'+esc(x)+'</span>').join(" "):"없음/특수")+'</div>'+
    '<div class="box"><strong>관련 연구</strong>'+(research.length?research.map(x=>esc(x.koName||x.id)+(x.cost!=null?' ('+fmt(x.cost,0)+')':'')).join('<br>'):'—')+'</div>'+
    '<div class="box"><strong>관련 제조</strong>'+(manufacture.length?manufacture.map(x=>esc(x.koName||x.id)+(x.time!=null?' · '+fmt(x.time,0)+'h':'')+(x.cost!=null?' · '+fmt(x.cost,0):'')).join('<br>'):'—')+'</div>'+
    '<div class="box"><strong>원본 ID</strong>'+esc(r.itemId)+(r.ammoId&&r.ammoId!==r.itemId?'<br><span class="subtle">탄약 '+esc(r.ammoId)+'</span>':'')+'</div></div>';

  html+='<h3>룰셋 유효 정의 전체</h3><p class="subtle">사람이 보기 좋은 요약에서 빠질 수 있는 특수 필드를 잃지 않도록, 아래에는 해당 무기의 병합 후 룰 필드를 전부 보존합니다.</p>'+
    rawRuleHtml(itemDetail,"무기 "+r.itemId);
  if(r.ammoId&&r.ammoId!==r.itemId)html+=rawRuleHtml(ammoDetail,"탄약 "+r.ammoId);
  if(r.powerSourceId&&r.powerSourceId!==r.itemId&&r.powerSourceId!==r.ammoId)html+=rawRuleHtml(powerDetail,"위력 출처 "+r.powerSourceId);
  html+='<p class="subtle">명목 위력은 방어력·저항 적용 전 값입니다. 실제위력은 OXCE의 기본 damage type 설정에 룰셋의 damageAlter를 덮어쓴 뒤, 선택한 적의 damageModifier와 전면 방어력을 적용한 명중 시 기대 HP 피해량입니다. 원본 룰 JSON은 명시 필드만 그대로 보여주며, 실제위력 계산에 사용한 엔진 기본값은 위의 유효 피해 보정 항목에 별도로 표시합니다. 커스텀 HitUnit/DamageUnit 계열 스크립트와 전투 중 이미 손상된 방어구 상태는 정적 계산으로 완전히 재현할 수 없어 ≈ 표기로 구분합니다.</p>';
  $("#detailBody").innerHTML=html;
  if(!$("#detailDialog").open)$("#detailDialog").showModal();
}
["search","distance"].forEach(id=>$("#"+id).addEventListener("input",()=>{void render()}));
$("#targetSearch").addEventListener("input",()=>{fillTargets(true);void render()});
["section","character","band","targetUnit","mode","kneel","oneHandPenalty"].forEach(id=>$("#"+id).addEventListener("change",()=>{if(id==="section"){sort={key:"effPerTu",dir:-1};$("#mode").value=""}void render()}));
$("#closeDialog").addEventListener("click",()=>$("#detailDialog").close());
$("#detailDialog").addEventListener("click",e=>{if(e.target.id==="detailDialog")e.currentTarget.close()});
load().catch(err=>{$("#summary").innerHTML='<article class="card metric"><strong>데이터 로드 실패</strong><span>'+esc(err.message)+'</span></article>';console.error(err)});
