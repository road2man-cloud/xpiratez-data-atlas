import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "js-yaml";

const args=process.argv.slice(2);
const arg=(name,fallback=null)=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:fallback};
const source=arg("--source",process.env.XPIRATEZ_MOD_PATH);
const outDir=path.resolve(arg("--out","public/data"));
const repoRoot=path.resolve(arg("--repo","."));
if(!source){console.error("Usage: node tools/build-manufacture-data.mjs --source <.../Piratez> [--out public/data]");process.exit(2)}
const modRoot=path.resolve(source),rulesDir=path.join(modRoot,"Ruleset"),langDir=path.join(modRoot,"Language");
const read=p=>fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"");
const loadJson=p=>JSON.parse(fs.readFileSync(path.resolve(repoRoot,p),"utf8"));
const loadYaml=p=>{const docs=[];yaml.loadAll(read(p),d=>{if(d)docs.push(d)},{json:true});return docs};

function deepMerge(a,b){
  if(a&&b&&typeof a==="object"&&b&&typeof b==="object"&&!Array.isArray(a)&&!Array.isArray(b)){
    const out={...a};for(const [k,v] of Object.entries(b))out[k]=k in out?deepMerge(out[k],v):v;return out;
  }
  return b;
}
const identityKeys=["type","name","id","article","race","category","region","deployment","missionName","script","eventScript","cutscene","commendation"];
function identityOf(x){if(!x||typeof x!=="object"||Array.isArray(x))return null;for(const k of identityKeys)if(typeof x[k]==="string")return k+":"+x[k];return null}
function mergeSection(oldValue,newValue){
  if(!Array.isArray(oldValue)||!Array.isArray(newValue))return deepMerge(oldValue,newValue);
  const out=[...oldValue],pos=new Map();out.forEach((x,i)=>{const id=identityOf(x);if(id)pos.set(id,i)});
  for(const x of newValue){
    if(x&&typeof x==="object"&&!Array.isArray(x)&&typeof x.delete==="string"){
      const idx=out.findIndex(y=>y&&typeof y==="object"&&Object.values(y).includes(x.delete));if(idx>=0)out.splice(idx,1);
      continue;
    }
    const id=identityOf(x);if(id&&pos.has(id)){const i=pos.get(id);out[i]=deepMerge(out[i],x)}else{out.push(x);if(id)pos.set(id,out.length-1)}
  }
  return out;
}
function resolveRefNode(value,depth=0){
  if(!value||typeof value!=="object"||Array.isArray(value))return value;
  if(depth>32)throw new Error("refNode nesting exceeded 32 levels");
  const child={...value},parent=child.refNode;delete child.refNode;
  return parent&&typeof parent==="object"&&!Array.isArray(parent)?deepMerge(resolveRefNode(parent,depth+1),child):child;
}
const merged={},sourceHistory={};
for(const file of fs.readdirSync(rulesDir).filter(f=>f.toLowerCase().endsWith(".rul")).sort()){
  for(const doc of loadYaml(path.join(rulesDir,file))){
    for(const [section,value] of Object.entries(doc)){
      merged[section]=section in merged?mergeSection(merged[section],value):value;
      if(Array.isArray(value))for(const entry of value){const id=identityOf(entry);if(id){const a=sourceHistory[id]||=[];if(a.at(-1)!==file)a.push(file)}}
    }
  }
}
const effective={...merged};
if(Array.isArray(merged.manufacture))effective.manufacture=merged.manufacture.map(v=>resolveRefNode(v));

function locale(code){const p=path.join(langDir,code+".yml");if(!fs.existsSync(p))return{};const d=yaml.load(read(p),{json:true})||{};return d[code]||d}
const ko=locale("ko"),en=locale("en-US");
function tr(id,which="ko"){if(typeof id!=="string")return String(id??"");const a=which==="ko"?ko:en,b=which==="ko"?en:ko;const v=a[id]??b[id]??id;return Array.isArray(v)?v.join(" / "):String(v).replaceAll("{NEWLINE}"," ").replace(/\s+/g," ").trim()}
function arr(v){return Array.isArray(v)?v:(v==null?[]:[v])}
function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function num(v){return Number.isFinite(Number(v))?Number(v):0}
function bucket(id){return crypto.createHash("sha1").update(id).digest("hex")[0]}
function fmt(v){return Number(v||0).toLocaleString("ko-KR")}
function hasBatchim(s){const t=String(s||"").trim();for(let i=t.length-1;i>=0;i--){const c=t.charCodeAt(i);if(c>=0xac00&&c<=0xd7a3)return(c-0xac00)%28!==0;if(/[A-Za-z0-9]/.test(t[i]))return false}return false}
function topic(s){const v=String(s||"").trim();return v+(hasBatchim(v)?"은":"는")}
function objectWord(s){const v=String(s||"").trim();return v+(hasBatchim(v)?"을":"를")}
function hoursText(h){const n=num(h);if(!n)return"0시간";if(n<24)return n.toLocaleString("ko-KR")+"시간";const d=n/24;return (Number.isInteger(d)?d:d.toFixed(d>=10?1:2))+"일"}
function expanded(text,fallback){const t=String(text||"").trim();return t.length>=45?t:[t,fallback].filter(Boolean).join(" ")}

const recipes=arr(effective.manufacture).filter(x=>x&&typeof x.name==="string");
const itemIndex=loadJson("public/items/data/items-index.json").index||[];
const itemMap=new Map(itemIndex.map(x=>[x.id,x]));
const researchIndex=loadJson("public/items/data/research-index.json").index||[];
const researchInsightIndex=loadJson("public/items/data/research-insight-index.json").index||[];
const researchMap=new Map(researchIndex.map(x=>[x.id,x]));
const researchInsightMap=new Map(researchInsightIndex.map(x=>[x.id,x]));
const facilitiesIndex=loadJson("public/data/facilities-index.json").index||[];
const facilityProviders=new Map();
for(const f of facilitiesIndex)for(const func of arr(f.provideBaseFunc)){
  if(!facilityProviders.has(func))facilityProviders.set(func,[]);
  facilityProviders.get(func).push({id:f.id,koName:f.koName,enName:f.enName,buildCost:f.buildCost,buildTime:f.buildTime});
}
const craftIds=new Set(arr(effective.crafts).map(x=>x?.type).filter(Boolean));

function named(id){return{id,koName:tr(id,"ko"),enName:tr(id,"en")}}
function itemDetail(id,qty){
  const x=itemMap.get(id);return{...named(id),qty:num(qty),costSell:x?.costSell??null,costBuy:x?.costBuy??null,size:x?.size??null};
}
function researchClosure(roots){
  const seen=new Set(),stack=[...new Set(arr(roots).filter(x=>typeof x==="string"&&researchMap.has(x)))];
  while(stack.length){const id=stack.pop();if(seen.has(id))continue;seen.add(id);for(const d of arr(researchInsightMap.get(id)?.dependencyIds))if(researchMap.has(d)&&!seen.has(d))stack.push(d)}
  const ids=[...seen],totalCost=ids.reduce((s,id)=>s+num(researchMap.get(id)?.cost),0);
  const eventOrFree=ids.filter(id=>{const x=researchInsightMap.get(id);return ["event-grant","research-granted-by"].includes(x?.primaryInsightKind)});
  const branch=ids.filter(id=>arr(researchInsightMap.get(id)?.insightKinds).includes("branch-choice"));
  return{ids,count:ids.length,totalCost,eventOrFreeIds:eventOrFree,branchIds:branch};
}
function normalizeOutputs(m){
  const explicit=obj(m.producedItems),det={...explicit};
  let defaultOutput=false;
  if(!Object.keys(det).length&&itemMap.has(m.name)){det[m.name]=1;defaultOutput=true}
  const deterministic=Object.entries(det).map(([id,qty])=>itemDetail(id,qty));
  const random=arr(m.randomProducedItems).map((row,i)=>{
    const weight=num(row?.[0]),outs=obj(row?.[1]);
    return{index:i+1,weight,outputs:Object.entries(outs).map(([id,qty])=>itemDetail(id,qty))};
  });
  const totalWeight=random.reduce((s,x)=>s+x.weight,0);
  for(const x of random)x.probability=totalWeight>0?x.weight/totalWeight:null;
  const expectedRandom=new Map();
  for(const option of random)for(const o of option.outputs)expectedRandom.set(o.id,(expectedRandom.get(o.id)||0)+(option.probability??0)*o.qty);
  return{deterministic,random,totalWeight,expectedRandom:[...expectedRandom].map(([id,qty])=>({...named(id),expectedQty:qty})),defaultOutput};
}
function knownSellValue(xs){let value=0,complete=true;for(const x of xs){if(x.costSell==null){complete=false;continue}value+=num(x.costSell)*num(x.qty)}return{value,complete}}
function randomExpectedSell(random){
  let value=0,complete=true;
  for(const op of random){
    let ov=0;
    for(const x of op.outputs){if(x.costSell==null){complete=false;continue}ov+=num(x.costSell)*x.qty}
    value+=(op.probability??0)*ov;
  }
  return{value,complete};
}
function roleOf(m,random,hasPerson,hasCraft){
  if(hasPerson||m.category==="STR_RECRUITMENT")return"recruitment";
  if(hasCraft||m.category==="STR_CRAFT")return"craft";
  if(m.category==="STR_DISASSEMBLY"||/DISASSEMBLY|_DA$/.test(m.name))return"disassembly";
  if(m.category==="STR_EXTRACTION"||/EXTRACTION|_EX$|_EEX$/.test(m.name))return"extraction";
  if(random.length)return"random";
  return"production";
}
const roleKo={production:"일반 생산",disassembly:"분해/회수",extraction:"추출/개봉",recruitment:"병사/인원 획득",craft:"기체 제작",random:"랜덤 생산"};

const rows=[],details={},editorials={};
for(const m of recipes){
  const id=m.name,b=bucket(id),requiredItems=Object.entries(obj(m.requiredItems)).map(([x,q])=>itemDetail(x,q));
  const outputs=normalizeOutputs(m),directRequires=arr(m.requires).filter(x=>typeof x==="string"),research=researchClosure(directRequires);
  const baseFuncs=arr(m.requiresBaseFunc).filter(x=>typeof x==="string");
  const baseFuncDetails=baseFuncs.map(id=>({...named(id),providers:facilityProviders.get(id)||[]}));
  const hasPerson=typeof m.spawnedPersonType==="string",hasCraft=m.category==="STR_CRAFT"&&craftIds.has(id);
  const role=roleOf(m,outputs.random,hasPerson,hasCraft);
  const inputVal=knownSellValue(requiredItems),detVal=knownSellValue(outputs.deterministic),randVal=randomExpectedSell(outputs.random);
  const expectedOutputSell=detVal.value+randVal.value;
  const outputComplete=detVal.complete&&randVal.complete&&!hasPerson&&!hasCraft;
  const inputComplete=inputVal.complete;
  const economicComparable=outputComplete&&inputComplete;
  const cashMargin=economicComparable?expectedOutputSell-num(m.cost):null;
  const opportunityNet=economicComparable?cashMargin-inputVal.value:null;
  const perHour=economicComparable&&num(m.time)>0?opportunityNet/num(m.time):null;
  const categoryKo=tr(m.category,"ko"),categoryEn=tr(m.category,"en");
  const detail={
    id,bucket:b,koName:tr(id,"ko"),enName:tr(id,"en"),category:m.category,categoryKo,categoryEn,role,roleKo:roleKo[role],
    time:m.time??0,cost:m.cost??0,space:m.space??0,refund:Boolean(m.refund),listOrder:m.listOrder??null,
    directRequires,directResearch:directRequires.map(id=>({...named(id),cost:researchMap.get(id)?.cost??null,primaryKind:researchInsightMap.get(id)?.primaryInsightKind??null})),
    research:{count:research.count,totalCost:research.totalCost,eventOrFreeCount:research.eventOrFreeIds.length,branchCount:research.branchIds.length,eventOrFree:research.eventOrFreeIds.slice(0,8).map(named),branches:research.branchIds.slice(0,8).map(named)},requiresBaseFunc:baseFuncs,baseFuncDetails,requiredItems,
    deterministicOutputs:outputs.deterministic,randomOutputs:outputs.random,expectedRandomOutputs:outputs.expectedRandom,randomWeightTotal:outputs.totalWeight,defaultOutput:outputs.defaultOutput,
    spawnedPersonType:m.spawnedPersonType??null,spawnedPersonTypeName:m.spawnedPersonType?tr(m.spawnedPersonType,"ko"):null,
    spawnedPersonName:m.spawnedPersonName??null,spawnedSoldier:m.spawnedSoldier??null,
    craftOutput:hasCraft?named(id):null,
    economics:{
      inputSellOpportunityValue:inputVal.value,inputSellCoverage:inputComplete,
      deterministicOutputSellValue:detVal.value,randomExpectedSellValue:randVal.value,
      expectedOutputSellValue:expectedOutputSell,outputSellCoverage:outputComplete,economicComparable,
      manufactureCashCost:num(m.cost),cashMargin,opportunityNet,opportunityNetPerEngineerHour:perHour
    },
    sourceFiles:sourceHistory["name:"+id]||[],raw:m
  };
  (details[b]||={})[id]=detail;

  const outputNames=[
    ...detail.deterministicOutputs.map(x=>x.koName+(x.qty!==1?" ×"+fmt(x.qty):"")),
    ...(detail.craftOutput?[detail.craftOutput.koName+" (기체)"]:[]),
    ...(detail.spawnedPersonType?[detail.spawnedPersonTypeName+" (병사/인원)"]:[])
  ];
  const inputNames=requiredItems.map(x=>x.koName+" ×"+fmt(x.qty));
  const researchNames=detail.directResearch.map(x=>x.koName);
  const providers=[...new Set(baseFuncDetails.flatMap(x=>x.providers.map(p=>p.koName)))];
  const outputText=outputNames.length?outputNames.slice(0,5).join(" · ")+(outputNames.length>5?" 외 "+(outputNames.length-5)+"개":""):"명시된 확정 산출물 없음";
  const inputText=inputNames.length?inputNames.slice(0,5).join(" · ")+(inputNames.length>5?" 외 "+(inputNames.length-5)+"개":""):"재료 없음";
  let overview;
  if(role==="recruitment")overview=topic(detail.koName)+" 제조 시스템을 통해 "+objectWord(detail.spawnedPersonTypeName||"병사/인원")+" 획득하는 모집·복구형 제조식이다. 일반 아이템 생산과 달리 병사 자체의 가치는 판매가 경제성에 포함하지 않는다.";
  else if(role==="craft")overview=topic(detail.koName)+" 기체를 실제 제작하는 제조식이다. 연구 완료만으로 기체가 생기는 것이 아니라 이 제조 시간·비용·재료와 작업장 조건을 별도로 충족해야 한다.";
  else if(role==="disassembly")overview=topic(detail.koName)+" 보유 물품을 분해해 다른 자원으로 회수하는 제조식이다. 원재료를 그냥 판매할 때와 분해 산출물을 판매할 때의 기회비용 차이가 경제성 판단의 핵심이다.";
  else if(role==="extraction")overview=topic(detail.koName)+" 상자·시체·부품 등에서 자원을 추출하거나 개봉하는 제조식이다. 랜덤 산출물이 있으면 평균 기대값과 실제 1회 결과의 변동성을 분리해서 봐야 한다.";
  else if(detail.randomOutputs.length)overview=topic(detail.koName)+" 확정 산출물 외에 가중치 기반 랜덤 산출물이 붙는 제조식이다. 표의 기대 판매가는 반복 시행의 평균값이지 한 번의 보장 수익이 아니다.";
  else overview=topic(detail.koName)+" "+categoryKo+" 계열 제조식이다. 시간·비용뿐 아니라 필요한 연구·기지 기능·재료와 실제 산출물을 함께 봐야 제조 가능 시점과 가치가 드러난다.";

  const unlock=[
    researchNames.length?"직접 요구 연구: "+researchNames.slice(0,4).join(" · ")+(researchNames.length>4?" 외 "+(researchNames.length-4)+"개":"")+".":"직접 요구 연구 없음.",
    research.count?"재귀 선행망은 "+fmt(research.count)+"개, 명목 연구량 합계 "+fmt(research.totalCost)+"이다.":"",
    baseFuncs.length?"필요 baseFunc는 "+baseFuncs.join(" · ")+"이며 제공 시설 예시는 "+(providers.slice(0,4).join(" · ")||"현재 시설 DB에서 직접 제공자 미확인")+"이다.":"별도 baseFunc 요구 없음."
  ].filter(Boolean).join(" ");

  let io="투입: "+inputText+". 확정 산출: "+outputText+".";
  if(detail.randomOutputs.length){
    const exp=detail.expectedRandomOutputs.slice(0,5).map(x=>x.koName+" 평균 "+x.expectedQty.toFixed(x.expectedQty<1?2:1)).join(" · ");
    io+=" 랜덤 후보 "+fmt(detail.randomOutputs.length)+"개, 총 가중치 "+fmt(detail.randomWeightTotal)+(exp?". 가중치 기준 기대 추가 산출은 "+exp:"")+"이다.";
  }
  if(detail.spawnedPersonType)io+=" 생성 병종은 "+detail.spawnedPersonTypeName+"이다.";
  if(io.length<45)io+=" 위 수량은 제조 1회 기준의 직접 투입량과 확정 산출량이다.";

  let economics;
  if(economicComparable){
    economics="아이템 판매가 기준 기대 산출가 "+fmt(expectedOutputSell)+", 제조 현금비 "+fmt(detail.cost)+", 투입 재료를 그냥 팔았을 때의 기회비용 "+fmt(inputVal.value)+"이다. 순가치는 "+(opportunityNet>=0?"+":"")+fmt(Math.round(opportunityNet))+"이고";
    economics+=detail.time>0?" 기술자-시간당 약 "+(perHour>=0?"+":"")+fmt(Math.round(perHour))+"이다.":" 제조시간이 0이라 시간당 값은 계산하지 않았다.";
  }else{
    economics="확인 가능한 아이템 산출의 판매가 기대값은 "+fmt(Math.round(expectedOutputSell))+", 재료 판매 기회비용은 "+fmt(inputVal.value)+"이다. ";
    if(hasPerson||hasCraft)economics+="병사·기체 자체 가치는 판매가로 환산하지 않아 완전한 순이익 비교 대상에서 제외했다.";
    else economics+="일부 산출물의 판매가를 확인할 수 없어 순이익 정렬에서는 제외했다.";
  }

  const execution="제조 시간은 "+fmt(detail.time)+" 기술자-시간("+hoursText(detail.time)+")이다. 기술자 10명을 계속 투입한다고 단순 환산하면 약 "+hoursText(detail.time/10)+"이며, 실제 완료 시점은 가용 작업장 공간·인력 배분에 따라 달라진다. 제조비는 "+fmt(detail.cost)+", space 값은 "+fmt(detail.space)+"이다.";

  let decision;
  if(role==="recruitment")decision=(detail.spawnedPersonTypeName||"병사/인원")+" 획득이 핵심이므로 경제성 숫자보다 희소 특성·자동 특성·초기 능력치와 재료 소모를 비교해야 한다. "+(detail.spawnedSoldier?"spawnedSoldier 직접값이 있어 동일 병종의 일반 고용과 완전히 같은 개체라고 가정하면 안 된다.":"별도 spawnedSoldier 직접값은 없으므로 병종 DB의 기본 획득형과 비교하는 편이 좋다.");
  else if(role==="craft")decision=detail.koName+" 기체는 판매가 기준 제조이익보다 전력화 가치가 핵심이다. 연구·격납고·무장·승무원까지 준비되어 있을 때 제조 우선순위가 높아진다.";
  else if(economicComparable&&opportunityNet>0)decision="판매가 기회비용 기준 순가치는 +"+fmt(Math.round(opportunityNet))+(detail.time>0?", 기술자-시간당 약 +"+fmt(Math.round(perHour)):"")+"로 플러스다. 반복 제조가 가능하고 입력 재료가 병목이 아니라면 환금/자원 전환 후보로 볼 수 있다.";
  else if(economicComparable&&opportunityNet<0)decision="판매가 기회비용 기준 순가치는 "+fmt(Math.round(opportunityNet))+(detail.time>0?", 기술자-시간당 약 "+fmt(Math.round(perHour)):"")+"로 마이너스다. 현금 목적이라면 비효율적이며, 장비 성능·연구 병목 해소·분해 부산물 같은 비금전 가치가 있을 때 만드는 편이 맞다.";
  else if(detail.randomOutputs.length)decision="기대값만으로 한 번의 결과를 보장할 수 없다. 귀한 입력 1개를 소모하는 랜덤 개봉은 평균 수익보다 하방 위험과 필요한 특정 보상 확률을 함께 봐야 한다.";
  else decision="금전 순가치를 완전히 계산할 수 없는 "+roleKo[role]+" 제조식이다. 확정 산출 "+fmt(detail.deterministicOutputs.length)+"종·랜덤 후보 "+fmt(detail.randomOutputs.length)+"개를 현재 진행 목표에서 실제로 필요로 하는지와 대체 획득 경로를 기준으로 우선순위를 정하는 편이 안전하다.";

  const cautions=[];
  if(research.eventOrFreeIds.length)cautions.push("선행망에 이벤트/무료 지급형 연구 "+fmt(research.eventOrFreeIds.length)+"개가 있어 명목 연구량이 실제 최소 경로보다 클 수 있다.");
  if(research.branchIds.length)cautions.push("선행망에 분기 연구 "+fmt(research.branchIds.length)+"개가 있어 현재 선택에 따라 제조식 자체가 막힐 수 있다.");
  if(detail.randomOutputs.length)cautions.push("랜덤 산출 기대값은 룰의 가중치를 확률로 정규화한 파생값이며 실제 단발 결과와 다르다.");
  if(detail.refund)cautions.push("원본 룰에 refund=true가 설정되어 있다. 이 플래그는 별도 엔진 동작이므로 위 판매가 순가치 계산에 추가 현금 보상으로 임의 합산하지 않았다.");
  if(hasPerson){
    const statCount=Object.keys(obj(detail.spawnedSoldier?.initialStats)).length+Object.keys(obj(detail.spawnedSoldier?.currentStats)).length;
    const bonusCount=Object.keys(obj(detail.spawnedSoldier?.transformationBonuses)).length;
    cautions.push("병사/인원의 전력 가치는 판매가 경제성에 포함하지 않았다."+((statCount||bonusCount)?" 이 제조식에는 spawnedSoldier 직접값이 있으며 특수 능력치 필드 "+fmt(statCount)+"개·변신/특성 보너스 "+fmt(bonusCount)+"개가 기록되어 있어 일반 병종 획득과 동일하다고 가정하면 안 된다.":" 생성 개체의 실제 능력치는 병종 DB와 획득 경로를 함께 확인해야 한다."));
  }else if(hasCraft)cautions.push("기체의 전력 가치는 판매가 경제성에 포함하지 않았다. 기체 제조는 판매 수익보다 격납고·무장·승무원과 실제 전투 역할을 기준으로 평가해야 한다.");
  if(!cautions.length)cautions.push("판매가 기반 순가치는 전략 가치와 다르다. 희귀 재료, 전투 성능, 후속 연구 필요성은 별도로 판단해야 한다.");

  (editorials[b]||={})[id]={
    overview:expanded(overview,"이 제조식의 실제 가치는 단일 수치보다 해금·재료·산출물·시간을 함께 볼 때 정확히 판단할 수 있다."),
    unlock:expanded(unlock,"현재 제조식 자체에는 추가 연구나 기지 기능 병목이 적어, 재료·작업장 인력·현금이 실제 실행 병목이 된다."),
    inputsOutputs:expanded(io,"표시 수량은 제조 1회 기준이며 랜덤 산출은 별도 기대값으로 분리해 표시한다."),
    economics:expanded(economics,"판매가 기반 계산은 전투 성능이나 희귀 재료의 전략 가치를 포함하지 않는 경제 비교용 파생값이다."),
    execution:expanded(execution,"실제 달력 시간은 투입 기술자 수와 작업장 가용 공간에 따라 달라진다."),
    decision:expanded(decision,"현재 세이브의 목표와 대체 획득 경로가 달라지면 제조 우선순위도 달라질 수 있다."),
    caution:expanded(cautions.join(" "),"원본 룰의 직접값과 파생 경제 계산을 구분해 해석해야 하며 스크립트성 예외는 별도 확인이 필요하다.")
  };

  const search=[
    id,detail.koName,detail.enName,detail.category,categoryKo,categoryEn,roleKo[role],
    ...directRequires,...detail.directResearch.map(x=>x.koName),...baseFuncs,...providers,
    ...requiredItems.flatMap(x=>[x.id,x.koName,x.enName]),...detail.deterministicOutputs.flatMap(x=>[x.id,x.koName,x.enName]),
    ...detail.expectedRandomOutputs.flatMap(x=>[x.id,x.koName,x.enName]),detail.spawnedPersonType,detail.spawnedPersonTypeName
  ].filter(Boolean).join(" ").toLowerCase();
  rows.push({
    id,bucket:b,koName:detail.koName,enName:detail.enName,category:detail.category,categoryKo,role,roleKo:roleKo[role],
    time:detail.time,cost:detail.cost,space:detail.space,requiredItemCount:requiredItems.length,requiredItemQty:requiredItems.reduce((s,x)=>s+x.qty,0),
    inputSummary:inputText,outputSummary:outputText,outputItemCount:detail.deterministicOutputs.length,randomOptionCount:detail.randomOutputs.length,hasPerson,hasCraft,
    researchCount:research.count,researchCost:research.totalCost,directResearchCount:directRequires.length,baseFuncs,baseFuncCount:baseFuncs.length,refund:detail.refund,
    economicComparable,expectedOutputSellValue:economicComparable?expectedOutputSell:null,inputSellOpportunityValue:economicComparable?inputVal.value:null,
    opportunityNet:economicComparable?opportunityNet:null,opportunityNetPerEngineerHour:economicComparable&&detail.time>0?perHour:null,
    searchText:search
  });
}

rows.sort((a,b)=>(a.listOrder??999999)-(b.listOrder??999999)||a.koName.localeCompare(b.koName,"ko"));
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(path.join(outDir,"manufacture-index.json"),JSON.stringify({
  meta:{version:1,generator:"manufacture-data-v1",sourceVersion:"XPiratez v.o1.1.1",economicModel:"item costSell opportunity-cost; person/craft value excluded"},
  counts:{
    recipes:rows.length,categories:new Set(rows.map(x=>x.category)).size,random:rows.filter(x=>x.randomOptionCount).length,
    recruitment:rows.filter(x=>x.hasPerson).length,craft:rows.filter(x=>x.hasCraft).length,economicComparable:rows.filter(x=>x.economicComparable).length
  },
  roles:roleKo,index:rows
}));
for(const [b,ds] of Object.entries(details)){fs.mkdirSync(path.join(outDir,"manufacture-chunks"),{recursive:true});fs.writeFileSync(path.join(outDir,"manufacture-chunks",b+".json"),JSON.stringify({details:ds}))}
for(const [b,ds] of Object.entries(editorials)){fs.mkdirSync(path.join(outDir,"manufacture-editorial-chunks"),{recursive:true});fs.writeFileSync(path.join(outDir,"manufacture-editorial-chunks",b+".json"),JSON.stringify({details:ds}))}
console.log(JSON.stringify({recipes:rows.length,categories:new Set(rows.map(x=>x.category)).size,random:rows.filter(x=>x.randomOptionCount).length,recruitment:rows.filter(x=>x.hasPerson).length,craft:rows.filter(x=>x.hasCraft).length,economicComparable:rows.filter(x=>x.economicComparable).length,avgEditorialChars:Math.round(Object.values(editorials).flatMap(x=>Object.values(x)).reduce((s,e)=>s+Object.values(e).join("").length,0)/rows.length)}));
