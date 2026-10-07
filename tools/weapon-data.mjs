const STAT_KEYS=["tu","stamina","health","bravery","reactions","firing","throwing","strength","psiStrength","psiSkill","melee","mana"];

function n(v,d=0){const x=Number(v);return Number.isFinite(x)?x:d}
function arr(v){return Array.isArray(v)?v:[]}
function hasOwn(o,k){return !!o&&Object.prototype.hasOwnProperty.call(o,k)}
function roundLikeEngine(x){return x>=0?Math.floor(x+0.5):Math.ceil(x-0.5)}

function statTerm(name,s){
  const a=k=>n(s?.[k]);
  switch(name){
    case "flatOne": return 1;
    case "flatHundred": return 100;
    case "strength": return a("strength");
    case "psi": return a("psiSkill")*a("psiStrength");
    case "psiSkill": return a("psiSkill");
    case "psiStrength": return a("psiStrength");
    case "throwing": return a("throwing");
    case "bravery": return a("bravery");
    case "firing": return a("firing");
    case "health": return a("health");
    case "mana": return a("mana");
    case "tu": return a("tu");
    case "reactions": return a("reactions");
    case "stamina": return a("stamina");
    case "melee": return a("melee");
    case "strengthMelee": return a("strength")*a("melee");
    case "strengthThrowing": return a("strength")*a("throwing");
    case "firingReactions": return a("firing")*a("reactions");
    case "strengthScaled": return a("strength")/100;
    case "psiScaled": return a("psiSkill")*a("psiStrength")/10000;
    case "psiSkillScaled": return a("psiSkill")/100;
    case "psiStrengthScaled": return a("psiStrength")/100;
    case "throwingScaled": return a("throwing")/100;
    case "braveryScaled": return a("bravery")/100;
    case "firingScaled": return a("firing")/100;
    case "healthScaled": return a("health")/100;
    case "manaScaled": return a("mana")/100;
    case "tuScaled": return a("tu")/100;
    case "reactionsScaled": return a("reactions")/100;
    case "staminaScaled": return a("stamina")/100;
    case "meleeScaled": return a("melee")/100;
    case "strengthMeleeScaled": return a("strength")*a("melee")/10000;
    case "strengthThrowingScaled": return a("strength")*a("throwing")/10000;
    case "firingReactionsScaled": return a("firing")*a("reactions")/10000;
    default:return null;
  }
}
function normalizeBonus(raw,def){
  if(typeof raw==="string") return {kind:"script",script:raw};
  if(raw&&typeof raw==="object"&&!Array.isArray(raw)) return {kind:"terms",terms:raw};
  return {kind:"terms",terms:def||{}};
}
function evalBonus(spec,stats){
  if(!spec||spec.kind==="script")return null;
  let total=0;
  for(const [key,val] of Object.entries(spec.terms||{})){
    const st=statTerm(key,stats); if(st==null)continue;
    const c=Array.isArray(val)?val:[val];
    let p=st,part=0;
    for(let i=0;i<Math.min(4,c.length);i++){part+=n(c[i])*p;p*=st}
    total+=part;
  }
  return roundLikeEngine(total);
}
function actionCost(item,mode){
  const cap=mode[0].toUpperCase()+mode.slice(1);
  const direct=item["cost"+cap];
  const fallback=(mode==="snap"||mode==="auto")?item.costAimed:null;
  const legacy=item["tu"+cap];
  const time=direct?.time??fallback?.time??legacy??(mode==="throw"?25:0);
  const energy=direct?.energy??fallback?.energy??0;
  const flatDirect=item["flat"+cap]?.time;
  const flatAimed=(mode==="snap"||mode==="auto")?item.flatAimed?.time:undefined;
  const flatRate=item.flatRate;
  const flat=flatDirect??flatAimed??flatRate??false;
  return {time:n(time),energy:n(energy),flat:Boolean(flat)};
}
function rangeFor(item,mode){
  if(mode==="aimed")return n(item.aimRange,200);
  if(mode==="snap")return n(item.snapRange,15);
  if(mode==="auto")return n(item.autoRange,7);
  return null;
}
function modeShots(item,mode){
  const conf=item["conf"+mode[0].toUpperCase()+mode.slice(1)];
  if(conf&&conf.shots!=null)return n(conf.shots,1);
  if(mode==="auto")return n(item.autoShots,1);
  return 1;
}
function sourceReq(item){
  return [...new Set([...arr(item.requires),...arr(item.requiresBuy)])];
}
function damageName(damageKeys,tr,id){
  const k=Number.isInteger(id)?damageKeys[id]:null;
  return k?tr(k,"ko"):null;
}
function isThrowWeapon(item){
  const cats=arr(item.categories);
  // OXCE technically lets many inventory objects be thrown. The weapon DB's
  // throwing section is intentionally narrower: actual grenade/proximity-grenade
  // battle types plus X-Piratez items explicitly categorized as thrown weapons.
  return item.battleType===4||item.battleType===5||cats.includes("STR_BAT_CAT_THROWN");
}
function damageSpec(rule){
  return normalizeBonus(rule?.damageBonus,rule?.strengthApplied?{strength:1}:{});
}
function meleeSpec(rule){
  return normalizeBonus(rule?.meleeBonus,{});
}
function accuracySpec(rule){
  return normalizeBonus(rule?.accuracyMultiplier,{firing:1});
}
function meleeAccuracySpec(rule){
  return normalizeBonus(rule?.meleeMultiplier,{melee:1});
}
function throwAccuracySpec(rule){
  return normalizeBonus(rule?.throwMultiplier,{throwing:1});
}
function hasScriptFields(rule){
  return !!rule&&typeof rule==="object"&&Object.keys(rule).some(k=>/script/i.test(k));
}
function damageProfile(damageType,alter){
  const id=Number.isInteger(damageType)?damageType:0;
  const base={
    RandomType:8,ResistType:id,ArmorEffectiveness:1,ToHealth:1,RandomHealth:false,
    IgnoreDirection:false
  };
  if(id===0){base.RandomType=5}
  else if(id===2){base.RandomType=4;base.ArmorEffectiveness=0;base.IgnoreDirection=true}
  else if(id===3){base.RandomType=9}
  else if(id===6){base.ToHealth=0}
  else if(id===9){base.RandomType=5;base.ArmorEffectiveness=0;base.ToHealth=0;base.IgnoreDirection=true}
  const a=alter&&typeof alter==="object"&&!Array.isArray(alter)?alter:{};
  return {
    randomType:n(a.RandomType,base.RandomType),
    resistType:n(a.ResistType,base.ResistType),
    armorEffectiveness:a.ArmorEffectiveness==null?base.ArmorEffectiveness:n(a.ArmorEffectiveness,base.ArmorEffectiveness),
    toHealth:a.ToHealth==null?base.ToHealth:n(a.ToHealth,base.ToHealth),
    randomHealth:a.RandomHealth==null?base.RandomHealth:Boolean(a.RandomHealth),
    ignoreDirection:a.IgnoreDirection==null?base.IgnoreDirection:Boolean(a.IgnoreDirection)
  };
}
function collectStrings(value,out){
  if(typeof value==="string"){out.add(value);return}
  if(Array.isArray(value)){for(const v of value)collectStrings(v,out)}
  else if(value&&typeof value==="object")for(const v of Object.values(value))collectStrings(v,out);
}
function buildTargetProfiles(effectiveMerged,tr){
  const unitById=new Map(arr(effectiveMerged.units).filter(x=>x&&typeof x.type==="string").map(x=>[x.type,x]));
  const armorById=new Map(arr(effectiveMerged.armors).filter(x=>x&&typeof x.type==="string").map(x=>[x.type,x]));
  const enemyIds=new Set(),raceRefs=new Map();
  for(const race of arr(effectiveMerged.alienRaces)){
    if(!race||typeof race.id!=="string")continue;
    const ids=new Set();
    collectStrings(race.members,ids);
    collectStrings(race.membersRandom,ids);
    for(const id of ids){
      if(!unitById.has(id))continue;
      enemyIds.add(id);
      const refs=raceRefs.get(id)||[];
      refs.push({id:race.id,koName:tr(race.id,"ko"),enName:tr(race.id,"en")});
      raceRefs.set(id,refs);
    }
  }
  const profiles=[];
  for(const id of enemyIds){
    const u=unitById.get(id);if(!u||typeof u.armor!=="string")continue;
    const a=armorById.get(u.armor);if(!a)continue;
    const modifiers=Array.from({length:20},(_,i)=>{
      const v=Array.isArray(a.damageModifier)?a.damageModifier[i]:null;
      return v==null?1:n(v,1);
    });
    profiles.push({
      unitId:u.type,koName:tr(u.type,"ko"),enName:tr(u.type,"en"),
      armorId:a.type,armorKoName:tr(a.type,"ko"),armorEnName:tr(a.type,"en"),
      frontArmor:n(a.frontArmor),sideArmor:n(a.sideArmor),rearArmor:n(a.rearArmor),underArmor:n(a.underArmor),
      damageModifier:modifiers,scripted:hasScriptFields(a),races:raceRefs.get(id)||[]
    });
  }
  profiles.sort((a,b)=>a.koName.localeCompare(b.koName,"ko")||a.unitId.localeCompare(b.unitId,"en"));
  if(profiles.length){
    const vals=profiles.map(x=>x.frontArmor).sort((a,b)=>a-b),median=vals[Math.floor(vals.length/2)]??0;
    const chosen=profiles.slice().sort((a,b)=>Math.abs(a.frontArmor-median)-Math.abs(b.frontArmor-median)||a.koName.localeCompare(b.koName,"ko"))[0];
    if(chosen)chosen.recommended=true;
  }
  return profiles;
}
function compactRelations(detail){
  const research=(detail?.research||[]).map(x=>({id:x.id||x.owner,koName:x.koName,cost:x.cost??null,needItem:x.needItem??null,destroyItem:x.destroyItem??null}));
  const manufacture=(detail?.manufacture||[]).map(x=>({id:x.id||x.owner,koName:x.koName,time:x.time??null,cost:x.cost??null,requiredQty:x.requiredQty??null,producedQty:x.producedQty??null}));
  return {research,manufacture};
}
function rowBase(item,tr,sourceHistory,globals,itemDetails){
  const rel=compactRelations(itemDetails[item.type]);
  return {
    itemId:item.type,koName:tr(item.type,"ko"),enName:tr(item.type,"en"),
    categories:arr(item.categories),weight:n(item.weight,3),costBuy:item.costBuy??null,costSell:item.costSell??null,
    twoHanded:Boolean(item.twoHanded),blockBothHands:Boolean(item.blockBothHands),
    kneelBonus:item.kneelBonus!=null&&item.kneelBonus!==-1?item.kneelBonus:globals.kneelBonus,
    oneHandedPenalty:item.oneHandedPenalty!=null&&item.oneHandedPenalty!==-1?item.oneHandedPenalty:globals.oneHandedPenalty,
    requires:sourceReq(item),sourceFiles:sourceHistory["type:"+item.type]||[],research:rel.research,manufacture:rel.manufacture
  };
}
function makeCharacters(soldierData){
  const rows=[];
  const recommended=new Set([
    "profile:manufacture:STR_THEBAN_ASSAULT_CLONE","profile:manufacture:STR_FREAK_RECRUITMENT",
    "profile:manufacture:STR_AGGRESSOR_GAL_RECRUITMENT","profile:manufacture:STR_STASIS_POD_GREEN_GAL_EXTRACTION",
    "profile:manufacture:STR_TURANIAN_UBER_RECRUITMENT","profile:manufacture:STR_GLAMOUR_RECRUITMENT",
    "profile:manufacture:STR_THEBAN_ASSAULT_CATGIRL_RECRUITMENT",
    "base:STR_SOLDIER","base:STR_SOLDIER_M","base:STR_SOLDIER_V","base:STR_SOLDIER_W","base:STR_SOLDIER_OGRE"
  ]);
  for(const s of soldierData.soldiers){
    rows.push({
      id:"base:"+s.id,group:"기본 병종",sourceId:s.id,koName:s.koName,enName:s.enName,
      recommended:recommended.has("base:"+s.id),
      stats:{min:s.minStats,avg:s.avgStats,max:s.maxStats}
    });
  }
  for(const p of soldierData.profiles){
    rows.push({
      id:"profile:"+p.id,group:"실제 생성 프로필",sourceId:p.id,
      koName:p.sourceKoName+" ("+p.soldierKoName+")",enName:p.sourceEnName+" ("+p.soldierEnName+")",
      recommended:recommended.has("profile:"+p.id),
      stats:p.effectiveStats
    });
  }
  const order=new Map([
    ["profile:manufacture:STR_THEBAN_ASSAULT_CLONE",0],["profile:manufacture:STR_FREAK_RECRUITMENT",1],
    ["profile:manufacture:STR_AGGRESSOR_GAL_RECRUITMENT",2],["profile:manufacture:STR_STASIS_POD_GREEN_GAL_EXTRACTION",3],
    ["profile:manufacture:STR_TURANIAN_UBER_RECRUITMENT",4],["profile:manufacture:STR_GLAMOUR_RECRUITMENT",5],
    ["profile:manufacture:STR_THEBAN_ASSAULT_CATGIRL_RECRUITMENT",6],
    ["base:STR_SOLDIER",10],["base:STR_SOLDIER_M",11],["base:STR_SOLDIER_V",12],["base:STR_SOLDIER_W",13],["base:STR_SOLDIER_OGRE",14]
  ]);
  rows.sort((a,b)=>(a.recommended===b.recommended?((order.get(a.id)??99)-(order.get(b.id)??99)||a.koName.localeCompare(b.koName,"ko")):(a.recommended?-1:1)));
  return rows;
}

export function buildWeaponData({effectiveMerged,sourceHistory,tr,damageKeys,soldierData,itemDetails}){
  const globals={kneelBonus:effectiveMerged.kneelBonusGlobal??115,oneHandedPenalty:effectiveMerged.oneHandedPenaltyGlobal??80};
  const items=arr(effectiveMerged.items).filter(x=>x&&typeof x.type==="string");
  const byId=new Map(items.map(x=>[x.type,x]));
  const shooting=[],melee=[],throwing=[];

  for(const item of items){
    const common=rowBase(item,tr,sourceHistory,globals,itemDetails);
    if(item.battleType===1){
      const ammoIds=arr(item.compatibleAmmo).length?arr(item.compatibleAmmo):[item.type];
      for(const ammoId of ammoIds){
        const ammo=byId.get(ammoId); if(!ammo)continue;
        for(const mode of ["snap","aimed","auto"]){
          const cap=mode[0].toUpperCase()+mode.slice(1);
          const baseAcc=n(item["accuracy"+cap]);
          if(baseAcc<=0)continue;
          const powerRule=item.ignoreAmmoPower?item:ammo;
          const dmgType=ammo.damageType??powerRule.damageType??null;
          shooting.push({
            ...common,id:"shoot:"+item.type+":"+ammoId+":"+mode,section:"shooting",mode,
            modeKo:{snap:"스냅",aimed:"조준",auto:"연사"}[mode],
            ammoId,ammoKoName:tr(ammoId,"ko"),ammoEnName:tr(ammoId,"en"),
            ammoCostBuy:ammo.costBuy??null,ammoCostSell:ammo.costSell??null,ammoWeight:n(ammo.weight,3),
            ammoResearch:compactRelations(itemDetails[ammoId]).research,ammoManufacture:compactRelations(itemDetails[ammoId]).manufacture,
            baseAccuracy:baseAcc,accuracyBonus:accuracySpec(item),
            cost:actionCost(item,mode),shots:modeShots(item,mode),
            pellets:Math.max(1,n(ammo.shotgunPellets,0)||1),clipSize:ammo.clipSize??null,
            effectiveRange:rangeFor(item,mode),minRange:n(item.minRange,0),dropoff:n(item.dropoff,2),
            maxRange:n(item.maxRange,200),powerRangeReduction:n(powerRule.powerRangeReduction,0),
            powerRangeThreshold:n(powerRule.powerRangeThreshold,0),basePower:n(powerRule.power,0),
            damageBonus:damageSpec(powerRule),powerSourceId:powerRule.type,
            damageType:dmgType,damageTypeKo:damageName(damageKeys,tr,dmgType),
            damageProfile:damageProfile(dmgType,ammo.damageAlter??powerRule.damageAlter),
            actualDamageScripted:hasScriptFields(item)||hasScriptFields(ammo)||hasScriptFields(powerRule),
            blastRadius:ammo.blastRadius??ammo.damageAlter?.FixRadius??null,
            armorEffectiveness:ammo.damageAlter?.ArmorEffectiveness??powerRule.damageAlter?.ArmorEffectiveness??null,
            toHealth:ammo.damageAlter?.ToHealth??powerRule.damageAlter?.ToHealth??null,
            toStun:ammo.damageAlter?.ToStun??powerRule.damageAlter?.ToStun??null,
            toTile:ammo.damageAlter?.ToTile??powerRule.damageAlter?.ToTile??null
          });
        }
      }
    }

    const hasMelee=n(item.accuracyMelee)>0&&(item.battleType===3||n(item.meleePower)>0||hasOwn(item,"meleeBonus")||hasOwn(item,"meleeType"));
    if(hasMelee){
      const standalone=item.battleType===3;
      const basePower=standalone?n(item.power):n(item.meleePower);
      const dmgType=standalone?(item.damageType??null):(item.meleeType??item.damageType??null);
      melee.push({
        ...common,id:"melee:"+item.type,section:"melee",mode:"melee",modeKo:"근접",
        baseAccuracy:n(item.accuracyMelee),accuracyBonus:meleeAccuracySpec(item),
        cost:actionCost(item,"melee"),shots:1,pellets:1,basePower,
        damageBonus:standalone?damageSpec(item):meleeSpec(item),
        damageType:dmgType,damageTypeKo:damageName(damageKeys,tr,dmgType),
        damageProfile:damageProfile(dmgType,standalone?item.damageAlter:item.meleeAlter),
        actualDamageScripted:hasScriptFields(item),
        armorEffectiveness:(standalone?item.damageAlter:item.meleeAlter)?.ArmorEffectiveness??null,
        toHealth:(standalone?item.damageAlter:item.meleeAlter)?.ToHealth??null,
        toStun:(standalone?item.damageAlter:item.meleeAlter)?.ToStun??null,
        toTile:(standalone?item.damageAlter:item.meleeAlter)?.ToTile??null,
        standaloneMelee:standalone
      });
    }

    if(isThrowWeapon(item)){
      const dmgType=item.damageType??null;
      throwing.push({
        ...common,id:"throw:"+item.type,section:"throwing",mode:"throw",modeKo:"투척",
        baseAccuracy:n(item.accuracyThrow,100),accuracyBonus:throwAccuracySpec(item),
        cost:actionCost(item,"throw"),primeCost:item.costPrime?.time??item.tuPrime??50,
        primeFlat:Boolean(item.flatPrime?.time??false),basePower:n(item.power,0),damageBonus:damageSpec(item),
        damageType:dmgType,damageTypeKo:damageName(damageKeys,tr,dmgType),
        damageProfile:damageProfile(dmgType,item.damageAlter),actualDamageScripted:hasScriptFields(item),
        throwRange:n(item.throwRange,200),throwDropoffRange:n(item.throwDropoffRange,99),throwDropoff:n(item.throwDropoff,5),
        blastRadius:item.blastRadius??item.damageAlter?.FixRadius??null,
        armorEffectiveness:item.damageAlter?.ArmorEffectiveness??null,toHealth:item.damageAlter?.ToHealth??null,
        toStun:item.damageAlter?.ToStun??null,toTile:item.damageAlter?.ToTile??null
      });
    }
  }

  const characters=makeCharacters(soldierData);
  const targetProfiles=buildTargetProfiles(effectiveMerged,tr);
  const allRows=[...shooting,...melee,...throwing];
  const unsupportedSpecs=allRows.filter(r=>r.accuracyBonus?.kind==="script"||r.damageBonus?.kind==="script").length;
  const damageProfiles={};
  for(const r of allRows){
    damageProfiles[r.id]={...r.damageProfile,scripted:Boolean(r.actualDamageScripted)};
    delete r.damageProfile;
    delete r.actualDamageScripted;
  }
  const detailIds=new Set();
  for(const r of allRows){
    detailIds.add(r.itemId);
    if(r.ammoId)detailIds.add(r.ammoId);
    if(r.powerSourceId)detailIds.add(r.powerSourceId);
  }
  const details={};
  for(const id of [...detailIds].sort()){
    const rule=byId.get(id);
    if(!rule)continue;
    details[id]={
      itemId:id,koName:tr(id,"ko"),enName:tr(id,"en"),
      sourceFiles:sourceHistory["type:"+id]||[],
      rule
    };
  }
  return {
    statKeys:STAT_KEYS,characters,targetProfiles,damageProfiles,
    sections:{shooting,melee,throwing},details,
    counts:{shooting:shooting.length,melee:melee.length,throwing:throwing.length,characters:characters.length,targetProfiles:targetProfiles.length,detailItems:Object.keys(details).length,unsupportedSpecs},
    engineNotes:{
      accuracy:"OXCE BattleUnit::getFiringAccuracy 계열: 캐릭터 stat multiplier × 무기 accuracy, 이후 자세/양손/거리 보정.",
      power:"OXCE RuleStatBonus: power 또는 meleePower에 캐릭터 스탯 보너스를 합산. 1타 명목위력과 shots×pellets 총 명목위력을 분리하고, powerRangeReduction은 선택 거리 값에만 적용.",
      range:"maxRange/물리 투척거리는 하드 사거리로 취급. 하드 사거리 밖은 피해 0이 아니라 공격 불가이므로 거리 기반 위력·정확도를 사거리 밖으로 표시.",
      actualDamage:"명중 시 기대 HP 피해: OXCE RandomType의 정수 피해 분포 → 선택한 적 armor.damageModifier[ResistType] → 전면 방어력 × ArmorEffectiveness 차감 → ToHealth/RandomHealth. alienRaces에 실제 편성되는 적 유닛을 개별 선택하며, 커스텀 전투 스크립트는 정적 근사로 표시.",
      tu:"OXCE BattleUnit::getActionTUs: flat가 아니면 캐릭터 기본 TU에 % 비용을 곱해 floor, 최소 1.",
      throwRange:"OXCE ProjectileFlyBState::getMaxThrowDistance의 동일고도 물리 투척거리 근사."
    }
  };
}

export const weaponMath={evalBonus,roundLikeEngine};
