// V162: one-month research score ledger + conditional score-gated rank transitions.
// Never treat lifetime research points as a monthly score or invent regional activity.
import assert from 'node:assert/strict';
import {exactStateHash} from './origin-pair-exact-prefix-checkpoint.mjs';
import {eventScriptVerdict} from '../public/soldiers/modern/event-chronology.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
export function createMonthlyScoreLedger(data,rp,proof,proofSha){
 assert.equal(proof.schema,'ATLAS_OVERCAP_SCORE_SOURCE_V1');
 assert.equal(proof.sourceMetadataSha256,data.meta.source.metadataSha256);
 assert.deepEqual(proof.sourceFiles,data.meta.source.rules);
 const rankRule=(section,id)=>{const r=proof.rankRows.find(x=>x.section===section&&x.id===id);assert(r);return r.raw;};
 function points(id,section='research'){
  const table=section==='research'?proof.points:proof.eventPoints;
  assert(Object.hasOwn(table,id)&&!proof.conflicts[section+':'+id],'Unknown score fact: '+id);
  assert(Number.isSafeInteger(table[id]));return table[id];
 }
 function begin(s){return {month:s.world.month,current:0,entries:[],closed:[],completeSelectedMonth:false,seen:[...s.world.researched],anchor:exactStateHash(s.world)};}
 function observe(ledger,prev,next){
  assert.equal(ledger.anchor,exactStateHash(prev.world));assert.equal(ledger.month,prev.world.month);
  assert.equal(next.actions.length,prev.actions.length+1);const a=next.actions.at(-1);
  const anchor=exactStateHash(next.world);
  if(a.type==='sourceMonthlyBoundary'){
   assert.equal(next.world.month,prev.world.month+1);
   assert.deepEqual([...next.world.researched],[...prev.world.researched]);
   const closed={month:ledger.month,researchAndEventSubtotal:ledger.current,engineBaseBonus:next.world.month>1?400:0,scoreBeforeRegionalActivity:ledger.current+(next.world.month>1?400:0),entries:ledger.entries,completeSelectedMonth:ledger.completeSelectedMonth,closingStateHash:ledger.anchor};
   return {...ledger,month:next.world.month,current:0,entries:[],closed:[...ledger.closed,closed],completeSelectedMonth:true,anchor};
  }
  assert.equal(next.world.month,prev.world.month);
  assert.deepEqual([...next.world.disabled],[...prev.world.disabled],'Score ledger does not support disables or reenables');
  const additions=[...next.world.researched].filter(k=>!prev.world.researched.has(k));
  assert(additions.every(k=>!ledger.seen.includes(k)),'Already credited research');
  const grants=additions.map(id=>({id,points:points(id)}));
  const eventId=a.event??null;
  const eventDelta=eventId?points(eventId,'events'):0;
  // Only direct scored research and explicitly supported events are accepted.
  assert(['research','repeatResearch','freeResearch','sourceResearchDelivery','sourceMonthlyRankReward'].includes(a.type),'Unsupported score transition: '+a.type);
  const delta=grants.reduce((n,x)=>n+x.points,0)+eventDelta;
  assert(Number.isSafeInteger(delta));
  return {...ledger,current:ledger.current+delta,seen:[...ledger.seen,...additions],entries:[...ledger.entries,{action:a,grants,eventDelta,delta}],anchor};
 }
 function rankOption(s,ledger,id){
  const rule=rankRule('eventScripts',id),event=rankRule('events',id),research=rankRule('research',id);
  assert.deepEqual(event.researchList,[id]);assert.equal(points(id),research.points??0);assert.equal(points(id,'events'),event.points??0);
  assert(Object.keys(rule).every(k=>['type','eventWeights','firstMonth','minScore','executionOdds','researchTriggers'].includes(k)));
  assert.deepEqual(rule.eventWeights,{'0':{[id]:100}});assert.equal(rule.executionOdds,100);
  assert(Object.keys(event).every(k=>['name','description','background','music','researchList','timer','timerRandom','points'].includes(k)));
  assert.equal(s.actions.at(-1)?.type,'sourceMonthlyBoundary');
  if(!rp.settled(s)||s.world.month<rule.firstMonth||s.world.researched.has(id)||s.world.disabled.has(id))return null;
  for(const [k,v] of Object.entries(rule.researchTriggers||{}))if(active(s.world,k)!==v)return null;
  const closing=ledger.closed.at(-1);if(!closing||!closing.completeSelectedMonth||closing.month!==s.world.month-1)return null;
  if(closing.scoreBeforeRegionalActivity<rule.minScore)return null;
  const indexed=data.forwardSupply.events[id];assert(indexed&&indexed.funds===0&&indexed.points===(event.points??0)&&indexed.research.length===1&&indexed.research[0]===id&&!Object.keys(indexed.fixed).length);
  const script=indexed.scripts.find(x=>x.script===id);
  assert(script);assert.equal(script.otherConditions.minScore,rule.minScore);assert.equal(script.firstMonth,rule.firstMonth);assert.equal(script.executionOdds,rule.executionOdds);
  assert.deepEqual(script.researchPositive,Object.keys(rule.researchTriggers).filter(k=>rule.researchTriggers[k]));assert.deepEqual(script.researchNegative,Object.keys(rule.researchTriggers).filter(k=>!rule.researchTriggers[k]));
  const modeledScore=closing.scoreBeforeRegionalActivity;
  const proxy={...s.world,score:modeledScore};
  const verdict=eventScriptVerdict(script,proxy,{mode:'current'});assert.equal(verdict.kind,'eligible');
  const action={type:'sourceMonthlyRankReward',event:id,script:id,research:id,month:s.world.month,scoreProof:{previousMonth:closing.month,subtotal:closing.researchAndEventSubtotal,baseBonus:closing.engineBaseBonus,scoreBeforeRegionalActivity:modeledScore,minScore:rule.minScore,assumeUnmodeledNetActivityAtLeast:rule.minScore-modeledScore,closingStateHash:closing.closingStateHash},assumeOutcome:true};
  return {action,evidence:{kind:'CONDITIONAL_MONTHLY_SCORE_GATE',sourceSha256:proofSha,scoreProof:action.scoreProof,regionalActivityNotSimulated:true,unmodeledResearchAndEventPointsIncludedInResidual:true,actualScoreUnknown:true,selectedResearchCompletionWithinMonthConditional:true,rankResearchPoints:research.points??0}};
 }
 function applyRank(s,ledger,a){
  const o=rankOption(s,ledger,a.research);assert(o&&same(o.action,a),'Rank score gate unavailable');
  assert(!Object.hasOwn(s.world,'score'),'Do not overwrite native score evidence');
  const proxy={...s,world:{...s.world,score:a.scoreProof.scoreBeforeRegionalActivity}};
  const n=rp.research(proxy,{type:'eventResearch',research:a.research,event:a.event,script:a.script,assumeOutcome:true});
  const w=n.world;delete w.score;assert(active(w,a.research));
  return {...n,world:w,actions:[...s.actions,a],trace:[...s.trace,{...n.trace.at(-1),action:a,evidence:o.evidence,stateHash:exactStateHash(w)}]};
 }
 return {begin,observe,points,rankOption,applyRank};
}
