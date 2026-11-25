// Internal exact replay work scheduling; final admission remains in atlas-career-completion-core.
// Historical candidate hashes are replay work identities, NOT final-state proofs.
import {createHash} from 'node:crypto';
import {retainedTraitIds} from '../public/branch-soldier-atlas-career-core.js';
export const WORK_SCHEMA='FINAL_REPLAY_WORKLIST_V1';
const sha=s=>createHash('sha256').update(s).digest('hex');
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
export function canonical(x){
 if(x===null||typeof x==='boolean'||typeof x==='string')return JSON.stringify(x);
 if(typeof x==='number'&&Number.isFinite(x))return JSON.stringify(x);
 if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
 if(plain(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
 throw Error('Noncanonical value');
}
export const digest=x=>sha(canonical(x));
export const flags=Object.freeze({
 CONDITIONAL_CLOSURE:1,FIXED_UPPER:2,RESEARCH_WITNESS:4,TRAITS_MEASURED:8,
 RECRUIT_WITNESS:16,REPLAY_ALIAS:32,EVIDENCE_CONFLICT:64,INVALID:128
});
const knownFlags=(r,projected,hasWitness)=>Number(r.conditionalScopeComplete===true)*flags.CONDITIONAL_CLOSURE+
 Number(!!projected?.fixedModelOptimum)*flags.FIXED_UPPER+
 Number(hasWitness(projected))*flags.RESEARCH_WITNESS+
 Number(retainedTraitIds(r)!==null)*flags.TRAITS_MEASURED+
 Number(!!projected?.birthEvidence)*flags.RECRUIT_WITNESS+
 Number(!projected)*flags.INVALID;
function fingerprint(r){
 // Exact action hash is not enough if two sources disagree about output.
 // Unknown fields are deliberately not filled with guesses.
 return digest({state:r.canonicalStateHash??null,body:r.body??null,
 current:r.permanentVector??r.vector??null,cap:r.permanentCapVector??r.capVector??null,
 rank:r.rank??null,medals:r.medals??null,order:r.order??null});
}
export function classifyReplayWork(sources,{hasWitness=()=>false}={}){
 const groups=new Map(),entries=[],sourceStats=[];
 for(const [si,s] of sources.entries()){
  const projected=new Map(s.rows.map(r=>[r.id,r])),ids=Object.keys(s.raw.routes).sort();
  const counts={source:s.key,rows:ids.length,conditional:0,fixed:0,measuredTraits:0,researchWitness:0,invalid:0};
  for(const [ri,rid] of ids.entries()){
   const r=s.raw.routes[rid],p=projected.get(rid),mask=knownFlags(r,p,q=>!!q&&hasWitness(q));
   const entry={si,ri,id:rid,origin:r.origin??null,branch:r.branch??null,action:r.fullActionHash??null,state:r.canonicalStateHash??null,mask,group:null,traits:retainedTraitIds(r),traitCounts:r.traitEvidence?.counts??null,difficulty:p?.difficulties??[]};
   counts.conditional+=Number(!!(mask&flags.CONDITIONAL_CLOSURE));counts.fixed+=Number(!!(mask&flags.FIXED_UPPER));counts.measuredTraits+=Number(!!(mask&flags.TRAITS_MEASURED));counts.researchWitness+=Number(!!(mask&flags.RESEARCH_WITNESS));counts.invalid+=Number(!!(mask&flags.INVALID));
   entries.push(entry);
   if(!p||!hash(entry.action)||!hash(entry.state))continue;
   const key=digest([entry.origin,entry.branch,entry.action]);
   if(!groups.has(key))groups.set(key,{key,origin:entry.origin,branch:entry.branch,members:[],fingerprints:new Set(),representatives:[]});
   const g=groups.get(key);entry.group=g;g.members.push(entry);g.fingerprints.add(fingerprint(r));
  }
  sourceStats.push(counts);
 }
 const work=[],conflicts=[];
 function priority(e){return 100000*Number(!!(e.mask&flags.FIXED_UPPER))+10000*Number(!!(e.mask&flags.CONDITIONAL_CLOSURE))+1000*Number(!!(e.mask&flags.RECRUIT_WITNESS))+100*Number(!!(e.mask&flags.RESEARCH_WITNESS))+(e.traits?.length??0);}
 const compare=(a,b)=>priority(b)-priority(a)||a.si-b.si||a.ri-b.ri;
 for(const g of groups.values()){
  // Differences in known trait sets/counts also prohibit sharing the result.
  const traitSets=new Set(g.members.filter(e=>e.traits!==null).map(e=>canonical([...e.traits].sort())));
  const traitCounts=new Set(g.members.filter(e=>e.traitCounts!==null).map(e=>canonical(e.traitCounts)));
  if(g.fingerprints.size!==1||traitSets.size>1||traitCounts.size>1){
   for(const e of g.members){
    e.mask|=flags.EVIDENCE_CONFLICT;
    for(const d of new Set(e.difficulty))work.push({key:digest([g.key,d,e.si,e.ri]),origin:g.origin,branch:g.branch,difficulty:d,seed:[e.si,e.ri],aliases:[],priority:priority(e),requiresComparison:true});
   }
   conflicts.push({key:g.key,members:g.members.map(e=>[e.si,e.ri])});continue;
  }
  // Each difficulty may have different mission/event semantics. Share only
  // the exact replay input at the same difficulty; never merge final outcomes.
  const byDifficulty=new Map();
  for(const e of g.members)for(const d of new Set(e.difficulty)){
   if(!byDifficulty.has(d))byDifficulty.set(d,[]);
   byDifficulty.get(d).push(e);
  }
  const reps=new Set();
  for(const [d,es] of byDifficulty){
   es.sort(compare);const e=es[0];reps.add(e);
   work.push({key:digest([g.key,d]),origin:g.origin,branch:g.branch,difficulty:d,seed:[e.si,e.ri],aliases:es.slice(1).map(a=>[a.si,a.ri]),priority:priority(e)});
  }
  if(byDifficulty.size)for(const e of g.members)if(!reps.has(e)&&e.difficulty.length)e.mask|=flags.REPLAY_ALIAS;
 }
 // Fair queue across origins, prioritizing exact closure candidates inside
 // each lane; no state is removed just because its vector is dominated.
 const lanes=new Map();
 for(const item of work){if(!lanes.has(item.origin))lanes.set(item.origin,[]);lanes.get(item.origin).push(item);}
 for(const lane of lanes.values())lane.sort((a,b)=>b.priority-a.priority||a.branch.localeCompare(b.branch)||a.key.localeCompare(b.key));
 const laneOrder=[...lanes.keys()].sort((a,b)=>lanes.get(b)[0].priority-lanes.get(a)[0].priority||a.localeCompare(b));
 const queue=[];let max=0;for(const a of lanes.values())max=Math.max(max,a.length);
 for(let i=0;i<max;i++)for(const origin of laneOrder){const item=lanes.get(origin)[i];if(item)queue.push(item);}
 const sourceMasks=sources.map((s,i)=>Buffer.from(entries.filter(e=>e.si===i).map(e=>e.mask)).toString('base64'));
 const summary={registered:entries.length,actionIdentityGroups:groups.size,identicalActionReferences:entries.filter(e=>e.group).length-groups.size,
 replayWorkUnitsBefore:entries.filter(e=>e.group).reduce((n,e)=>n+new Set(e.difficulty).size,0),replayWorkUnits:work.length,replayAliasUnits:work.reduce((n,x)=>n+x.aliases.length,0),
 replayAliasRows:entries.filter(e=>e.mask&flags.REPLAY_ALIAS).length,conflictingActionGroups:conflicts.length,
 conflictingRows:entries.filter(e=>e.mask&flags.EVIDENCE_CONFLICT).length,unqueueableRows:entries.filter(e=>!e.group||!e.difficulty.length).length,
 conditional:sourceStats.reduce((n,s)=>n+s.conditional,0),fixed:sourceStats.reduce((n,s)=>n+s.fixed,0),
 measuredTraits:sourceStats.reduce((n,s)=>n+s.measuredTraits,0),researchWitness:sourceStats.reduce((n,s)=>n+s.researchWitness,0),
 origins:new Set(entries.map(e=>e.origin)).size,branches:new Set(entries.map(e=>e.branch)).size,
 unresolvedRegistered:entries.length};
 return {summary,sourceStats,sourceMasks,queue,conflicts,entries};
}
