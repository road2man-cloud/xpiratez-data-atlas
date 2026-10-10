// Captain/choice/event access for the soldier transformation planner.
// An event can grant a research flag even when ordinary research dependencies
// cannot be reached. Never infer permanent exclusion from a single nominal path.
import {computeChoiceScenario,choiceStatus} from "../captains/choice-simulator-core.js";

export const CAPTAIN_ROUTES=[
  {id:"ANY",label:"선장 미지정 · 변신 자체 조건만"},
  {id:"DUMBASS",label:"Dumbass · DumbLazy 가능",first:"STR_CAPTAIN_DUMBASS",
    steps:["STR_CAPTAIN_DUMBASS","STR_CAPTAIN_DUMBLAZY"]},
  {id:"DUMBASS_SAINT",label:"Dumbass → Gray Codex + Saint (조건 달성 가정)",first:"STR_CAPTAIN_DUMBASS",
    steps:["STR_CAPTAIN_DUMBASS","STR_CAPTAIN_DUMBLAZY","STR_EMBRACE_THE_POWER","STR_TINY_DRILL_INVESTIGATION",
      "STR_CAPTAIN_RED","STR_CAPTAIN_GREEN","STR_CAPTAIN_GOLD","STR_CODEX_GRAY_AWAKENED","STR_CAPTAIN_GRAY","STR_CAPTAINS_LOG_01","STR_CAPTAIN_SAINT"]},
  {id:"LAZYASS",label:"Lazyass · DumbLazy 가능",first:"STR_CAPTAIN_LAZYASS",
    steps:["STR_CAPTAIN_LAZYASS","STR_CAPTAIN_DUMBLAZY"]},
  {id:"LAZYASS_SAINT",label:"Lazyass → Red Codex + Saint (조건 달성 가정)",first:"STR_CAPTAIN_LAZYASS",
    steps:["STR_CAPTAIN_LAZYASS","STR_CAPTAIN_DUMBLAZY","STR_EMBRACE_THE_POWER","STR_TINY_DRILL_INVESTIGATION",
      "STR_CAPTAIN_GREEN","STR_CAPTAIN_GOLD","STR_CAPTAIN_GRAY","STR_CODEX_RED_AWAKENED","STR_CAPTAIN_RED","STR_CAPTAINS_LOG_01","STR_CAPTAIN_SAINT"]},
  {id:"JACKASS_SAINT",label:"Jackass → Green Codex + Saint (조건 달성 가정)",first:"STR_CAPTAIN_JACKASS",
    steps:["STR_CAPTAIN_JACKASS","STR_EMBRACE_THE_POWER","STR_TINY_DRILL_INVESTIGATION",
      "STR_CAPTAIN_RED","STR_CAPTAIN_GRAY","STR_CAPTAIN_GOLD","STR_CODEX_GREEN_AWAKENED","STR_CAPTAIN_GREEN","STR_CAPTAINS_LOG_01","STR_CAPTAIN_SAINT"]},
  {id:"SOREASS_SAINT",label:"Soreass → Gold Codex + Saint (조건 달성 가정)",first:"STR_CAPTAIN_SOREASS",
    steps:["STR_CAPTAIN_SOREASS","STR_EMBRACE_THE_POWER","STR_TINY_DRILL_INVESTIGATION",
      "STR_CAPTAIN_RED","STR_CAPTAIN_GREEN","STR_CAPTAIN_GRAY","STR_CODEX_GOLD_AWAKENED","STR_CAPTAIN_GOLD","STR_CAPTAINS_LOG_01","STR_CAPTAIN_SAINT"]},
  {id:"THIEF",label:"Pussy → Thief · Captains 11 + JackLazy 이벤트",first:"STR_CAPTAIN_PUSSY",second:"STR_CAPTAIN_THIEF",
    steps:["STR_CAPTAIN_PUSSY","STR_CAPTAIN_PUSSY_UP","STR_CAPTAIN_THIEF","STR_CAPTAIN_DUMBLAZY","STR_CAPTAIN_JACKLAZY"]},
  {id:"THIEF_SAVAGE",label:"Pussy → Thief → 힘 거부 → 야만 여왕 (후기 도달 가정)",first:"STR_CAPTAIN_PUSSY",second:"STR_CAPTAIN_THIEF",
    steps:["STR_CAPTAIN_PUSSY","STR_CAPTAIN_PUSSY_UP","STR_CAPTAIN_THIEF","STR_CAPTAIN_DUMBLAZY","STR_CAPTAIN_JACKLAZY",
      "STR_QUESTION_OF_DRILL","STR_REJECT_THE_POWER","STR_QUEEN_SAVAGE"]},
  {id:"PRIEST",label:"Pussy → Priest · DumbLazy 가능",first:"STR_CAPTAIN_PUSSY",second:"STR_CAPTAIN_PRIEST",
    steps:["STR_CAPTAIN_PUSSY","STR_CAPTAIN_PUSSY_UP","STR_CAPTAIN_PRIEST","STR_CAPTAIN_DUMBLAZY"]},
  {id:"RULER",label:"Pussy → Ruler",first:"STR_CAPTAIN_PUSSY",second:"STR_CAPTAIN_RULER",
    steps:["STR_CAPTAIN_PUSSY","STR_CAPTAIN_PUSSY_UP","STR_CAPTAIN_RULER"]},
  {id:"MAGE",label:"Pussy → Mage",first:"STR_CAPTAIN_PUSSY",second:"STR_CAPTAIN_MAGE",
    steps:["STR_CAPTAIN_PUSSY","STR_CAPTAIN_PUSSY_UP","STR_CAPTAIN_MAGE"]},
  {id:"SOREASS",label:"Soreass",first:"STR_CAPTAIN_SOREASS",steps:["STR_CAPTAIN_SOREASS"]},
  {id:"JACKASS",label:"Jackass",first:"STR_CAPTAIN_JACKASS",steps:["STR_CAPTAIN_JACKASS"]}
];
const routeMap=new Map(CAPTAIN_ROUTES.map(x=>[x.id,x]));
const pussySecondaries=new Set(["STR_CAPTAIN_THIEF","STR_CAPTAIN_PRIEST","STR_CAPTAIN_RULER","STR_CAPTAIN_MAGE"]);
const startingCaptains=new Set([
  "STR_CAPTAIN_PUSSY","STR_CAPTAIN_DUMBASS","STR_CAPTAIN_LAZYASS",
  "STR_CAPTAIN_SOREASS","STR_CAPTAIN_JACKASS"
]);
const names=x=>Array.isArray(x)?x:[];
export function createRouteContext(index,key="ANY"){
  const route=routeMap.get(key)||CAPTAIN_ROUTES[0];
  if(route.id==="ANY")return{index,route,state:null,invalid:[]};
  const state=computeChoiceScenario(index,[],route.steps);
  return{index,route,state,invalid:state.skipped};
}
export function impossibleFlag(id,ctx){
  if(!ctx?.state)return false;
  if(ctx.state.completed.has(id))return false;
  if(ctx.state.disabled.has(id))return true;
  if(startingCaptains.has(id))return id!==ctx.route.first;
  if(pussySecondaries.has(id))return id!==ctx.route.second;
  if(id==="STR_CAPTAIN_SAINT"&&ctx.route.first==="STR_CAPTAIN_PUSSY")return true;
  if(id==="STR_CAPTAIN_PUSSY_UP"&&ctx.route.first!=="STR_CAPTAIN_PUSSY")return true;
  if(id==="STR_CAPTAIN_JACKLAZY"&&![
    "STR_CAPTAIN_THIEF","STR_CAPTAIN_MAGE"
  ].includes(ctx.route.second)&&![
    "STR_CAPTAIN_JACKASS","STR_CAPTAIN_LAZYASS"
  ].includes(ctx.route.first))return true;
  // DumbLazy is granted by the compatible first/second captain routes; all
  // its compatible templates carry it as a completed flag in this planner.
  if(id==="STR_CAPTAIN_DUMBLAZY")return true;
  if(id==="STR_CAPTAIN_JACKDUMB")return !["STR_CAPTAIN_DUMBASS","STR_CAPTAIN_JACKASS"].includes(ctx.route.first);
  // This branch is granted by a finite set of captain choices or an explicit
  // research unlock; do not mark ordinary future research as permanently absent.
  return false;
}
export function checkEventScript(s,ctx){
  if(!ctx?.state)return{kind:"unselected",missing:[],blocked:[],itemUnknown:[]};
  const missing=[],blocked=[],itemUnknown=[];
  for(const [id,expected] of Object.entries(s.researchTriggers||{})){
    if(expected===true){
      if(ctx.state.completed.has(id))continue;
      if(impossibleFlag(id,ctx))blocked.push({id,expected});
      else missing.push(id);
    }else if(expected===false&&ctx.state.completed.has(id))blocked.push({id,expected});
  }
  for(const [id,expected] of Object.entries(s.itemTriggers||{})){
    // User's currently-owned inventory is not known from a captain preset.
    itemUnknown.push({id,expected});
  }
  return{kind:blocked.length?"blocked":missing.length||itemUnknown.length?"pending":"possible",
    missing,blocked,itemUnknown};
}
export function eventAvailability(events,ctx){
  const scripts=names(events).flatMap(e=>names(e.scripts).map(s=>({...checkEventScript(s,ctx),
    eventId:e.id,scriptId:s.id,script:s,eventName:e.koName,reward:e.reward})));
  if(!ctx?.state)return{kind:"unselected",scripts,eligible:[]};
  const eligible=scripts.filter(x=>x.kind!=="blocked");
  return{kind:eligible.length?"possible":"blocked",scripts,eligible};
}
export function trainingRouteGate(t,ctx,access){
  if(!ctx?.state)return{kind:"unselected",reasons:[],events:[]};
  const blocked=[],caution=[],events=[];
  for(const root of names(t.researchRoots)){
    if(root==="STR_UNAVAILABLE"){blocked.push({id:root,reason:"미사용 내부 전용 플래그"});continue;}
    // Cross-category gates not expressed as a transformation's own forbids:
    // Wasteland Priestess II (required for Savage Queen) is granted only
    // after STR_REJECT_THE_POWER, which disables Tiny Drill Investigation.
    // Every Saint Codex route requires that Tiny Drill Investigation.
    if(root==="STR_PARIAH_TRAINING"&&
      (ctx.state.completed.has("STR_TINY_DRILL_INVESTIGATION")||ctx.state.completed.has("STR_CAPTAIN_SAINT"))){
      blocked.push({id:root,reason:"야만 여왕의 여사제 이벤트는 힘 거부 필요; Saint/Codex의 드릴 조사와 영구 배타"});continue;
    }
    if((root==="STR_BRIDES_TO_THE_QUEEN"||
       ["STR_HERO_GOLD_TRAINING","STR_HERO_GREEN_TRAINING","STR_HERO_RED_TRAINING"].includes(root))&&
       ctx.state.completed.has("STR_REJECT_THE_POWER")){
      blocked.push({id:root,reason:"Codex 각성이 필요한 연구이지만 힘 거부가 드릴 조사를 봉쇄"});continue;
    }
    if(ctx.state.disabled.has(root)){blocked.push({id:root,reason:"선택 분기로 비활성화된 연구"});continue;}
    const grantEvents=access?.researchEvents?.[root]||[];
    if(grantEvents.length){
      const ev=eventAvailability(grantEvents,ctx);
      events.push({id:root,...ev});
      if(ev.kind==="blocked"){blocked.push({id:root,reason:"연구를 지급하는 모든 이벤트가 선택한 선장과 충돌"});continue;}
      if(!ctx.state.completed.has(root))caution.push({id:root,reason:"이벤트의 추가 연구·보유 조건과 지급 시점을 확인"});
      continue;
    }
    const rule=ctx.index.byId.get(root),status=choiceStatus(ctx.index,ctx.state,root);
    if(status.kind==="blocked"){blocked.push({id:root,reason:"분기에서 연구가 비활성화됨"});continue;}
    const unavailableDirect=names(rule?.dependencies).filter(x=>
      x.startsWith("STR_CAPTAIN_")&&impossibleFlag(x,ctx));
    // Only declare an irreversible block on DIRECT, named captain dependencies
    // without another live explicit unlock. Multi-step routes (Proud Warrior,
    // Codex awakening etc.) remain conditional, not falsely excluded.
    const alternative=names([...(ctx.index.unlockedBy.get(root)||[])])
      .filter(id=>!impossibleFlag(id,ctx));
    if(unavailableDirect.length&&!alternative.length){
      blocked.push({id:root,reason:"필수 선장 연구 "+unavailableDirect.join(", ")+" 획득 불가"});
      continue;
    }
    if(status.kind==="path-risk"||status.kind==="uncertain")
      caution.push({id:root,reason:"연구 경로에 차단된 명목 선행조건/대체 해금 확인 필요"});
  }
  return{kind:blocked.length?"blocked":caution.length?"caution":"possible",
    reasons:blocked,notes:caution,events};
}
export function routeEventReport(ctx,access){
  const saint=ctx?.state?.completed.has("STR_CAPTAIN_SAINT")?
    {kind:"completed",scripts:[],eligible:[]}:eventAvailability(access?.researchEvents?.STR_CAPTAIN_SAINT||[],ctx);
  const eleven=eventAvailability(access?.researchEvents?.STR_CAPTAINS_11||[],ctx);
  const rogueEvents=access?.itemEvents?.STR_ROGUE_CLONE||[];
  const rogueSaint=eventAvailability(rogueEvents.filter(e=>e.id==="STR_SAINTS_REINFORCEMENTS"),ctx);
  const rogueDumbLazy=eventAvailability(rogueEvents.filter(e=>e.id==="STR_KNOCK_KNOCK_ROGUE_CLONE"),ctx);
  const rogueTrouble=eventAvailability(rogueEvents.filter(e=>e.id==="STR_TROUBLESEEKING_ALLY"),ctx);
  const orthodox=access?.itemEvents?.STR_ORTHODOX_MAGE_DAMSEL||[];
  const orthodoxSaint=eventAvailability(orthodox.filter(e=>e.id==="STR_KNOCK_KNOCK_ORTHODOX_MAGE_DAMSEL"),ctx);
  return{saint,eleven,rogueSaint,rogueDumbLazy,rogueTrouble,orthodoxSaint};
}
