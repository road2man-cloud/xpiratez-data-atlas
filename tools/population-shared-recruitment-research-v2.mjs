// Exact pre-recruit research prefix reuse. Selection is a heuristic; each
// actual recruitment and every subsequent route must be independently replayed.
import {key} from "./population-research-career-core.mjs";
import {createSharedPrefixReplay} from "./population-shared-prefix-replay.mjs";
import {member} from "./population-growth-replay-core.mjs";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";

export function createSharedRecruitmentIndex({data,branches,profiles,prefixPool,donors,replay,commit,allChoice,graphs,attempts,prior={},scanLimit=32,existingPairs=new Set(),deadline=Infinity}){
 const prefixReplay=createSharedPrefixReplay(replay);
 const records={...prior.records},metrics={scanned:0,ready:0,rejected:0,proposals:0,crossOriginProposals:0};
 const pool=new Map(prefixPool.map(p=>[p.id,p]));
 const counts=new Map(),pairCounts=new Map(),seenBirth=new Set();
 for(const g of Object.values(graphs)){
  counts.set(g.origin,(counts.get(g.origin)||0)+1);
  const pair=JSON.stringify([g.origin,g.branch]);
  pairCounts.set(pair,(pairCounts.get(pair)||0)+1);
  seenBirth.add(key([g.origin,g.prefixHash]));
 }
 // Prefer concrete successful births and staged research. Preserve all
 // distinct action hashes even when the resulting active research sets match.
 const todo=prefixPool.filter(p=>!records[p.id]&&donors.get(p.id)?.size)
  .sort((a,b)=>Number(b.source.kind==="stagedResearch")-Number(a.source.kind==="stagedResearch")||b.actions.length-a.actions.length||a.id.localeCompare(b.id));
 // Group the selected batch by ordered action prefixes to maximize exact reuse.
 const batch=todo.slice(0,scanLimit).map(p=>({p,sort:p.actions.map(a=>JSON.stringify(a)).join("\n")})).sort((a,b)=>a.sort<b.sort?-1:a.sort>b.sort?1:0);
 for(const {p} of batch){
  if(performance.now()>=deadline)break;
  metrics.scanned++;
  try{
   const w=prefixReplay.load(p),b=branches.get(p.branch),c=commit(b);
   if(member(w)||w.pendingFree)throw Error("NOT_PRE_RECRUIT");
   if(!c.every(k=>replay.active(w,k)))throw Error("BRANCH_NOT_ACTIVE");
   if((b.blockedResearch||[]).some(k=>w.researched.has(k))||[...w.researched].some(k=>allChoice.has(k)&&!c.includes(k)))throw Error("BRANCH_CONFLICT");
   const ctx=auditOriginCampaignContext(p.actions,data);
   if(ctx.kind!=="compatible"||!ctx.allowedDifficulties.length)throw Error("CAMPAIGN_CONTEXT");
   records[p.id]={branch:p.branch,active:[...w.researched].filter(k=>replay.active(w,k)).sort(),disabled:[...w.disabled].sort(),month:w.month,allowedDifficulties:ctx.allowedDifficulties,status:"READY"};
   metrics.ready++;
  }catch(e){records[p.id]={branch:p.branch,status:"UNRESOLVED",reason:String(e.message)};metrics.rejected++;}
 }
 const candidates=[];
 for(const [id,r] of Object.entries(records)){
  if(r.status!=="READY"||!pool.has(id))continue;
  const p=pool.get(id),from=[...(donors.get(id)||[])].sort(),active=new Set(r.active);
  for(const profile of profiles.values()){
   // Event births have a distinct verifier; never turn them into direct hires.
   if(profile.sourceType==="event"||!from.some(x=>x!==profile.id)||!profile.requires.every(k=>active.has(k)))continue;
   if(seenBirth.has(key([profile.id,id]))||attempts[key([profile.id,id,"SHARED_DIRECT"])]||attempts[key([profile.id,id,"BRANCH_FIRST"])]?.status==="CONDITIONAL_REPLAY")continue;
   const pair=JSON.stringify([profile.id,p.branch]);
   candidates.push({origin:profile.id,prefix:p,donors:from,pair,known:existingPairs.has(profile.id+"|"+p.branch),research:r.active.length});
  }
 }
 metrics.proposals=candidates.length;metrics.crossOriginProposals=candidates.length;
 const turns=new Map(),used=new Set(),pairTurns=new Map();
 for(const a of Object.values(attempts))if(a.mode==="SHARED_DIRECT")turns.set(a.origin,(turns.get(a.origin)||0)+1);
 function next(){
  // Fair origin scheduling; prioritize newly covered pairs and real active
  // research depth, never infer completeness from an exhausted work batch.
  candidates.sort((a,b)=>(turns.get(a.origin)||0)-(turns.get(b.origin)||0)||Number(a.known||pairTurns.has(a.pair))-Number(b.known||pairTurns.has(b.pair))||(pairCounts.get(a.pair)||0)-(pairCounts.get(b.pair)||0)||(counts.get(a.origin)||0)-(counts.get(b.origin)||0)||b.research-a.research||a.prefix.actions.length-b.prefix.actions.length||a.origin.localeCompare(b.origin)||a.prefix.id.localeCompare(b.prefix.id));
  const t=candidates.find(x=>!used.has(key([x.origin,x.prefix.id])));
  if(!t)return null;
  used.add(key([t.origin,t.prefix.id]));turns.set(t.origin,(turns.get(t.origin)||0)+1);pairTurns.set(t.pair,(pairTurns.get(t.pair)||0)+1);
  return t;
 }
 return {records,metrics,next,load:prefixReplay.load,replayMetrics:prefixReplay.metrics,pendingPrefixes:todo.length-metrics.scanned};
}
