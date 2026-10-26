// Minimal whitelist parser for *only* bases / stationed soldiers / facilities
// / stock in the second document of an OXCE YAML save. This intentionally
// never evaluates YAML tags, aliases or object constructors. No server access.
const ID=/^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;
const STAT_KEYS=new Set(["tu","stamina","health","bravery","reactions","firing",
  "throwing","strength","psiStrength","psiSkill","melee","mana"]);
const NUMBER=/^[+-]?\d+$/;
const DECIMAL=/^[+-]?\d+(?:\.\d+)?$/;
const floatNum=s=>DECIMAL.test(String(s).trim())?Number(s):null;
const MAX_SIZE=60*1024*1024;
function num(text){
  if(!NUMBER.test(String(text).trim()))return null;
  const n=Number(String(text).trim().replace(/\s+#.*$/,"").trim());
  return NUMBER.test(String(text).trim().replace(/\s+#.*$/,"").trim())&&Number.isSafeInteger(n)?n:null;
}
function cleanText(value){
  const text=String(value||"").trim();
  if(text.startsWith('"')&&text.endsWith('"')){
    try{
      const decoded=JSON.parse(text);
      return typeof decoded==="string"?decoded:null;
    }catch{return null;}
  }
  if(text.startsWith("'")&&text.endsWith("'"))return text.slice(1,-1).replace(/''/g,"'");
  if(text.includes("#"))return text.split(/\s+#/)[0].trim();
  return text;
}
function field(text){
  const match=String(text).match(/^(['"]?[\w.:-]+['"]?)\s*:\s*(.*?)\s*$/);
  if(!match)return null;
  const key=cleanText(match[1]);
  return ID.test(key||"")?{key,value:match[2]}:null;
}
function flowFields(text){
  const raw=String(text||"").trim();
  if(!raw.startsWith("{")||!raw.endsWith("}"))return null;
  if(raw==="{}")return [];
  const entries=raw.slice(1,-1).split(",").map(s=>field(s.trim()));
  return entries.every(Boolean)?entries:null;
}
function newBase(index){
  return {index,name:"기지 "+(index+1),soldiers:[],facilities:[],items:new Map(),
    itemsComplete:false,facilitiesComplete:false,soldiersComplete:true};
}
function newSoldier(index){
  return {slot:index,id:null,name:"대원 "+(index+1),type:null,
    rank:null,stats:new Map(),initialStats:new Map(),armor:null,healthMissing:null,manaMissing:null,
    previousTransformations:{},transformationBonuses:{},medals:new Map(),
    medalsComplete:false,diarySeen:false,historyComplete:true,bonusesComplete:true,recovery:null};
}
function readSecondDocument(text){
  let doc=0,seen=false,found=false,bases=null;
  const extracted=[];
  for(const line of text.replace(/^\uFEFF/,"").split(/\r?\n/)){
    if(/^---(?:\s+#.*)?\s*$/.test(line)){
      if(seen)doc++;
      seen=false;
      continue;
    }
    if(line.trim()&&!line.trim().startsWith("#"))seen=true;
    if(doc!==1)continue;
    if(/^bases:(?:\s|$)/.test(line)){
      if(found)throw new Error("두 번째 문서의 bases 항목이 중복되었습니다.");
      found=true;
      bases=line.slice(6).trim();
      continue;
    }
    if(found&&/^[A-Za-z][\w-]*:/.test(line))break;
    if(found)extracted.push(line);
  }
  return found?{head:bases,lines:extracted}:null;
}
function parseMedal(raw){
  const pairs=flowFields(raw);
  if(!pairs)return null;
  const map=Object.fromEntries(pairs.map(p=>[p.key,cleanText(p.value)]));
  const id=map.commendationName,level=num(map.decorationLevel);
  if(!ID.test(id||"")||level==null||level<0)return null;
  return {id,level};
}
export function readSavePersonnel(text){
  if(typeof text!=="string"||text.length<30||text.length>MAX_SIZE)
    throw new Error("세이브가 비었거나 60MB 제한을 넘었습니다.");
  if(text.includes("\0")||text.includes("\uFFFD"))
    throw new Error("UTF-8 YAML 텍스트 세이브가 아닙니다.");
  const section=readSecondDocument(text);
  if(!section)return {bases:[],warnings:["세이브의 두 번째 문서에 bases 항목이 없습니다."]};
  if(section.head==="[]"||section.head==="null"||section.head==="~")
    return {bases:[],warnings:["기지 목록이 비어 있습니다."]};
  if(section.head!=="")
    return {bases:[],warnings:["지원하지 않는 bases 형식이므로 기지 증빙은 적용하지 않습니다."]};
  let base=null,group=null,facility=null,soldier=null,soldierGroup=null,diaryGroup=null,medal=null;
  const bases=[],warnings=[];
  for(const line of section.lines){
    if(!line.trim()||line.trim().startsWith("#"))continue;
    if(/\t/.test(line.slice(0,line.length-line.trimStart().length))){
      warnings.push("들여쓰기에 탭이 있어 일부 기지 데이터를 신뢰할 수 없습니다.");break;
    }
    const spaces=line.length-line.trimStart().length,raw=line.trim();
    if(spaces===2&&raw.startsWith("- ")){
      if(bases.length>=150)throw new Error("기지 수가 제한을 초과했습니다.");
      base=newBase(bases.length);
      bases.push(base);group=null;facility=null;soldier=null;
      const initial=field(raw.slice(2));
      if(initial?.key==="name")base.name=cleanText(initial.value)||base.name;
      continue;
    }
    if(!base)continue;
    if(spaces===4){
      const f=field(raw);group=f?.key||null;facility=null;soldier=null;soldierGroup=null;diaryGroup=null;medal=null;
      if(!f)continue;
      if(f.key==="name")base.name=cleanText(f.value)||base.name;
      if(f.key==="items")base.itemsComplete=true;
      if(f.key==="facilities")base.facilitiesComplete=true;
      if(f.key==="soldiers")base.soldiersComplete=true;
      if(f.key==="items"&&f.value!==""){
        if(f.value==="{}"){}
        else if(f.value==="null"||f.value==="~")base.itemsComplete=false;
        else {
          const all=flowFields(f.value);
          if(!all)base.itemsComplete=false;
          else for(const x of all){
            const n=num(x.value);
            if(n==null||n<0||base.items.has(x.key))base.itemsComplete=false;
            else base.items.set(x.key,n);
          }
        }
      }
      if(f.key==="facilities"&&f.value!==""&&f.value!=="[]")
        base.facilitiesComplete=false;
      if(f.key==="soldiers"&&f.value!==""&&f.value!=="[]")
        base.soldiersComplete=false;
      continue;
    }
    if(spaces===6&&group==="items"){
      const f=field(raw),n=f&&num(f.value);
      if(!f||n==null||n<0||base.items.has(f.key))base.itemsComplete=false;
      else base.items.set(f.key,n);
      continue;
    }
    if(spaces===6&&group==="facilities"&&raw.startsWith("- ")){
      if(base.facilities.length>=500)throw new Error("한 기지의 시설이 500개를 넘었습니다.");
      facility={type:null,buildTime:0,complete:true};
      base.facilities.push(facility);
      const f=field(raw.slice(2));
      if(f?.key==="type"&&ID.test(cleanText(f.value)||""))facility.type=cleanText(f.value);
      else facility.complete=false;
      continue;
    }
    if(spaces===8&&group==="facilities"&&facility){
      const f=field(raw);
      if(f?.key==="type"&&ID.test(cleanText(f.value)||""))facility.type=cleanText(f.value);
      if(f?.key==="buildTime"){
        const n=num(f.value);
        if(n==null||n<0)facility.complete=false;
        else facility.buildTime=n;
      }
      if(f?.key==="disabled"&&f.value.trim()==="true")facility.complete=false;
      continue;
    }
    if(spaces===6&&group==="soldiers"&&raw.startsWith("- ")){
      if(base.soldiers.length>=2500)throw new Error("한 기지의 대원이 2,500명을 넘었습니다.");
      soldier=newSoldier(base.soldiers.length);
      base.soldiers.push(soldier);soldierGroup=null;diaryGroup=null;medal=null;
      const f=field(raw.slice(2));
      if(f?.key==="type"&&ID.test(cleanText(f.value)||""))soldier.type=cleanText(f.value);
      continue;
    }
    if(!soldier||group!=="soldiers")continue;
    if(spaces===8){
      const f=field(raw);
      soldierGroup=f?.key||null;diaryGroup=null;medal=null;
      if(!f)continue;
      if(f.key==="type"&&ID.test(cleanText(f.value)||""))soldier.type=cleanText(f.value);
      if(f.key==="id")soldier.id=num(f.value);
      if(f.key==="name")soldier.name=cleanText(f.value)||soldier.name;
      if(f.key==="rank")soldier.rank=num(f.value);
      if(f.key==="recovery")soldier.recovery=floatNum(f.value);
      if(f.key==="armor")soldier.armor=cleanText(f.value);
      if(f.key==="healthMissing")soldier.healthMissing=num(f.value);
      if(f.key==="manaMissing")soldier.manaMissing=num(f.value);
      if(f.key==="diary"){soldier.diarySeen=true;soldier.medalsComplete=f.value===""||f.value==="{}";}
      if(["currentStats","initialStats"].includes(f.key)&&f.value!==""){
        const pairs=flowFields(f.value);
        if(pairs)for(const pair of pairs){
          const n=num(pair.value);
          if(n!=null&&n>=0&&STAT_KEYS.has(pair.key))(f.key==="initialStats"?soldier.initialStats:soldier.stats).set(pair.key,n);
        }
      }
      for(const [key,completeKey] of [["previousTransformations","historyComplete"],["transformationBonuses","bonusesComplete"]])
        if(f.key===key&&f.value!==""){
          const pairs=flowFields(f.value);
          if(!pairs)soldier[completeKey]=false;
          else for(const pair of pairs){
            const n=num(pair.value);
            if(n==null||n<0)soldier[completeKey]=false;
            else if(n>0)soldier[key][pair.key]=n;
          }
        }
      continue;
    }
    if(spaces===10&&["currentStats","initialStats"].includes(soldierGroup)){
      const f=field(raw),n=f&&num(f.value);
      if(f&&STAT_KEYS.has(f.key)&&n!=null&&n>=0)(soldierGroup==="initialStats"?soldier.initialStats:soldier.stats).set(f.key,n);
      continue;
    }
    if(spaces===10&&["previousTransformations","transformationBonuses"].includes(soldierGroup)){
      const f=field(raw),n=f&&num(f.value);
      const completeKey=soldierGroup==="previousTransformations"?"historyComplete":"bonusesComplete";
      if(!f||n==null||n<0)soldier[completeKey]=false;
      else if(n>0)soldier[soldierGroup][f.key]=n;
      continue;
    }
    if(spaces===10&&soldierGroup==="diary"){
      const f=field(raw);diaryGroup=f?.key||null;medal=null;
      if(f?.key==="commendations"){
        if(f.value==="[]"||f.value==="null"||f.value==="~")soldier.medalsComplete=true;
        else if(f.value==="")soldier.medalsComplete=true;
        else soldier.medalsComplete=false;
      }
      continue;
    }
    if(spaces===12&&soldierGroup==="diary"&&diaryGroup==="commendations"&&raw.startsWith("- ")){
      const content=raw.slice(2).trim();
      medal=parseMedal(content);
      if(!medal){
        const f=field(content);
        if(f?.key==="commendationName"&&ID.test(cleanText(f.value)||""))
          medal={id:cleanText(f.value),level:null};
        else soldier.medalsComplete=false;
      }else soldier.medals.set(medal.id,medal.level);
      continue;
    }
    if(spaces===14&&soldierGroup==="diary"&&diaryGroup==="commendations"&&medal){
      const f=field(raw);
      if(f?.key==="commendationName"&&ID.test(cleanText(f.value)||""))
        medal.id=cleanText(f.value);
      if(f?.key==="decorationLevel")medal.level=num(f.value);
      if(medal.id&&medal.level!=null&&medal.level>=0)
        soldier.medals.set(medal.id,medal.level);
      continue;
    }
  }
  for(const b of bases){
    if(b.facilities.some(f=>!f.complete||!f.type))b.facilitiesComplete=false;
    if(b.soldiers.some(s=>!s.type))b.soldiersComplete=false;
    for(const s of b.soldiers){
      // OXCE omits a diary section for a soldier who has no diary record.
      if(!s.diarySeen)s.medalsComplete=true;
      if(!s.historyComplete)warnings.push("일부 대원의 변신 이력 파싱 불완전");
      if(!s.bonusesComplete)warnings.push("일부 대원의 SoldierBonus 목록 파싱 불완전");
      if(!s.medalsComplete&&s.diarySeen)warnings.push("일부 대원의 훈장 기록 파싱 불완전");
    }
    if(!b.itemsComplete)warnings.push("일부 기지의 재고 파싱 불완전");
    if(!b.facilitiesComplete)warnings.push("일부 기지의 시설 파싱 불완전");
    if(!b.soldiersComplete)warnings.push("일부 기지의 주둔 대원 목록 파싱 불완전");
  }
  return {bases,warnings:[...new Set(warnings)]};
}
// OXCE applies each unique SoldierBonus once, regardless of the saved count.
// Bonuses do not unlock a psi skill whose raw currentStats value is <= 0.
export function effectiveSoldierStats(soldier,bonuses){
  if(!soldier)return {stats:new Map(),complete:false,missing:[]};
  if(!soldier.bonusesComplete)return {stats:new Map(),complete:false,missing:["unparsed"]};
  const names=Object.keys(soldier.transformationBonuses||{});
  const missing=names.filter(id=>!bonuses?.[id]?.stats);
  if(missing.length)return {stats:new Map(),complete:false,missing};
  const stats=new Map(soldier.stats);
  for(const [stat,original] of soldier.stats){
    let result=original;
    for(const id of names)result+=Number(bonuses[id].stats?.[stat])||0;
    if(stat==="psiSkill"&&original<=0)result=original;
    stats.set(stat,Math.max(stat==="health"?1:0,result));
  }
  return {stats,complete:true,missing:[]};
}
export function facilityEvidence(base,facilityIndex,requiredBaseFuncs=[]){
  const known=new Map(),byId=new Map((facilityIndex||[]).map(f=>[f.id,f]));
  if(!base)return {functions:known,complete:false,unresolved:[]};
  const unresolved=[];
  for(const item of base.facilities){
    const f=byId.get(item.type);
    if(!f||!item.complete){unresolved.push(item.type||"unknown");continue;}
    if(item.buildTime>0)continue; // Planned structures do not yet supply facilities.
    for(const k of f.provideBaseFunc||[])known.set(k,1);
  }
  const complete=base.facilitiesComplete&&unresolved.length===0;
  if(complete)for(const id of requiredBaseFuncs)if(!known.has(id))known.set(id,0);
  return {functions:known,complete,unresolved};
}
export function inventoryEvidence(base,requiredItemIds=[]){
  if(!base)return new Map();
  const result=new Map(base.items);
  if(base.itemsComplete)for(const id of requiredItemIds)
    if(!result.has(id))result.set(id,0);
  return result;
}
export function medalEvidence(soldier,requiredMedalIds=[]){
  if(!soldier)return new Map();
  const result=new Map(soldier.medals);
  if(soldier.medalsComplete)for(const id of requiredMedalIds)
    if(!result.has(id))result.set(id,-1);
  return result;
}
