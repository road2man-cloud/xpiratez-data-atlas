// V155: conditional recovery from one specific generated, victorious mission.
// Never infer recovery from research alone; require the immediately preceding
// source-checked mission success transition plus a compatible map outcome.
import assert from 'node:assert/strict';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
export function createTavernRecovery(data,source,replay,sourceHash){
 assert.equal(source.schema,'ATLAS_OVERCAP_TAVERN_SOURCE_V1');
 assert.equal(source.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.deepEqual(source.sourceFiles,data.meta.source.rules);
 const dep=source.deployment.value,script=source.script.value,map=source.mapScript.value;
 assert.equal(dep.type,'STR_LOC_TAVERN_CELLAR');assert.equal(dep.script,map.type);
 assert.deepEqual(dep.terrains,[source.terrain.name]);
 assert.deepEqual(map.commands[2],{type:'addBlock',size:2,groups:5});
 assert.equal(script.missionWeights['0'][dep.type],100);
 const missionAction={type:'missionResearch',research:dep.unlockedResearch,deployment:dep.type,script:script.type,assumeOutcome:true};
 function options(s){
  if(JSON.stringify(s.actions.at(-1))!==JSON.stringify(missionAction)||!s.world.completedMissions?.has(dep.type)||!replay.settled(s)||s.trace.at(-1)?.stateHash!==exactStateHash(s.world))return [];
  const result=[];
  for(const block of source.blocks){
   assert(source.candidateNames.includes(block.name)&&block.width===20&&block.length===20&&[block.groups].flat().includes(5));
   const fixed=block.items.STR_BOOK_OF_SERMONS.length;
   const picks=[null];
   const idx=block.randomizedItems.findIndex(x=>x.mixed===true&&x.amount>=1&&x.itemList.includes('STR_OLD_BOOKS'));
   if(idx>=0)picks.push({slot:idx,item:'STR_OLD_BOOKS',count:1});
   for(const pick of picks){
    const recovered={STR_BOOK_OF_SERMONS:fixed};
    if(pick)recovered[pick.item]=pick.count;
    const action={type:'sourceMapRecovery',deployment:dep.type,script:script.type,terrain:source.terrain.name,mapScript:map.type,block:block.name,recovered,randomPick:pick,assumeGeneratedBlock:true,assumeLootSurvived:true,assumeRecovered:true};
    const pool=pick?block.randomizedItems[pick.slot].itemList:null;
    const evidence={kind:'SOURCE_BOUND_CONDITIONAL_MAP_RECOVERY',sourceSha256:sourceHash,startingCondition:dep.startingCondition,missionGenerationConditional:true,missionVictoryConditional:true,validSquadConditional:true,blockChoiceConditional:true,blockCandidateCount:source.candidateNames.length,commandIndex:2,fixedPositions:block.items.STR_BOOK_OF_SERMONS,randomPick:pick?{...pick,poolSize:pool.length,matchingSlots:pool.filter(x=>x===pick.item).length}:null,lootSurvivalConditional:true,recoveryConditional:true,otherLootNotCredited:true};
    result.push({action,evidence});
   }
  }return result;
 }
 function apply(s,a){
  const o=options(s).find(x=>JSON.stringify(x.action)===JSON.stringify(a));
  assert(o,'Map recovery requires one immediately preceding compatible mission success');
  const w=structuredClone(s.world);
  for(const [id,count] of Object.entries(a.recovered)){assert(Number.isSafeInteger(count)&&count>0);w.items[id]=Number(w.items[id]||0)+count;}
  return {...s,world:w,actions:[...s.actions,a],trace:[...s.trace,{action:a,evidence:o.evidence,stateHash:exactStateHash(w),balance:w.funds,conditional:true}]};
 }
 function begin(s){
  assert(replay.options(s).some(o=>JSON.stringify(o.action)===JSON.stringify(missionAction)),'Mission not enabled');
  return replay.research(s,missionAction);
 }
 return {begin,options,apply,missionAction};
}
