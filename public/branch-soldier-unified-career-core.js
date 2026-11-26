// One table, distinct evidence classes. A complete row supersedes only its
// own exact source reference, never a different route or a legacy projection.
export const rowStatus=r=>r.complete?"complete":r.birthOnly?"birth":r.missing?"missing":"conditional";
const order={complete:0,conditional:1,birth:2,missing:3};
export function unifyCareerRows(complete,exploration,legacy=[]){
 const byKey=new Map();
 for(const r of [...exploration,...legacy,...complete]){
  if(!r.key)throw Error("Missing career row key");
  const old=byKey.get(r.key);
  if(old&&old.hash&&r.hash&&old.hash!==r.hash)throw Error("Career source identity conflict: "+r.key);
  byKey.set(r.key,r);
 }
 return [...byKey.values()];
}
export function unifiedStatusRows(rows,status){
 return status==="all"?rows:rows.filter(r=>rowStatus(r)===status);
}
// Group independently by evidence status: conditional scores cannot replace
// the representative of a complete line. Preserve original ordered witnesses.
export function groupUnifiedRows(sorted,group){
 const seen=new Set();
 return sorted.slice().sort((a,b)=>order[rowStatus(a)]-order[rowStatus(b)]).filter(r=>{
  if(group==="routes")return true;
  const id=group==="body"?(r.body||r.origin):r.origin;
  const k=JSON.stringify([rowStatus(r),id,r.body==="STR_SOLDIER_CHORT"]);
  if(seen.has(k))return false;seen.add(k);return true;
 });
}
