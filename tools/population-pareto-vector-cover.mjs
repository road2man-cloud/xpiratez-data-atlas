// Cover a finite product of mutually exclusive relaxed bonus choices by
// a union of admitted Pareto witness orthants. A split is a proof only if
// every child is covered. An exhausted budget is UNKNOWN, never closure.
const ge=(a,b)=>a.every((v,i)=>v>=b[i]);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const zeros=n=>Array(n).fill(0);
export function reduceChoices(choices){
 const out=[];for(const v of choices){
  if(out.some(q=>ge(q,v)))continue;
  for(let j=out.length-1;j>=0;j--)if(ge(v,out[j]))out.splice(j,1);
  out.push(v);
 }return out;
}
export function coverBonusProduct({base,groups,refs,ceiling,minimum,maxVisits=256,expired=()=>false}){
 const width=base.length,metrics={visits:0,splits:0,covered:0,uncovered:0,exhausted:0};
 const valid=v=>v.length===width&&v.every(Number.isSafeInteger);
 if(!valid(base)||!valid(ceiling)||!valid(minimum)||groups.some(g=>!g.length||g.some(v=>!valid(v))))return {covered:false,metrics};
 // Each optional vector is nonnegative, so omitting all bonuses in a
 // clique is covered by any member of that clique. Retained fixed bonuses
 // may be negative and are already included in the base.
 if(groups.some(g=>g.some(v=>v.some(x=>x<0))))return {covered:false,metrics};
 const normalized=groups.map(reduceChoices),constant=normalized.filter(g=>g.length===1).reduce((s,g)=>add(s,g[0]),zeros(width));
 const split=normalized.filter(g=>g.length>1).sort((a,b)=>b.length-a.length||b.reduce((s,v)=>s+v.reduce((t,x)=>t+x,0),0)-a.reduce((s,v)=>s+v.reduce((t,x)=>t+x,0),0));
 const suffix=Array(split.length+1);suffix[split.length]=zeros(width);
 for(let i=split.length-1;i>=0;i--)suffix[i]=add(suffix[i+1],Array.from({length:width},(_,j)=>Math.max(...split[i].map(v=>v[j]))));
 const proofs=[];
 function visit(i,selected){
  if(++metrics.visits>maxVisits||expired()){metrics.exhausted++;return false;}
  const upper=add(selected,suffix[i]).map((v,j)=>Math.max(minimum[j],Math.min(ceiling[j],v)));
  if(!valid(upper)){metrics.exhausted++;return false;}
  const witness=refs.find(p=>ge(p.current,upper)&&ge(p.cap,upper));
  if(witness){proofs.push({witness,upper});metrics.covered++;return true;}
  if(i===split.length){metrics.uncovered++;return false;}
  metrics.splits++;
  // Check difficult alternatives first, to fail fast on an open corner.
  const alternatives=split[i].map(v=>({v,score:Math.max(...v)})).sort((a,b)=>b.score-a.score);
  for(const {v} of alternatives)if(!visit(i+1,add(selected,v)))return false;
  return true;
 }
 const covered=visit(0,add(base,constant));
 return {covered,metrics,proofs:covered?proofs:[]};
}
