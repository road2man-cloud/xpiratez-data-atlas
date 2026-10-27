// X-Piratez 2.1 OXCE 8.7.1 local-only save integration.
// Parse with the existing browser-safe whitelist readers; never upload saves.
import {parseXpiratezSave} from "../../captains/save-import-core.js";
import {readSavePersonnel,facilityEvidence,inventoryEvidence,medalEvidence} from "./save-personnel.js";
import {initialState,STAT_KEYS} from "./eligibility.js";

export function importModernSave(text,data){
  if(typeof text!=="string"||text.length>60*1024*1024)throw Error("세이브 크기/형식을 확인하세요 (최대 60MB).");
  const head=text.split(/^---\s*$/m)[0]||"";
  if(!/version:\s*Extended\s+8[.]7[.]1/i.test(head))
    throw Error("OXCE 8.7.1 저장 파일인지 확인할 수 없습니다. 다른 버전은 검증하지 않습니다.");
  if(!/piratez ver:\s*v[.]o2\b/i.test(head))
    throw Error("세이브가 X-Piratez 2.1 (v.o2)과 일치하지 않습니다. 다른 버전의 규칙을 섞지 않습니다.");
  const researchMap=new Map(Object.entries(data.researchRules||{}).map(([id,rule])=>
    [id,{disables:rule.disables||[]}]));
  const research=parseXpiratezSave(text,{byId:researchMap});
  const personnel=readSavePersonnel(text);
  const body=text.split(/^---\s*$/m).slice(1).join("\n");
  // OXCE records finance history as a sequence; the LAST entry is current funds.
  // Parse one line at a time to prevent \s from consuming indentation/newlines.
  const lines=body.split(/\r?\n/);
  const start=lines.findIndex(x=>x==="funds:");
  const history=[];
  if(start>=0)for(let i=start+1;i<lines.length;i++){
    const match=lines[i].match(/^  - ([+-]?\d+)$/);
    if(!match)break;
    history.push(Number(match[1]));
  }
  const inline=body.match(/^funds:[ \t]*([+-]?\d+)[ \t]*$/m);
  const monthsMatch=body.match(/^monthsPassed:[ \t]*(\d+)[ \t]*$/m);
  return {
    research,personnel,
    monthsPassed:monthsMatch?Number(monthsMatch[1]):null,
    funds:history.length?history.at(-1):inline?Number(inline[1]):null,
    warnings:[...research.warnings,...personnel.warnings],
    compatible:![...(research.unknownCompleted||[]),...(research.unknownDisabled||[])].some(id=>
      data.transformations.some(t=>(t.requires||[]).includes(id)))
  };
}
export function modernSoldierProof(data,save,baseIndex,soldierIndex){
  const base=save?.personnel?.bases?.[baseIndex];
  const soldier=base?.soldiers?.[soldierIndex];
  if(!base||!soldier||!soldier.type)return null;
  const rule=data.soldiers.find(x=>x.id===soldier.type);
  if(!rule)return {kind:"unknown-body",issues:["현재 게임 데이터에 없는 병종: "+soldier.type]};
  const state=initialState(data,"base:"+soldier.type);
  state.sourceId=null;
  if(soldier.stats?.size)state.currentStats=Object.fromEntries(soldier.stats);
  if(soldier.initialStats?.size)state.initialStats=Object.fromEntries(soldier.initialStats);
  state.rank=soldier.rank??0;
  state.armorId=soldier.armor||state.armorId;
  state.history=new Map(Object.entries(soldier.previousTransformations||{}));
  state.historyKnown=soldier.historyComplete;
  state.bonusCounts=new Map(Object.entries(soldier.transformationBonuses||{}).filter(([,n])=>Number(n)>0).map(([id,n])=>[id,Number(n)]));
  state.bonusIds=new Set(state.bonusCounts.keys());
  const thresholds=data.woundThresholds||{health:100,mana:200};
  // Missing zero-value recovery/healthMissing/manaMissing fields are normal
  // in an OXCE save; use zero only when the surrounding unit parsed fully.
  const hasStatus=soldier.stats?.has("health")&&soldier.stats?.has("mana")&&
    soldier.soldierComplete!==false;
  const woundHealth=Number(soldier.healthMissing||0)>
    Math.trunc(Number(soldier.stats?.get("health")||0)*Number(thresholds.health||100)/100);
  const woundMana=Number(soldier.manaMissing||0)>
    Math.trunc(Number(soldier.stats?.get("mana")||0)*Number(thresholds.mana||200)/100);
  state.status=hasStatus?((soldier.recovery??0)>0||woundHealth||woundMana?"wounded":"healthy"):"unknown";
  state.exactStats=soldier.stats?.size===STAT_KEYS.length&&
    soldier.initialStats?.size===STAT_KEYS.length&&soldier.bonusesComplete;
  const baseFunctionsNeeded=[...new Set(data.transformations.flatMap(t=>t.requiresBaseFunc||[]))];
  const facilities=facilityEvidence(base,
    Object.entries(data.baseFacilityFunctions||{}).map(([id,r])=>({id,provideBaseFunc:r.provides||[]})),
    baseFunctionsNeeded);
  const requiredItems=[...new Set(data.transformations.flatMap(t=>Object.keys(t.requiredItems||{})))];
  const stock=inventoryEvidence(base,requiredItems);
  const requiredMedals=[...new Set(data.transformations.flatMap(t=>Object.keys(t.requiredCommendations||{})))];
  const medalMap=medalEvidence(soldier,requiredMedals);
  const options={
    mode:"current",researched:save.research.completed||[],
    disabled:save.research.disabled||[],
    baseFunctions:[...facilities.functions].filter(([,v])=>v>=1).map(([id])=>id),
    // Regions/countries can supply base functions not listed among facilities.
    // Treat a missing facility function as UNKNOWN, not proven absent.
    baseFunctionsKnown:false,items:Object.fromEntries(stock),
    itemsKnown:base.itemsComplete,commendations:Object.fromEntries(medalMap),
    medalsKnown:soldier.medalsComplete,
    funds:save.funds,fundsKnown:save.funds!==null,
    statsKnown:state.exactStats,historyKnown:soldier.historyComplete
  };
  const issues=[];
  if(!save.compatible)issues.push("연구 데이터 버전·ID 불일치");
  if(!base.itemsComplete)issues.push("기지 재고의 일부를 읽지 못함");
  if(!facilities.complete)issues.push("시설 기능 근거 불완전");
  if((data.transformations||[]).some(t=>(t.requiresBaseFunc||[]).some(f=>!facilities.functions.has(f))))
    issues.push("시설 밖 국가·지역 제공 기능의 부재는 아직 확정할 수 없음");
  if(!soldier.medalsComplete)issues.push("훈장 기록 일부를 읽지 못함");
  if(!soldier.historyComplete)issues.push("변신 이력 불완전");
  if(!soldier.bonusesComplete)issues.push("SoldierBonus 목록 불완전");
  if(!state.exactStats)issues.push("현재/초기 능력치 12종 또는 특성 근거 불완전");
  if(!hasStatus)issues.push("부상 판정에 필요한 회복일수·손실치 누락");
  if(save.funds===null)issues.push("자금 잔액 미확인");
  return {kind:"proof",state,options,base,soldier,issues,facilities};
}
