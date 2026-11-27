// Build an evidence-linked production queue without admitting conditional rows.
export function buildOvercapResearchQueue(data,local,conversion,archive,{maxDonors=4,sourceBlobs={}}={}){
 const metadata=data.meta.source.metadataSha256;
 if(local.sourceMetadataSha256!==metadata||conversion.sourceMetadataSha256!==metadata)throw Error("source metadata mismatch");
 if(archive.schema!=="CONDITIONAL_RESEARCH_SET_MATCH_V1")throw Error("archive schema mismatch");
 const rules=new Map(data.transformations.map(r=>[r.id,r])),profiles=new Map(data.profiles.map(p=>[p.id,p]));
 const sum=v=>v.reduce((s,n)=>s+n,0),sortIds=v=>[...new Set(v)].sort();
 // Identity intentionally excludes order/rank: player requested one group per origin,
 // final body, research goal set and retained trait set. Keep multiple exact recipes.
 const groupKey=r=>JSON.stringify([r.origin,r.body,sortIds(r.researchGoals),r.traits.slice().sort((a,b)=>String(a[0]).localeCompare(String(b[0])))]);
 const groups=new Map();
 for(const [source,rows] of [["local",local.rows],["conversion",conversion.rows]])for(const [index,r] of rows.entries()){
  const key=groupKey(r),g=groups.get(key)||{key,origin:r.origin,body:r.body,goals:sortIds(r.researchGoals),traits:r.traits,recipes:[]};
  g.recipes.push({source,index,row:r});groups.set(key,g);
 }
 const catalog=new Map(),branches=new Set(),byRule=new Map();
 // A donor is an observed ORDERED gate sequence on one source route. No
 // claim that research-only projection is sufficient to reconstruct a campaign.
 for(const [routeId,r] of Object.entries(archive.routes)){
  const set=archive.sets[r.set];if(!set||!Array.isArray(r.orderedGates))continue;
  const gates=r.orderedGates.filter(x=>typeof x.transform==="string"&&Number.isSafeInteger(x.index)&&Number.isSafeInteger(x.prefix));
  if(!gates.length)continue;
  const seq=gates.map(x=>x.transform),donor={routeId,branch:set.branch,history:r.originalHistory,seq,gates,set:r.set,historyIds:set.historyIds||[]};
  catalog.set(routeId,donor);branches.add(set.branch);
  for(const id of new Set(seq)){if(!byRule.has(id))byRule.set(id,[]);byRule.get(id).push(donor);}
 }
 // Longest prefix of the candidate order that appears as a subsequence.
 // Matching prefix uses only one donor, never combines unrelated branches.
 function match(seq,donor){
  let i=0;const found=[];
  for(const g of donor.gates)if(g.transform===seq[i]){found.push({transform:g.transform,index:g.index,prefix:g.prefix});i++;if(i===seq.length)break;}
  return {matched:i,gates:found};
 }
 const scoreRow=(a,b)=>sum(b.row.cap)-sum(a.row.cap)||sum(b.row.capRaw)-sum(a.row.capRaw)||a.row.steps.length-b.row.steps.length||a.index-b.index;
 const memo=new Map();
 function donorsFor(seq){
  const k=JSON.stringify(seq);if(memo.has(k))return memo.get(k);
  const bestByBranch=new Map();
  const options=byRule.get(seq[0])||[];
  for(const d of options){const m=match(seq,d);if(!m.matched)continue;
   const cover=seq.filter(id=>d.seq.includes(id)).length;
   const hit={branch:d.branch,routeId:d.routeId,history:d.history,matchedPrefix:m.matched,total:seq.length,setCoverage:cover,gateWitnesses:m.gates,sourceSet:d.set,donorLength:d.seq.length,sharedHistoryCount:d.historyIds.length};
   const old=bestByBranch.get(d.branch);
   const cmp=(x,y)=>y.matchedPrefix-x.matchedPrefix||y.setCoverage-x.setCoverage||x.donorLength-y.donorLength||String(x.routeId).localeCompare(String(y.routeId));
   if(!old||cmp(hit,old)<0)bestByBranch.set(d.branch,hit);
  }
  const ds=[...bestByBranch.values()].sort((x,y)=>y.matchedPrefix-x.matchedPrefix||y.setCoverage-x.setCoverage||x.donorLength-y.donorLength||String(x.routeId).localeCompare(String(y.routeId))).slice(0,maxDonors);
  memo.set(k,ds);return ds;
 }
 const jobs=[],invalid=[];
 for(const g of groups.values()){
  const p=profiles.get(g.origin);if(!p){invalid.push({key:g.key,reason:"unknown origin"});continue;}
  const ranked=[];
  for(const recipe of g.recipes){
   const seq=recipe.row.steps.filter(a=>a.type==="transform").map(a=>a.transform);
   if(!seq.length||seq.some(id=>!rules.has(id)))continue;
   const donors=donorsFor(seq),best=donors[0];
   ranked.push({...recipe,seq,donors,matched:best?.matchedPrefix||0,total:seq.length});
  }
  if(!ranked.length){invalid.push({key:g.key,reason:"no indexed recipe"});continue;}
  ranked.sort((a,b)=>Number(b.matched===b.total)-Number(a.matched===a.total)||b.matched/b.total-a.matched/a.total||scoreRow(a,b));
  const best=ranked[0],bestStats=ranked.slice().sort(scoreRow)[0];
  // Keep highest-cap recipe even if the best donor supports another timing/order.
  const picks=[best,...(best!==bestStats?[bestStats]:[])];
  const recipes=picks.map(x=>{
   const stages=[{type:"birth",profile:g.origin,requires:sortIds(p.requires||[]),rank:p.rank??0}];
   for(const a of x.row.steps){
    if(a.type==="transform"){
     const r=rules.get(a.transform);stages.push({type:"ensureAndTransform",transform:r.id,requires:sortIds(r.requires||[]),requiredPreviousTransformations:r.requiredPreviousTransformations||[],forbiddenPreviousTransformations:r.forbiddenPreviousTransformations||[],requiresBaseFunc:r.requiresBaseFunc||[],requiredItems:r.requiredItems||{},minRank:r.minRank||0});
    }else stages.push({...a});
   }
   if(x.source==="local"&&x.row.finalGrowthAssumption)stages.push({type:"conditionalCapGrowth",soldier:"origin",assumption:true});
   return {source:x.source,index:x.index,order:x.seq,stages,donors:x.donors,expectedCapRaw:x.row.capRaw,expectedCap:x.row.cap,expectedRank:x.row.rank,scope:"LOCAL_EXPECTATION_NOT_REPLAY_PROOF"};
  });
  const status=best.matched===best.total?"ORDERED_DONOR":best.matched>0?"PARTIAL_ORDERED_DONOR":"NO_ORDERED_DONOR";
  jobs.push({id:g.key,origin:g.origin,body:g.body,goals:g.goals,traits:g.traits,status,recipeCount:g.recipes.length,selectedRecipes:recipes,canonicalReplayVerified:false,actualGameCertified:false});
 }
 jobs.sort((a,b)=>({ORDERED_DONOR:0,PARTIAL_ORDERED_DONOR:1,NO_ORDERED_DONOR:2}[a.status]-({ORDERED_DONOR:0,PARTIAL_ORDERED_DONOR:1,NO_ORDERED_DONOR:2}[b.status]))||sum(b.selectedRecipes[0].expectedCap)-sum(a.selectedRecipes[0].expectedCap)||a.id.localeCompare(b.id));
 const byBody={};for(const j of jobs){const b=byBody[j.body]||{groups:0,ordered:0,partial:0,unmatched:0};b.groups++;b[j.status==="ORDERED_DONOR"?"ordered":j.status==="PARTIAL_ORDERED_DONOR"?"partial":"unmatched"]++;byBody[j.body]=b;}
 return {schema:"ATLAS_OVERCAP_RESEARCH_REPLAY_QUEUE_V1",sourceMetadataSha256:metadata,sourceLedgerHash:archive.sourceLedgerHash,sourceBlobs,scope:"Observed donor gate sequences and conditional local recipes; full chronological replay and final admission outstanding.",summary:{groups:jobs.length,ordered:jobs.filter(x=>x.status==="ORDERED_DONOR").length,partial:jobs.filter(x=>x.status==="PARTIAL_ORDERED_DONOR").length,unmatched:jobs.filter(x=>x.status==="NO_ORDERED_DONOR").length,recipes:jobs.reduce((s,j)=>s+j.selectedRecipes.length,0),donorRoutes:catalog.size,donorBranches:branches.size,invalid:invalid.length,byBody},invalid,jobs};
}
