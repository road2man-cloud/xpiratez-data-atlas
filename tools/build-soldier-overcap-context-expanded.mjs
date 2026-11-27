import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {foundationWorld,applyOriginWitnessStep} from '../public/soldiers/modern/origin-witness.js';
import {auditOriginCampaignContext} from '../public/soldiers/modern/origin-campaign-context.js';
import {createContextResearchPlanner} from '../public/soldiers/modern/foundation-research-planner-context-v2.js';
const read=p=>JSON.parse(fs.existsSync(p)?fs.readFileSync(p,'utf8'):execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show','HEAD:'+p],{encoding:'utf8',maxBuffer:64*1024*1024}));
const data=JSON.parse(gunzipSync(fs.readFileSync('public/data/soldiers-modern-index.json.gz')));
data.sourceItemIds=new Set(read('public/data/soldier-source-catalog.json').itemIds);
const queue=read('public/data/soldier-overcap-research-queue.json'),base=read('public/data/soldier-overcap-context-recovery.json');
const target='public/data/soldier-overcap-context-expanded.json';
const out=fs.existsSync(target)?read(target):structuredClone(base);
if(queue.sourceMetadataSha256!==data.meta.source.metadataSha256||out.sourceMetadataSha256!==queue.sourceMetadataSha256||out.sourceLedgerHash!==queue.sourceLedgerHash)throw Error('source mismatch');
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.split('=')[1]??d;
const limit=Number(arg('calls',36)), maxAttempts=Number(arg('attempts',450)), lane=Number(arg('difficulty',2)), wanted=arg('body','');
if(!Number.isInteger(limit)||limit<0||!Number.isInteger(lane)||lane<0||lane>4)throw Error('invalid limits');
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k),key=JSON.stringify;
const planner=createContextResearchPlanner(data,{difficulty:lane,maxAttempts,maxDepth:55,maxSteps:1900,methodLimit:45,collectFailures:true});
const metrics={calls:0,attempts:0,memoHits:0,complete:0,reusedWithoutSearch:0,failures:[]};
const memo=new Map(),pool=new Map();
function load(actions){const n=planner.newNode();if(actions[0]?.type!=='campaignContext'||actions[0].difficulty!==lane)throw Error('lane mismatch');for(const a of actions.slice(1))planner.append(n,a);return n}
function cache(n){pool.set(key(n.steps),n);return n}
function ensure(n,goals){if(goals.every(k=>active(n.world,k)))return {ok:true,node:n};const k=key([n.steps,goals]);if(memo.has(k)){metrics.memoHits++;return memo.get(k)}if(metrics.calls>=limit)return null;if(!n.trace){n=cache(load(n.steps));}const q=planner.ensure(goals,n);metrics.calls++;metrics.attempts+=q.attempts||0;memo.set(k,q);if(q.ok)cache(q.node);return q}
function retain(n){const k=key(n.steps),found=out.prefixes.find(p=>key(p.actions)===k);if(found)return found.id;let w=foundationWorld();for(const a of n.steps){const q=applyOriginWitnessStep(w,a,data);if(!q.ok)throw Error(q.reason);w=q.world}const ctx=auditOriginCampaignContext(n.steps,data);if(ctx.kind!=='compatible'||!ctx.allowedDifficulties.includes(lane)||w.pendingFree||w.soldiers.length)throw Error('bad prefix');const id='prefix-'+String(out.prefixes.length+1).padStart(4,'0');if(out.prefixes.some(p=>p.id===id))throw Error('id collision');out.prefixes.push({id,actions:n.steps,activeResearch:[...w.researched].filter(k=>active(w,k)).sort(),disabledResearch:[...w.disabled].sort(),month:w.month,allowedDifficulties:ctx.allowedDifficulties,researchOnlyReplayVerified:true});return id}
// In reuse-only mode use the independently replayed stored prefix directly.
for(const p of out.prefixes){if(p.actions[0]?.difficulty!==lane||!p.researchOnlyReplayVerified)continue;pool.set(key(p.actions),{steps:p.actions,world:{researched:new Set(p.activeResearch),disabled:new Set(p.disabledResearch)}})}
const root=cache(planner.newNode());
const done=new Set(out.entries.filter(e=>e.status==='RESEARCH_ONLY_SEQUENCE_COMPLETE').flatMap(e=>e.groups));
const order=['STR_SOLDIER_PEASANT','STR_SOLDIER_DAMSEL','STR_SOLDIER_SLAVE','STR_SOLDIER_PUREBLOOD','STR_SOLDIER_HERO','STR_SOLDIER_X','STR_SOLDIER_R','STR_SOLDIER_CHORT'];
const targets=queue.jobs.filter(j=>!done.has(j.id)&&(!wanted||j.body===wanted)).map(j=>({j,stages:j.selectedRecipes[0].stages.filter(s=>s.type==='birth'||s.type==='ensureAndTransform').map(s=>({type:s.type,transform:s.transform??null,requires:[...new Set(s.requires||[])].sort()}))}));
targets.sort((a,b)=>order.indexOf(a.j.body)-order.indexOf(b.j.body)||a.stages.length-b.stages.length||a.j.origin.localeCompare(b.j.origin)||a.j.id.localeCompare(b.j.id));
for(const {j,stages} of targets){
 const goals=[...new Set(stages.flatMap(s=>s.requires))];
 const all=[...pool.values()].filter(n=>goals.every(k=>active(n.world,k))).sort((a,b)=>a.steps.length-b.steps.length);
 let best=null,failure=null;
 if(all.length){best={node:all[0],stages:stages.map((s,i)=>({...s,from:i?all[0].steps.length:1,to:all[0].steps.length,activeGoals:s.requires}))};metrics.reusedWithoutSearch++}
 else if(metrics.calls<limit){
 const score=n=>goals.reduce((v,k)=>v+(active(n.world,k)?100:n.world.disabled.has(k)?-500:0),0)+stages[0].requires.reduce((v,k)=>v+(active(n.world,k)?150:0),0);
 const starts=[...pool.values()].filter(n=>!goals.some(k=>n.world.disabled.has(k))).sort((a,b)=>score(b)-score(a)||a.steps.length-b.steps.length).slice(0,3);
 if(!starts.includes(root))starts.push(root);
 for(const start of starts){let n=start,rows=[];for(const s of stages){const from=rows.length?n.steps.length:1,q=ensure(n,s.requires);if(!q?.ok){failure={stage:rows.length,requires:s.requires,reason:q?.reason||'BUDGET_DEFERRED',unresolved:q?.unresolved,deadEnds:q?.deadEnds?.slice(-2)};break}n=q.node;if(!s.requires.every(k=>active(n.world,k)))throw Error('inactive goal');rows.push({...s,from,to:n.steps.length,activeGoals:s.requires})}
 if(rows.length===stages.length){best={node:n,stages:rows};break}if(metrics.calls>=limit)break}
 }
 if(best){const p=retain(best.node);out.entries.push({recipeKey:key(stages),body:j.body,groups:[j.id],origins:[j.origin],status:'RESEARCH_ONLY_SEQUENCE_COMPLETE',difficulty:lane,stages:best.stages,totalStages:stages.length,failed:null,prefix:p,steps:best.node.steps.length,psiInitiationActive:active(best.node.world,'STR_PSI_INITIATION'),researchOnlyReplayVerified:true,soldierBirthReplayed:false,materialBudgetVerified:false,finalAdmission:false});done.add(j.id);metrics.complete++}
 else if(failure)metrics.failures.push({id:j.id,body:j.body,origin:j.origin,...failure});
}
out.schema='ATLAS_OVERCAP_CONTEXT_EXPANDED_V1';out.scope='Research-only chronological paths; no final admission. Prior successful groups are retained unchanged.';
out.expansionRuns=[...(out.expansionRuns||[]),{difficulty:lane,body:wanted||null,limit,maxAttempts,...metrics}];
const entries=out.entries.filter(e=>e.status==='RESEARCH_ONLY_SEQUENCE_COMPLETE'),byBody={};for(const j of queue.jobs){const b=byBody[j.body]||{total:0,complete:0};b.total++;if(done.has(j.id))b.complete++;byBody[j.body]=b}
out.summary={totalGroups:queue.jobs.length,completeGroups:done.size,remaining:queue.jobs.length-done.size,completeEntries:entries.length,uniquePrefixes:out.prefixes.length,uniqueActions:out.prefixes.reduce((s,p)=>s+p.actions.length,0),byBody};
fs.writeFileSync(target,JSON.stringify(out)+'\n');
console.log(JSON.stringify({summary:out.summary,run:{...metrics,failures:metrics.failures.map(x=>({origin:x.origin,body:x.body,stage:x.stage,reason:x.reason}))}}));
