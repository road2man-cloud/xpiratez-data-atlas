import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "js-yaml";
import {isPresentationResourceKey,splitPresentationResources} from "./data-normalize.mjs";

const args=process.argv.slice(2);
const arg=(name,fallback=null)=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:fallback};
const source=arg("--source",process.env.XPIRATEZ_MOD_PATH);
const outDir=path.resolve(arg("--out","public/data"));
const includeLore=args.includes("--include-lore");
if(!source){console.error("Usage: node tools/build-data.mjs --source <.../user/mods/Piratez>");process.exit(2)}

const modRoot=path.resolve(source);
const rulesDir=path.join(modRoot,"Ruleset");
const langDir=path.join(modRoot,"Language");
const metadataPath=path.join(modRoot,"metadata.yml");
for(const p of [rulesDir,langDir,metadataPath]) if(!fs.existsSync(p)) throw new Error("Missing X-Piratez source: "+p);

const read=p=>fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"");
const sha256=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const loadYaml=p=>{const docs=[];yaml.loadAll(read(p),d=>{if(d)docs.push(d)},{json:true});return docs};

const META=yaml.load(read(metadataPath),{json:true})||{};
const ruleFiles=fs.readdirSync(rulesDir).filter(f=>f.toLowerCase().endsWith(".rul")).sort((a,b)=>a.localeCompare(b,"en"));

function deepMerge(a,b){
  if(a&&b&&typeof a==="object"&&typeof b==="object"&&!Array.isArray(a)&&!Array.isArray(b)){
    const out={...a};
    for(const [k,v] of Object.entries(b)) out[k]=k in out?deepMerge(out[k],v):v;
    return out;
  }
  return b;
}
const identityKeys=["type","name","id","article","race","category","region","deployment","missionName","script","eventScript","cutscene","commendation"];
function identityOf(x){
  if(!x||typeof x!=="object"||Array.isArray(x)) return null;
  for(const k of identityKeys) if(typeof x[k]==="string") return k+":"+x[k];
  return null;
}
function mergeSection(oldValue,newValue){
  if(!Array.isArray(oldValue)||!Array.isArray(newValue)) return deepMerge(oldValue,newValue);
  const out=[...oldValue], pos=new Map();
  out.forEach((x,i)=>{const id=identityOf(x);if(id)pos.set(id,i)});
  for(const x of newValue){
    if(x&&typeof x==="object"&&!Array.isArray(x)&&typeof x.delete==="string"){
      const target=x.delete;
      const idx=out.findIndex(y=>y&&typeof y==="object"&&Object.values(y).includes(target));
      if(idx>=0)out.splice(idx,1);
      continue;
    }
    const id=identityOf(x);
    if(id&&pos.has(id)){const idx=pos.get(id);out[idx]=deepMerge(out[idx],x)}
    else{out.push(x);if(id)pos.set(id,out.length-1)}
  }
  return out;
}

const merged={}, sourceHistory={};
for(const file of ruleFiles){
  const full=path.join(rulesDir,file);
  for(const doc of loadYaml(full)){
    for(const [section,value] of Object.entries(doc)){
      merged[section]=section in merged?mergeSection(merged[section],value):value;
      if(Array.isArray(value)) value.forEach(entry=>{
        const id=identityOf(entry);if(!id)return;
        const h=(sourceHistory[id]||=[]);if(h.at(-1)!==file)h.push(file);
      });
    }
  }
}
function resolveRefNode(value,depth=0){
  if(!value||typeof value!=="object"||Array.isArray(value))return value;
  if(depth>32)throw new Error("refNode nesting exceeded 32 levels");
  const child={...value}, parent=child.refNode;
  delete child.refNode;
  if(parent&&typeof parent==="object"&&!Array.isArray(parent)) return deepMerge(resolveRefNode(parent,depth+1),child);
  return child;
}
const effectiveMerged={};
for(const [section,value] of Object.entries(merged)){
  effectiveMerged[section]=Array.isArray(value)?value.map(v=>resolveRefNode(v)):resolveRefNode(value);
}

function loadLocale(code){
  const p=path.join(langDir,code+".yml");if(!fs.existsSync(p))return{};
  const doc=yaml.load(read(p),{json:true})||{};return doc[code]||doc;
}
const ko=loadLocale("ko"), en=loadLocale("en-US");
function tr(key,locale="ko"){
  if(typeof key!=="string")return key;
  const a=locale==="ko"?ko:en,b=locale==="ko"?en:ko;
  const v=a[key]??b[key]??key;
  if(Array.isArray(v))return v.join(" / ");
  if(v&&typeof v==="object")return JSON.stringify(v);
  return String(v).replaceAll("{NEWLINE}","\n").replaceAll("{SMALLLINE}","\n");
}

const damageKeys=[
  "STR_DAMAGE_NONE","STR_DAMAGE_ARMOR_PIERCING","STR_DAMAGE_INCENDIARY","STR_DAMAGE_HIGH_EXPLOSIVE",
  "STR_DAMAGE_LASER_BEAM","STR_DAMAGE_PLASMA_BEAM","STR_DAMAGE_STUN","STR_DAMAGE_MELEE",
  "STR_DAMAGE_ACID","STR_DAMAGE_SMOKE","STR_DAMAGE_10","STR_DAMAGE_11","STR_DAMAGE_12",
  "STR_DAMAGE_13","STR_DAMAGE_14","STR_DAMAGE_15","STR_DAMAGE_16","STR_DAMAGE_17","STR_DAMAGE_18","STR_DAMAGE_19"
];
const battleTypeLabels={0:"기타/없음",1:"총기",2:"탄약",3:"근접무기",4:"수류탄",5:"근접신관 수류탄",6:"의료/메디킷",7:"스캐너",8:"마인드 프로브",9:"사이오닉 앰프",10:"조명탄",11:"시체/잔해"};

const itemDeclared=(Array.isArray(merged.items)?merged.items:[]).filter(x=>x&&typeof x.type==="string");
const itemList=(Array.isArray(effectiveMerged.items)?effectiveMerged.items:[]).filter(x=>x&&typeof x.type==="string");
const declaredItemById=new Map(itemDeclared.map(x=>[x.type,x]));
const itemIds=new Set(itemList.map(x=>x.type));

const researchList=(Array.isArray(effectiveMerged.research)?effectiveMerged.research:[]).filter(x=>x&&typeof x.name==="string");
const researchIds=new Set(researchList.map(x=>x.name));
const manufactureList=(Array.isArray(effectiveMerged.manufacture)?effectiveMerged.manufacture:[]).filter(x=>x&&typeof x.name==="string");
const ufopaedia=Array.isArray(effectiveMerged.ufopaedia)?effectiveMerged.ufopaedia:[];

function ownerId(entry,index){
  if(!entry||typeof entry!=="object")return "#"+index;
  for(const k of identityKeys)if(typeof entry[k]==="string")return entry[k];
  return "#"+index;
}
function buildRefs(idSet){
  const refs=Object.fromEntries([...idSet].map(id=>[id,[]]));
  function walk(value,ctx,p=[]){
    if(typeof value==="string"){if(idSet.has(value))refs[value].push({...ctx,path:p.join(".")});return}
    if(Array.isArray(value)){value.forEach((v,i)=>walk(v,ctx,[...p,String(i)]));return}
    if(value&&typeof value==="object")for(const [k,v] of Object.entries(value))walk(v,ctx,[...p,k]);
  }
  for(const [section,value] of Object.entries(effectiveMerged)){
    if(!Array.isArray(value))continue;
    value.forEach((entry,i)=>walk(entry,{section,owner:ownerId(entry,i)},[]));
  }
  return refs;
}
const itemRefs=buildRefs(itemIds), researchRefs=buildRefs(researchIds);
const entityNameIds=new Set();
for(const value of Object.values(effectiveMerged))if(Array.isArray(value))value.forEach((entry,i)=>{const id=ownerId(entry,i);if(!id.startsWith("#"))entityNameIds.add(id)});

function groupRefs(refMap,id,excludeSection=null){
  const groups=new Map();
  for(const r of refMap[id]||[]){
    if(excludeSection&&r.section===excludeSection&&r.owner===id)continue;
    const key=r.section+"\u0000"+r.owner;
    const g=groups.get(key)||{section:r.section,id:r.owner,paths:[]};
    if(!g.paths.includes(r.path))g.paths.push(r.path);groups.set(key,g);
    if(!r.owner.startsWith("#"))entityNameIds.add(r.owner);
  }
  return [...groups.values()].sort((a,b)=>(a.section+a.id).localeCompare(b.section+b.id));
}
function containsId(v,id){
  if(v===id)return true;
  if(Array.isArray(v))return v.some(x=>containsId(x,id));
  if(v&&typeof v==="object")return Object.values(v).some(x=>containsId(x,id));
  return false;
}

const researchByName=new Map(researchList.map(x=>[x.name,x]));
const manufactureByName=new Map(manufactureList.map(x=>[x.name,x]));

function researchRelationsForItem(id){
  return groupRefs(itemRefs,id,"items").filter(x=>x.section==="research").map(g=>{
    const x=researchByName.get(g.id)||{};
    return {id:g.id,paths:g.paths,cost:x.cost??null,points:x.points??null,needItem:x.needItem??null,destroyItem:x.destroyItem??null,sourceFile:(sourceHistory["name:"+g.id]||[]).at(-1)||null};
  });
}
function manufactureRelationsForItem(id){
  return groupRefs(itemRefs,id,"items").filter(x=>x.section==="manufacture").map(g=>{
    const x=manufactureByName.get(g.id)||{};
    const requiredQty=x.requiredItems&&typeof x.requiredItems==="object"?x.requiredItems[id]??null:null;
    const producedQty=x.producedItems&&typeof x.producedItems==="object"?x.producedItems[id]??null:null;
    return {id:g.id,paths:g.paths,time:x.time??null,cost:x.cost??null,category:x.category??null,requiredQty,producedQty,sourceFile:(sourceHistory["name:"+g.id]||[]).at(-1)||null};
  });
}
function articleFor(id){
  return ufopaedia.filter(a=>containsId(a,id)).map(a=>{
    const titleKey=a.title||a.name||a.article||a.id||id;
    const textKey=a.text||a.description;
    const out={id:a.id||a.article||null,titleKey,titleKo:tr(titleKey,"ko"),titleEn:tr(titleKey,"en")};
    if(includeLore&&typeof textKey==="string"){out.textKey=textKey;out.textKo=tr(textKey,"ko");out.textEn=tr(textKey,"en")}
    return out;
  });
}

function kindOf(item){
  if(item.battleType===1)return"weapon";
  if(item.battleType===2)return"ammo";
  if(item.battleType===3)return"melee";
  if(item.battleType===4||item.battleType===5)return"grenade";
  if(item.battleType===6)return"medical";
  if(item.battleType===7)return"scanner";
  if(item.battleType===8||item.battleType===9)return"psi";
  if(item.battleType===10)return"flare";
  if(item.battleType===11)return"corpse";
  if(item.compatibleAmmo?.length)return"weapon";
  if(item.clipSize!=null)return"ammo";
  if(item.tuMelee!=null||item.meleePower!=null)return"melee";
  if(item.power!=null&&item.damageType!=null)return"damage-item";
  return"item";
}
function mode(item,key,label){
  const acc=item["accuracy"+key],tu=item["tu"+key],conf=item["conf"+key]||{};
  const shots=conf.shots??item[key.toLowerCase()+"Shots"]??(acc!=null||tu!=null?1:null);
  if(acc==null&&tu==null&&shots==null)return null;
  return{label,accuracy:acc??null,tu:tu??null,shots:shots??1,name:conf.name?tr(conf.name,"ko"):null,nameKey:conf.name??null};
}
function fireModes(item){return[mode(item,"Auto","연사"),mode(item,"Snap","스냅"),mode(item,"Aimed","조준"),mode(item,"Melee","근접")].filter(Boolean)}

const globals={
  oneHandedPenalty:effectiveMerged.oneHandedPenaltyGlobal??80,
  kneelBonus:effectiveMerged.kneelBonusGlobal??115,
  closeQuartersAccuracy:effectiveMerged.closeQuartersAccuracyGlobal??100,
  noLOSAccuracyPenalty:effectiveMerged.noLOSAccuracyPenaltyGlobal??-1
};
function coreStats(item){
  const bt=item.battleType??0,out={},sources={};
  const put=(k,v,s)=>{out[k]=v;sources[k]=s};
  const direct=(k,fallback)=>put(k,item[k]!==undefined&&item[k]!==null?item[k]:fallback,item[k]!==undefined&&item[k]!==null?"ruleset":"engineDefault");
  direct("battleType",0);direct("weight",3);direct("size",0);direct("costBuy",0);direct("costSell",0);direct("transferTime",24);direct("armor",20);
  direct("power",0);direct("meleePower",0);direct("clipSize",0);direct("minRange",0);direct("maxRange",200);direct("autoRange",7);direct("snapRange",15);
  direct("aimRange",bt===9?0:200);direct("dropoff",bt===9?1:2);direct("accuracyAimed",0);direct("accuracyAuto",0);direct("accuracySnap",0);
  direct("accuracyMelee",0);direct("accuracyUse",0);direct("accuracyThrow",100);direct("twoHanded",false);direct("blockBothHands",false);direct("shotgunPellets",0);
  direct("invWidth",1);direct("invHeight",1);direct("recover",true);direct("recoverCorpse",true);direct("monthlySalary",0);direct("monthlyMaintenance",0);
  const globalFallback=(k,rawKey,fallback)=>{const v=item[rawKey];put(k,v!==undefined&&v!==null&&v!==-1?v:fallback,v!==undefined&&v!==null&&v!==-1?"ruleset":"modGlobal")};
  globalFallback("oneHandedPenalty","oneHandedPenalty",globals.oneHandedPenalty);
  globalFallback("kneelBonus","kneelBonus",globals.kneelBonus);
  globalFallback("accuracyCloseQuarters","accuracyCloseQuarters",globals.closeQuartersAccuracy);
  globalFallback("noLOSAccuracyPenalty","noLOSAccuracyPenalty",globals.noLOSAccuracyPenalty);
  put("psiRequired",item.psiRequired!==undefined?item.psiRequired:bt===9,item.psiRequired!==undefined?"ruleset":"engineDefault");
  return{values:out,sources};
}
const effectiveCoreFields=Object.keys(coreStats({}).values);
const coreSourceLegend={r:"ruleset",e:"engineDefault",m:"modGlobal"};
function coreSourceCodes(sources){return effectiveCoreFields.map(k=>sources[k]==="ruleset"?"r":sources[k]==="modGlobal"?"m":"e").join("")}
function humanSummary(item){
  const bits=[];
  bits.push(battleTypeLabels[item.battleType]||kindOf(item));
  if(item.weight!=null)bits.push("무게 "+item.weight);
  if(item.costBuy!=null)bits.push("구매 "+Number(item.costBuy).toLocaleString("ko-KR"));
  if(item.costSell!=null)bits.push("판매 "+Number(item.costSell).toLocaleString("ko-KR"));
  if(item.power!=null){const k=damageKeys[item.damageType];bits.push("위력 "+item.power+(k?" ("+tr(k,"ko")+")":""))}
  if(item.meleePower!=null&&!item.power)bits.push("근접 위력 "+item.meleePower);
  if(item.clipSize!=null)bits.push("용량 "+item.clipSize);
  return tr(item.type,"ko")+": "+bits.join(" · ");
}

const reverseAmmo={};
for(const w of itemList)for(const ammo of w.compatibleAmmo||[])(reverseAmmo[ammo]||=[]).push(w.type);

const allItemKeys=[...new Set([...itemList,...itemDeclared].flatMap(x=>Object.keys(x)))].sort();
const itemFieldLabels={
 type:"내부 아이템 ID",weight:"무게",size:"창고 점유량",costBuy:"구매가",costSell:"판매가",monthlySalary:"월 급여/수익",monthlyMaintenance:"월 유지비",
 power:"기본 위력",meleePower:"근접 위력",damageType:"피해 유형",clipSize:"탄약 용량",compatibleAmmo:"호환 탄약",armor:"아이템 내구",
 accuracyAuto:"연사 명중률",accuracySnap:"스냅 명중률",accuracyAimed:"조준 명중률",accuracyMelee:"근접 명중률",
 tuAuto:"연사 TU",tuSnap:"스냅 TU",tuAimed:"조준 TU",tuMelee:"근접 TU",autoRange:"연사 기준거리",snapRange:"스냅 기준거리",aimRange:"조준 기준거리",
 twoHanded:"양손 무기",oneHandedPenalty:"한손 사용 보정",kneelBonus:"무릎쏴 보정",accuracyCloseQuarters:"근거리 명중",noLOSAccuracyPenalty:"LOS 미확보 보정",
 requires:"필요 연구/조건",requiresBuy:"구매 해금 조건",categories:"분류 태그",spawnUnit:"생성 유닛",spawnItem:"생성 아이템",recoveryPoints:"회수 포인트"
};
function genericDesc(k,label){
  if(k.startsWith("accuracy"))return label+". 명중 계산에 쓰이는 원본 계수입니다.";
  if(k.startsWith("tu")||k.startsWith("cost"))return label+". 행동/경제 비용 규칙입니다.";
  if(k.endsWith("Range")||k==="minRange"||k==="maxRange")return label+". 타일 거리 기반 계산값입니다.";
  if(/Sprite|Animation|Sound|vapor/i.test(k))return label+". 화면/음향 표현 리소스 설정입니다.";
  if(/requires|categories|tags/i.test(k))return label+". 해금·분류·사용 조건입니다.";
  return label+". X-Piratez/OXCE 원본 아이템 규칙 값입니다.";
}
const fieldMeta=Object.fromEntries(allItemKeys.map(k=>{const label=itemFieldLabels[k]||k;return[k,{label,description:genericDesc(k,label),separatedResource:isPresentationResourceKey(k)}]}));

const promotedSortableFields=new Set(["type","battleType","weight","size","costBuy","costSell","monthlySalary","monthlyMaintenance","power","damageType","clipSize","armor","accuracyAuto","accuracySnap","accuracyAimed","tuAuto","tuSnap","tuAimed","tuMelee","autoRange","snapRange","aimRange","oneHandedPenalty"]);
const sortableItemFieldSet=new Set();
const scalarFields=o=>Object.fromEntries(Object.entries(o).filter(([k,v])=>!isPresentationResourceKey(k)&&["string","number","boolean"].includes(typeof v)));
const itemDetails={},itemIndex=[],itemResourceDetails={};
for(const item of itemList){
  const id=item.type,core=coreStats(item),allSortable=scalarFields(item);Object.keys(allSortable).forEach(k=>sortableItemFieldSet.add(k));
  const sortable=Object.fromEntries(Object.entries(allSortable).filter(([k])=>!promotedSortableFields.has(k)));
  const dKey=Number.isInteger(item.damageType)?damageKeys[item.damageType]:null;
  const research=researchRelationsForItem(id),manufacture=manufactureRelationsForItem(id);
  const refs=groupRefs(itemRefs,id,"items");
  const bucket=crypto.createHash("sha1").update(id).digest("hex")[0];
  const effectiveSplit=splitPresentationResources(item),declared=declaredItemById.get(id)||item;
  const inheritedViaRefNode=Boolean(declaredItemById.get(id)?.refNode);
  const declaredSplit=inheritedViaRefNode?splitPresentationResources(declared):null;
  const resourceFieldCount=effectiveSplit.resources.length+(declaredSplit?.resources.length||0);
  const detail={
    id,bucket,koName:tr(id,"ko"),enName:tr(id,"en"),kind:kindOf(item),battleType:item.battleType??0,battleTypeLabel:battleTypeLabels[item.battleType]||"기타",
    summaryKo:humanSummary(item),sourceFiles:sourceHistory["type:"+id]||["Piratez.rul"],sourceFile:(sourceHistory["type:"+id]||["Piratez.rul"]).at(-1),
    damageType:item.damageType??null,damageTypeKey:dKey,damageTypeKo:dKey?tr(dKey,"ko"):null,damageTypeEn:dKey?tr(dKey,"en"):null,
    effectiveCore:core.values,effectiveCoreSourceCodes:coreSourceCodes(core.sources),fireModes:fireModes(item),
    compatibleAmmo:item.compatibleAmmo||[],usedByWeapons:reverseAmmo[id]||[],research,manufacture,otherReferences:refs.filter(x=>x.section!=="research"&&x.section!=="manufacture"),ufopaedia:articleFor(id),
    raw:effectiveSplit.core,inheritedViaRefNode,resourceFieldCount
  };
  if(inheritedViaRefNode)detail.rawDeclared=declaredSplit.core;
  if(resourceFieldCount)itemResourceDetails[id]={id,bucket,effective:effectiveSplit.resources,...(declaredSplit?.resources.length?{declared:declaredSplit.resources}:{})};
  itemDetails[id]=detail;
  itemIndex.push({
    id,bucket,koName:detail.koName,enName:detail.enName,kind:detail.kind,battleType:detail.battleType,battleTypeLabel:detail.battleTypeLabel,
    categories:(item.categories||[]).map(c=>tr(c,"ko")),categoryIds:item.categories||[],
    weight:core.values.weight,size:core.values.size,costBuy:item.costBuy??null,costSell:item.costSell??null,monthlySalary:item.monthlySalary??0,monthlyMaintenance:item.monthlyMaintenance??0,
    power:item.power??item.meleePower??null,damageType:detail.damageType,damageTypeKo:detail.damageTypeKo,clipSize:core.values.clipSize,armor:core.values.armor,
    accuracyAuto:item.accuracyAuto??null,accuracySnap:item.accuracySnap??null,accuracyAimed:item.accuracyAimed??null,
    tuAuto:item.tuAuto??null,tuSnap:item.tuSnap??null,tuAimed:item.tuAimed??null,tuMelee:item.tuMelee??null,
    autoRange:item.autoRange??null,snapRange:item.snapRange??null,aimRange:item.aimRange??null,oneHandedPenalty:core.values.oneHandedPenalty,
    researchCount:research.length,manufactureCount:manufacture.length,referenceCount:refs.length,hasUfopaedia:detail.ufopaedia.length>0,resourceFieldCount,sortable
  });
}
itemIndex.sort((a,b)=>a.koName.localeCompare(b.koName,"ko"));

const directDeps=new Map(),requiredBy=new Map(),explicitUnlocks=new Map();
for(const r of researchList){
  const deps=[...(Array.isArray(r.dependencies)?r.dependencies:[]),...(Array.isArray(r.requires)?r.requires:[])].filter(x=>researchIds.has(x));
  const uniq=[...new Set(deps)];directDeps.set(r.name,uniq);
  for(const d of uniq)(requiredBy.get(d)||requiredBy.set(d,[]).get(d)).push(r.name);
  const u=(Array.isArray(r.unlocks)?r.unlocks:[]).filter(x=>researchIds.has(x));explicitUnlocks.set(r.name,[...new Set(u)]);
  for(const x of u)(requiredBy.get(r.name)||requiredBy.set(r.name,[]).get(r.name));
}
const allResearchKeys=[...new Set(researchList.flatMap(x=>Object.keys(x)))].sort();
const researchFieldMeta=Object.fromEntries(allResearchKeys.map(k=>[k,{label:({name:"내부 연구 ID",cost:"연구량",points:"완료 점수",dependencies:"직접 선행",requires:"필요 조건",unlocks:"명시 해금",needItem:"실물 표본 필요",destroyItem:"표본 소모",getOneFree:"무료 획득",getOneFreeProtected:"조건부 무료 획득"}[k]||k),description:"X-Piratez 연구 규칙의 원본 필드입니다."}]));
const researchDetails={},researchIndex=[],researchResourceDetails={};
for(const r of researchList){
  const id=r.name,bucket=crypto.createHash("sha1").update(id).digest("hex")[0],refs=groupRefs(researchRefs,id,"research");
  const deps=directDeps.get(id)||[],reqBy=[...new Set(requiredBy.get(id)||[])],unlocks=explicitUnlocks.get(id)||[];
  const spawnedItems=(Array.isArray(r.spawnedItem)?r.spawnedItem:(r.spawnedItem==null?[]:[r.spawnedItem])).filter(x=>typeof x==="string");
  const items=refs.filter(x=>x.section==="items"),mans=refs.filter(x=>x.section==="manufacture"),others=refs.filter(x=>x.section!=="items"&&x.section!=="manufacture");
  const rawSplit=splitPresentationResources(r);
  const detail={
    id,bucket,koName:tr(id,"ko"),enName:tr(id,"en"),
    summaryKo:tr(id,"ko")+": 연구량 "+(r.cost??"—")+" · 완료 점수 "+(r.points??"—")+(r.needItem?" · 실물 표본 "+(r.destroyItem?"필요·소모":"필요"):""),
    cost:r.cost??null,points:r.points??null,needItem:Boolean(r.needItem),destroyItem:Boolean(r.destroyItem),
    dependencies:deps,requiredBy:reqBy,unlocks,
    itemReferences:items,manufactureReferences:mans,otherReferences:others,
    getOneFree:r.getOneFree||[],getOneFreeProtected:r.getOneFreeProtected||{},
    sourceFiles:sourceHistory["name:"+id]||["Piratez.rul"],raw:rawSplit.core,resourceFieldCount:rawSplit.resources.length
  };
  if(rawSplit.resources.length)researchResourceDetails[id]={id,bucket,effective:rawSplit.resources};
  researchDetails[id]=detail;
  researchIndex.push({
    id,bucket,koName:detail.koName,enName:detail.enName,cost:detail.cost,points:detail.points,needItem:detail.needItem,destroyItem:detail.destroyItem,
    dependencyCount:deps.length,requiredByCount:reqBy.length,spawnedItemCount:spawnedItems.length,itemReferenceCount:items.length,manufactureReferenceCount:mans.length,otherReferenceCount:others.length,
    sourceFile:detail.sourceFiles.at(-1)
  });
}
researchIndex.sort((a,b)=>a.koName.localeCompare(b.koName,"ko"));

const sortableItemFields=[...sortableItemFieldSet].filter(k=>k!=="type").sort((a,b)=>(fieldMeta[a]?.label||a).localeCompare(fieldMeta[b]?.label||b,"ko")).map(k=>({key:k,label:fieldMeta[k]?.label||k,storage:promotedSortableFields.has(k)?"topLevel":"sortable"}));
const entityNames=Object.fromEntries([...entityNameIds].sort().map(id=>[id,[tr(id,"ko"),tr(id,"en")]]));
const resourceCount=x=>Object.values(x).reduce((s,v)=>s+(v.effective?.length||0)+(v.declared?.length||0),0);
const itemResourceFields=resourceCount(itemResourceDetails),researchResourceFields=resourceCount(researchResourceDetails);

fs.rmSync(outDir,{recursive:true,force:true});fs.mkdirSync(outDir,{recursive:true});
function writeChunks(dir,details){
  const d=path.join(outDir,dir);fs.mkdirSync(d,{recursive:true});const buckets={};
  for(const [id,x] of Object.entries(details))(buckets[x.bucket]||={})[id]=x;
  for(const [b,v] of Object.entries(buckets))fs.writeFileSync(path.join(d,b+".json"),JSON.stringify({details:v}));
}
writeChunks("chunks",itemDetails);writeChunks("research-chunks",researchDetails);
writeChunks("resource-chunks/items",itemResourceDetails);writeChunks("resource-chunks/research",researchResourceDetails);

const manifest={
  generatedAt:new Date().toISOString(),
  mod:{name:META.name||"X-Piratez",version:META.version||"unknown",id:META.id||"piratez",requiredExtendedVersion:META.requiredExtendedVersion||null},
  source:{metadataSha256:sha256(metadataPath),rules:ruleFiles.map(file=>({file,sha256:sha256(path.join(rulesDir,file))})),languages:["ko.yml","en-US.yml"].filter(f=>fs.existsSync(path.join(langDir,f))).map(file=>({file,sha256:sha256(path.join(langDir,file))}))},
  counts:{items:itemIndex.length,research:researchIndex.length,manufacture:manufactureList.length,ufopaedia:ufopaedia.length,itemRuleFields:allItemKeys.length,sortableItemFields:sortableItemFields.length,entityNames:Object.keys(entityNames).length,itemResourceFields,researchResourceFields,separatedResourceFields:itemResourceFields+researchResourceFields},
  normalization:{entityNames:"entities.json",presentationResources:"resource-chunks/<kind>/<bucket>.json",resourceKinds:["items","research"],rawDeclaredStoredOnlyWhenInherited:true,itemReferenceUnionDerived:true,researchReferenceUnionDerived:true},
  loreIncluded:includeLore
};
fs.writeFileSync(path.join(outDir,"items-index.json"),JSON.stringify({meta:manifest,index:itemIndex}));
fs.writeFileSync(path.join(outDir,"research-index.json"),JSON.stringify({meta:manifest,index:researchIndex}));
fs.writeFileSync(path.join(outDir,"entities.json"),JSON.stringify({names:entityNames}));
fs.writeFileSync(path.join(outDir,"schema.json"),JSON.stringify({allItemKeys,fieldMeta,sortableItemFields,allResearchKeys,researchFieldMeta,effectiveCoreFields,coreSourceLegend,globalItemDefaults:globals,resourceStorage:{separated:true,path:"resource-chunks/<kind>/<bucket>.json",entryFormat:"[jsonPointer,value]"},damageTypes:damageKeys.map((k,i)=>({id:i,key:k,ko:tr(k,"ko"),en:tr(k,"en")}))},null,2));
fs.writeFileSync(path.join(outDir,"manifest.json"),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest.counts));
