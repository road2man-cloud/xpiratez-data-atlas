// Produce an independent fixed-difficulty career, never mutate a prior route.
// Only actual replayed prefixes and terminal research outcomes are admitted.
import {key} from "./population-research-career-core.mjs";
import {auditOriginCampaignContext} from "../public/soldiers/modern/origin-campaign-context.js";

export function runDifficultyForks({data,graphs,profiles,branches,terminal,terminalRule,replay,register,insert,enqueue,stepsFor,commit,context,workPriority,deadline,limit=2,difficulty=1}){
 const stats={difficulty,eligible:0,attempts:0,births:0,prefixes:0,reusedActions:0,ready:0,advanced:0,failures:{},outcomes:[]};
 const candidates=[],seen=new Set(),readyBranches=new Set(Object.values(terminal.records).filter(r=>r.status==="CONDITIONAL_TARGET_RESEARCH_READY").map(r=>r.branch));
 // Newest actual context conflicts first. Birth itself must allow the new
 // difficulty; a birth whose own history excludes it is never rewritten.
 for(const r of Object.values(terminal.records).reverse()){
  const g=graphs[r.graph],b=g&&branches.get(g.branch),p=g&&profiles.get(g.origin),t=terminalRule.targets.find(t=>t.id===r.target);
  if(!g||!b||!p||!t||readyBranches.has(g.branch)||!g.allowedDifficulties.includes(difficulty)||g.birthActions[0]?.type==="campaignContext"||p.soldierType==="STR_SOLDIER_CHORT")continue;
  if(!JSON.stringify(r.failures||[]).includes("CAMPAIGN_CONTEXT_CONFLICT"))continue;
  const k=key([r.graph,r.target,difficulty]);if(seen.has(k))continue;seen.add(k);
  const actions=[{type:"campaignContext",difficulty,assumption:true},...g.birthActions];
  const id=key([g.origin,g.branch,actions]);
  if(graphs[id]&&terminal.anchors[key([id,t.id])])continue;
  candidates.push({r,g,b,p,t,actions,id});
 }
 stats.eligible=candidates.length;
 const used=new Set();
 for(const x of candidates){
  if(stats.attempts>=limit||performance.now()>=deadline())break;
  if(used.has(x.g.branch))continue;used.add(x.g.branch);
  stats.attempts++;
  const {r,g,b,p,t,actions,id}=x;
  try{
   const birthContext=auditOriginCampaignContext(actions,data);if(birthContext.kind!=="compatible"||!birthContext.allowedDifficulties.includes(difficulty))throw Error("DIFFICULTY_BIRTH_CONTEXT");
   let root=graphs[id];
   if(!root){
    const world=replay.replay(actions),prefix={id:key([b.id,actions.slice(0,g.birthAt+1)]),source:{kind:"difficultyFork",id:r.graph,origin:g.origin,difficulty}};
    const gid=register(p,b,prefix,{world,steps:actions,birthMonth:g.birthMonth},g.birthAt+1,"DIFFICULTY_FORK");
    if(gid!==id)throw Error("DIFFICULTY_GRAPH_ID");root=graphs[id];stats.births++;
   }
   let i=0;
   // Recover the longest contiguous pre-conflict prefix from the old
   // chronological record. No skipped or reordered conflicting event.
   if(root.nodes.length===1){
    const suffix=stepsFor(g,r.to??r.node),audit=auditOriginCampaignContext([...actions,...suffix],data);
    const first=audit.conflicts.find(c=>c.at>=actions.length);
    const available=first?suffix.slice(0,first.at-actions.length):suffix;
    let world=replay.replay(actions),safeWorld=world,safe=0;
    for(let j=0;j<available.length&&performance.now()<deadline();j++){
     try{world=replay.apply(world,available[j]);if(!world.pendingFree&&commit(b).every(k=>replay.active(world,k))){safeWorld=world;safe=j+1;}}catch{break;}
    }
    if(safe&&context(b.id,{allowedDifficulties:[difficulty]},[...actions,...available.slice(0,safe)],safeWorld).length){
     const edge=insert(id,root,safeWorld,0,"DIFFICULTY_PREFIX:"+t.id,available.slice(0,safe),true);i=edge.to;enqueue(id,i);stats.prefixes++;stats.reusedActions+=safe;
    }
   }else i=root.nodes.length-1;
   const k=key([id,t.id]),n=root.nodes[i];
   if(!workPriority.eligible({g:root,n,i}))continue;
   const beforeReady=terminal.stats.ready+terminal.stats.alreadyReady,beforeAdvanced=terminal.stats.advanced;
   if(performance.now()<deadline())workPriority.run({g:root,n,i},"difficultyFork",()=>terminal.run({id,g:root,b,t,k,i,n,attempt:0,partial:false,sameBatch:false}));
   stats.ready+=terminal.stats.ready+terminal.stats.alreadyReady-beforeReady;stats.advanced+=terminal.stats.advanced-beforeAdvanced;
   stats.outcomes.push({branch:b.id,origin:g.origin,graph:id,target:t.id,status:terminal.anchors[k]?.status||"ROOT_ONLY"});
  }catch(e){const reason=String(e.message);stats.failures[reason]=(stats.failures[reason]||0)+1;}
 }
 return stats;
}
