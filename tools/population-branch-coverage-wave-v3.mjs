// Branch coverage with per-origin queues and empirical, diversity-aware scheduling.
// All scores are scheduling hints. Every admitted recruitment is replayed;
// deferred prefixes are considered again in subsequent batches.
import {key} from "./population-research-career-core.mjs";
const MODE="STAGED_COVERAGE_V17";
export function createBranchCoverageWave({db,graphs,profiles,branches,prefixPool,attempts,commit,allChoice,terminalRule,terminalRecords,focus=[],maxSeedsPerBranch=1}){
 const complete=new Set(Object.values(db.careerCompletion?.researchTraitSets?.pairs||{}).filter(p=>p.body!=="STR_SOLDIER_CHORT").map(p=>p.branch));
 for(const r of Object.values(terminalRecords||{}))if(r.status==="CONDITIONAL_TARGET_RESEARCH_READY"&&graphs[r.graph]?.nodes[r.to]?.body!=="STR_SOLDIER_CHORT")complete.add(r.branch);
 const pathTotals=new Map(),pathReady=new Map(),branchAttempts=new Map(),originAttempts=new Map(),originSuccess=new Map(),commitmentFailures=new Map(),seeded=new Map(),pairs=new Set(),originGraphs=new Map(),attemptedPrefixes=new Map();
 const inc=(m,k,n=1)=>m.set(k,(m.get(k)||0)+n);
 for(const b of branches.values()){inc(pathTotals,b.choices.path);if(complete.has(b.id))inc(pathReady,b.choices.path);}
 for(const g of Object.values(graphs)){if(g.blocker)continue;inc(seeded,g.branch);pairs.add(g.branch+"|"+g.origin);inc(originGraphs,g.origin);}
 for(const a of Object.values(attempts))if(a.mode===MODE){
  inc(branchAttempts,a.branch);inc(originAttempts,a.origin);
  if(a.status==="CONDITIONAL_REPLAY")inc(originSuccess,a.origin);
  if(!attemptedPrefixes.has(a.origin))attemptedPrefixes.set(a.origin,new Set());
  attemptedPrefixes.get(a.origin).add(a.prefix);
  const b=branches.get(a.branch);
  if(b&&a.status==="LIMITED_UNRESOLVED"&&(a.stage?.remaining||[]).some(k=>commit(b).includes(k)))inc(commitmentFailures,key([b.captain,b.choices.path,b.choices.cause]));
 }
 const pp=new Map(),focused=new Set(focus);
 for(const prefix of prefixPool){const b=branches.get(prefix.branch);if(!b||complete.has(b.id)||(seeded.get(b.id)||0)>=maxSeedsPerBranch||focused.size&&!focused.has(b.id))continue;const a=pp.get(b.id)||[];a.push(prefix);pp.set(b.id,a);}
 const selectedProfiles=[...profiles.values()].filter(p=>p.sourceType!=="event"&&p.soldierType!=="STR_SOLDIER_CHORT");
 const terminalTopics=[...new Set(terminalRule.targets.flatMap(t=>t.researchGoals))];
 const lists=new Map(),stats={policy:"ORIGIN_BALANCED_PREFIX_QUEUES_V3",eligibleBranches:0,eligiblePrefixes:0,proposals:0,prefixPairsEvaluated:0,attempts:0,births:0,selected:[],paths:{},origins:{}};
 const rankCompare=(a,b)=>b.score-a.score||a.prefix.actions.length-b.prefix.actions.length||a.prefix.id.localeCompare(b.prefix.id);
 for(const [bid,prefixes] of pp){
  const b=branches.get(bid),keep=commit(b),blocked=new Set(b.blockedResearch||[]),family=key([b.captain,b.choices.path,b.choices.cause]);
  const ps=selectedProfiles.filter(p=>!pairs.has(bid+"|"+p.id)&&p.requires.every(k=>!blocked.has(k)&&(!allChoice.has(k)||keep.includes(k))));
  const ranked=prefixes.map(prefix=>({prefix,score:keep.filter(k=>prefix.topics.has(k)).length*1200+terminalTopics.filter(k=>prefix.topics.has(k)).length*140+Math.min(700,prefix.topics.size)*2+Number(prefix.source.kind==="retainedRoot")*20}));
  const queues=[];
  // Keep three best unattempted prefixes for EACH eligible origin, rather
  // than letting the first 300 cross-product entries crowd other origins out.
  // More prefixes are replenished on the next run, never declared impossible.
  for(const p of ps){
   const used=attemptedPrefixes.get(p.id),top=[];
   for(const {prefix,score} of ranked){
    if(used?.has(prefix.id))continue;
    const missing=p.requires.filter(k=>!prefix.topics.has(k)).length;
    const rank=score-missing*900+Number(missing===0)*160+Number(p.sourceType==="direct")*35-Math.min(30,Object.keys(p.acquisitionRequiredItems||{}).length*3);
    const t={origin:p.id,p,prefix,score:rank,b,path:b.choices.path,family,missing};
    stats.prefixPairsEvaluated++;
    if(top.length<3||rankCompare(t,top.at(-1))<0){top.push(t);top.sort(rankCompare);if(top.length>3)top.pop();}
   }
   if(top.length){queues.push({origin:p.id,body:p.soldierType,items:top,cursor:0});stats.proposals+=top.length;}
  }
  if(queues.length){lists.set(bid,queues);stats.eligiblePrefixes+=ranked.length;}
 }
 stats.eligibleBranches=lists.size;
 const roundTurns=new Map(),roundOriginTurns=new Map(),roundBodyTurns=new Map(),selected=new Set();
 const adjusted=t=>t.score+180*((2+(originSuccess.get(t.origin)||0))/(4+(originAttempts.get(t.origin)||0))-.5)-90*Math.log2(1+(originGraphs.get(t.origin)||0))-180*(roundOriginTurns.get(t.origin)||0)-90*(roundBodyTurns.get(t.p.soldierType)||0);
 const compare=(a,b)=>adjusted(b)-adjusted(a)||rankCompare(a,b)||a.origin.localeCompare(b.origin);
 function next(){
  const choices=[];
  for(const [bid,queues] of lists){
   if(complete.has(bid)||(seeded.get(bid)||0)>=maxSeedsPerBranch)continue;
   let best;
   for(const q of queues){
    if(pairs.has(bid+"|"+q.origin))continue;
    while(q.cursor<q.items.length&&selected.has(q.items[q.cursor]))q.cursor++;
    const t=q.items[q.cursor];if(t&&(!best||compare(t,best)<0))best=t;
   }
   if(best)choices.push(best);
  }
  choices.sort((a,b)=>(roundTurns.get(a.path)||0)-(roundTurns.get(b.path)||0)||(pathReady.get(a.path)||0)/(pathTotals.get(a.path)||1)-(pathReady.get(b.path)||0)/(pathTotals.get(b.path)||1)||(branchAttempts.get(a.b.id)||0)-(branchAttempts.get(b.b.id)||0)||(commitmentFailures.get(a.family)||0)-(commitmentFailures.get(b.family)||0)||compare(a,b)||a.b.id.localeCompare(b.b.id));
  const t=choices[0];if(!t)return;
  t.adjustedScore=adjusted(t);selected.add(t);inc(branchAttempts,t.b.id);inc(originAttempts,t.origin);inc(roundTurns,t.path);inc(roundOriginTurns,t.origin);inc(roundBodyTurns,t.p.soldierType);stats.attempts++;
  return t;
 }
 function finish(t,success){
  const p=stats.paths[t.path]??={attempts:0,births:0},o=stats.origins[t.origin]??={attempts:0,births:0};p.attempts++;o.attempts++;
  const record=attempts[key([t.origin,t.prefix.id,MODE])];
  stats.selected.push({branch:t.b.id,origin:t.origin,path:t.path,prefix:t.prefix.id,success,missingAtSelection:t.missing,score:t.score,adjustedScore:t.adjustedScore,...(!success?{reason:record?.reason,remaining:record?.stage?.remaining}: {})});
  if(!success&&(record?.stage?.remaining||[]).some(k=>commit(t.b).includes(k)))inc(commitmentFailures,t.family);
  if(success){stats.births++;p.births++;o.births++;inc(seeded,t.b.id);pairs.add(t.b.id+"|"+t.origin);inc(originGraphs,t.origin);inc(originSuccess,t.origin);}
 }
 return {next,finish,stats};
}
