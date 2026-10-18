import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "js-yaml";

const args=process.argv.slice(2);
const arg=(flag,defaultValue)=>{const i=args.indexOf(flag);return i<0?defaultValue:args[i+1]};
const root=path.resolve(arg("--root","D:/daphne_auto"));
const game=path.resolve(arg("--game","C:/Dioxine_XPiratez_o1.1.1/Dioxine_XPiratez"));
const output=path.resolve(arg("--out","public/data/standard-evaluation.json"));
const saveDir=path.resolve(arg("--saves",path.join(game,"user/piratez")));
const sha256=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const read=p=>fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"");
const number=(x,otherwise=null)=>x==null||x===""||!Number.isFinite(Number(x))?otherwise:Number(x);
const nums=(x,d=0)=>number(x,d);
const unique=xs=>[...new Set(xs.filter(Boolean))];
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const round=(x,d=1)=>Number.isFinite(x)?Number(x.toFixed(d)):null;
const arr=x=>Array.isArray(x)?x:[];
const entries=x=>x&&typeof x==="object"&&!Array.isArray(x)?Object.entries(x):[];
const csvParse=text=>{
  const all=[];let cells=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++}
      else quoted=!quoted;
    }else if(c===","&&!quoted){cells.push(cell);cell=""}
    else if((c==="\n"||c==="\r")&&!quoted){
      if(c==="\r"&&text[i+1]==="\n")i++;
      cells.push(cell);cell="";
      if(cells.some(x=>x!==""))all.push(cells);
      cells=[];
    }else cell+=c;
  }
  if(cell||cells.length){cells.push(cell);all.push(cells)}
  const [header,...rows]=all;
  return rows.map(v=>Object.fromEntries(header.map((h,i)=>[h.replace(/^\uFEFF/,""),v[i]??""])));
};
const csv=name=>csvParse(read(path.join(root,name)));
const manifest=JSON.parse(read("public/data/weapons-index.json"));
const lookup={shooting:new Map(),melee:new Map(),throwing:new Map()};
for(const [kind,paths] of Object.entries(manifest.sectionChunks)){
  for(const p of paths){
    const section=JSON.parse(read(path.join("public/data",p)));
    for(const r of section.rows){
      const key=kind==="shooting"?r.itemId+"|"+r.ammoId:r.itemId;
      if(!lookup[kind].has(key))lookup[kind].set(key,[]);
      lookup[kind].get(key).push(r);
    }
  }
}
const raw=JSON.parse(read(path.join(root,"xp_weapon_metadata.json")));
const fullItemRules=JSON.parse(read(path.join(root,"weapon_eval_20261018/items.json")));
const items=new Map(raw.items.map(x=>[x.id,x]));
const researches=new Map(raw.research.map(x=>[x.id,x]));
const manufactures=new Map(raw.manufacture.map(x=>[x.id,x]));
const recipes=new Map();
for(const recipe of raw.manufacture){
  const produces=entries(recipe.producedItems);
  if(produces.length){
    for(const [id,qty] of produces){
      if(!recipes.has(id))recipes.set(id,[]);
      recipes.get(id).push({...recipe,producedQty:nums(qty,1),productionEvidence:"명시적 생산품"});
    }
  }else if(items.has(recipe.id)){
    if(!recipes.has(recipe.id))recipes.set(recipe.id,[]);
    recipes.get(recipe.id).push({...recipe,producedQty:1,productionEvidence:"제조명=아이템 ID"});
  }
}
const savFiles=fs.readdirSync(saveDir).filter(x=>/\.sav$/i.test(x)).map(name=>({name,path:path.join(saveDir,name),mtime:fs.statSync(path.join(saveDir,name)).mtimeMs})).sort((a,b)=>b.mtime-a.mtime);
if(!savFiles.length)throw Error("No SAV in "+saveDir);
const newest=savFiles[0],savDocs=yaml.loadAll(read(newest.path)),sav=savDocs.at(-1);
const discovered=new Set(arr(sav.discovered).map(x=>typeof x==="string"?x:x.id||x.name||x.type).filter(Boolean));
const storage={};let soldiers=[],engineers=0,scientists=0,facilities=[],activeManufacture=[];
for(const b of arr(sav.bases)){
  for(const [id,qty] of entries(b.items))storage[id]=(storage[id]||0)+nums(qty,0);
  soldiers.push(...arr(b.soldiers));
  engineers+=nums(b.engineers,0);scientists+=nums(b.scientists,0);
  facilities.push(...arr(b.facilities).map(x=>x.type));
  activeManufacture.push(...arr(b.productions).map(x=>x.item||x.name||x.type));
}
const workforce={engineers,scientists,
  engineersAssigned:arr(sav.bases).reduce((sum,b)=>sum+arr(b.productions).reduce((n,p)=>n+nums(p.assigned),0),0),
  scientistsAssigned:arr(sav.bases).reduce((sum,b)=>sum+arr(b.research).reduce((n,p)=>n+nums(p.assigned),0),0),
  facilities:unique(facilities),activeManufacture:unique(activeManufacture)};
const funds=arr(sav.funds).at(-1)??null;
// The active 16.sav production queue and installed game recipe establish the
// marginal X-Grog sale opportunity, not a fixed engineer wage.
const grogRule=raw.manufacture.find(x=>x.id==="STR_GROG_BARREL");
const grogValue=number(fullItemRules.STR_GROG_BARREL?.costSell);
const grogCash=number(grogRule?.cost),grogHours=number(grogRule?.time);
const grogIngredients=entries(grogRule?.requiredItems);
const activeGrog=arr(sav.bases).some(base=>arr(base.productions).some(p=>p.item==="STR_GROG_BARREL"&&nums(p.assigned)>0));
const grogMaterials=grogIngredients.length===0?0:null;
const grogMargin=grogValue!=null&&grogCash!=null&&grogMaterials!=null?grogValue-grogCash-grogMaterials:null;
const engineerOpportunityHourly=activeGrog&&grogMargin!=null&&grogHours>0?grogMargin/grogHours:null;
// Ordinary GAL units only; other STR_SOLDIER_* transformations are not silently pooled.
const galSoldiers=soldiers.filter(s=>String(s.type||s.soldierType||s.rule||"")==="STR_SOLDIER");
const observed=galSoldiers.map(s=>s.currentStats||s.stats).filter(s=>s&&Number.isFinite(number(s.firing)));
const baseline=manifest.characters.find(x=>x.id==="base:STR_SOLDIER")?.stats?.avg||{tu:70,firing:65,melee:65,strength:50,bravery:50,reactions:55,stamina:60};
const ordered=observed.sort((a,b)=>nums(a.firing)-nums(b.firing));
const at=q=>ordered[Math.min(ordered.length-1,Math.floor((ordered.length-1)*q))];
const sampleStats=ordered.length>=3?[at(0.15),at(0.5),at(0.85)]:[
  {...baseline,firing:Math.max(35,nums(baseline.firing)-20),melee:Math.max(30,nums(baseline.melee)-20)},
  {...baseline},
  {...baseline,firing:nums(baseline.firing)+30,melee:nums(baseline.melee)+30}
];
const evidence={
  engine:"OXCE 산식 일부를 적용한 비교모형. 실제 복셀 명중, 피해 주사위, 투사체 경로, 방어구별 내성은 미검증",
  estimate:"거리×능력치×방어계층 평균 예상 피해. 실측 처치확률이 아님",
  supply:"구매 또는 제조 규칙의 증거가 없으면 전리품/특수로 분류. CSV의 반복보급 판정을 단독 증거로 사용하지 않음",
  phase:"게임 시기 판정은 일부 연구/구매 해금 트리만 확인한 추정치"
};
function bonus(spec,s){
  if(spec?.kind!=="terms")return null;
  let total=0;
  for(const [k,coeff] of Object.entries(spec.terms||{})){
    let v;
    if(k==="flatOne")v=1;else if(k==="flatHundred")v=100;
    else if(k.endsWith("Scaled")){const base=k.slice(0,-6);v=nums(s[base])/100}
    else if(k==="strengthMelee")v=nums(s.strength)*nums(s.melee);
    else if(k==="firingReactions")v=nums(s.firing)*nums(s.reactions);
    else v=number(s[k]);
    if(v==null)return null;
    let p=v;for(const c of (Array.isArray(coeff)?coeff:[coeff])){total+=nums(c)*p;p*=v}
  }
  return Math.round(total);
}
const dependencyIds=(v)=>unique([...(arr(v.requiresBuy)),...(arr(v.requires)),...(arr(v.requiredResearch)),...(arr(v.dependencies))].map(x=>typeof x==="string"?x:x.name||x.id).filter(x=>researches.has(x)));
function prerequisiteTree(id,seen=new Set()){
  if(seen.has(id)||discovered.has(id))return [];
  seen.add(id);
  const rule=researches.get(id);
  if(!rule)return [];
  return unique([...arr(rule.dependencies).flatMap(d=>prerequisiteTree(typeof d==="string"?d:d.name||d.id,seen)),id]);
}
function access(item){
  if(!item)return {sources:[],required:[],requiredUnknown:[],manufacture:[],price:null,materialCost:null,laborHours:null,totalCost:null};
  const requireIds=dependencyIds(item);
  const missing=unique(requireIds.flatMap(id=>prerequisiteTree(id)));
  const unknown=unique([...arr(item.requiresBuy),...arr(item.requires)].filter(x=>typeof x==="string"&&!researches.has(x)&&!discovered.has(x)));
  const manufacture=arr(recipes.get(item.id)).map(r=>({
    id:r.id,requires:dependencyIds(r),requiredItems:r.requiredItems||{},
    knownCash:number(r.cost),hours:number(r.time),producedQty:r.producedQty,
    evidence:r.productionEvidence,space:number(r.space),requiresBaseFunc:arr(r.requiresBaseFunc)
  }));
  const price=number(item.costBuy);
  const source=[];
  if(price!=null&&price>0)source.push("구매");
  if(manufacture.length)source.push("제조");
  // Neither a sale price nor an item on hand establishes an unlimited procurement route.
  return {sources:source,required:missing,requiredUnknown:unknown,
    manufacture,price,materialCost:null,laborHours:null,totalCost:null};
}
function supply(weapon,ammo){
  const w=access(weapon),a=ammo&&ammo.id!==weapon?.id?access(ammo):w;
  const wRepeat=w.sources.length>0,aRepeat=a.sources.length>0;
  let kind=wRepeat&&aRepeat?"제식화 가능":(!wRepeat&&!aRepeat?"전리품 한정":"특수조건");
  if(w.requiredUnknown.length||a.requiredUnknown.length)kind="특수조건";
  const missing=unique([...w.required,...a.required]);
  const unverified=unique([...w.requiredUnknown,...a.requiredUnknown]);
  const gunStock=nums(storage[weapon?.id],0);
  const selfAmmo=!ammo||ammo.id===weapon?.id||nums(ammo.clipSize,-2)===-1;
  const ammoStock=selfAmmo?null:nums(storage[ammo.id],0);
  const hasAmmo=selfAmmo||ammoStock>0;
  const buyUnlocked=w.sources.includes("구매")&&a.sources.includes("구매")&&!missing.length&&!unverified.length;
  const recipeReady=o=>o.manufacture.some(r=>!r.requiresBaseFunc?.length&&
    r.requires.every(id=>discovered.has(id))&&
    entries(r.requiredItems).every(([id,q])=>nums(storage[id],0)>=nums(q,0)));
  const manufactureUnlocked=recipeReady(w)&&recipeReady(a)&&!missing.length&&!unverified.length;
  let state="후반 목표",stateKey="later";
  if(gunStock>=4&&(hasAmmo&&(selfAmmo||ammoStock>=4))&&kind==="제식화 가능"&&(buyUnlocked||manufactureUnlocked)){state="현재 제식 가능";stateKey="now"}
  else if(gunStock>0&&hasAmmo){state="보유분 사용 가능(재보급 별도 확인)";stateKey="now"}
  else if(missing.length){state="연구 "+missing.length+"개 남음";stateKey="research"}
  else if(unverified.length){state="선행조건 확인 필요";stateKey="special"}
  else if(buyUnlocked){state="현재 구매·제식 가능";stateKey="buy"}
  else if(manufactureUnlocked){state="현재 제조 가능";stateKey="manufacture"}
  else if(kind==="전리품 한정"){state="확보해야 할 전리품";stateKey="loot"}
  else if(w.sources.includes("구매")||a.sources.includes("구매")){state="구매처 미해금";stateKey="buy"}
  return {kind,state,stateKey,gunStock,ammoStock,weapon:w,ammo:a,
    missingResearch:missing,unknownRequirements:unverified,
    researchIds:unique([...dependencyIds(weapon),...dependencyIds(ammo||weapon),...missing]),
    manufactureIds:unique([...w.manufacture.map(x=>x.id),...a.manufacture.map(x=>x.id)])};
}
function costModel(item,info){
  const recipe=info.manufacture[0];
  if(!recipe)return null;
  const ingredients=entries(recipe.requiredItems).map(([id,qty])=>{
    const n=nums(qty,1),src=items.get(id);
    const purchase=number(src?.costBuy),sale=number(src?.costSell);
    // Lower bound by the realizable sale proceeds; never infer a missing raw material is free.
    const opportunity=purchase!=null?Math.max(purchase,nums(sale,0)):sale;
    return {id,qty:n,unitOpportunity:opportunity,subtotal:opportunity==null?null:round(opportunity*n,2)};
  });
  const materialKnown=ingredients.every(x=>x.subtotal!=null);
  const materialCost=materialKnown?round(ingredients.reduce((sum,x)=>sum+x.subtotal,0),2):null;
  const cash=recipe.knownCash;
  const opp=engineerOpportunityHourly!=null&&recipe.hours!=null?round(engineerOpportunityHourly*recipe.hours,2):null;
  const batch=materialCost!=null&&cash!=null&&opp!=null?round(cash+materialCost+opp,2):null;
  const producedQty=recipe.producedQty>0?recipe.producedQty:1;
  return {id:recipe.id,cash,materialCost,ingredients,
    engineerHours:recipe.hours,engineerOpportunityHourly,
    opportunityProfitLost:opp,producedQty,
    economicBatchTotal:batch,economicTotal:batch!=null?round(batch/producedQty,2):null,
    productionEvidence:recipe.evidence,
    completeness:batch==null?"미확인 재료 단가 또는 작업시간이 있어 실질 원가 미확정":"현금 + 재료 포기이익 + X그로그 명목판매가 기반 포기이익(실현 판매 여부 미검증), 제품수량으로 나눔"};
}
// Benchmark real XPiratez enemies from the canonical weapon DB, rather than
// treating the special-resistance target as an imaginary 40-armor humanoid.
const benchmarkUnits=[
  ["경장갑","STR_SECTOID_SOLDIER"],
  ["중간 장갑","STR_BANDIT_RATMAN_STORMRAT"],
  ["중장갑","STR_MARSEC_BODYGUARD"],
  ["특수내성","STR_WRAITH_SOLDIER"]
];
const armorValues=benchmarkUnits.map(([label,id])=>{
  const p=arr(manifest.targetProfiles).find(x=>x.unitId===id);
  if(!p||!Array.isArray(p.damageModifier))throw Error("Missing RUL target armor profile "+id);
  return [label,{id,name:p.koName,frontArmor:p.frontArmor,damageModifier:p.damageModifier,scripted:p.scripted}];
});
const distances=[4,14,28];
const modes=["auto","snap","aimed"];
function hitIndex(r,s,dist){
  const m=bonus(r.accuracyBonus,s);
  if(m==null)return null;
  let acc=Math.trunc(m*nums(r.baseAccuracy)/100);
  if(dist>nums(r.effectiveRange,200))acc-=Math.floor((dist-nums(r.effectiveRange,200))*nums(r.dropoff,2));
  else if(dist<nums(r.minRange))acc-=Math.floor((nums(r.minRange)-dist)*nums(r.dropoff,2));
  // Accuracy is not direct hit probability: the factor below is a declared proxy.
  return clamp(acc/100,0,1);
}
function expectedHit(r,s,dist,target){
  const hit=hitIndex(r,s,dist);
  if(hit==null)return null;
  const dmgBonus=bonus(r.damageBonus,s);
  if(dmgBonus==null)return null;
  const p=Math.max(0,nums(r.basePower)+dmgBonus-nums(r.powerRangeReduction)*Math.max(0,dist-nums(r.powerRangeThreshold)));
  const typ=nums(r.damageType);
  const resistance=number(target.damageModifier[typ],1);
  const armorEffective=nums(target.frontArmor)*nums(r.armorEffectiveness,1);
  const healthCoeff=nums(r.toHealth,typ===6?0:1);
  const perProjectile=Math.max(0,p*0.85*resistance-armorEffective)*healthCoeff;
  const pellets=Math.max(1,nums(r.pellets,1));
  const pelletFactor=pellets>1?Math.sqrt(pellets):1; // Conservative: no automatic full pellet convergence.
  const splash=nums(r.blastRadius)>0?1.08:1;
  const shots=Math.max(1,nums(r.shots,1));
  const tu=nums(r.cost?.time,0);
  if(tu<=0)return null;
  const eff=perProjectile*hit*shots*pelletFactor*splash*100/tu;
  return eff;
}
function combinedModes(rows){
  const ds=[],samples=[];
  for(const dist of distances){
    const byArmor={};let avg=0,count=0;
    for(const [name,armor] of armorValues){
      const model=sampleStats.map(s=>{
        const performances=rows.map(r=>({mode:r.mode,damage:expectedHit(r,s,dist,armor)}))
          .filter(x=>x.damage!=null);
        return performances.length?performances.sort((a,b)=>b.damage-a.damage)[0]:null;
      }).filter(Boolean);
      const value=model.length?model.reduce((s,x)=>s+x.damage,0)/model.length:null;
      byArmor[name]=round(value,2);
      if(value!=null){avg+=value;count++}
    }
    ds.push({distance:dist,tu100Hp:count?round(avg/count,2):null,armor:byArmor});
  }
  for(const mode of modes){
    const rs=rows.filter(x=>x.mode===mode);
    if(!rs.length)continue;
    const values=distances.map(dist=>expectedHit(rs[0],sampleStats[1],dist,armorValues[1][1])).filter(x=>x!=null);
    samples.push({id:mode,label:rs[0].modeKo,tu:rs[0].cost?.time,shots:rs[0].shots,tu100Hp:values.length?round(values.reduce((a,b)=>a+b,0)/values.length,2):null});
  }
  const base=ds.map(x=>x.tu100Hp).filter(x=>x!=null);
  const strength=base.length?base.reduce((a,b)=>a+b,0)/base.length:null;
  const best=samples.filter(x=>x.tu100Hp!=null).sort((a,b)=>b.tu100Hp-a.tu100Hp)[0]||null;
  const accuracyIsProxy=true;
  const special=rows.some(r=>nums(r.pellets,1)>1||nums(r.blastRadius)>0||r.damageBonus?.kind==="script"||r.accuracyBonus?.kind==="script"||[2,3,6,9,10].includes(nums(r.damageType)));
  return {scenarios:ds,modeScores:samples,bestMode:best?.label||"불명",
    dptu:strength==null?null:round(strength,3),special,accuracyIsProxy};
}
function phaseLabel(csvStage,src,availability){
  const label=csvStage||"시기 미확인";
  const deps=availability.missingResearch.concat(availability.researchIds);
  const hanna=deps.some(x=>/CRAZY_HANNA|HANNA/.test(x));
  if(hanna)return {stage:"한나 이후",basis:"선행조건에서 한나 확인",hanna:"이후"};
  if(label==="초반"&&availability.kind!=="제식화 가능")return {stage:"시기 미확인",basis:"반복조달 미확인 — 기존 초반 판정 폐기",hanna:"미확인"};
  if(label==="중반"||label==="초반")return {stage:label,basis:"기존 단계표·공급규칙을 이용한 추정",hanna:"이전 추정"};
  return {stage:label,basis:"기존 단계표의 미검증 구간",hanna:"미확인"};
}
const audit={unmatchedRanged:[],unmatchedMelee:[],misclassifiedRepeat:[],unknownCosts:[],specialDamage:[],missingBaseWeapon:[]};
const prepared=csv("xp_weapon_AMMO_v2.csv");
const ranged=[];
for(const r of prepared){
  const weapon=items.get(r.id);
  const self=r.ammo==="내장/자체충전";
  const ammo=items.get(self?r.id:r.ammo);
  if(!weapon){audit.missingBaseWeapon.push(r.id);continue}
  const key=r.id+"|"+(self?r.id:r.ammo);
  const rows=lookup.shooting.get(key)||[];
  if(!rows.length){audit.unmatchedRanged.push(key);continue}
  const available=supply(weapon,ammo);
  const performance=combinedModes(rows);
  const stage=phaseLabel(r.stage,weapon,available);
  if(r.standardizable==="true"&&available.kind!=="제식화 가능")audit.misclassifiedRepeat.push(key);
  if(performance.special)audit.specialDamage.push(key);
  const ammoClip=nums(ammo?.clipSize,0);
  const ammoPrice=number(ammo?.costBuy);
  const ammoMfg=costModel(ammo,available.ammo);
  const unitAmmoCost=self?0:ammoClip>0&&ammoPrice!=null?round(ammoPrice/ammoClip,2):
    ammoClip>0&&ammoMfg?.economicTotal!=null?round(ammoMfg.economicTotal/ammoClip,2):null;
  if(unitAmmoCost==null)audit.unknownCosts.push(key);
  ranged.push({
    key,weaponId:r.id,koName:rows[0]?.koName||r.name,ammoId:ammo?.id||null,ammoKoName:rows[0]?.ammoKoName||r.ammo,
    type:"원거리",stage:stage.stage,stageEvidence:stage.basis,hanna:stage.hanna,
    supply:available,weaponPrice:number(weapon.costBuy),ammoPrice,
    costPerShot:unitAmmoCost,weight:nums(weapon.weight),twoHanded:weapon.twoHanded===true||weapon.twoHanded==="true",
    width:nums(weapon.invWidth,1),height:nums(weapon.invHeight,1),
    confidence:performance.special?"특수피해 모형 제한":"명중/장갑 추정모형",
    ...performance,
    manufactureEconomics:costModel(weapon,available.weapon),
    ammoManufactureEconomics:ammoMfg,
    legacyScore:number(r.score),score:null,combatScore:null
  });
}
const melee=[];
for(const r of csv("xp_weapon_MELEE_v2.csv")){
  const item=items.get(r.id);
  const intrinsic=["STR_UNARMED_BASIC","STR_KUNG_FU","STR_UNARMED_PLUS"].includes(r.id);
  const width=nums(item?.invWidth,1),height=nums(item?.invHeight,1);
  if(!intrinsic&&(!item||width*height>2||width>2||height>2)){audit.unmatchedMelee.push(r.id);continue}
  const baseRows=lookup.melee.get(r.id)||[];
  if(!baseRows.length){audit.unmatchedMelee.push(r.id);continue}
  const ranks=baseRows.map(row=>{
    const tu=nums(row.cost?.time);
    const power=nums(row.basePower)+nums(bonus(row.damageBonus,sampleStats[1]));
    const accuracy=hitIndex(row,sampleStats[1],1);
    const hp=Math.max(0,power*.85-10*nums(row.armorEffectiveness,1))*nums(row.toHealth,nums(row.damageType)===6?0:1);
    return {id:row.mode,mode:"주먹/근접",tu,accuracy:round(accuracy,2),hp100Tu:tu>0?round(hp*nums(accuracy)*100/tu,2):null,
      toStun:row.toStun,damageType:row.damageType};
  });
  if(r.id==="STR_KUNG_FU"){
    for(const shot of (lookup.shooting.get("STR_KUNG_FU|STR_KUNG_FU")||[])){
      if(!["snap","auto"].includes(shot.mode))continue;
      const tu=nums(shot.cost.time),accuracy=hitIndex(shot,sampleStats[1],1);
      const power=nums(shot.basePower)+nums(bonus(shot.damageBonus,sampleStats[1]));
      const hp=Math.max(0,power*.85-10*nums(shot.armorEffectiveness,1))*nums(shot.toHealth,0);
      ranks.push({id:shot.mode,mode:shot.mode==="snap"?"발차기":"5연타",tu,shots:shot.shots,
        accuracy:round(accuracy,2),hp100Tu:tu>0?round(hp*nums(accuracy)*nums(shot.shots)*100/tu,2):null,
        toStun:shot.toStun,damageType:shot.damageType});
    }
  }
  const available=intrinsic?{
    kind:"제식화 가능",state:"기본 내장격투",stateKey:"now",gunStock:null,ammoStock:null,
    weapon:access(null),ammo:access(null),missingResearch:[],unknownRequirements:[],researchIds:[],manufactureIds:[]
  }:supply(item,item);
  const baselinePunch=16.5,reported=number(r.hpTU);
  const stun=nums(r.stun)>0||nums(baseRows[0].toStun)>0;
  if(!intrinsic&&!stun&&reported!=null&&reported<baselinePunch)continue;
  const phase=phaseLabel(r.phase,item||{},available);
  const best=ranks.filter(x=>x.hp100Tu!=null).sort((a,b)=>b.hp100Tu-a.hp100Tu)[0]||null;
  melee.push({
    key:"melee:"+r.id,weaponId:r.id,koName:r.name,ammoId:null,ammoKoName:"—",type:"근접",
    stage:intrinsic?"기본":phase.stage,hanna:intrinsic?"이전 추정":phase.hanna,stageEvidence:intrinsic?"게임 내 기본 공격":phase.basis,
    supply:available,weaponPrice:number(item?.costBuy),ammoPrice:null,costPerShot:0,
    weight:intrinsic?0:nums(item?.weight),twoHanded:intrinsic?false:item?.twoHanded===true||item?.twoHanded==="true",
    width:intrinsic?0:width,height:intrinsic?0:height,unarmed:intrinsic,
    actions:ranks,basePower:nums(r.basePower),stun,
    dptu:best?.hp100Tu??null,
    scenarios:[],modeScores:ranks,bestMode:best?.mode||"근접",
    confidence:"피해주사위/상태이상·반격 전 추정모형",
    manufactureEconomics:costModel(item,available.weapon),
    ammoManufactureEconomics:null,legacyScore:number(r.score),
    score:null,combatScore:null,referencePunchHpTU:baselinePunch
  });
}
const scores=ranged.concat(melee).map(x=>x.dptu).filter(x=>x!=null&&x>0).sort((a,b)=>a-b);
// P99 (rather than P95) preserves meaningful separation among powerful melee options.
const p99=scores[Math.floor((scores.length-1)*.99)]||1;
for(const x of [...ranged,...melee]){
  const c=x.dptu==null?null:Math.round(clamp(Math.sqrt(x.dptu/p99)*100,0,100));
  x.combatScore=c;
  const s=x.supply;
  const reach=s.kind==="제식화 가능"?90:s.kind==="특수조건"?48:25;
  const researched=clamp(100-(s.missingResearch.length*12+s.unknownRequirements.length*12),15,100);
  const price=x.unarmed?0:(x.weaponPrice??x.manufactureEconomics?.economicTotal??null),cost=x.unarmed?0:x.costPerShot;
  // Built-in attacks have no item/ammo replacement cost, but may still
  // depend on the active armor. Their procurement cost must not be null.
  const cheap=price==null||cost==null?null:clamp(100-10*Math.log10(1+price/200)-12*Math.log10(1+cost/5),0,100);
  x.economicsScore=cheap==null?null:Math.round(cheap);
  x.supplyScore=Math.round(.7*reach+.3*researched);
  // Never turn missing material values into an average assumed-price bonus.
  // Combat remains scored independently, but an unverifiable standard supply
  // route is not eligible for a 0-100 overall standard-issue ranking.
  const credible=s.kind==="제식화 가능"&&!s.unknownRequirements.length&&
    (x.unarmed||x.weaponPrice!=null||x.manufactureEconomics?.economicTotal!=null);
  x.score=c==null||cheap==null||!credible?null:
    Math.round(clamp(.77*c+.18*x.supplyScore+.05*cheap,0,100));
  x.scoreConfidence="추정(실측 피해/처치율 아님)";
  if(x.confidence==="특수피해 모형 제한")x.scoreConfidence="낮음(산탄·광역·특수피해 보수적 처리)";
}
ranged.sort((a,b)=>(b.score??-1)-(a.score??-1));
melee.sort((a,b)=>(b.score??-1)-(a.score??-1));
const model={
  meta:{
    version:1,generatedAt:new Date().toISOString(),sourceVersion:"XPiratez o1.1.1",
    rulesetSha256:sha256(path.join(game,"user/mods/Piratez/Ruleset/Piratez.rul")),
    koSha256:sha256(path.join(game,"user/mods/Piratez/Language/ko.yml")),
    saveFile:newest.name,saveModifiedAt:new Date(newest.mtime).toISOString(),
    researchCompleted:discovered.size,soldierCount:soldiers.length,observedGalCount:observed.length,
    galStats:sampleStats.map(s=>({tu:nums(s.tu),firing:nums(s.firing),melee:nums(s.melee),strength:nums(s.strength)})),
    galStatsSource:observed.length>=3?"SAV GAL 실측 분위값":"SAV 분류 부족: 룰 기본 GAL 스탯 가정",
    funds,workforce,scoreScale:"전체 평가 후보의 추정 TU100 체력피해 P99="+round(p99,2),
    engineerOpportunityHourly,engineerOpportunityReason:engineerOpportunityHourly==null?"SAV 활성 생산 또는 X그로그 투입/순이익 미확인":"활성 SAV X그로그 1배치 판매가 - 현금/재료비를 게임 엔지니어시간으로 나눈 대체이익",
    simulation: {distances,armorValues,statProfiles:3,hitModel:"명중률 대리지표 (엔진 실측 아님)",damageModel:"기본위력×0.85-방어×ArmorEffectiveness 후 ToHealth, 모형값"}
  },
  counts:{ranged:ranged.length,melee:melee.length,combined:ranged.length+melee.length,uniqueRangedWeapons:new Set(ranged.map(x=>x.weaponId)).size,
    repeatable:ranged.filter(x=>x.supply.kind==="제식화 가능").length},
  evidence,audit,ranged,melee
};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(model));
console.log(JSON.stringify({output,counts:model.counts,save:newest.name,observedGal:observed.length,
  audit:Object.fromEntries(Object.entries(audit).map(([k,v])=>[k,{count:v.length,examples:v.slice(0,8)}])),
  status:Object.fromEntries(["now","research","buy","manufacture","loot","later","special"].map(k=>[k,ranged.filter(x=>x.supply.stateKey===k).length]))},null,2));
