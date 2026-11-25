import {statKeys,filterRows,sum} from './branch-soldier-atlas-career-core.js?v=29';
const validList=v=>Array.isArray(v)&&v.every(x=>typeof x==='string');
export function unpackOptions(raw,metadata){
 if(raw.schema!=='ATLAS_BRANCH_OPTIONS_V1'||raw.sourceMetadataSha256!==metadata)throw Error('분기 자료 버전 불일치');
 const map=new Map();
 for(const [id,rank,c,choice,historyCount,g,sourceRootConflict] of raw.rows){
  const captain=raw.captains[c],choices=raw.choices[choice],group=raw.blocked[g];
  if(typeof id!=='string'||!Number.isInteger(rank)||!validList(captain)||!choices||!validList(group?.[0])||!validList(group?.[1])||map.has(id))throw Error('분기 옵션 데이터 오류');
  map.set(id,{id,rank,captain,choices,historyCount,blockedResearch:group[0],blockedRoots:group[1],sourceRootConflict});
 }
 return map;
}
export const choiceKeys=['path','cause','queen','codex'];
export function sameChoices(a,b){return !!(a&&b)&&choiceKeys.every(k=>(a.choices[k]??null)===(b.choices[k]??null));}
const unique=xs=>new Set(xs.filter(x=>typeof x==='string'&&x));
export function diffSets(a,b){
 return {common:[...a].filter(x=>b.has(x)),onlyA:[...a].filter(x=>!b.has(x)),onlyB:[...b].filter(x=>!a.has(x))};
}
function observed(rows){
 return {origin:unique(rows.map(r=>r.origin)),body:unique(rows.map(r=>r.body)),training:unique(rows.flatMap(r=>r.order)),trait:unique(rows.flatMap(r=>r.traits||[])),measured:rows.filter(r=>r.traits!==null).length};
}
function score(r,metric,stat){
 const i=statKeys.indexOf(stat);return i<0?sum(r[metric]):r[metric][i];
}
function better(a,b,metric,stat){
 if(!b)return true;
 return score(a,metric,stat)>score(b,metric,stat)||(score(a,metric,stat)===score(b,metric,stat)&&(sum(a[metric])>sum(b[metric])||(sum(a[metric])===sum(b[metric])&&a.key.localeCompare(b.key)<0)));
}
function bestGroups(rows,metric,stat,difficulty){
 const out=new Map();
 for(const r of rows){
  for(const d of new Set(r.difficulties)){
   if(difficulty!==''&&difficulty!=null&&Number(difficulty)!==d)continue;
   const key=JSON.stringify([r.origin,r.body,d]);if(better(r,out.get(key),metric,stat))out.set(key,r);
  }
 }
 return out;
}
export function compareBranches(rows,a,b,filters={}){
 if(!a||!b||a===b)throw Error('서로 다른 분기 두 개를 선택하세요');
 const {metric='cap',stat='total',difficulty=''}=filters;
 // A/B selection replaces only branch and captain; remaining filters apply equally.
 const base={...filters,branch:'',captain:''};
 const scoped=filterRows(rows,base),left=scoped.filter(r=>r.branch===a),right=scoped.filter(r=>r.branch===b);
 const l=observed(left),r=observed(right);
 const ga=bestGroups(left,metric,stat,difficulty),gb=bestGroups(right,metric,stat,difficulty);
 const matched=[];
 for(const [key,x] of ga){const y=gb.get(key);if(!y)continue;const [origin,body,d]=JSON.parse(key);const av=score(x,metric,stat),bv=score(y,metric,stat);matched.push({origin,body,difficulty:d,a:x,b:y,av,bv,delta:av-bv});}
 matched.sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta)||Math.max(y.av,y.bv)-Math.max(x.av,x.bv)||x.origin.localeCompare(y.origin)||x.difficulty-y.difficulty);
 return {left,right,measuredA:l.measured,measuredB:r.measured,sets:Object.fromEntries(['origin','body','training','trait'].map(k=>[k,diffSets(l[k],r[k])])),matched,groupOnlyA:[...ga.keys()].filter(k=>!gb.has(k)).length,groupOnlyB:[...gb.keys()].filter(k=>!ga.has(k)).length};
}
