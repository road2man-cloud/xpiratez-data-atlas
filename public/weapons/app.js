let DATA=null;
const SECTION_CACHE={};
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
    const res=await fetch("../data/"+rel);
    if(!res.ok)throw new Error(rel+" 로드 실패: "+res.status);
    return res.json();
  }));
  SECTION_CACHE[key]=parts.flatMap(x=>Array.isArray(x.rows)?x.rows:[]);
  return SECTION_CACHE[key];
}
async function load(){
  DATA=await (await fetch("../data/weapons-index.json")).json();
  fillCharacters();
  renderSummary();
  await render();
}
function renderSummary(){
  const c=DATA.counts;
  $("#summary").innerHTML=[
    ["사격 비교행",fmt(c.shooting,0)+"개","무기 × 탄종 × 사격모드"],
    ["근접 공격",fmt(c.melee,0)+"개","전용 근접 + 총기 보조공격"],
    ["투척 무기",fmt(c.throwing,0)+"개","수류탄·투척 카테고리"],
    ["기준 캐릭터",fmt(c.characters,0)+"개","기본 병종 + 실제 생성 프로필"]
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
function character(){
  return DATA.characters.find(x=>x.id===$("#character").value)||DATA.characters[0];
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
  return {
    ...r,effPower:power,actionPower:total,rangePower,rangeActionPower,tu,
    effPerTu:tu&&rangeActionPower!=null?rangeActionPower/tu:null,
    nominalPerTu:tu?total/tu:null,effAccuracy:acc,inRange,hardMaxRange:hardMax,
    physicalThrowRange:phys,costEnergy:Number(r.cost?.energy)||0,requiresText:(r.requires||[]).join(" · ")
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
  $(".mode-filter").style.display=section==="shooting"?"grid":"none";
  $("#kneel").parentElement.style.display=section==="shooting"?"flex":"none";
  $("#oneHandPenalty").parentElement.style.display=section==="shooting"?"flex":"none";
  $(".distance").style.display=section==="melee"?"none":"grid";
  $("#tableTitle").textContent={shooting:"사격 무기 — 무기 × 탄종 × 모드",melee:"근접 공격",throwing:"투척 무기"}[section];
  const h=section==="shooting"?[
    th("무기","koName"),th("탄약","ammoKoName"),th("모드","modeKo"),th("피해","damageTypeKo"),th("1타 명목위력","effPower"),th("총 명목위력","actionPower"),
    th("총위력@거리","rangeActionPower"),th("TU","tu"),th("위력/TU@거리","effPerTu"),th("ACC@거리","effAccuracy"),th("기본 ACC","baseAccuracy"),th("유효거리","effectiveRange"),th("최대사거리","maxRange"),th("Drop","dropoff"),
    th("발수","shots"),th("펠릿","pellets"),th("탄창","clipSize"),th("탄약가","ammoCostBuy"),th("무게","weight"),th("구매가","costBuy"),th("해금","requiresText")
  ]:section==="melee"?[
    th("무기","koName"),th("피해","damageTypeKo"),th("명목위력","effPower"),th("TU","tu"),th("위력/TU","effPerTu"),th("ACC","effAccuracy"),
    th("기본 위력","basePower"),th("기본 ACC","baseAccuracy"),th("에너지","costEnergy"),th("무게","weight"),th("구매가","costBuy"),th("해금","requiresText")
  ]:[
    th("무기","koName"),th("피해","damageTypeKo"),th("명목위력","effPower"),th("TU","tu"),th("위력/TU@거리","effPerTu"),th("ACC@거리","effAccuracy"),
    th("물리 최대거리","physicalThrowRange"),th("규칙 최대거리","throwRange"),th("무게","weight"),th("폭발반경","blastRadius"),th("프라임","primeCost"),th("구매가","costBuy"),th("해금","requiresText")
  ];
  $("#weaponTable thead").innerHTML="<tr>"+h.join("")+"</tr>";
  const a=rows();$("#rowCount").textContent=a.length+"개 · "+c.koName+" · 거리 "+($("#distance").value||0)+"칸";
  $("#weaponTable tbody").innerHTML=a.map(r=>rowHtml(r,section)).join("");
  document.querySelectorAll("th[data-sort]").forEach(el=>el.addEventListener("click",()=>{const k=el.dataset.sort;if(sort.key===k)sort.dir*=-1;else sort={key:k,dir:k==="koName"?1:-1};void render()}));
  document.querySelectorAll("tbody tr").forEach(el=>el.addEventListener("click",()=>openDetail(decodeURIComponent(el.dataset.id))));
}
function rowHtml(r,section){
  const first='<td><span class="name">'+esc(r.koName)+'</span><span class="id">'+esc(r.itemId)+'</span>'+scriptMark(r)+"</td>";
  if(section==="shooting")return '<tr data-id="'+encodeURIComponent(r.id)+'">'+first+
    '<td><span class="ammo">'+esc(r.ammoKoName)+'</span><span class="id">'+esc(r.ammoId)+'</span></td><td>'+esc(r.modeKo)+'</td><td class="damage">'+esc(r.damageTypeKo||"—")+'</td>'+
    '<td class="num-strong">'+fmt(r.effPower)+'</td><td class="num-strong good">'+fmt(r.actionPower)+'</td><td class="num-strong">'+rangeNum(r,r.rangeActionPower)+'</td><td>'+fmt(r.tu,0)+'</td><td class="num-strong">'+rangeNum(r,r.effPerTu,2)+'</td><td class="num-strong">'+rangePct(r,r.effAccuracy)+'</td>'+
    '<td>'+pct(r.baseAccuracy)+'</td><td>'+fmt(r.effectiveRange,0)+'</td><td>'+fmt(r.maxRange,0)+'</td><td>'+fmt(r.dropoff,0)+'</td><td>'+fmt(r.shots,0)+'</td><td>'+fmt(r.pellets,0)+'</td><td>'+fmt(r.clipSize,0)+'</td><td>'+fmt(r.ammoCostBuy,0)+'</td><td>'+fmt(r.weight)+'</td><td>'+fmt(r.costBuy,0)+'</td><td>'+reqHtml(r)+'</td></tr>';
  if(section==="melee")return '<tr data-id="'+encodeURIComponent(r.id)+'">'+first+
    '<td class="damage">'+esc(r.damageTypeKo||"—")+'</td><td class="num-strong">'+fmt(r.effPower)+'</td><td>'+fmt(r.tu,0)+'</td><td class="num-strong good">'+fmt(r.effPerTu,2)+'</td><td class="num-strong">'+pct(r.effAccuracy)+'</td>'+
    '<td>'+fmt(r.basePower)+'</td><td>'+pct(r.baseAccuracy)+'</td><td>'+fmt(r.cost?.energy,0)+'</td><td>'+fmt(r.weight)+'</td><td>'+fmt(r.costBuy,0)+'</td><td>'+reqHtml(r)+'</td></tr>';
  return '<tr data-id="'+encodeURIComponent(r.id)+'">'+first+
    '<td class="damage">'+esc(r.damageTypeKo||"—")+'</td><td class="num-strong">'+fmt(r.effPower)+'</td><td>'+fmt(r.tu,0)+'</td><td class="num-strong good">'+rangeNum(r,r.effPerTu,2)+'</td><td class="num-strong">'+rangePct(r,r.effAccuracy)+'</td>'+
    '<td class="num-strong">'+fmt(r.physicalThrowRange,1)+'</td><td>'+fmt(r.throwRange,0)+'</td><td>'+fmt(r.weight)+'</td><td>'+fmt(r.blastRadius,1)+'</td><td>'+fmt(r.primeCost,0)+'</td><td>'+fmt(r.costBuy,0)+'</td><td>'+reqHtml(r)+'</td></tr>';
}
function findRow(id){return sectionRows().find(x=>x.id===id)}
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
function openDetail(id){
  const raw=findRow(id);if(!raw)return;const r=computed(raw),s=stats(),c=character();
  const bonus=evalBonus(r.damageBonus,s),accMult=evalBonus(r.accuracyBonus,s);
  let html='<p class="eyebrow">'+({shooting:"사격",melee:"근접",throwing:"투척"}[r.section])+' 계산 상세</p><h2>'+esc(r.koName)+'</h2><p class="muted">'+esc(r.itemId)+(r.ammoId?" · "+esc(r.ammoKoName)+" / "+esc(r.ammoId):"")+'</p>';
  html+='<div class="detail-grid"><div class="box"><strong>기준 캐릭터</strong>'+esc(c.koName)+'</div><div class="box"><strong>1타 명목위력</strong>'+fmt(r.effPower)+'</div><div class="box"><strong>총 명목위력</strong>'+fmt(r.actionPower)+'</div><div class="box"><strong>총위력@거리</strong>'+esc(rangeText(r,r.rangeActionPower))+'</div><div class="box"><strong>행동 TU</strong>'+fmt(r.tu,0)+'</div><div class="box"><strong>위력/TU@거리</strong>'+esc(rangeText(r,r.effPerTu,2))+'</div></div>';
  html+='<h3>위력 계산</h3><div class="formula">기본 위력 '+fmt(r.basePower)+' + 스탯 보너스 '+(bonus==null?"SCRIPT":fmt(bonus))+' = 1타 명목위력 '+fmt(r.effPower)+(r.section==="shooting"?'\n총 명목위력 = '+fmt(r.effPower)+' × '+fmt(r.shots,0)+'발 × '+fmt(r.pellets,0)+'펠릿 = '+fmt(r.actionPower)+'\n선택 거리 '+fmt(Number($("#distance").value)||0,0)+'칸 총위력 = '+rangeText(r,r.rangeActionPower):"")+'\n보너스식: '+esc(bonusFormula(r.damageBonus))+'</div>';
  html+='<h3>정확도 계산</h3><div class="formula">스탯 multiplier '+(accMult==null?"SCRIPT":fmt(accMult))+' × 기본 ACC '+fmt(r.baseAccuracy)+'% / 100 → '+pct(baseAccuracy(r,s))+'\n거리/자세 보정 후 = '+(r.inRange?pct(r.effAccuracy):"사거리 밖")+(r.hardMaxRange!=null?'\n하드 최대사거리 = '+fmt(r.hardMaxRange,1)+'칸':"")+'\nmultiplier식: '+esc(bonusFormula(r.accuracyBonus))+'</div>';
  html+='<div class="detail-grid"><div class="box"><strong>피해유형</strong>'+esc(r.damageTypeKo||"—")+'</div><div class="box"><strong>ArmorEffectiveness</strong>'+fmt(r.armorEffectiveness,2)+'</div><div class="box"><strong>ToHealth / ToStun</strong>'+fmt(r.toHealth,2)+' / '+fmt(r.toStun,2)+'</div><div class="box"><strong>ToTile</strong>'+fmt(r.toTile,2)+'</div></div>';
  if(r.section==="throwing")html+='<h3>투척거리</h3><div class="formula">동일 고도 OXCE 물리 투척거리 = '+fmt(r.physicalThrowRange,1)+'칸\n근력 '+fmt(s.strength)+' / 무게 '+fmt(r.weight)+' / 아이템 규칙 상한 '+fmt(r.throwRange,0)+'칸</div>';
  const research=[...(r.research||[]),...(r.ammoResearch||[])],manufacture=[...(r.manufacture||[]),...(r.ammoManufacture||[])];
  html+='<h3>해금/획득/출처</h3><div class="detail-grid"><div class="box"><strong>직접 조건</strong>'+(r.requires?.length?r.requires.map(x=>'<span class="tag">'+esc(x)+'</span>').join(" "):"없음/특수")+'</div><div class="box"><strong>구매/판매</strong>'+fmt(r.costBuy,0)+' / '+fmt(r.costSell,0)+(r.ammoId?' <br><span class="subtle">탄약 '+fmt(r.ammoCostBuy,0)+' / '+fmt(r.ammoCostSell,0)+'</span>':'')+'</div><div class="box"><strong>분류</strong>'+r.categories.map(x=>'<span class="tag">'+esc(x)+'</span>').join(" ")+'</div><div class="box"><strong>룰 파일</strong>'+esc((r.sourceFiles||[]).join(", ")||"—")+'</div></div>';
  html+='<div class="detail-grid"><div class="box"><strong>관련 연구</strong>'+(research.length?research.map(x=>esc(x.koName||x.id)+(x.cost!=null?' ('+fmt(x.cost,0)+')':'')).join('<br>'):'—')+'</div><div class="box"><strong>관련 제조</strong>'+(manufacture.length?manufacture.map(x=>esc(x.koName||x.id)+(x.time!=null?' · '+fmt(x.time,0)+'h':'')+(x.cost!=null?' · '+fmt(x.cost,0):'')).join('<br>'):'—')+'</div></div>';
  html+='<p class="subtle">위력은 대상 방어력·저항·damageAlter의 RandomType에 따른 실제 피해 주사위 적용 전 값입니다. 커스텀 스크립트 보정은 정적 DB에서 정확히 실행할 수 없어 SCRIPT*로 표시합니다.</p>';
  $("#detailBody").innerHTML=html;$("#detailDialog").showModal();
}
["search","distance"].forEach(id=>$("#"+id).addEventListener("input",()=>{void render()}));
["section","character","band","mode","kneel","oneHandPenalty"].forEach(id=>$("#"+id).addEventListener("change",()=>{if(id==="section"){sort={key:"effPerTu",dir:-1};$("#mode").value=""}void render()}));
$("#closeDialog").addEventListener("click",()=>$("#detailDialog").close());
$("#detailDialog").addEventListener("click",e=>{if(e.target.id==="detailDialog")e.currentTarget.close()});
load().catch(err=>{$("#summary").innerHTML='<article class="card metric"><strong>데이터 로드 실패</strong><span>'+esc(err.message)+'</span></article>';console.error(err)});
