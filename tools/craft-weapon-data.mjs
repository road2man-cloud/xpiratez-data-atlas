function arr(x){return Array.isArray(x)?x:(x==null?[]:[x])}
function uniq(xs){return [...new Set(xs)]}
function flatNums(x){return arr(x).flat(Infinity).map(Number).filter(Number.isFinite)}
function entity(id,tr){return id?{id,koName:tr(id,"ko"),enName:tr(id,"en")}:null}
function num(v){return Number.isFinite(Number(v))?Number(v):null}
function bucketFor(id){let h=2166136261;for(let i=0;i<id.length;i++){h^=id.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)[0]}

const TYPE_META={
  0:{label:"소형 무장/지원",roles:["attack","tractor","defense"]},
  1:{label:"중·대형 무장",roles:["attack","tractor","defense","sensor"]},
  2:{label:"미사일",roles:["attack","defense","mobility","sensor"]},
  3:{label:"무장창/중폭장",roles:["attack","defense"]},
  4:{label:"폭격",roles:["attack"]},
  5:{label:"차량/경무장",roles:["attack","defense"]},
  6:{label:"대공/전자",roles:["attack","defense","sensor"]},
  7:{label:"주력 무장/지원",roles:["attack","mobility","sensor","tractor","defense"]},
  8:{label:"휴대 화기",roles:["attack"]},
  9:{label:"어둠기술",roles:["attack","defense","mobility","sensor"]},
  10:{label:"은폐",roles:["defense"]},
  11:{label:"특수 화기",roles:["attack"]},
  21:{label:"전기 보조",roles:["mobility","defense","sensor"]},
  22:{label:"기계 보조",roles:["mobility","defense","sensor"]},
  23:{label:"소형 지원",roles:["defense","sensor"]},
  24:{label:"엔진/장갑 보조",roles:["defense","mobility"]},
  25:{label:"회피/전지 보조",roles:["defense","mobility"]},
  26:{label:"연료/장갑 보조",roles:["mobility","defense"]},
  27:{label:"대형 연료 보조",roles:["mobility","defense"]},
  28:{label:"보강 엔진",roles:["defense","mobility"]},
  29:{label:"소형 화학연료",roles:["mobility","defense"]},
  30:{label:"대형 화학연료",roles:["mobility","defense"]}
};

const TACTICAL_BATTLE_TYPES=new Set([1,2,3,4,5,6,7,8,9,10]);

function itemKind(x){
  if(!x)return null;
  if(x.battleType===1||arr(x.compatibleAmmo).length)return "weapon";
  if(x.battleType===2||x.clipSize!=null)return "ammo";
  if(x.battleType===3||x.tuMelee!=null||x.meleePower!=null)return "melee";
  if(x.battleType===4||x.battleType===5)return "grenade";
  if(x.battleType===6)return "medical";
  if(x.battleType===7)return "scanner";
  if(x.battleType===8||x.battleType===9)return "psi";
  return "item";
}
function isTacticalUsableItem(x){
  if(!x)return false;
  if(TACTICAL_BATTLE_TYPES.has(Number(x.battleType)))return true;
  return arr(x.compatibleAmmo).length>0||x.tuAuto!=null||x.tuSnap!=null||x.tuAimed!=null||x.tuMelee!=null||x.meleePower!=null;
}
function researchClosure(roots,researchById,tr){
  const seen=new Set(),visiting=new Set(),nodes=[];
  function visit(id){
    if(!researchById.has(id)||seen.has(id)||visiting.has(id))return;
    visiting.add(id);
    const r=researchById.get(id);
    for(const d of uniq([...arr(r.dependencies),...arr(r.requires)]))visit(d);
    visiting.delete(id);seen.add(id);nodes.push(id);
  }
  uniq(roots).forEach(visit);
  const totalCost=nodes.reduce((s,id)=>s+(num(researchById.get(id)?.cost)||0),0);
  return{
    roots:uniq(roots).filter(id=>researchById.has(id)),
    nodeIds:nodes,
    totalCost,
    needItemCount:nodes.filter(id=>Boolean(researchById.get(id)?.needItem)).length,
    baseFuncs:uniq(nodes.flatMap(id=>arr(researchById.get(id)?.requiresBaseFunc).filter(x=>typeof x==="string")))
  };
}
function itemSummary(id,item,tr){
  if(!id)return null;
  if(!item)return{...entity(id,tr),exists:false};
  const roots=uniq([...arr(item.requires),...arr(item.requiresBuy)]).filter(x=>typeof x==="string");
  return{
    ...entity(id,tr),exists:true,kind:itemKind(item),battleType:item.battleType??null,
    tacticalUsable:isTacticalUsableItem(item),
    weight:item.weight??null,size:item.size??null,costBuy:item.costBuy??null,costSell:item.costSell??null,
    power:item.power??null,meleePower:item.meleePower??null,clipSize:item.clipSize??null,
    compatibleAmmo:arr(item.compatibleAmmo).filter(x=>typeof x==="string").map(x=>entity(x,tr)),
    requires:arr(item.requires).filter(x=>typeof x==="string").map(x=>entity(x,tr)),
    requiresBuy:arr(item.requiresBuy).filter(x=>typeof x==="string").map(x=>entity(x,tr)),
    researchRoots:roots
  };
}
function recipeMatches(m,id){
  if(!id)return false;
  if(m.name===id)return true;
  if(m.producedItems&&typeof m.producedItems==="object"&&!Array.isArray(m.producedItems)&&Object.prototype.hasOwnProperty.call(m.producedItems,id))return true;
  return false;
}
function recipeSummary(m,tr,researchById){
  const outputQty=m.producedItems&&typeof m.producedItems==="object"&&!Array.isArray(m.producedItems)?m.producedItems[m.name]??null:null;
  const roots=uniq([...arr(m.requires),...arr(m.dependencies)]).filter(x=>researchById.has(x));
  const fullResearch=researchClosure(roots,researchById,tr);
  return{
    id:m.name,koName:tr(m.name,"ko"),enName:tr(m.name,"en"),
    category:m.category??null,time:m.time??null,cost:m.cost??null,space:m.space??null,
    requiresBaseFunc:arr(m.requiresBaseFunc).filter(x=>typeof x==="string"),
    requiredItems:Object.entries(m.requiredItems&&typeof m.requiredItems==="object"&&!Array.isArray(m.requiredItems)?m.requiredItems:{}).map(([id,qty])=>({...entity(id,tr),qty})),
    producedItems:Object.entries(m.producedItems&&typeof m.producedItems==="object"&&!Array.isArray(m.producedItems)?m.producedItems:{}).map(([id,qty])=>({...entity(id,tr),qty})),
    outputQty,research:{roots:fullResearch.roots,totalCost:fullResearch.totalCost,needItemCount:fullResearch.needItemCount,baseFuncs:fullResearch.baseFuncs}
  };
}
function supportRole(stats){
  if(!stats||typeof stats!=="object")return[];
  const keys=Object.keys(stats).map(x=>x.toLowerCase());
  const out=[];
  if(keys.some(k=>/armor|shield|damage|health|avoid|hit/.test(k)))out.push("defense");
  if(keys.some(k=>/speed|fuel|accel|turn|engine/.test(k)))out.push("mobility");
  if(keys.some(k=>/radar|range|accuracy|detect|sight/.test(k)))out.push("sensor");
  return out;
}
function actualRoles(w){
  const roles=[];
  if(num(w.damage)>0||w.clip||w.projectileType!=null)roles.push("attack");
  if(num(w.tractorBeamPower)>0)roles.push("tractor");
  roles.push(...supportRole(w.stats));
  if(!roles.length&&TYPE_META[w.weaponType]?.roles)roles.push(...TYPE_META[w.weaponType].roles.filter(x=>x!=="attack"));
  return uniq(roles.length?roles:["support"]);
}

export function buildCraftWeaponData({effectiveMerged,tr,sourceHistory}){
  const weapons=arr(effectiveMerged.craftWeapons).filter(x=>x&&typeof x.type==="string");
  const items=arr(effectiveMerged.items).filter(x=>x&&typeof x.type==="string");
  const crafts=arr(effectiveMerged.crafts).filter(x=>x&&typeof x.type==="string");
  const research=arr(effectiveMerged.research).filter(x=>x&&typeof x.name==="string");
  const manufacture=arr(effectiveMerged.manufacture).filter(x=>x&&typeof x.name==="string");
  const itemById=new Map(items.map(x=>[x.type,x]));
  const researchById=new Map(research.map(x=>[x.name,x]));
  const manufactureById=new Map(manufacture.map(x=>[x.name,x]));

  const craftCompat=new Map(weapons.map(w=>[w.type,[]]));
  for(const c of crafts){
    const count=Math.max(0,Number(c.weapons)||0);
    const slots=arr(c.weaponTypes).slice(0,count);
    const byType=new Map();
    slots.forEach((slot,i)=>{
      for(const t of uniq(flatNums(slot))){
        const xs=byType.get(t)||[];xs.push(i+1);byType.set(t,xs);
      }
    });
    for(const w of weapons){
      const slotsFor=byType.get(Number(w.weaponType));
      if(slotsFor?.length)craftCompat.get(w.type).push({
        id:c.type,koName:tr(c.type,"ko"),enName:tr(c.type,"en"),slots:slotsFor,
        weapons:c.weapons??null,soldiers:c.soldiers??null,speedMax:c.speedMax??null
      });
    }
  }

  const index=[],details={};
  let sharedTacticalCount=0,launcherItemCount=0,clipItemCount=0,attackCount=0,supportCount=0;
  for(const w of weapons){
    const launcherItem=itemById.get(w.launcher),clipItem=itemById.get(w.clip);
    const launcher=itemSummary(w.launcher,launcherItem,tr),clip=itemSummary(w.clip,clipItem,tr);
    const sharedTactical=Boolean(launcher?.tacticalUsable);
    if(sharedTactical)sharedTacticalCount++;
    if(launcher?.exists)launcherItemCount++;
    if(clip?.exists)clipItemCount++;
    const roles=actualRoles(w);
    if(roles.includes("attack"))attackCount++;else supportCount++;
    const profileResearch=researchById.has(w.type)?researchClosure([w.type],researchById,tr):researchClosure([],researchById,tr);
    const launcherResearch=launcher?.exists?researchClosure(launcher.researchRoots,researchById,tr):researchClosure([],researchById,tr);
    const clipResearch=clip?.exists?researchClosure(clip.researchRoots,researchById,tr):researchClosure([],researchById,tr);
    const launcherRecipes=manufacture.filter(m=>recipeMatches(m,w.launcher)).map(m=>recipeSummary(m,tr,researchById));
    const clipRecipes=manufacture.filter(m=>recipeMatches(m,w.clip)).map(m=>recipeSummary(m,tr,researchById));
    const typeMeta=TYPE_META[Number(w.weaponType)]||{label:"미분류",roles:[]};
    const compatibleCrafts=craftCompat.get(w.type)||[];
    const bucket=bucketFor(w.type);
    const d={
      id:w.type,bucket,koName:tr(w.type,"ko"),enName:tr(w.type,"en"),
      weaponType:w.weaponType??null,typeLabel:typeMeta.label,typeRoles:typeMeta.roles,
      roles,
      damage:w.damage??null,range:w.range??null,accuracy:w.accuracy??null,
      reloadCautious:w.reloadCautious??null,reloadStandard:w.reloadStandard??null,reloadAggressive:w.reloadAggressive??null,
      ammoMax:w.ammoMax??null,rearmRate:w.rearmRate??null,bulletSaving:Boolean(w.bulletSaving),
      shieldDamageModifier:w.shieldDamageModifier??null,projectileType:w.projectileType??null,projectileSpeed:w.projectileSpeed??null,
      tractorBeamPower:w.tractorBeamPower??null,stats:w.stats??null,
      launcher,clip,sharedTactical,
      profileResearch,launcherResearch,clipResearch,
      launcherRecipes,clipRecipes,compatibleCrafts,
      sourceFiles:sourceHistory["type:"+w.type]||[],raw:w
    };
    details[w.type]=d;
    index.push({
      id:d.id,bucket,koName:d.koName,enName:d.enName,weaponType:d.weaponType,typeLabel:d.typeLabel,roles:d.roles,
      damage:d.damage,range:d.range,accuracy:d.accuracy,ammoMax:d.ammoMax,reloadStandard:d.reloadStandard,
      rearmRate:d.rearmRate,shieldDamageModifier:d.shieldDamageModifier,tractorBeamPower:d.tractorBeamPower,
      launcherId:w.launcher??null,launcherName:launcher?.koName??null,clipId:w.clip??null,clipName:clip?.koName??null,
      sharedTactical,launcherExists:Boolean(launcher?.exists),clipExists:Boolean(clip?.exists),
      compatibleCraftCount:compatibleCrafts.length,profileResearchCost:profileResearch.totalCost,
      searchText:[d.id,d.koName,d.enName,d.typeLabel,...d.roles,w.launcher,launcher?.koName,launcher?.enName,w.clip,clip?.koName,clip?.enName,...compatibleCrafts.flatMap(c=>[c.id,c.koName,c.enName])].filter(Boolean).join(" ").toLowerCase()
    });
  }
  index.sort((a,b)=>(Number(a.weaponType)-Number(b.weaponType))||a.koName.localeCompare(b.koName,"ko"));
  const typeCounts={};
  for(const x of index)typeCounts[x.weaponType]=(typeCounts[x.weaponType]||0)+1;
  return{
    counts:{craftWeapons:index.length,attack:attackCount,support:supportCount,sharedTactical:sharedTacticalCount,launcherItems:launcherItemCount,clipItems:clipItemCount},
    typeMeta:Object.fromEntries(Object.entries(TYPE_META).map(([id,m])=>[id,{...m,count:typeCounts[id]||0}])),
    researchCatalog:Object.fromEntries(research.map(r=>[r.name,{id:r.name,koName:tr(r.name,"ko"),enName:tr(r.name,"en"),cost:r.cost??null}])),
    index,details
  };
}
