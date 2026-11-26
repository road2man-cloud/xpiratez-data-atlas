// Broad research-branch scheduling. All selection scores are heuristics;
// actual recruitment and terminal research are replayed by the producer.
// No absence or unsuccessful trial is a proof of impossibility.
import {key} from "./population-research-career-core.mjs";
const MODE="STAGED_COVERAGE_V17";
export function createBranchCoverageWave({db,graphs,profiles,branches,prefixPool,attempts,commit,allChoice,terminalRule,terminalRecords,focus=[],maxSeedsPerBranch=1}){
 const complete=new Set(Object.values(db.careerCompletion?.researchTraitSets?.pairs||{}).filter(p=>p.body!=="STR_SOLDIER_CHORT").map(p=>p.branch));
 for(const r of Object.values(terminalRecords||{}))if(r.status==="CONDITIONAL_TARGET_RESEARCH_READY"&&graphs[r.graph]?.nodes[r.to]?.body!=="STR_SOLDIER_CHORT")complete.add(r.branch);
 const pathTotals=new Map(),pathReady=new Map(),pathAttempts=new Map(),branchAttempts=new Map(),originAttempts=new Map(),commitmentFailures=new Map(),seeded=new Map(),pairs=new Set();
 for(const b of branches.values()){const p=b.choices.path;pathTotals.set(p,(pathTotals.get(p)||0)+1);if(complete.has(b.id))pathReady.set(p,(pathReady.get(p)||0)+1);}
 for(const g of Object.values(graphs)){if(g.blocker)continue;seeded.set(g.branch,(seeded.get(g.branch)||0)+1);pairs.add(g.branch+"|"+g.origin);}
 for(const a of Object.values(attempts))if(a.mode===MODE){
  branchAttempts.set(a.branch,(branchAttempts.get(a.branch)||0)+1);originAttempts.set(a.origin,(originAttempts.get(a.origin)||0)+1);
  const b=branches.get(a.branch),path=b?.choices.path;pathAttempts.set(path,(pathAttempts.get(path)||0)+1);
  const missing=(a.stage?.remaining||[]).filter(k=>b&&commit(b).includes(k));
  if(a.status==="LIMITED_UNRESOLVED"&&missing.length){const family=key([b.captain,b.choices.path,b.choices.cause]);commitmentFailures.set(family,(commitmentFailures.get(family)||0)+1);}
 }
 const pp=new Map();
 for(const prefix of prefixPool){const b=branches.get(prefix.branch);if(!b||complete.has(b.id)||(seeded.get(b.id)||0)>=maxSeedsPerBranch||focus.length&&!focus.includes(b.id))continue;const a=pp.get(b.id)||[];a.push(prefix);pp.set(b.id,a);}
 const selectedProfiles=[...profiles.values()].filter(p=>p.sourceType!=="event"&&p.soldierType!=="STR_SOLDIER_CHORT");
 const terminalTopics=new Set(terminalRule.targets.flatMap(t=>t.researchGoals));
 const lists=new Map(),stats={eligibleBranches:0,eligiblePrefixes:0,proposals:0,attempts:0,births:0,selected:[],paths:{}};
 for(const [bid,prefixes] of pp){
  const b=branches.get(bid),keep=commit(b),blocked=new Set(b.blockedResearch||[]),candidates=[];
  const ps=selectedProfiles.filter(p=>!pairs.has(bid+"|"+p.id)&&p.requires.every(k=>!blocked.has(k)&&(!allChoice.has(k)||keep.includes(k))));
  // Rank real chronological prefixes, not projected research sets. The
  // topics are only a cheap ordering hint; tryBirth checks actual activity.
  const ranked=prefixes.map(prefix=>{
   const commitments=keep.filter(k=>prefix.topics.has(k)).length,terminal=Array.from(terminalTopics).filter(k=>prefix.topics.has(k)).length;
   const score=commitments*1200+terminal*140+Math.min(700,prefix.topics.size)*2+Number(prefix.source.kind==="retainedRoot")*20;
   return {prefix,score};
  }).sort((a,b)=>b.score-a.score||a.prefix.actions.length-b.prefix.actions.length||a.prefix.id.localeCompare(b.prefix.id));
  for(const {prefix,score} of ranked){
   if(!ps.length)break;
   for(const p of ps){
    if(attempts[key([p.id,prefix.id,MODE])])continue;
    const ready=p.requires.filter(k=>prefix.topics.has(k)).length,missing=p.requires.length-ready;
    const rank=score+ready*400-missing*650+Number(p.sourceType==="direct")*35-Math.min(30,Object.keys(p.acquisitionRequiredItems||{}).length*3);
    candidates.push({origin:p.id,p,prefix,score:rank,b,path:b.choices.path,family:key([b.captain,b.choices.path,b.choices.cause])});
   }
   // A bounded queue per branch is replenished from all prefixes next run.
   // No candidate is excluded from future runs based on its score.
   if(candidates.length>=300)break;
  }
  if(candidates.length){candidates.sort((a,z)=>z.score-a.score||(originAttempts.get(a.origin)||0)-(originAttempts.get(z.origin)||0)||a.origin.localeCompare(z.origin)||a.prefix.id.localeCompare(z.prefix.id));lists.set(bid,candidates);stats.proposals+=candidates.length;stats.eligiblePrefixes+=ranked.length;}
 }
 stats.eligibleBranches=lists.size;
 const roundTurns=new Map(),selected=new Set();
 function next(){
  const choices=[];
  for(const [bid,list] of lists){
   if(complete.has(bid)||(seeded.get(bid)||0)>=maxSeedsPerBranch)continue;
   const t=list.find(t=>!pairs.has(bid+"|"+t.origin)&&!selected.has(key([t.origin,t.prefix.id,MODE])));
   if(t)choices.push(t);
  }
  choices.sort((a,b)=>(roundTurns.get(a.path)||0)-(roundTurns.get(b.path)||0)||(pathReady.get(a.path)||0)/(pathTotals.get(a.path)||1)-(pathReady.get(b.path)||0)/(pathTotals.get(b.path)||1)||(branchAttempts.get(a.b.id)||0)-(branchAttempts.get(b.b.id)||0)||(commitmentFailures.get(a.family)||0)-(commitmentFailures.get(b.family)||0)||b.score-a.score||a.b.id.localeCompare(b.b.id));
  const t=choices[0];if(!t)return;
  selected.add(key([t.origin,t.prefix.id,MODE]));branchAttempts.set(t.b.id,(branchAttempts.get(t.b.id)||0)+1);originAttempts.set(t.origin,(originAttempts.get(t.origin)||0)+1);roundTurns.set(t.path,(roundTurns.get(t.path)||0)+1);stats.attempts++;
  return t;
 }
 function finish(t,success){
  const p=stats.paths[t.path]??={attempts:0,births:0};p.attempts++;
  const record=attempts[key([t.origin,t.prefix.id,MODE])];
  stats.selected.push({branch:t.b.id,origin:t.origin,path:t.path,prefix:t.prefix.id,success,...(!success?{reason:record?.reason,remaining:record?.stage?.remaining}: {})});
  if(!success&&(record?.stage?.remaining||[]).some(k=>commit(t.b).includes(k)))commitmentFailures.set(t.family,(commitmentFailures.get(t.family)||0)+1);
  if(success){stats.births++;p.births++;seeded.set(t.b.id,(seeded.get(t.b.id)||0)+1);pairs.add(t.b.id+"|"+t.origin);pathReady.set(t.path,(pathReady.get(t.path)||0)+1);}
 }
 return {next,finish,stats};
}
