// Parse only saved facility instances and manufacture orders at the base level.
// This intentionally does not infer workshop capacity, personnel throughput,
// completion ETA, game scheduling or availability from save values.
const ID=/^[A-Za-z0-9_.-]+$/;
const positive = x => Number.isSafeInteger(x) && x >= 0 && x <= 1000000000;
const safeInteger = (field, value) => {
  if (!/^\d+$/.test(value)) throw new Error('잘못된 '+field+' 수치');
  const n=Number(value);
  if (!positive(n)) throw new Error('허용 범위를 벗어난 '+field);
  return n;
};
export function parseSavedBaseOperations(text) {
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
  let section='',base=null,subsection='',entry=null;
  const result=[];
  const validateEntry=()=>{
    if (!entry) return;
    if (subsection==='facilities') {
      if (typeof entry.type!=='string') throw new Error('시설 type이 없는 세이브');
      base.facilities.push(entry);
    } else if (subsection==='productions') {
      if (typeof entry.item!=='string') throw new Error('생산 item이 없는 세이브');
      base.productions.push(entry);
    }
    entry=null;
  };
  const resetSub=()=>{validateEntry();subsection='';};
  const sectionRegex=/^([A-Za-z_][A-Za-z0-9_]*):/;
  for(const line of lines){
    const top=line.match(sectionRegex);
    if(top){
      if(section==='bases')resetSub();
      section=top[1];base=null;continue;
    }
    if(section!=='bases')continue;
    if(/^  -(?:\s|$)/.test(line)){
      resetSub();
      if(result.length>=32)throw new Error('너무 많은 기지');
      base={facilities:[],productions:[],facilitiesPresent:false,productionsPresent:false};
      result.push(base);continue;
    }
    if(!base)continue;
    const field=line.match(/^    (facilities|productions):\s*(.*?)\s*$/);
    if(field){
      resetSub();subsection=field[1];base[subsection+'Present']=true;
      if(field[2] && field[2]!=='[]')throw new Error('지원하지 않는 '+subsection+' 형태');
      if(field[2]==='[]')subsection='';
      continue;
    }
    if(!subsection)continue;
    if(/^    [^ ]/.test(line)){resetSub();continue;}
    const item=line.match(/^      -\s+(type|item):\s*([A-Za-z0-9_.-]+)\s*$/);
    if(item){
      validateEntry();
      const expected=subsection==='facilities'?'type':'item';
      if(item[1]!==expected)throw new Error('지원하지 않는 '+subsection+' 목록');
      entry={ [expected]:item[2] };continue;
    }
    if(/^      -/.test(line))throw new Error('시설/제조 주문의 ID 형태가 잘못되었습니다.');
    if(!entry)continue;
    const prop=line.match(/^        (buildTime|x|y|assigned|spent|amount|infinite|sell):\s*([^#\r\n]*?)\s*$/);
    if(!prop)continue;
    const [,key,value]=prop;
    if(['infinite','sell'].includes(key)){
      if(value!=='true'&&value!=='false')throw new Error(key+'는 불리언이어야 합니다.');
      entry[key]=value==='true';
    }else entry[key]=safeInteger(key,value);
  }
  if(section==='bases')resetSub();
  return result;
}
export function facilityReadiness(base, facilitiesIndex, recipe) {
  const requirements=recipe?.fields?.requiresBaseFunc;
  const required=Array.isArray(requirements)?requirements.filter(x=>typeof x==='string'):
    typeof requirements==='string'?[requirements]:[];
  const map=new Map(facilitiesIndex?.facilities?.map(x=>[x.id,x.fields])||[]);
  const provided=new Set(), unknown=new Set(), pending=new Set(), unrecognized=new Set();
  for(const instance of base?.facilities||[]){
    const field=map.get(instance.type);
    if(!field){unrecognized.add(instance.type);continue;}
    const functions=Array.isArray(field.provideBaseFunc)?field.provideBaseFunc:[];
    if(typeof instance.buildTime==='number'&&instance.buildTime>0){
      for(const fn of functions)pending.add(fn);
    }else if(instance.buildTime===undefined || instance.buildTime===0){
      for(const fn of functions)provided.add(fn);
    }else for(const fn of functions)unknown.add(fn);
  }
  const missing=required.filter(fn=>!provided.has(fn));
  return {
    required, provided:[...provided].sort(), pending:[...pending].sort(),
    missing, unrecognizedFacilities:[...unrecognized].sort(),
    evidence:base?.facilitiesPresent?'saved facility instance + explicit v.o2 provideBaseFunc':
      'facility list unavailable',
    note:'기지의 시설 인스턴스와 명시된 제공 기능만 대조합니다. 사용 중단, 특별 조건, 기능 결합, 제작 가능 인원·작업장 시간은 평가하지 않습니다.'
  };
}
export function productionOrders(base, manufacture) {
  const byId=new Map(manufacture.entries.map(x=>[x.id,x]));
  return (base?.productions||[]).map(p=>{
    const row=byId.get(p.item);
    return {
      id:p.item, name:row?.koName||row?.enName||p.item,
      catalogued:!!row,
      assigned:p.assigned??null, amount:p.amount??null,
      spent:p.spent??null, infinite:p.infinite??null,
      sell:p.sell??null,
      status:'saved order only; does not determine progress percentage or completion time'
    };
  });
}
