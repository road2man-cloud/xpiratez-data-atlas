// Exact skyline of the currently registered candidates, not of the whole game.
// Comparisons are within one source model, exact origin (if supplied), body,
// and known stat coverage. A dominator must retain EVERY referenced parent
// branch of the dominated witness. Equal objective points are not deleted.
// Resource requirements are separate dimensions, never exchange rates.
const finite=Number.isFinite;
const desc=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]>b[i]?-1:1;}return 0;};
function denseDominance(a,b){
 let strict=false;
 for(let i=0;i<a.length;i++){if(a[i]<b[i])return -1;strict||=a[i]>b[i];}
 return strict?1:0;
}
function mapLeq(a,b,presence=false){
 let strict=false;
 for(const [id,n] of Object.entries(a)){
  if(presence&&!Object.hasOwn(b,id))return -1;
  if(n>(b[id]??0))return -1;
  strict||=n<(b[id]??0);
 }
 for(const [id,n] of Object.entries(b))if(!Object.hasOwn(a,id)&&(presence||n>0))strict=true;
 return strict?1:0;
}
function setLeq(a,b){
 for(const id of a)if(!b.has(id))return -1;
 return a.size<b.size?1:0;
}
function sparseDominance(a,b){
 const checks=[mapLeq(a.items,b.items),mapLeq(a.medals,b.medals,true),
  setLeq(a.facilities,b.facilities),setLeq(a.research,b.research)];
 return checks.some(n=>n<0)?-1:checks.some(n=>n>0)?1:0;
}
function supportSuperset(a,b){
 if(a.supportCount<b.supportCount)return false;
 for(let i=0;i<b.support.length;i++)if((a.support[i]&b.support[i])!==b.support[i])return false;
 return true;
}
// Only used as a topological ordering of equal dense vectors. It is NOT
// a resource score: dominance still checks every quantity and ID separately.
function sparseSize(s){
 return Object.values(s.items).reduce((n,v)=>n+v,0)+
  Object.values(s.medals).reduce((n,v)=>n+v+1,0)+s.facilities.size+s.research.size;
}
const ruleModel=w=>w.source==="GATE12"&&["ORIGINAL_DAG_D5","D5_DIRECT_FEE_BUDGET_CHECKPOINT"].includes(w.sourceKind)
 ?"D5_SAME_BODY":w.source==="GATE12"?(w.sourceKind||"GATE12"):"";
export function registeredResourcePareto({ids,witnesses,resourceFor,supportFor,statIndices=null,resourceMode="fees"}){
 if(!["fees","requirements"].includes(resourceMode))throw Error("Unknown Pareto resource mode");
 const full=resourceMode==="requirements",groups=new Map(),unranked=[],retained=[],removed=[];
 const branchOrd=new Map(),supports=new Map();
 const unique=[...new Set(ids)];
 for(const id of unique){
  const refs=[...new Set(supportFor(id)||[])];supports.set(id,refs);
  for(const b of refs)if(!branchOrd.has(b))branchOrd.set(b,branchOrd.size);
 }
 const blocks=Math.ceil(branchOrd.size/31); // bit 30 max; bitwise signed safe
 const reasons={missingStats:0,missingResources:0,missingBranchSupport:0};
 for(const id of unique){
  const w=witnesses[id],r=resourceFor(id);
  const dims=statIndices??w.vector.map((v,i)=>finite(v)?i:-1).filter(i=>i>=0);
  let why=null;
  if(!dims.length||dims.some(i=>!finite(w.vector[i])))why="missingStats";
  else if(!r.complete.cash||!finite(r.grossFees)||full&&
   (!["actions","recovery","transfer","items","medals","facilities","research","rank"].every(k=>r.complete[k])||
    ![r.actions,r.recoveryDays,r.transferHours].every(finite)))why="missingResources";
  else if(!supports.get(id).length)why="missingBranchSupport";
  if(why){reasons[why]++;unranked.push(id);continue;}
  const support=new Int32Array(blocks);
  for(const b of supports.get(id)){const i=branchOrd.get(b);support[Math.floor(i/31)]|=1<<(i%31);}
  const dense=[...dims.map(i=>w.vector[i]),-r.grossFees];
  const sparse=full?{items:r.items,medals:r.medals,facilities:new Set(r.facilities),
   research:new Set([...r.research,...(w.research||[])])}:null;
  if(full)dense.push(-r.actions,-r.recoveryDays,-r.transferHours);
  // Do not substitute a different rank-reset or body-change chronology
  // under the expanded requirements mode. Rank acquisition is not a cost.
  const key=JSON.stringify([w.source,ruleModel(w),w.body,w.originProfile??null,w.mode??null,dims,full?r.rankRequirements:null]);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({id,dense,sparse,size:sparse?sparseSize(sparse):0,support,supportCount:supports.get(id).length});
 }
 let comparisons=0;
 const byGroup=[];
 for(const [group,entries] of groups){
  // Any strict dominator precedes a dominated entry in this ordering.
  // The superset-support condition is transitive, so previously removed
  // entries can never be needed as dominators of a later entry.
  entries.sort((a,b)=>desc(a.dense,b.dense)||a.size-b.size||b.supportCount-a.supportCount||a.id.localeCompare(b.id));
  const front=[];
  for(const b of entries){
   let dominator=null;
   for(const a of front){
    comparisons++;
    if(a.supportCount<b.supportCount)continue;
    const d=denseDominance(a.dense,b.dense);
    if(d<0)continue;
    if(!full&&d===0)continue;
    const s=full?sparseDominance(a.sparse,b.sparse):0;
    if(s<0||d===0&&s===0||!supportSuperset(a,b))continue;
    dominator=a;break;
   }
   if(dominator)removed.push({id:b.id,dominator:dominator.id});
   else{front.push(b);retained.push(b.id);}
  }
  byGroup.push({group,input:entries.length,retained:front.length});
 }
 const keep=new Set([...retained,...unranked]);
 return {ids:unique.filter(id=>keep.has(id)),frontier:retained,unranked,removed,
  reasons,comparisons,byGroup,input:unique.length,resourceMode,
  scope:"REGISTERED_CANDIDATES_SAME_MODEL_ORIGIN_BRANCH_SUPERSET"};
}
