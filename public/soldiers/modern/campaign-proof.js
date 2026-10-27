// X-Piratez chronological ruleset verifier (NOT a substitute for game QA).
// A "verified" result means explicit supplied steps satisfy the modeled OXCE
// research/event/production/transformation/armor gates in that order.
// It never proves that RNG, unknown missions or future item drops will occur.
import {researchStep,eventScriptVerdict} from "./event-chronology.js";
import {inspectAutoZeroCascade} from "./auto-zero-cascade.js";
import {eligibleTransformation,applyTransformation} from "./eligibility.js";
const arr=x=>Array.isArray(x)?x:[];
const has=(set,id)=>set instanceof Set?set.has(id):arr(set).includes(id);
const own=(obj,id)=>Number(obj?.[id]||0);
function cloneMember(p){
  const st=p.state||p;
  return {...p,state:{...st,currentStats:{...st.currentStats},initialStats:{...st.initialStats},
    history:new Map(st.history||[]),bonusCounts:new Map(st.bonusCounts||[]),
    bonusIds:new Set(st.bonusIds||[]),researchCompleted:new Set(st.researchCompleted||[]),
    researchDisabled:new Set(st.researchDisabled||[]),steps:[...arr(st.steps)],remarks:[...arr(st.remarks)]}};
}
function cloneWorld(w){
  return {...w,researched:new Set(w.researched||[]),disabled:new Set(w.disabled||[]),
    baseFunctions:new Set(w.baseFunctions||[]),facilities:new Set(w.facilities||[]),
    items:{...(w.items||{})},
    otherItems:w.otherItems==null?null:{...w.otherItems},
    globalFacilities:w.globalFacilities==null?null:new Set(w.globalFacilities),
    generatedEvents:w.generatedEvents==null?null:{...w.generatedEvents},
    activeResearch:w.activeResearch==null?null:new Set(w.activeResearch),
    autoZeroEvidence:w.autoZeroEvidence===true,
    pendingFree:w.pendingFree?{source:w.pendingFree.source,
      choices:[...w.pendingFree.choices],sequential:!!w.pendingFree.sequential}:null,
    soldiers:arr(w.soldiers).map(cloneMember)};
}
function fail(kind,reason){return {kind,reason:arr(reason).length?reason:[String(reason)]};}
function useItems(world,required,qty=1){
  for(const [id,n] of Object.entries(required||{}))
    if(own(world.items,id)<Number(n)*qty)return "재료 부족: "+id+" ×"+Number(n)*qty;
  for(const [id,n]of Object.entries(required||{})){
    world.items[id]=own(world.items,id)-Number(n)*qty;
  }
  return null;
}
function pendingFunds(world,n){
  if(world.funds===undefined)return "자금 보유액 미확인";
  return Number(world.funds)>=Number(n)?null:"자금 부족: "+n;
}
function haveResearch(world,required){
  const missing=arr(required).filter(id=>!world.researched.has(id)||world.disabled.has(id));
  return missing.length?"필수 연구 미완료/폐쇄: "+missing.join(", "):null;
}
function haveFunctions(world,required){
  const missing=arr(required).filter(id=>!world.baseFunctions.has(id));
  return missing.length?"필수 기지 기능 미확인: "+missing.join(", "):null;
}
function grantResearch(world,id,data,method="research",options={}){
  const result=researchStep(world,id,data.researchRules||{},{method,...options});
  if(result.kind!=="applied")return fail(result.kind,result.reason);
  world.researched=result.state.researched;world.disabled=result.state.disabled;
  // A candidate cascade is never a witness by itself. Replay only when the
  // caller attests a complete same-base snapshot, and refuse truncated queues,
  // unknown active projects and random free-result chains.
  const autoNotes=[];
  let autoAssumed=false;
  if(world.autoZeroEvidence===true && world.items!=null &&
      world.baseFunctions instanceof Set && world.activeResearch instanceof Set &&
      result.repeatRun!==true){
    const before={researched:new Set(world.researched),disabled:new Set(world.disabled),
      items:world.items,baseFunctions:world.baseFunctions,
      activeResearch:world.activeResearch};
    before.researched.delete(id);
    const chain=inspectAutoZeroCascade(data,id,before,{
      inventoryKnown:true,functionsKnown:true,activeResearchKnown:true,maxSteps:180});
    if(chain.kind==="conditional"&&!chain.incomplete&&
        !chain.steps.some(s=>s.freeRewardPending&&s.kind==="auto-zero")){
      for(const zero of chain.steps.slice(1)){
        // Re-check each queued item against the final evidence snapshot;
        // applying a partial or inconsistent candidate is forbidden.
        if(world.disabled.has(zero.id)||world.researched.has(zero.id))continue;
        const rule=data.researchRules?.[zero.id];
        if(!rule||Number(rule.cost)!==0)continue;
        world.researched.add(zero.id);
        for(const drop of arr(rule.disables)){
          world.researched.delete(drop);world.disabled.add(drop);
        }
        for(const enable of arr(rule.reenables))world.disabled.delete(enable);
        autoAssumed=true;
        autoNotes.push("조건부 자동 연구 큐(엔진 실행 미검증): "+zero.id+" ← "+zero.queuedBy);
      }
    }
  }
  // OXCE selects a free topic when THIS source research is completed.
  // A completed source in an old save is not a reusable free-research voucher.
  world.pendingFree=method!=="free"&&result.randomFreeCandidates?.length?{
    source:id,choices:[...result.randomFreeCandidates],
    sequential:data.researchRules?.[id]?.sequentialGetOneFree===true
  }:null;
  return {kind:"applied",assumed:autoAssumed,notes:[...autoNotes,...(result.randomFreeCandidates?.length?
    ["연구 종료 후 별도로 추첨되는 무료 연구 후보 "+result.randomFreeCandidates.join(", ")]:[])]};
}
function eventResearch(world,step,data){
  if(world.disabled.has(step.research))
    return fail("blocked","비활성 연구는 이벤트 직접 지급으로도 획득할 수 없음: "+step.research);
  const route=arr((data.eventResearchSources||data.researchEventSources)?.[step.research]).find(e=>e.event===step.event);
  if(!route)return fail("unknown","이 연구를 지급하는 이벤트 규칙을 찾지 못함");
  const script=arr(route.scripts).find(s=>s.script===step.script);
  if(!script)return fail("unknown","이 이벤트 발생 스크립트를 찾지 못함");
  // Engine isItemObtained scans every base storage AND craft loadout.
  // Manufacture consumes ONLY the currently selected base's stores.
  // Recompute the global trigger stock after every local production change.
  const triggerItems=world.otherItems==null?null:{...world.otherItems};
  if(triggerItems)for(const [id,count] of Object.entries(world.items||{}))
    triggerItems[id]=(Number(triggerItems[id])||0)+Number(count||0);
  const judgment=eventScriptVerdict({...script,eventId:route.event},{...world,
    triggerItems,triggerFacilities:world.globalFacilities??null},{mode:"current"});
  if(judgment.kind==="blocked")return fail("blocked",judgment.blocked);
  const random=Number(script.executionOdds)<100||route.choiceCount>1||
    script.mode==="oneTimeRandom"||
    (script.mode==="weighted"&&judgment.weight!==null&&judgment.totalWeight!==null&&
      judgment.totalWeight>judgment.weight);
  const assumptions=[...judgment.pending,...judgment.unknown];
  if(random)assumptions.push("이벤트 실행 및 연구 지급 추첨 결과를 가정");
  assumptions.push("이벤트 스케줄러의 실제 발생 시점·결과는 세이브 없이 증명되지 않음");
  if(assumptions.length&&!step.assumeOutcome)
    return fail("conditional",assumptions);
  const research=grantResearch(world,step.research,data,"event");
  if(research.kind!=="applied")return research;
  if(world.generatedEvents!=null)
    world.generatedEvents[step.event]=own(world.generatedEvents,step.event)+1;
  return {kind:"applied",assumed:true,notes:[...assumptions,...arr(research.notes)]};
}
function freeResearch(world,step,data){
  const source=data.researchRules?.[step.source];
  if(!source)return fail("unknown","무료 연구 지급 원본 규칙 없음: "+step.source);
  // Must have JUST completed source in this model. No undetected re-running
  // already researched topics; after the next action, the pick expires.
  const token=world.pendingFree;
  if(token?.source!==step.source)
    return fail("blocked","원천 연구 완료 당시의 일회성 무료 보상 추첨 증거 없음: "+step.source);
  const choices=token.choices.filter(id=>!world.researched.has(id)&&!world.disabled.has(id));
  if(!choices.includes(step.research))
    return fail("blocked","원천 연구 완료 시점의 무료 연구 보상 목록에 없음: "+step.research);
  if(token.sequential&&choices[0]!==step.research)
    return fail("blocked","순차 지급 무료 연구는 첫 번째 미완료 후보만 선택 가능");
  if(!token.sequential&&choices.length>1&&!step.assumeOutcome)
    return fail("conditional",["무료 연구 "+choices.length+"개 후보 중 RNG 추첨 결과 미증명"]);
  // A payout consumes the single token and cannot itself count as a repeated
  // completion of the source that would unlock another payout.
  world.pendingFree=null;
  const result=grantResearch(world,step.research,data,"free");
  if(result.kind!=="applied")return result;
  return {kind:"applied",assumed:!token.sequential&&choices.length>1,
    notes:!token.sequential&&choices.length>1?
    ["무료 연구 무작위 선택 "+step.research+"을 가정"]:[]};
}
function manufacture(world,step,data){
  const supply=data.itemSupply?.[step.item];
  if(!supply)return fail("unknown","재료 공급 규칙 미색인: "+step.item);
  const qty=Math.max(1,Math.floor(Number(step.count)||1));
  const list=[...arr(supply.manufacture),...arr(supply.randomManufacture)];
  const recipe=list.find(r=>r.id===step.recipe);
  if(!recipe)return fail("blocked","선택한 제조법이 해당 아이템을 생산하지 않음");
  const research=haveResearch(world,recipe.requires);
  if(research)return fail("blocked",research);
  const base=haveFunctions(world,recipe.requiresBaseFunc);
  if(base)return fail("conditional",base);
  const money=pendingFunds(world,Number(recipe.cost||0)*qty);
  if(money)return fail("conditional",money);
  if(recipe.weight!==undefined&&!step.assumeOutcome)
    return fail("conditional",["확률 제조 결과를 보장할 수 없음: "+recipe.weight+"/"+recipe.weightTotal]);
  const materialMissing=Object.entries(recipe.requiredItems||{})
    .find(([id,n])=>own(world.items,id)<Number(n)*qty);
  if(materialMissing)return fail("blocked","필수 제조 재료 부족: "+materialMissing[0]);
  useItems(world,recipe.requiredItems,qty);
  if(world.funds!==undefined)world.funds-=Number(recipe.cost||0)*qty;
  world.items[step.item]=own(world.items,step.item)+Number(recipe.quantity??recipe.count??1)*qty;
  return {kind:"applied",assumed:recipe.weight!==undefined,notes:recipe.weight!==undefined?
    ["확률 제조 결과를 가정: "+step.item]:[]};
}
function transform(world,step,data){
  const member=world.soldiers.find(x=>x.id===step.soldier);
  if(!member)return fail("unknown","지정한 병사가 검증 세계에 없음");
  const rule=arr(data.transformations).find(x=>x.id===step.transform);
  if(!rule)return fail("unknown","변형 규칙 없음");
  if(rule.createsClone)return fail("blocked",
    "복제 변신의 결과는 신규 대원이며 원래 대원과 동일 인물의 강화 이력으로 합산 불가");
  if(member.state.exactStats!==true&&(
      Object.values(rule.requiredMinStats||{}).some(Number)||
      Object.values(rule.requiredMaxStats||{}).some(x=>Number(x)<9999)))
    return fail("conditional","정확한 병사 현재 능력치가 없어 스탯 선행조건을 검증할 수 없음");
  const verdict=eligibleTransformation(rule,member.state,data,{
    mode:"current",researched:[...world.researched],disabled:[...world.disabled],
    baseFunctions:[...world.baseFunctions],items:world.items,funds:world.funds,
    commendations:member.commendations||{}
  });
  if(verdict.kind==="blocked")return fail("blocked",verdict.blockers);
  if(verdict.kind!=="eligible")return fail("conditional",verdict.conditions);
  const result=applyTransformation(rule,member.state,data,{
    mode:"current",researched:[...world.researched],disabled:[...world.disabled],
    baseFunctions:[...world.baseFunctions],items:world.items,funds:world.funds,
    commendations:member.commendations||{}
  });
  const material=useItems(world,rule.requiredItems);
  if(material)return fail("blocked",material);
  world.funds-=Number(rule.cost||0);
  const oldArmor=member.state.armorId,newArmor=result.state.armorId;
  if(oldArmor!==newArmor&&!rule.createsClone){
    const armor=data.armorCatalog?.find(x=>x.id===oldArmor);
    if(armor?.storeItem&&armor.storeItem!=="STR_NONE")
      world.items[armor.storeItem]=own(world.items,armor.storeItem)+1;
  }
  member.state=result.state;
  return {kind:"applied",assumed:!result.state.exactStats,
    notes:result.state.exactStats?[]:["전투원 능력치 무작위 변동은 미증명"]};
}
function equip(world,step,data){
  const member=world.soldiers.find(x=>x.id===step.soldier);
  if(!member)return fail("unknown","장착 대상 병사를 찾지 못함");
  const armor=arr(data.armorCatalog).find(x=>x.id===step.armor);
  if(!armor)return fail("unknown","방어구 규칙을 찾지 못함");
  if(!arr(armor.soldierTypes).includes(member.state.soldierType))
    return fail("blocked","현재 병종에 허용되지 않는 방어구");
  if(member.state.armorId===step.armor)return {kind:"applied",notes:[]};
  if(armor.storeItem&&armor.storeItem!=="STR_NONE"&&own(world.items,armor.storeItem)<1)
    return fail("blocked","장착할 방어구 아이템 미보유: "+armor.storeItem);
  if(armor.storeItem&&armor.storeItem!=="STR_NONE")world.items[armor.storeItem]--;
  const old=data.armorCatalog?.find(x=>x.id===member.state.armorId);
  if(old?.storeItem&&old.storeItem!=="STR_NONE")
    world.items[old.storeItem]=own(world.items,old.storeItem)+1;
  member.state.armorId=armor.id;
  return {kind:"applied",notes:[]};
}
export function verifyCampaignSequence(initial,steps,data){
  let world=cloneWorld(initial);
  const trace=[],max=250;
  if(!Array.isArray(steps)||steps.length>max)return fail("unknown","시퀀스 길이 제한 "+max);
  let assumed=false;
  for(const [index,step] of steps.entries()){
    // An available getOneFree is selected immediately by OXCE, so
    // ignoring that outcome and continuing would fabricate a legal history.
    if(world.pendingFree&&step.type!=="freeResearch")
      return {kind:"blocked",trace,world,
        message:"무료 연구 보상 추첨 처리 전 다음 행동을 실행할 수 없음: "+world.pendingFree.source};
    const trial=cloneWorld(world);
    let result;
    if(step.type==="advanceMonth"){
      if(!Number.isInteger(step.month)||step.month<Number(trial.month||0))
        result=fail("blocked","시간 역행 또는 잘못된 월");
      else{trial.month=step.month;result={kind:"applied",notes:[]};}
    }else if(step.type==="research")result=grantResearch(trial,step.id,data,"research");
    else if(step.type==="freeResearch")result=freeResearch(trial,step,data);
    else if(step.type==="eventResearch")result=eventResearch(trial,step,data);
    else if(step.type==="manufacture")result=manufacture(trial,step,data);
    else if(step.type==="transform")result=transform(trial,step,data);
    else if(step.type==="equip")result=equip(trial,step,data);
    else result=fail("unknown","지원되지 않은 단계: "+step.type);
    const t={index:index+1,type:step.type,id:step.id||step.research||step.transform||step.armor||step.item||null,
      kind:result.kind,reason:result.reason||[],notes:result.notes||[]};
    trace.push(t);
    if(result.kind!=="applied")return {kind:result.kind,trace,world,
      message:"첫 미승인 단계에서 재생 중단. 이전 단계는 순서대로 적용됨."};
    if(result.assumed===true)assumed=true;
    world=trial;
  }
  if(world.pendingFree)return {kind:"conditional",trace,world,
    message:"무료 연구 보상 추첨 미처리: "+world.pendingFree.source};
  return {kind:assumed?"conditional":"ruleset-consistent",trace,world,
    message:assumed?"무작위·미증명 전제 중 일부를 명시적으로 가정한 시나리오":
      "제공된 단계는 모델에 포함된 엔진 조건과 순서상 일치. 실제 게임 재현 증명은 아님."};
}
