// Staged captain choices for the training planner.
// Stages are OPTION NODES imported from the captain DB; builds are their
// chronological combination with independently earned traits and Codex flags.
import {computeChoiceScenario} from "../captains/choice-simulator-core.js";

const list=x=>Array.isArray(x)?x:[];
const unique=x=>[...new Set(x)];
const PUSSY="STR_CAPTAIN_PUSSY";
const UNCLASSED="STR_CAPTAIN_UNCLASSED_UP";
const PURE="STR_CAPTAIN_PURE_UP";
const COLORS=["GOLD","GREEN","RED","GRAY"];
const COMPANIONS=[
  "STR_CAPTAIN_DUMBLAZY","STR_CAPTAIN_JACKDUMB","STR_CAPTAIN_JACKLAZY",
  "STR_CAPTAIN_JACKSORE","STR_CAPTAIN_LAZYSORE","STR_CAPTAIN_SOREDUMB"
];

export function validateCaptainStages(index,stages){
  if(!Array.isArray(stages)||stages.length!==4)throw Error("Missing four captain stages");
  const all=stages.flatMap(s=>s.ids||[]);
  if(stages.map(s=>s.ids.length).join(",")!=="5,5,7,5"||new Set(all).size!==all.length)
    throw Error("Captain choice catalog changed; verify branch rules");
  for(const id of all)if(!index.byId.has(id))throw Error("Missing captain choice "+id);
  return stages;
}
function projectedColors(index,state,selected){
  return COLORS.filter(color=>{
    const id="STR_CAPTAIN_"+color;
    return state.completed.has(id)||[...(index.unlockedBy.get(id)||[])]
      .some(source=>state.completed.has(source)||selected.includes(source));
  });
}
function availableCompanions(index,state,steps){
  return COMPANIONS.filter(id=>!state.disabled.has(id)&&!state.completed.has(id)&&
    [...(index.unlockedBy.get(id)||[])].some(source=>
      state.completed.has(source)||steps.includes(source)));
}
function pick(stages,i,choice){return stages[i].ids.includes(choice)?choice:"";}

export function buildStagedCaptainContext(index,stages,options={}){
  validateCaptainStages(index,stages);
  const selected=list(options.stages);
  const first=pick(stages,0,selected[0]);
  const second=first===PUSSY?pick(stages,1,selected[1]):"";
  const third=second===UNCLASSED?pick(stages,2,selected[2]):"";
  const fourth=third===PURE?pick(stages,3,selected[3]):"";
  const stageChoices=[first,second,third,fourth];
  const terminal=Boolean(first&&(
    first!==PUSSY||(second&&second!==UNCLASSED)||
    (second===UNCLASSED&&third&&third!==PURE)||
    (third===PURE&&fourth)
  ));
  const steps=[];
  if(first)steps.push(first);
  if(second)steps.push("STR_CAPTAIN_PUSSY_UP",second);
  if(third)steps.push("STR_CAPTAIN_UNCLASSED",third);
  if(fourth)steps.push("STR_CAPTAIN_PURE",fourth);
  const firstState=computeChoiceScenario(index,[],steps);
  const companions=availableCompanions(index,firstState,steps);
  const selectedCompanions=unique(list(options.companions)).filter(id=>companions.includes(id));
  steps.push(...selectedCompanions);

  // Known completed research supplied by the wider branch DB is historical
  // context. Never let free-form text impersonate a captain or special event.
  const extra=unique(list(options.extraFlags)).filter(id=>
    index.byId.has(id)&&!id.startsWith("STR_CAPTAIN_")&&id!=="STR_CAPTAINS_11");
  if(options.queenSavage && !extra.includes("STR_REJECT_THE_POWER"))
    extra.push("STR_REJECT_THE_POWER");
  steps.push(...extra.filter(id=>!steps.includes(id)));
  let state=computeChoiceScenario(index,[],steps);
  const ownedColors=projectedColors(index,state,steps);
  const codex=COLORS.includes(options.codex)?options.codex:"";
  const codexBlocked=Boolean(codex&&(state.completed.has("STR_REJECT_THE_POWER")||
    state.disabled.has("STR_TINY_DRILL_INVESTIGATION")||
    state.disabled.has("STR_EMBRACE_THE_POWER")));
  if(codex&&!codexBlocked){
    for(const id of [
      "STR_EMBRACE_THE_POWER","STR_TINY_DRILL_INVESTIGATION",
      "STR_CHOOSE_"+codex+"_QUERY","STR_CODEX_"+codex,
      "STR_CODEX_"+codex+"_AWAKENED"
    ])if(!state.completed.has(id)){
      steps.push(id);state=computeChoiceScenario(index,[],steps);
    }
  }
  const codexValid=codex&&!codexBlocked&&state.completed.has("STR_CODEX_"+codex+"_AWAKENED");
  const colors=unique([...ownedColors,...(codexValid?[codex]:[])]);
  for(const color of colors){
    const id="STR_CAPTAIN_"+color;
    if(!state.completed.has(id)){
      steps.push(id);state=computeChoiceScenario(index,[],steps);
    }
  }
  const missing=COLORS.filter(c=>!colors.includes(c));
  const saintPossible=Boolean(terminal&&first!==PUSSY&&!missing.length&&
    !state.disabled.has("STR_CAPTAIN_SAINT")&&
    !state.completed.has("STR_REJECT_THE_POWER"));
  const saintGoal=saintPossible&&options.saint===true;
  if(saintGoal){
    for(const id of ["STR_CAPTAINS_LOG_01","STR_CAPTAIN_SAINT"])
      if(!state.completed.has(id)){
        steps.push(id);state=computeChoiceScenario(index,[],steps);
      }
  }
  const route={id:fourth||third||second||first||"ANY",
    first:first||null,second:second||null,steps:stageChoices.filter(Boolean),
    isTerminal:terminal};
  return {
    dynamic:true,index,stages,route,state:first?state:null,invalid:state.skipped,
    stageChoices,availableCompanions:companions,selectedCompanions,
    codex,ownedColors,colors,missingColors:missing,codexBlocked,
    saintPossible,saintGoal,extraFlags:extra
  };
}
