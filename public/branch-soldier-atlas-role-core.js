import {statKeys} from './branch-soldier-atlas-career-core.js?v=29';
// Explicit player preferences, not inferred engine damage or combat formulas.
export const roles={
 shooter:{name:'사격수',axes:['firing','tu','reactions','stamina']},
 melee:{name:'격투가',axes:['melee','tu','strength','health']},
 psi:{name:'부두술사',axes:['psiSkill','psiStrength','mana','tu']},
 scout:{name:'정찰병',axes:['reactions','tu','stamina','health']},
 grenadier:{name:'투척병',axes:['throwing','strength','tu','stamina']},
 tank:{name:'생존 중심',axes:['health','stamina','bravery','tu']},
 carrier:{name:'중장비 운용',axes:['strength','tu','stamina','health']}
};
const index=new Map(statKeys.map((k,i)=>[k,i]));
export function roleAxes(role,primary){
 const axes=roles[role]?.axes||[];
 return axes.includes(primary)?[primary,...axes.filter(k=>k!==primary)]:axes.slice();
}
export function meetsMinima(row,metric,minima){
 return Object.entries(minima||{}).every(([k,v])=>!index.has(k)||v==null||row[metric][index.get(k)]>=v);
}
export function lexCompare(a,b,metric,axes){
 for(const k of axes){const i=index.get(k),delta=b[metric][i]-a[metric][i];if(delta)return delta;}
 // No hidden aggregate score; stable route IDs break exact objective ties.
 return a.key.localeCompare(b.key);
}
function dominates(a,b){
 let strict=false;
 for(let i=0;i<a.length;i++){if(a[i]<b[i])return false;if(a[i]>b[i])strict=true;}
 return strict;
}
// Each difficulty and final body is evaluated independently. All ties survive.
// Frontiers affect only the display; they are not proof of campaign-wide optimality.
export function roleFrontier(rows,metric,axes,difficulty=''){
 const ix=axes.map(k=>index.get(k)),groups=new Map(),kept=new Map();
 for(const row of rows){
  const ds=difficulty!==''?[Number(difficulty)]:[...new Set(row.difficulties)];
  if(!ds.length)continue; // unknown difficulty is never silently compared
  for(const d of ds){
   if(!row.difficulties.includes(d))continue;
   const groupKey=JSON.stringify([row.body,d]),v=ix.map(i=>row[metric][i]),key=JSON.stringify(v);
   if(!groups.has(groupKey))groups.set(groupKey,{difficulty:d,vectors:new Map()});
   const g=groups.get(groupKey).vectors;
   if(!g.has(key))g.set(key,{v,rows:[]});
   g.get(key).rows.push(row);
  }
 }
 for(const {difficulty:d,vectors} of groups.values()){
  const ordered=[...vectors.values()].sort((a,b)=>{for(let i=0;i<a.v.length;i++)if(a.v[i]!==b.v[i])return b.v[i]-a.v[i];return 0;});
  const frontier=[];
  for(const item of ordered){if(frontier.some(f=>dominates(f.v,item.v)))continue;frontier.push(item);}
  for(const item of frontier)for(const row of item.rows){
   if(!kept.has(row.key))kept.set(row.key,new Set());
   kept.get(row.key).add(d);
  }
 }
 return kept;
}
export function recommend(rows,{role,primary,metric='cap',minima={},pareto=false,representative=false,difficulty=''}={}){
 const axes=roleAxes(role,primary);
 if(!axes.length)return {rows:rows.slice(),eligible:rows.length,frontierCount:null,frontier:new Map(),axes,hidden:0};
 const eligible=rows.filter(r=>meetsMinima(r,metric,minima));
 const frontier=pareto?roleFrontier(eligible,metric,axes,difficulty):new Map();
 let sorted=eligible.filter(r=>!pareto||frontier.has(r.key)).sort((a,b)=>lexCompare(a,b,metric,axes));
 const frontierCount=pareto?sorted.length:null;
 let hidden=0;
 if(representative){
  const groups=new Set();
  sorted=sorted.filter(r=>{
   // Keep distinct branches and difficulty applicability, even for one birth/body.
   const key=JSON.stringify([r.origin,r.body,r.branch,pareto?[...frontier.get(r.key)].sort():[...r.difficulties].sort()]);
   if(groups.has(key)){hidden++;return false;}groups.add(key);return true;
  });
 }
 return {rows:sorted,eligible:eligible.length,frontierCount,frontier,axes,hidden};
}
