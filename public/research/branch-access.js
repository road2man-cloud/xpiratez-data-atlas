// Scenario-only research path visibility. This does not assert that the player
// owns specimens, facilities, event rewards or any currently unfinished topic.
// Uses the same OXCE-aligned choice state as the captains simulator.
import {computeChoiceScenario,choiceStatus} from "../captains/choice-simulator-core.js";

export const RESEARCH_STORY_ROUTES=[
  {id:"",label:"분기 미선택",completed:[]},
  {id:"male-touch",label:"Male Touch (남자가 필요해)",completed:["STR_WE_NEED_MALE_TOUCH_PREQ","STR_WE_NEED_MALE_TOUCH"]},
  {id:"gals-superior",label:"Gals Are Superior (슈퍼변이체 계집이 최고다)",completed:["STR_GALS_ARE_SUPERIOR_PREQ","STR_GALS_ARE_SUPERIOR"]},
  {id:"peasant-revolution",label:"Peasant Revolution (농부 혁명)",completed:["STR_PEASANT_REVOLUTION_PREQ","STR_PEASANT_REVOLUTION"]},
  {id:"cat-path",label:"Cat Path (고양이 경로)",completed:["STR_CAT_PATH_PREQ","STR_CAT_PATH"]},
  {id:"hybrid-path",label:"Hybrid Path (혼혈 경로)",completed:["STR_HYBRID_PATH_PREQ","STR_HYBRID_PATH"]}
];
const asIds=x=>Array.isArray(x)?x.map(v=>typeof v==="string"?v:v?.id).filter(v=>typeof v==="string"):[];

export function createResearchStoryOverlay(index,routeId){
  const route=RESEARCH_STORY_ROUTES.find(x=>x.id===routeId);
  if(!route||!route.id)return null;
  for(const id of route.completed)if(!index.byId.has(id))throw new Error("분기 연구 룰 누락: "+id);
  const state=computeChoiceScenario(index,route.completed);
  if(state.priorConflicts.length)throw new Error("완료 분기의 상호 배제 상태가 모순됩니다.");
  const incoming=new Map(),reachableCache=new Map(),statusCache=new Map();
  const add=(target,source,kind,gate=null)=>{
    if(!index.byId.has(target))return;
    if(!incoming.has(target))incoming.set(target,[]);
    incoming.get(target).push({source,kind,gate});
  };
  for(const source of index.topics){
    for(const target of source.unlocks)add(target,source.id,"unlock");
    for(const target of source.getOneFree)add(target,source.id,"free");
    for(const [gate,targets] of Object.entries(source.getOneFreeProtected||{}))
      for(const target of asIds(targets))add(target,source.id,"protected-free",gate);
  }
  function potential(id,stack=new Set()){
    // Unknown original references, cyclic grants and out-of-band event flags
    // must remain uncertain rather than become false "permanent" exclusions.
    if(!index.byId.has(id))return true;
    if(state.disabled.has(id))return false;
    if(state.completed.has(id))return true;
    if(reachableCache.has(id))return reachableCache.get(id);
    if(stack.has(id))return true; // an unproven cycle is NOT a hard block
    const topic=index.byId.get(id),next=new Set(stack);next.add(id);
    const normalRequires=topic.requires.every(x=>potential(x,next));
    const dependencyPath=topic.dependencies.every(x=>potential(x,next));
    const grantors=incoming.get(id)||[];
    const viable=grantors.filter(x=>
      !state.disabled.has(x.source)&&
      !(index.byId.get(x.source)?.disables||[]).includes(id)&&
      (!x.gate||potential(x.gate,next))&&potential(x.source,next));
    const viaUnlock=viable.some(x=>x.kind==="unlock");
    const viaFree=viable.some(x=>x.kind!=="unlock");
    // unlocks only skip dependencies; getOneFree grants a discovered flag.
    const possible=(normalRequires&&(dependencyPath||viaUnlock))||viaFree;
    reachableCache.set(id,possible);
    return possible;
  }
  function viableAlternates(id){
    return (incoming.get(id)||[]).filter(x=>
      !state.disabled.has(x.source)&&
      !(index.byId.get(x.source)?.disables||[]).includes(id)&&
      (!x.gate||potential(x.gate,new Set([id])))&&
      potential(x.source,new Set([id]))&&
      (x.kind!=="unlock"||index.byId.get(id).requires.every(req=>potential(req))));
  }
  function inspect(id){
    if(statusCache.has(id))return statusCache.get(id);
    const native=choiceStatus(index,state,id);
    let kind="other",reasonPath=[],blockedBy=[],alternates=[];
    if(native.kind==="completed")kind="completed";
    else if(native.kind==="blocked"){kind="direct";blockedBy=native.blockers||[];}
    else{
      const canFollow=potential(id);
      const nominal=native.nominal||null;
      if(nominal){reasonPath=nominal.path||[];blockedBy=nominal.blockers||[];}
      if(!canFollow)kind="path-blocked";
      else if(nominal){
        alternates=viableAlternates(id);
        kind=alternates.length?"alternative":"caution";
      }else if(native.kind==="uncertain")kind="caution";
    }
    const out={id,kind,native,reasonPath,blockedBy,alternates};
    statusCache.set(id,out);
    return out;
  }
  function counts(){
    const total={completed:0,direct:0,pathBlocked:0,alternative:0,caution:0};
    for(const topic of index.topics){
      const kind=inspect(topic.id).kind;
      if(kind==="completed")total.completed++;
      if(kind==="direct")total.direct++;
      if(kind==="path-blocked")total.pathBlocked++;
      if(kind==="alternative")total.alternative++;
      if(kind==="caution")total.caution++;
    }
    return total;
  }
  return {route,state,inspect,counts,possible:potential,viableAlternates};
}
