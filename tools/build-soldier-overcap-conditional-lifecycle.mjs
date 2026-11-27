import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {foundationWorld,applyOriginWitnessStep} from '../public/soldiers/modern/origin-witness.js';
import {auditOriginCampaignContext} from '../public/soldiers/modern/origin-campaign-context.js';
import {STAT_KEYS,bonusStats} from '../public/soldiers/modern/eligibility.js';
import {defaultRankData,RANK_POLICY} from './population-frontier-default-rank.mjs';
import {createContextResearchPlanner} from '../public/soldiers/modern/foundation-research-planner-context-v2.js';

const read=p=>JSON.parse(fs.existsSync(p)?fs.readFileSync(p,'utf8'):execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show','HEAD:'+p],{encoding:'utf8',maxBuffer:64*1024*1024}));
const rankData=defaultRankData(JSON.parse(gunzipSync(fs.readFileSync('public/data/soldiers-modern-index.json.gz'))));
const data=rankData.data;
const catalog=read('public/data/soldier-source-catalog.json'), ledger=read('public/data/soldier-acquisition-progression-20261102.json');
if(JSON.stringify(catalog.sourceHashes)!==JSON.stringify(data.meta.source.rules))throw Error('catalog source mismatch');
data.sourceItemIds=new Set(catalog.itemIds);
data.originRows=ledger.rows;
const queue=read('public/data/soldier-overcap-research-queue.json'), prep=read(process.argv.find(a=>a.startsWith('--prep='))?.slice(7)||'public/data/soldier-overcap-context-recovery.json');
if(queue.sourceMetadataSha256!==prep.sourceMetadataSha256||prep.sourceMetadataSha256!==data.meta.source.metadataSha256||queue.sourceLedgerHash!==prep.sourceLedgerHash)throw Error('source mismatch');
const keys=STAT_KEYS, active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k), vec=o=>keys.map(k=>o[k]), equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b), sum=a=>a.reduce((x,y)=>x+y,0);
const profiles=new Map(data.profiles.map(p=>[p.id,p])), rules=new Map(data.transformations.map(r=>[r.id,r])), bodies=new Map(data.soldiers.map(b=>[b.id,b])), jobs=new Map(queue.jobs.map(j=>[j.id,j])), prefixes=new Map(prep.prefixes.map(p=>[p.id,p]));
function member(w){const m=w.soldiers.find(s=>s.id==='origin');if(!m)throw Error('missing origin');return m}
function snapshot(w){const s=member(w).state,b=bonusStats(s,data,{commendations:{}}),raw=vec(s.currentStats),effective=keys.map(k=>k==='psiSkill'&&s.currentStats[k]<=0&&(b[k]||0)>0?s.currentStats[k]:Math.max(k==='health'?1:0,s.currentStats[k]+(b[k]||0)));return {body:s.soldierType,raw,effective,rank:s.rank,traits:[...s.bonusCounts].sort(),history:[...s.history].sort()}}
function apply(w,a){
 if(a.type==='conditionalPromotion'){
  if(a.assumption!==true||w.pendingFree)throw Error('invalid promotion assumption');
  const v=structuredClone(w),s=member(v).state,b=bodies.get(s.soldierType),ranks=b?.raw?.rankStrings;
  if(s.retired||s.status!=='healthy'||b?.allowPromotion!==true||!Array.isArray(ranks)||!Number.isSafeInteger(s.rank)||a.rank!==s.rank+1||a.rank>=ranks.length)throw Error('invalid sequential promotion: '+s.soldierType+' '+s.rank+' -> '+a.rank);
  s.rank=a.rank;return v;
 }
 if(a.type==='conditionalCapGrowth'){
  if(a.assumption!==true||w.pendingFree)throw Error('invalid growth assumption');
  const v=structuredClone(w),m=member(v),s=m.state,b=bodies.get(s.soldierType);
  if(!s.exactStats||!b||s.retired||s.status!=='healthy')throw Error('invalid growth body/state');
  for(const k of keys){const x=s.currentStats[k],c=b.statCaps[k];if(!Number.isSafeInteger(x)||!Number.isSafeInteger(c))throw Error('unknown growth cap: '+k);if(c>x&&(k!=='mana'||data.growthRules.manaPrimary||data.growthRules.manaSecondary))s.currentStats[k]=k==='bravery'?x+10*Math.floor((c-x)/10):c;}
  return v;
 }
 const q=applyOriginWitnessStep(w,a,data);if(!q.ok)throw Error(q.reason);return q.world;
}
const results=[];
const offset=Number(process.argv.find(a=>a.startsWith('--offset='))?.split('=')[1]||0), limit=Number(process.argv.find(a=>a.startsWith('--limit='))?.split('=')[1]||Infinity);let ordinal=0;
if(!Number.isSafeInteger(offset)||offset<0||!(limit===Infinity||Number.isSafeInteger(limit)&&limit>0))throw Error('invalid batch');
for(const entry of prep.entries){
 if(entry.status!=='RESEARCH_ONLY_SEQUENCE_COMPLETE')continue;
 const prefix=prefixes.get(entry.prefix);
 for(const id of entry.groups){
  const ix=ordinal++;if(ix<offset||ix>=offset+limit)continue;
  const j=jobs.get(id),r=j?.selectedRecipes[0],p=profiles.get(j?.origin);
  const out={id,origin:j?.origin,body:j?.body,prefix:entry.prefix,difficulty:entry.difficulty,order:r?.order,scope:'CONDITIONAL_LIFECYCLE_REPLAY',actualGameCertified:false,finalAdmission:false,materialBudgetVerified:false,commendationStatsIncluded:false,rankPolicy:RANK_POLICY.id,rankPolicyExactBuildVerified:false};
  let w=foundationWorld(),cursor=0,g=0,stageIndex=-1;const actions=[],milestones=[];
  function append(a){w=apply(w,a);actions.push(a)}
  function supply(items={},functions=[],funds=0,reason){const missing={};for(const [k,n] of Object.entries(items)){const m=Math.max(0,n-(w.items[k]||0));if(m)missing[k]=m}const funcs=functions.filter(k=>!w.baseFunctions.has(k)),money=Math.max(0,funds-w.funds);if(Object.keys(missing).length||funcs.length||money)append({type:'externalInputs',items:missing,functions:funcs,funds:money,reason,assumption:true})}
  function gate(s){const x=entry.stages[g++];if(!x||x.type!==s.type||x.transform!==(s.transform??null)||!equal(x.requires,[...new Set(s.requires||[])].sort())||x.to<cursor||x.to>prefix.actions.length)throw Error('research gate mismatch');while(cursor<x.to)append(prefix.actions[cursor++]);if(!x.requires.every(k=>active(w,k)))throw Error('research no longer active at gate');}
  try{
   if(!r||!p||!prefix)throw Error('missing queue/prefix/profile');
   for(const s of r.stages){stageIndex++;
    if(s.type==='birth'){gate(s);supply(p.acquisitionRequiredItems,p.requiresBaseFunc,p.cost||0,'recruit:'+p.id);
     if(p.sourceType==='event'){
      const row=data.originRows.find(r=>r.id===p.id&&r.kind==='SOURCE_SPAWN'), reasons=[];let selected=false;
      for(const alt of row?.prerequisites?.event?.alternatives||[]){
       const a={type:'recruit',profile:p.id,soldier:'origin',band:'min',script:alt.script,assumeOutcome:true};
       const ctx=auditOriginCampaignContext([...actions,a],data);if(ctx.kind!=='compatible'||!ctx.allowedDifficulties.includes(entry.difficulty)){reasons.push(alt.script+': context');continue;}
       const q=applyOriginWitnessStep(w,a,data);if(!q.ok){reasons.push(alt.script+': '+q.reason);continue;}
       append(a);selected=true;break;
      }
      if(!selected){
       // Add real research actions before birth, not arbitrary research flags.
       // Each alternative is a separate trial; failed branches never mutate the route.
       const planner=createContextResearchPlanner(data,{difficulty:entry.difficulty,maxAttempts:300,maxDepth:55,maxSteps:1900,methodLimit:45,collectFailures:true});
       const seed=planner.newNode();for(const a of actions.slice(1))planner.append(seed,a);
       for(const alt of row?.prerequisites?.event?.alternatives||[]){
        const a={type:'recruit',profile:p.id,soldier:'origin',band:'min',script:alt.script,assumeOutcome:true};
        const cond=alt.otherConditions||{};if(entry.difficulty<(cond.minDifficulty??0)||entry.difficulty>(cond.maxDifficulty??4))continue;
        const needs=(alt.positiveTriggers||[]).filter(t=>t.kind==='researchTriggers').map(t=>t.id),neg=(alt.negativeTriggers||[]).filter(t=>t.kind==='researchTriggers').map(t=>t.id);
        if(neg.some(k=>active(seed.world,k)))continue;
        const q=needs.every(k=>active(seed.world,k))?{ok:true,node:seed}:planner.ensure(needs,seed);
        if(!q.ok){reasons.push(alt.script+': research search incomplete '+(q.unresolved||''));continue;}
        const n=q.node;if(neg.some(k=>active(n.world,k)))continue;
        const tail=n.steps.slice(actions.length);let trial=w;
        try{for(const step of tail)trial=apply(trial,step);
         const month=Math.max(trial.month,alt.firstMonth||0);if(alt.lastMonth!=null&&month>alt.lastMonth)continue;
         if(month>trial.month){const step={type:'advanceMonth',month};trial=apply(trial,step);tail.push(step);}
         const missing={};for(const t of alt.positiveTriggers||[])if(t.kind==='itemTriggers'&&!(trial.items[t.id]>0))missing[t.id]=1;
         if(Object.keys(missing).length){const step={type:'externalInputs',items:missing,functions:[],funds:0,reason:'event birth trigger:'+alt.script,assumption:true};trial=apply(trial,step);tail.push(step);}
         const ctx=auditOriginCampaignContext([...actions,...tail,a],data);if(ctx.kind!=='compatible'||!ctx.allowedDifficulties.includes(entry.difficulty))continue;
         // Reject trials closing a gate that was active before birth and needed later.
         if(entry.stages.slice(g).some(x=>x.requires.some(k=>active(w,k)&&!active(trial,k))))continue;
         apply(trial,a);for(const step of tail)append(step);append(a);selected=true;break;
        }catch(e){reasons.push(alt.script+': '+e.message);}
       }
      }
      if(!selected)throw Error('event birth unresolved: '+reasons.join('; '));
     }else append({type:'recruit',profile:p.id,soldier:'origin',band:'min'});
     milestones.push({type:'recruit',at:actions.length,...snapshot(w)});}
    else if(s.type==='conditionalCapGrowth'){append({type:'conditionalCapGrowth',soldier:'origin',assumption:true});milestones.push({type:s.type,at:actions.length,...snapshot(w)});}
    else if(s.type==='conditionalPromotion'){append({type:s.type,soldier:'origin',rank:s.rank,assumption:true});milestones.push({type:s.type,at:actions.length,...snapshot(w)});}
    else if(s.type==='ensureAndTransform'){gate(s);const t=rules.get(s.transform);if(!t)throw Error('unknown transform');if(Object.keys(t.requiredCommendations||{}).length)throw Error('medal prerequisites need dedicated proof');supply(t.requiredItems,t.requiresBaseFunc,t.cost||0,'transform:'+t.id);append({type:'transform',soldier:'origin',transform:t.id});if(!member(w).state.exactStats)throw Error('random outcome not deterministic');milestones.push({type:'transform',id:t.id,at:actions.length,...snapshot(w)});}
    else throw Error('unsupported stage:'+s.type);
   }
   if(cursor!==prefix.actions.length||g!==entry.stages.length||w.pendingFree)throw Error('incomplete research prefix');
   const ctx=auditOriginCampaignContext(actions,data);if(ctx.kind!=='compatible'||!ctx.allowedDifficulties.includes(entry.difficulty))throw Error('campaign context conflict');
   const end=snapshot(w);
   if(end.body!==j.body||!equal(end.traits,j.traits)||end.rank!==r.expectedRank)throw Error('final identity mismatch');
   if(!equal(end.raw,r.expectedCapRaw)||!equal(end.effective,r.expectedCap))throw Error('expected vector mismatch: '+JSON.stringify({actual:end,expectedRaw:r.expectedCapRaw,expected:r.expectedCap}));
   // Independent replay, including explicit conditional growth actions.
   let verify=foundationWorld();for(const a of actions)verify=apply(verify,a);if(!equal(snapshot(verify),end)||verify.pendingFree)throw Error('independent replay mismatch');
   const assumedItems={},functions=new Set();let assumedFunds=0;
   for(const a of actions)if(a.type==='externalInputs'){for(const [k,n] of Object.entries(a.items||{}))assumedItems[k]=(assumedItems[k]||0)+n;for(const f of a.functions||[])functions.add(f);assumedFunds+=a.funds||0}
   Object.assign(out,{status:'CONDITIONAL_LIFECYCLE_COMPLETE',raw:end.raw,effective:end.effective,total:sum(end.effective),rank:end.rank,traits:end.traits,history:end.history,activeResearch:[...w.researched].filter(k=>active(w,k)).sort(),disabledResearch:[...w.disabled].sort(),assumedItems,assumedFunds,assumedBaseFunctions:[...functions].sort(),conditionalReplayVerified:true,soldierBirthReplayed:true,actions,milestones});
  }catch(e){Object.assign(out,{status:'LIFECYCLE_BLOCKED',stageIndex,reason:e.message,actions,milestones,conditionalReplayVerified:false,soldierBirthReplayed:w.soldiers.length>0});}
  results.push(out);
 }
}
const complete=results.filter(r=>r.status==='CONDITIONAL_LIFECYCLE_COMPLETE'), pareto=complete.filter(a=>!complete.some(b=>a!==b&&a.body===b.body&&a.origin===b.origin&&b.effective.every((v,i)=>v>=a.effective[i])&&b.effective.some((v,i)=>v>a.effective[i]))).map(r=>r.id);
const report={schema:'ATLAS_OVERCAP_CONDITIONAL_LIFECYCLE_V1',sourceMetadataSha256:prep.sourceMetadataSha256,sourceLedgerHash:prep.sourceLedgerHash,statKeys:keys,scope:'Chronological recruitment and deterministic transformation with conditional cap growth and external inputs. Not finite supply proof or actual game certification. No commendation stat bonuses.',summary:{attempted:results.length,complete:complete.length,blocked:results.length-complete.length,paretoWithinOrigin:pareto.length,byBody:Object.fromEntries([...new Set(results.map(r=>r.body))].map(b=>[b,{complete:complete.filter(r=>r.body===b).length,attempted:results.filter(r=>r.body===b).length}]))},paretoWithinOrigin:pareto,results};
const target=process.argv.find(a=>a.startsWith('--output='))?.slice(9)||(offset||limit!==Infinity?'public/data/soldier-overcap-conditional-lifecycle-'+offset+'.json':'public/data/soldier-overcap-conditional-lifecycle.json');
report.batch={offset,limit:limit===Infinity?null:limit,total:ordinal};
fs.writeFileSync(target,JSON.stringify(report)+'\n');
console.log(JSON.stringify({summary:report.summary,blocked:results.filter(r=>r.status!=='CONDITIONAL_LIFECYCLE_COMPLETE').map(r=>({origin:r.origin,order:r.order,reason:r.reason.slice(0,500)}))}));
