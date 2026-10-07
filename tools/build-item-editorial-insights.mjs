import fs from "node:fs";
import path from "node:path";

const args=process.argv.slice(2);
const arg=(name,fallback=null)=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:fallback};
const dataDir=path.resolve(arg("--data","public/items/data"));
const outDir=path.resolve(arg("--out",dataDir));
const file=(...parts)=>path.join(dataDir,...parts);
const outFile=(...parts)=>path.join(outDir,...parts);
const readJson=(...parts)=>JSON.parse(fs.readFileSync(file(...parts),"utf8"));

const items=readJson("items-index.json").index||[];
const entities=readJson("entities.json").names||{};
const itemById=new Map(items.map(x=>[x.id,x]));
const detailBuckets=new Map();

function detailFor(row){
  if(!detailBuckets.has(row.bucket))detailBuckets.set(row.bucket,readJson("chunks",row.bucket+".json").details);
  return detailBuckets.get(row.bucket)[row.id];
}
function list(v){return Array.isArray(v)?v:[]}
function uniq(xs){return [...new Set(list(xs).filter(Boolean))]}
function ko(id){return entities[id]?.[0]||itemById.get(id)?.koName||id}
function names(ids,limit=4){
  const xs=uniq(ids).map(ko);
  if(!xs.length)return "";
  return xs.slice(0,limit).join("·")+(xs.length>limit?" 외 "+(xs.length-limit)+"개":"");
}
function num(v){return Number(v||0).toLocaleString("ko-KR")}
function pct(v){return Number.isFinite(v)?num(v)+"%":"—"}
function hasBatchim(s){const t=String(s||"").trim();for(let i=t.length-1;i>=0;i--){const c=t.charCodeAt(i);if(c>=0xac00&&c<=0xd7a3)return(c-0xac00)%28!==0;if(/[A-Za-z0-9]/.test(t[i]))return false}return false}
function topic(s){return String(s)+(hasBatchim(s)?"은":"는")}
function hasPath(ref,prefix){return list(ref?.paths).some(p=>p===prefix||p.startsWith(prefix+"."))}
function refsBySection(d,section){return list(d.otherReferences).filter(x=>x.section===section)}
function directPower(d){
  if(Number.isFinite(d.raw?.power))return d.raw.power;
  if(Number.isFinite(d.raw?.meleePower))return d.raw.meleePower;
  return null;
}
function modeTime(d,label){
  const key={연사:"costAuto",스냅:"costSnap",조준:"costAimed",근접:"costMelee",사용:"costUse"}[label];
  const v=key?d.raw?.[key]?.time:null;
  return Number.isFinite(v)?v:null;
}
function fireModeText(d){
  return list(d.fireModes).map(m=>{
    const t=Number.isFinite(m.tu)?m.tu:modeTime(d,m.label);
    const shots=Number(m.shots||1);
    const bits=[m.name||m.label];
    if(Number.isFinite(m.accuracy))bits.push("명중 "+pct(m.accuracy));
    if(Number.isFinite(t))bits.push("TU "+num(t));
    if(shots>1)bits.push(num(shots)+"타");
    return bits.join(" · ");
  }).join(" / ");
}
function bestMultiHit(d){
  const p=directPower(d);
  if(!(p>0))return null;
  let best=null;
  for(const m of list(d.fireModes)){
    const shots=Number(m.shots||1);
    if(shots<=1)continue;
    const time=Number.isFinite(m.tu)?m.tu:modeTime(d,m.label);
    const gross=p*shots;
    const perTu=Number.isFinite(time)&&time>0?gross/time:null;
    if(!best||gross>best.gross)best={name:m.name||m.label,shots,time,gross,perTu};
  }
  return best;
}
function kindName(kind){
  return ({weapon:"무기",ammo:"탄약",melee:"근접무기",grenade:"투척/폭발물",medical:"의료품",scanner:"스캐너",psi:"사이오닉 장비",flare:"특수/조명 아이템",corpse:"시체·잔해","damage-item":"공격 아이템",item:"일반 아이템"})[kind]||kind||"아이템";
}

function overview(row,d){
  const r=d.raw||{},p=directPower(d),ammo=list(d.compatibleAmmo),used=list(d.usedByWeapons);
  const campaignHeavy=(row.referenceCount>=80||row.researchCount>=10||row.manufactureCount>=5)&&["item","flare","corpse"].includes(d.kind);
  if(campaignHeavy)return topic(row.koName)+" 전투 스펙보다 연구·제조·이벤트에서 반복 참조되는 캠페인 자원 성격이 강하다. 현재 연구 "+num(row.researchCount)+"개, 제조 "+num(row.manufactureCount)+"개, 전체 역참조 "+num(row.referenceCount)+"개가 연결된다.";
  if(d.kind==="weapon"){
    if(ammo.length)return topic(row.koName)+" "+names(ammo,3)+"를 사용하는 무기 본체다. 본체의 명중·TU·사거리와 탄약의 실제 위력·피해형을 분리해서 봐야 한다.";
    if((r.maxRange??d.effectiveCore?.maxRange)<=1||r.clipSize===-1)return topic(row.koName)+" 별도 탄약 없이 직접 공격하는 근거리 무기다. 표시 위력보다 한 행동의 타격 수·명중·TU가 실전 화력을 크게 좌우한다.";
    return topic(row.koName)+" 자체 공격 규칙을 가진 무기다. 공격 모드마다 명중·TU·타격 수가 달라 단일 위력 숫자만으로 성능을 판단하면 안 된다.";
  }
  if(d.kind==="ammo")return topic(row.koName)+" "+(used.length?names(used,4)+"에서 쓰는 ":"")+"탄약이다. 실제 가치는 탄약의 위력·피해형·장탄량과 호환 무기의 사격 효율을 합쳐서 판단해야 한다.";
  if(d.kind==="medical")return topic(row.koName)+" 전투 중 회복을 위한 의료 아이템이다. 판매가보다 상처·체력·기절·기력·사기 회복량과 사용 TU가 핵심 가치다.";
  if(d.kind==="grenade")return topic(row.koName)+" 투척 후 폭발/효과를 내는 전술 아이템이다. 위력뿐 아니라 투척 비용·퓨즈·폭발 관련 규칙을 함께 봐야 한다.";
  if(d.kind==="scanner")return topic(row.koName)+" 직접 피해보다 탐지·정보 획득을 위한 장비다. 공격력보다 사용 행동과 탐지 관련 원본 규칙이 중요하다.";
  if(d.kind==="psi")return topic(row.koName)+" 사이오닉 행동용 장비다. 일반 무기처럼 위력 하나로 평가하기보다 psi 요구 조건과 사용 비용·효과를 확인해야 한다.";
  if(d.kind==="corpse")return topic(row.koName)+" 병사 장비가 아니라 회수 후 연구·판매·제조 등에 쓰이는 시체/잔해 자원이다.";
  if(d.kind==="flare")return topic(row.koName)+" battleType상 특수/조명 계열 아이템이다. 실제 용도는 카테고리·스크립트·연구/제조 역참조까지 확인해야 한다.";
  if(p>0)return topic(row.koName)+" 기본 위력 "+num(p)+"을 가진 "+kindName(d.kind)+"이다.";
  return topic(row.koName)+" "+kindName(d.kind)+"이다. 직접 전투 성능이 뚜렷하지 않다면 경제·연구·제조·이벤트 연결이 실제 역할을 결정한다.";
}

function effect(row,d){
  const r=d.raw||{},c=d.effectiveCore||{},p=directPower(d),mode=fireModeText(d),multi=bestMultiHit(d),parts=[];
  if(["weapon","melee","damage-item"].includes(d.kind)){
    if(mode)parts.push("공격 모드: "+mode+".");
    if(p>0)parts.push("직접 기본 위력은 "+num(p)+(d.damageTypeKo?" ("+d.damageTypeKo+")":"")+"이다.");
    if(list(d.compatibleAmmo).length)parts.push("호환 탄약은 "+names(d.compatibleAmmo,4)+"이며, 본체 위력이 0이거나 피해형이 비어 있다면 실제 피해 프로필은 장전 탄약 규칙이 좌우한다.");
    if(multi){
      let s=multi.name+"은 "+num(multi.shots)+"타 × 기본 위력 "+num(p)+" = 명목 총합 "+num(multi.gross)+"이다.";
      if(Number.isFinite(multi.time))s+=" 행동 비용은 TU "+num(multi.time)+(Number.isFinite(multi.perTu)?"이고 명목 기본위력/TU는 "+multi.perTu.toFixed(2):"")+"다.";
      s+=" 이 값은 명중·장갑·피해형·각 타격 판정 전 단순 합산이라 실제 기대피해와 같지 않다.";
      parts.push(s);
    }
    if(Number.isFinite(c.maxRange)&&c.maxRange<=1)parts.push("최대 사거리 "+num(c.maxRange)+"이라 사실상 인접 근접전 전용이다.");
  }else if(d.kind==="medical"){
    const charges=[];
    for(const [k,label] of [["heal","치료"],["stimulant","자극제"],["painKiller","진통제"]])if(Number.isFinite(r[k]))charges.push(label+" "+num(r[k]));
    if(charges.length)parts.push("룰상 사용량/횟수 필드는 "+charges.join(" · ")+"이다.");
    const rec=[];
    for(const [k,label] of [["woundRecovery","치명상"],["healthRecovery","체력"],["stunRecovery","기절"],["energyRecovery","기력"],["moraleRecovery","사기"],["manaRecovery","Mana"]])if(Number.isFinite(r[k]))rec.push(label+" "+(r[k]>0?"+":"")+num(r[k]));
    if(rec.length)parts.push("회복 직접값은 "+rec.join(" · ")+"이다.");
    if(Number.isFinite(r.costUse?.time))parts.push("사용 행동 비용은 TU "+num(r.costUse.time)+"이다.");
    if(r.isConsumable)parts.push("소모성으로 설정되어 있다.");
  }else if(d.kind==="ammo"){
    if(p>0)parts.push("탄약 기본 위력은 "+num(p)+(d.damageTypeKo?" ("+d.damageTypeKo+")":"")+"이다.");
    if(Number.isFinite(c.clipSize)&&c.clipSize>0)parts.push("장탄량은 "+num(c.clipSize)+"발이다.");
    if(list(d.usedByWeapons).length)parts.push("호환 무기는 "+names(d.usedByWeapons,5)+"이다.");
  }else if(d.kind==="grenade"){
    if(p>0)parts.push("기본 위력은 "+num(p)+(d.damageTypeKo?" ("+d.damageTypeKo+")":"")+"이다.");
    if(Number.isFinite(r.costThrow?.time))parts.push("투척 기본 TU는 "+num(r.costThrow.time)+"이다.");
    if(Number.isFinite(r.explosionRadius))parts.push("폭발 반경 직접값은 "+num(r.explosionRadius)+"이다.");
    if(Number.isFinite(r.fuseType))parts.push("퓨즈 유형 값은 "+num(r.fuseType)+"이다.");
  }else{
    if(p>0)parts.push("직접 위력 값은 "+num(p)+(d.damageTypeKo?" ("+d.damageTypeKo+")":"")+"이다.");
    if(Number.isFinite(c.armor)&&c.armor>0)parts.push("아이템 내구 값은 "+num(c.armor)+"이다.");
    if(r.specialType!=null)parts.push("specialType "+num(r.specialType)+"의 특수 아이템이다.");
    if(r.scripts&&Object.keys(r.scripts).length)parts.push("아이템 자체 스크립트가 있어 battleType과 정적 수치만으로 효과를 완전히 설명할 수 없다.");
  }
  if(!parts.length)parts.push("직접 전투 수치보다 연결된 연구·제조·이벤트에서 소비되는 역할을 보는 편이 중요하다.");
  return parts.join(" ");
}

function acquisition(row,d){
  const r=d.raw||{},parts=[];
  const ownResearch=list(d.research).find(x=>x.id===d.id&&hasPath(x,"name"));
  const ownManufacture=list(d.manufacture).find(x=>x.id===d.id&&hasPath(x,"name"));
  if(Number.isFinite(row.costBuy)&&row.costBuy>0){
    let s="구매가 "+num(row.costBuy);
    if(list(r.requiresBuy).length)s+=" · 구매 해금 조건 "+names(r.requiresBuy,4);
    parts.push(s+".");
  }else if(list(r.requiresBuy).length){
    parts.push("구매 조건 ID는 "+names(r.requiresBuy,4)+"지만 직접 구매가는 0/미설정이라 일반 상점 구매품으로 단정하면 안 된다.");
  }
  if(ownManufacture)parts.push("동명 제조식이 있으며 제조 시간은 "+num(ownManufacture.time)+", 비용은 "+num(ownManufacture.cost)+"으로 기록되어 있다.");
  if(ownResearch)parts.push("동명 연구와 직접 연결되어 있어 조사/해금 단계를 거치는 아이템이다.");
  const ev=refsBySection(d,"events");
  if(ev.length)parts.push("이벤트 역참조가 "+num(ev.length)+"개 있어 이벤트 지급·요구·조건 중 하나로 쓰일 수 있다. 정확한 방향은 아래 역참조 경로에서 확인해야 한다.");
  if(!parts.length)parts.push("현재 정규화 데이터에서 단일한 구매·동명 제조·동명 연구 경로가 뚜렷하지 않다. 전투 드랍·이벤트·맵 배치가 실제 획득 경로일 수 있다.");
  return parts.join(" ");
}

function progression(row,d){
  const parts=[],research=list(d.research),manufacture=list(d.manufacture);
  const dep=research.filter(x=>list(x.paths).some(p=>p.startsWith("dependencies.")));
  const free=research.filter(x=>list(x.paths).some(p=>p.startsWith("getOneFree.")));
  const req=manufacture.filter(x=>list(x.paths).some(p=>p.startsWith("requires.")||p.startsWith("requiredItems.")));
  if(row.researchCount)parts.push("연구 DB 참조는 "+num(row.researchCount)+"개"+(dep.length?"이며 선행관계 참조가 "+num(dep.length)+"개":"")+(free.length?", getOneFree 계열이 "+num(free.length)+"개":"")+"다.");
  if(row.manufactureCount)parts.push("제조 DB 참조는 "+num(row.manufactureCount)+"개"+(req.length?"이며 최소 "+num(req.length)+"개는 requires/재료 계열 경로에서 잡힌다.":"다."));
  if(row.referenceCount>=50)parts.push("전체 역참조 "+num(row.referenceCount)+"개로 매우 많아 여러 콘텐츠가 공유하는 핵심 ID일 가능성이 높다.");
  else if(row.referenceCount)parts.push("전체 역참조는 "+num(row.referenceCount)+"개다. 참조 수가 적더라도 어떤 필드에서 이 ID를 요구하는지는 아래 원본 역참조 경로로 확인할 수 있다.");
  if(!parts.length)parts.push("연구·제조·기타 룰에서 직접 확인되는 역참조가 거의 없어 독립적인 장비/자원에 가깝다.");
  return parts.join(" ");
}

function decision(row,d){
  const parts=[],sell=Number(row.costSell||0),buy=Number(row.costBuy||0),size=Number(row.size||0);
  if(sell>0){
    let s="판매가는 "+num(sell);
    if(buy>0)s+="이고 구매가 대비 회수율은 "+(sell/buy*100).toFixed(1)+"%";
    if(size>0)s+="이며 창고 1칸당 판매가 단순 환산은 약 "+num(Math.round(sell/size));
    parts.push(s+"이다.");
  }
  if(row.researchCount>=10||row.manufactureCount>=5)parts.push("연구/제조 연결이 많은 편이라 당장 현금이 필요하지 않다면 판매 전에 향후 병목 재료인지 확인하는 편이 안전하다.");
  if(d.kind==="weapon"&&list(d.compatibleAmmo).length)parts.push("무기 본체만 비교하지 말고 실제 확보 가능한 탄약의 위력·피해형·가격까지 묶어서 평가해야 한다.");
  if(d.kind==="weapon"&&bestMultiHit(d))parts.push("다단 공격은 명목 총합이 높아 보여도 각 타격 명중·방어 판정이 따로 들어갈 수 있으므로 단발 고위력 무기와 같은 방식으로 비교하면 안 된다.");
  if(d.kind==="medical")parts.push("의료품은 공격 기대값보다 전투 지속시간과 행동 복구 가치가 핵심이라 판매가만으로 우선순위를 정하기 어렵다.");
  if(["item","flare","corpse"].includes(d.kind)&&row.referenceCount>=80)parts.push("전투 슬롯보다 캠페인 진행 자원으로서 보관 가치가 높을 가능성이 크다.");
  if(!parts.length)parts.push("이 아이템의 우선순위는 직접 전투 성능보다 현재 세이브에서의 획득 난이도와 연결된 연구·제조 목표에 따라 달라진다.");
  return parts.slice(0,3).join(" ");
}

function caution(row,d){
  const r=d.raw||{},notes=[];
  if(r.twoHanded)notes.push("양손 장비다.");
  if(Number.isFinite(r.oneHandedPenalty)&&r.oneHandedPenalty!==50)notes.push("한손 관련 보정 값은 "+pct(r.oneHandedPenalty)+"다. 엔진 기준값과 결합되므로 이를 곧바로 '정확도 "+pct(r.oneHandedPenalty)+" 감소'로 읽으면 안 된다.");
  if(list(d.compatibleAmmo).length&&!(directPower(d)>0))notes.push("본체에 직접 위력이 없으므로 본체 수치만 보고 실제 피해량을 결론내리면 안 된다.");
  if(r.ignoreInCraftEquip)notes.push("기체 장비 목록에서는 무시되도록 설정되어 있다.");
  if(r.ignoreInBaseDefense)notes.push("기지방어 자동 장비 취급에서 제외되도록 설정되어 있다.");
  if(list(r.requires).includes("STR_UNAVAILABLE"))notes.push("일반 가용 조건에 STR_UNAVAILABLE이 걸려 있어 통상 구매/장비와 다른 획득·사용 경로를 가질 수 있다.");
  if(r.scripts&&Object.keys(r.scripts).length)notes.push("자체 스크립트가 있으므로 정적 수치만으로 모든 동작을 설명할 수 없다.");
  if(d.kind==="corpse")notes.push("시체/잔해의 내구·무게 같은 전투 필드는 회수 오브젝트 속성일 수 있어 병사 장비 성능으로 해석하면 안 된다.");
  if(!notes.length)notes.push("이 해설은 룰셋 직접값과 역참조를 조합한 것이다. 미션 스크립트가 동적으로 지급·제거하는 예외는 아래 원본 역참조에서 추가 확인할 수 있다.");
  return notes.slice(0,4).join(" ");
}

function expanded(text,fallback){const t=String(text||"").trim();return t.length>=45?t:[t,fallback].filter(Boolean).join(" ")}
function editorialFor(row){
  const d=detailFor(row);
  if(!d)throw new Error("Missing item detail "+row.id);
  return{
    overview:expanded(overview(row,d),"전투용인지 진행용인지 판단할 때 아래 직접 룰과 역참조를 함께 보는 것이 안전하다."),
    effect:expanded(effect(row,d),"단독 수치만으로 최종 성능을 단정하지 말고 호환 장비·탄약·스크립트와 함께 해석해야 한다."),
    acquisition:expanded(acquisition(row,d),"현재 보이는 경로가 전부가 아닐 수 있으므로 이벤트·미션·맵 배치 역참조도 함께 확인해야 한다."),
    progression:expanded(progression(row,d),"참조의 방향은 선행 조건·무료 지급·재료 요구처럼 서로 다르므로 아래 경로명을 함께 확인해야 한다."),
    decision:expanded(decision(row,d),"현재 세이브의 재고·자금·연구 목표가 달라지면 보관·판매·장비 우선순위도 달라질 수 있다."),
    watch:expanded(caution(row,d),"표시 수치는 원본 룰을 요약한 것이며 엔진 보정이나 스크립트 예외가 있으면 실제 동작은 달라질 수 있다.")
  };
}

const buckets={};
let totalChars=0;
for(const row of items){
  const editorial=editorialFor(row);
  totalChars+=Object.values(editorial).reduce((n,x)=>n+String(x||"").length,0);
  (buckets[row.bucket]||={})[row.id]=editorial;
}
const dir=outFile("item-editorial-chunks");
fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
for(const [bucket,details] of Object.entries(buckets))fs.writeFileSync(path.join(dir,bucket+".json"),JSON.stringify({details}));
const meta={
  version:1,
  generator:"GPT item editorial synthesis v1",
  evidence:"ruleset-and-derived-links",
  generatedFrom:["items-index.json","chunks","entities.json"],
  count:items.length,
  averageChars:Math.round(totalChars/Math.max(1,items.length))
};
fs.writeFileSync(outFile("item-editorial-meta.json"),JSON.stringify(meta,null,2));
console.log(JSON.stringify(meta));
