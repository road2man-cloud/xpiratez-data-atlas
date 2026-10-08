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
const usageBuckets=new Map();

function detailFor(row){
  if(!detailBuckets.has(row.bucket))detailBuckets.set(row.bucket,readJson("chunks",row.bucket+".json").details);
  return detailBuckets.get(row.bucket)[row.id];
}
function usageFor(row){
  if(!usageBuckets.has(row.bucket))usageBuckets.set(row.bucket,readJson("item-usage-chunks",row.bucket+".json").details);
  const usage=usageBuckets.get(row.bucket)[row.id];
  if(!usage)throw new Error("Missing cross-system item usage "+row.id);
  return usage;
}
function list(v){return Array.isArray(v)?v:[]}
function uniq(xs){return [...new Set(list(xs).filter(Boolean))]}
function cleanName(v){return String(v??"").replace(/\s+/g," ").trim()}
function ko(id){return cleanName(entities[id]?.[0]||itemById.get(id)?.koName||id)}
function names(ids,limit=4){
  const xs=uniq(ids).map(ko);
  if(!xs.length)return "";
  return xs.slice(0,limit).join("·")+(xs.length>limit?" 외 "+(xs.length-limit)+"개":"");
}
function num(v){return Number(v||0).toLocaleString("ko-KR")}
function pct(v){return Number.isFinite(v)?num(v)+"%":"—"}
function hasBatchim(s){const t=String(s||"").trim();for(let i=t.length-1;i>=0;i--){const c=t.charCodeAt(i);if(c>=0xac00&&c<=0xd7a3)return(c-0xac00)%28!==0;if(/[A-Za-z0-9]/.test(t[i]))return false}return false}
function topic(s){const v=cleanName(s);return v+(hasBatchim(v)?"은":"는")}
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
const sectionKo={armors:"방어구",ufopaedia:"UFOPEDIA",alienDeployments:"미션/배치",items:"다른 아이템",units:"유닛",events:"이벤트",terrains:"지형",ufos:"UFO",craftWeapons:"기체 무장",commendations:"훈장",crafts:"기체",alienRaces:"종족",startingConditions:"시작 조건",soldiers:"병사",facilities:"시설",enviroEffects:"환경 효과",soldierTransformation:"병사 변신",soldierBonuses:"병사 특성",alienFuel:"연료"};
function groupedOtherReferences(d){
  const groups=new Map();
  for(const x of list(d.otherReferences)){
    if(x.section==="events")continue;
    if(!groups.has(x.section))groups.set(x.section,[]);
    groups.get(x.section).push(x);
  }
  return [...groups.entries()].sort((a,b)=>b[1].length-a[1].length);
}
function otherSectionSummary(d,limit=3){
  return groupedOtherReferences(d).slice(0,limit).map(([k,xs])=>(sectionKo[k]||k)+" "+num(xs.length)+"회").join(" · ");
}
function otherReferenceDetail(d,limitSections=2,limitNames=2){
  return groupedOtherReferences(d).slice(0,limitSections).map(([k,xs])=>{
    const label=sectionKo[k]||k;
    const ids=uniq(xs.map(x=>x.id));
    const shown=ids.slice(0,limitNames).map(ko).join("·");
    return label+" "+(shown||num(xs.length)+"회")+(ids.length>limitNames?" 외 "+num(ids.length-limitNames)+"개":"");
  }).join(" / ");
}

function overview(row,d,u){
  const r=d.raw||{},p=directPower(d),ammo=list(d.compatibleAmmo),used=list(d.usedByWeapons);
  if(Number(row.monthlyMaintenance)<0)return topic(row.koName)+" 보유 시 월 유지비 "+num(row.monthlyMaintenance)+"로 매월 "+num(-row.monthlyMaintenance)+"의 비용 절감 효과가 있는 경제 아이템이다. 단순 판매가 "+num(row.costSell)+"보다 장기 반복 수입의 가치가 크며 보유 기간에 따라 판단해야 한다.";
  const campaignHeavy=(row.referenceCount>=80||row.researchCount>=10||row.manufactureCount>=5)&&["item","flare","corpse"].includes(d.kind);
  if(campaignHeavy)return topic(row.koName)+" 전투 스펙보다 연구·제조·이벤트에서 반복 참조되는 캠페인 자원 성격이 강하다. 현재 연구 "+num(row.researchCount)+"개, 제조 "+num(row.manufactureCount)+"개, 전체 역참조 "+num(row.referenceCount)+"개가 연결된다.";
  if((r.hiddenOnMinimap||r.invWidth===0)&&list(u.consumes).length&&["item","flare"].includes(d.kind))return topic(row.koName)+" 전술 조명 장비라기보다 제조 "+num(u.consumes.length)+"곳에서 실제 소모되는 특수 자원이다. 특히 "+names(list(u.consumes).sort((a,b)=>a.qty-b.qty).map(x=>x.id),3)+"에 투입되므로 각 사용처의 수량·산출물·연구 조건을 비교해야 한다.";
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
    if(Number.isFinite(r.armor)&&r.armor>0)parts.push("룰셋에 명시된 아이템 내구 값은 "+num(r.armor)+"이다.");
    if(r.specialType!=null)parts.push("specialType "+num(r.specialType)+"의 특수 아이템이다.");
    if(r.scripts&&Object.keys(r.scripts).length)parts.push("아이템 자체 스크립트가 있어 battleType과 정적 수치만으로 효과를 완전히 설명할 수 없다.");
  }
  if(!parts.length){
    if(row.researchCount||row.manufactureCount){
      const links=[];
      if(row.researchCount)links.push("연구 "+num(row.researchCount)+"곳");
      if(row.manufactureCount)links.push("제조 "+num(row.manufactureCount)+"곳");
      parts.push("직접 전투 효과는 확인되지 않고 "+links.join("·")+"에서 조건·재료·보상 등의 형태로 참조된다. 이 아이템의 실질 효과는 그 연결을 진행시키는 캠페인 자원 역할에 가깝다.");
    }else if(row.referenceCount){
      parts.push("직접 전투 효과는 확인되지 않지만 다른 룰에서 "+num(row.referenceCount)+"회 참조된다. 전투 장비라기보다 이벤트·유닛·맵·스크립트에서 쓰이는 상태/자원 ID일 가능성이 높다.");
    }else if(Number(row.costBuy||0)>0||Number(row.costSell||0)>0){
      const econ=[];
      if(Number(row.costBuy||0)>0)econ.push("구매 "+num(row.costBuy));
      if(Number(row.costSell||0)>0)econ.push("판매 "+num(row.costSell));
      parts.push("직접 전투 효과와 뚜렷한 진행 역참조는 확인되지 않는다. 현재 룰에서 분명한 기능은 "+econ.join("·")+"의 경제/수집 가치 쪽이다.");
    }else{
      parts.push("정적 룰에서 직접 전투 효과나 뚜렷한 역참조가 확인되지 않는다. 장식·맵 오브젝트·스크립트 전용 표식처럼 정규화된 수치만으로 용도를 확정하기 어려운 항목이다.");
    }
  }
  return parts.join(" ");
}

function usesEditorial(row,u){
  const consumers=list(u.consumes),transforms=list(u.transformations),flags=list(u.researchUnlocks);
  const output=x=>{
    const fixed=list(x.output?.fixed).map(v=>ko(v.id)+(v.qty!==1?" ×"+num(v.qty):""));
    const other=list(x.output?.other).map(v=>ko(v.id)+(v.kind==="person"?" (병사)":" (기체)"));
    const known=[...fixed,...other].slice(0,3).join("·");
    const random=list(x.output?.randomSample).slice(0,4).map(v=>ko(v.id)+(v.qty!==1?" ×"+num(v.qty):"")).join("·");
    return [known,random?"랜덤 후보 "+random+(x.output.randomOptions>4?" 등":""):""].filter(Boolean).join(" + ")||"원본 제조식에서 산출 확인";
  };
  if(consumers.length){
    const preview=consumers.slice().sort((a,b)=>a.qty-b.qty).slice(0,5).map(x=>ko(x.id)+" ×"+num(x.qty)+" → "+output(x));
    return topic(row.koName)+" 제조 "+num(consumers.length)+"곳에서 실물 재료로 직접 소비된다. 대표 사용처(제조 1회 기준): "+preview.join(" / ")+(consumers.length>5?" / 그 외 "+num(consumers.length-5)+"곳은 아래 전체 목록 참조":"")+". 연구 선행조건에 등장하는 것은 실물 소비와 구분한다.";
  }
  if(transforms.length)return topic(row.koName)+" 제조 소모처는 없지만 병사 훈련/변신 "+num(transforms.length)+"곳에서 실물 "+transforms.slice(0,3).map(x=>"×"+num(x.qty)+"("+ko(x.id)+")").join("·")+"이 필요하다. 연구 플래그와 달리 훈련별 재료를 준비해야 한다.";
  if(flags.length)return topic(row.koName)+" 제조 재료로 소비되지 않지만 "+names(flags.map(x=>x.id),4)+"의 연구 선행 플래그로 참조된다. 이는 아이템 수량을 차감하는 소비처가 아니다.";
  return topic(row.koName)+" 확인된 제조·훈련 실물 소비처는 없다. 연구 선행 조건은 아이템 소모가 아니며 이벤트·맵 사용은 별도 근거에서 확인해야 한다.";
}
function economyEditorial(row,u){
  const ec=u.economy||{},maintenance=Number(ec.monthlyMaintenance||0),sell=ec.sellValue??row.costSell;
  const out=[];
  if(maintenance<0){
    out.push("월 유지비 "+num(maintenance)+"은 명시된 음수 유지비다. 보유 중 월 "+num(-maintenance)+"만큼 유지비를 줄이는 경제 효과가 있으므로 단순 판매가보다 반복 절감이 핵심 가치다.");
    if(sell>0&&Number.isFinite(ec.holdingMonthsToExceedSale))
      out.push("판매가 "+num(sell)+"와 비교하면 약 "+ec.holdingMonthsToExceedSale.toFixed(2)+"개월의 절감액이 한 번의 판매대금을 넘는다(유지비가 매월 적용된다는 전제).");
  }else if(maintenance>0)out.push("월 유지비 "+num(maintenance)+"의 반복 비용이 설정돼 있다. 한 번의 구매가보다 보유 기간 동안의 총비용이 중요하다.");
  else out.push(topic(row.koName)+" 월 유지비가 설정되지 않았다. "+(sell==null?"원본 판매가는 확인되지 않는다.":"원본 판매가는 "+num(sell)+"이다.")+" 판매/보유 판단에는 실제 제조·연구의 실물 사용처와 재조달 경로를 함께 확인해야 한다.");
  if(typeof (ec.size??row.size)==="number"&&(ec.size??row.size)<0)out.push("창고 크기도 "+(ec.size??row.size)+"로 음수 설정돼 있다. 실제 공간 처리 효과는 엔진에서 확인할 필요가 있다.");
  if(list(u.consumes).length>0&&maintenance<0)out.push("재료로 소비하면 해당 아이템 보유에 따른 월 유지비 절감도 포기할 수 있으므로 소모와 보유를 비교해야 한다.");
  return out.join(" ");
}
function supplyEditorial(row,u){
  const events=list(u.eventGrants),production=list(u.produces);
  const grants=events.filter(x=>x.kind==="fixed"),random=events.filter(x=>x.kind!=="fixed");
  const parts=[];
  if(grants.length)parts.push("확정 이벤트 보상 "+num(new Set(grants.map(x=>x.id)).size)+"곳(예: "+names(grants.map(x=>x.id),3)+")");
  if(random.length)parts.push("랜덤 이벤트 후보 "+num(new Set(random.map(x=>x.id)).size)+"곳(발생/당첨 보장 아님)");
  if(production.length)parts.push("제조 산출 "+num(new Set(production.map(x=>x.id)).size)+"개 제조식(예: "+names(production.map(x=>x.id),3)+")");
  return parts.length?"실제 아이템 지급·생산 경로: "+parts.join(" · ")+". 이 목록은 연구 선행 플래그와 구분된다.":"";
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
  const ev=refsBySection(d,"events"),otherDetail=otherReferenceDetail(d);
  if(ev.length)parts.push("이벤트 역참조가 "+num(ev.length)+"개 있으며 대표 연결은 "+names(ev.map(x=>x.id),3)+"이다. 지급·요구·조건 중 어느 방향인지는 아래 역참조 경로에서 확인해야 한다.");
  if(otherDetail&&parts.length)parts.push("추가 배치/사용 단서는 "+otherDetail+" 쪽에 있다.");
  if(!parts.length){
    const other=otherSectionSummary(d);
    if(other)parts.push("일반 구매·동명 제조·동명 연구 경로는 잡히지 않지만 "+other+"에서 이 아이템을 참조한다. 대표 연결은 "+otherReferenceDetail(d,2,3)+"이며 실제 획득·배치 경로를 찾을 때 이 역참조를 먼저 확인하는 편이 정확하다.");
    else if(d.kind==="corpse")parts.push("구매·동명 제조·동명 연구·이벤트 역참조가 잡히지 않는다. 시체/잔해 계열이므로 전투·맵에서 회수되는 오브젝트일 수 있으나, 자동 데이터만으로 획득 장소를 특정하지는 않는다.");
    else if(["weapon","ammo","medical","grenade","scanner","psi"].includes(d.kind))parts.push("표준 구매·동명 제조·동명 연구·이벤트 경로가 자동 검출되지 않는다. 적 장비, 맵 배치, 미션 스크립트 지급 같은 비정형 획득 가능성을 원본 역참조에서 확인해야 한다.");
    else parts.push("표준 구매·동명 제조·동명 연구·이벤트 경로가 자동 검출되지 않는다. 맵 배치·스크립트 지급·내부 표식처럼 일반 해금표 밖의 경로일 수 있다.");
  }
  return parts.join(" ");
}

function progression(row,d,u){
  const parts=[],research=list(d.research),manufacture=list(d.manufacture);
  const dep=research.filter(x=>list(x.paths).some(p=>p.startsWith("dependencies.")));
  const free=research.filter(x=>list(x.paths).some(p=>p.startsWith("getOneFree.")));
  const recipes=new Set([...list(u.consumes),...list(u.produces),...list(u.manufactureResearchGates)].map(x=>x.id));
  if(row.researchCount)parts.push("연구 DB 참조는 "+num(row.researchCount)+"개"+(dep.length?"이며 선행관계 참조가 "+num(dep.length)+"개":"")+(free.length?", getOneFree 계열이 "+num(free.length)+"개":"")+"다.");
  if(recipes.size)parts.push("제조 관련 제조식은 "+num(recipes.size)+"곳이며, 실제 재료 소모 "+num(list(u.consumes).length)+"곳·생산 "+num(new Set(list(u.produces).map(x=>x.id)).size)+"곳이다. requires 연구 플래그와 requiredItems 실물 재료를 분리해 집계했다.");
  if(row.referenceCount>=50)parts.push("전체 역참조 "+num(row.referenceCount)+"개로 매우 많아 여러 콘텐츠가 공유하는 핵심 ID일 가능성이 높다."+ (otherSectionSummary(d)?" 주요 기타 참조는 "+otherSectionSummary(d)+"다.":""));
  else if(row.referenceCount){
    const detail=otherReferenceDetail(d,2,2);
    parts.push("전체 역참조는 "+num(row.referenceCount)+"개다."+ (detail?" 대표 연결은 "+detail+"이다.":"")+" 어떤 필드에서 이 ID를 요구하는지는 아래 원본 역참조 경로로 확인할 수 있다.");
  }
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
  if(!parts.length){
    if(row.researchCount||row.manufactureCount){
      const links=[];
      if(row.researchCount)links.push("연구 "+num(row.researchCount)+"개");
      if(row.manufactureCount)links.push("제조 "+num(row.manufactureCount)+"개");
      parts.push(links.join("·")+"와 연결되어 있으므로 당장 쓰지 않더라도 진행 병목 재료인지 확인한 뒤 판매·소모하는 편이 안전하다.");
    }else if(row.referenceCount){
      const detail=otherReferenceDetail(d,2,2);
      parts.push("전체 역참조가 "+num(row.referenceCount)+"개라 독립적인 장비라기보다 특정 콘텐츠와 함께 쓰이는 항목에 가깝다."+ (detail?" 대표 연결은 "+detail+"이다.":"")+" 해당 역참조의 용도를 확인한 뒤 보관 여부를 결정하는 편이 낫다.");
    }else if(d.kind==="weapon"){
      parts.push("연구·제조·경제 연결이 거의 없는 무기라면 현재 보유 전력에서 공격 모드·탄약·사거리의 실전 효율이 보관 여부를 결정한다.");
    }else if(d.kind==="ammo"){
      parts.push("진행 연결이 거의 없는 탄약이라면 현재 실제로 사용하는 호환 무기가 있는지가 보관 가치의 핵심이다.");
    }else if(d.kind==="corpse"){
      parts.push("직접 진행 역참조와 판매 가치가 없다면 장기 보관 우선순위는 낮다. 다만 미션·연구 스크립트의 동적 요구는 정적 역참조에서 빠질 수 있다.");
    }else{
      parts.push("현재 데이터에서 직접 전투·경제·진행 가치가 뚜렷하지 않다. 특정 이벤트나 스크립트 목적이 확인되지 않는다면 우선순위를 높게 둘 근거는 적다.");
    }
  }
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
  if(!notes.length){
    if(d.kind==="weapon"&&list(d.compatibleAmmo).length)notes.push("본체와 탄약의 역할이 분리되어 있으므로 본체 수치만으로 실제 피해·운용비를 판단하면 안 된다.");
    else if(d.kind==="ammo"&&list(d.usedByWeapons).length)notes.push("탄약 자체 수치가 좋아도 호환 무기의 명중·TU·발사 방식에 따라 실제 효율이 크게 달라진다.");
    else if(row.referenceCount>=50)notes.push("역참조가 "+num(row.referenceCount)+"개로 많지만, 참조된다는 사실만으로 지급·소모·해금 중 어느 방향인지 단정할 수 없다. 아래 경로명을 함께 확인해야 한다.");
    else if(row.referenceCount>0)notes.push("정적 역참조 "+num(row.referenceCount)+"개가 확인되지만 각 참조의 방향은 지급·요구·배치 등 서로 다를 수 있다. 경로 이름을 확인하지 않고 효과를 추정하면 안 된다.");
    else if(Number(row.costSell||0)>0||Number(row.costBuy||0)>0)notes.push("가격이 설정되어 있어도 안정적으로 반복 구매·획득 가능한지는 별개다. 해금 조건이나 실제 공급 경로가 확인되지 않으면 경제 효율을 과대평가할 수 있다.");
    else notes.push("정적 룰에서 별도 경고 조건이나 역참조가 거의 보이지 않는다. 이것이 곧 '아무 기능 없음'을 뜻하지는 않으며 맵·미션 스크립트 전용 사용은 남을 수 있다.");
  }
  return notes.slice(0,4).join(" ");
}

function expanded(text,fallback){const t=String(text||"").trim();return t.length>=45?t:[t,fallback].filter(Boolean).join(" ")}
function effectFallback(row,d){
  const r=d.raw||{};
  if(Number.isFinite(r.armor)&&r.armor>0)return "이 내구 값은 아이템 오브젝트 자체의 내구성 계열 값이며 병사의 방어력에 그대로 더하는 수치로 해석하면 안 된다.";
  if(row.researchCount||row.manufactureCount){
    const bits=[];
    if(row.researchCount)bits.push("연구 "+num(row.researchCount)+"곳");
    if(row.manufactureCount)bits.push("제조 "+num(row.manufactureCount)+"곳");
    return "직접 전투 성능보다 "+bits.join("·")+"에서 이 ID를 어떻게 소비·요구하는지가 실질 효과를 결정한다.";
  }
  if(row.referenceCount)return "직접 수치 효과가 짧게 보이더라도 정적 역참조 "+num(row.referenceCount)+"개가 있으므로 연결 콘텐츠의 경로와 함께 해석해야 한다.";
  if(d.kind==="weapon"||d.kind==="ammo")return "표시된 단일 수치보다 실제 공격 모드·호환 탄약·명중·TU를 묶어서 봐야 전투 효율을 판단할 수 있다.";
  return "정적 수치만으로 용도를 확정하기 어려운 항목이므로 카테고리·배치·스크립트 정보를 함께 확인해야 한다.";
}
function decisionFallback(row,d){
  if(Number(row.costSell||0)>0||Number(row.costBuy||0)>0){
    const bits=[];
    if(Number(row.costBuy||0)>0)bits.push("구매가 "+num(row.costBuy));
    if(Number(row.costSell||0)>0)bits.push("판매가 "+num(row.costSell));
    return bits.join("·")+"처럼 가격 정보가 있어도 반복 공급 가능 여부는 별개다. 현재 확보 경로와 향후 재구매 가능성을 확인한 뒤 처분하는 편이 안전하다.";
  }
  if(row.researchCount||row.manufactureCount){
    const bits=[];
    if(row.researchCount)bits.push("연구 "+num(row.researchCount)+"개");
    if(row.manufactureCount)bits.push("제조 "+num(row.manufactureCount)+"개");
    return bits.join("·")+" 연결이 현재 목표 트리에 포함된다면 보관 가치가 올라가고, 해당 계통을 쓰지 않는 세이브라면 우선순위는 낮아진다.";
  }
  if(row.referenceCount){
    const detail=otherReferenceDetail(d,2,2);
    return "정적 역참조 "+num(row.referenceCount)+"개"+(detail?"("+detail+")":"")+"가 실제 플레이에서 활성화되는지에 따라 보관 가치가 달라진다.";
  }
  if(d.kind==="weapon")return "진행·경제 연결이 적으므로 현재 보유 무기 대비 명중·TU·사거리·탄약 효율이 실제 채용 여부를 결정한다.";
  if(d.kind==="ammo")return "현재 운용 중인 호환 무기가 없다면 재고 가치가 낮고, 주력 무기 탄약이라면 공급 안정성이 우선순위를 결정한다.";
  if(d.kind==="medical")return "회복량과 사용 TU가 충분히 좋다면 판매가보다 전투 지속력 가치가 우선하며, 대체 의료품이 충분하면 우선순위가 낮아진다.";
  return "현재 정적 데이터만으로 뚜렷한 전투·경제·진행 우선순위를 만들기 어렵다. 실제 사용하는 미션·이벤트가 확인될 때 가치가 구체화된다.";
}
function editorialFor(row){
  const d=detailFor(row),u=usageFor(row);
  if(!d)throw new Error("Missing item detail "+row.id);
  return{
    overview:expanded(overview(row,d,u),"전투용인지 진행용인지 판단할 때 아래 직접 룰과 역참조를 함께 보는 것이 안전하다."),
    effect:expanded(effect(row,d),effectFallback(row,d)),
    acquisition:expanded([acquisition(row,d),supplyEditorial(row,u)].filter(Boolean).join(" "),"현재 보이는 경로가 전부가 아닐 수 있으므로 이벤트·미션·맵 배치 역참조도 함께 확인해야 한다."),
    progression:expanded(progression(row,d,u),"참조의 방향은 선행 조건·무료 지급·재료 요구처럼 서로 다르므로 아래 경로명을 함께 확인해야 한다."),
    uses:usesEditorial(row,u),
    economics:economyEditorial(row,u),
    decision:expanded((u.economy?.monthlyMaintenanceRelief>0?"반복 유지비 절감 효과가 있으므로 즉시 판매와 장기 보유를 기간 기준으로 비교해야 한다. ":"")+decision(row,d),decisionFallback(row,d)),
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
  version:3,
  generator:"GPT item editorial synthesis v3",
  evidence:"ruleset-and-derived-links",
  generatedFrom:["items-index.json","chunks","entities.json","item-usage-chunks"],
  count:items.length,
  averageChars:Math.round(totalChars/Math.max(1,items.length))
};
fs.writeFileSync(outFile("item-editorial-meta.json"),JSON.stringify(meta,null,2));
console.log(JSON.stringify(meta));
