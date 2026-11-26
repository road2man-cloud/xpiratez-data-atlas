// Work allocation only; never a reachability filter or an upper-bound proof.
// Ordinary bodies get balanced opportunities. The late special body has a
// small shared discretionary quota across the expensive career schedulers.
const CHORT="STR_SOLDIER_CHORT";
export function createCareerWorkPriority({specialShare=0,mode="ordinary",graphs={},historicalRecords={}}={}){
 if(!["ordinary","chort","all"].includes(mode))throw Error("Invalid career class");
 if(!Number.isFinite(specialShare)||specialShare<0||specialShare>1)throw Error("Invalid special work share");
 const metrics={policy:"INDEPENDENT_CHORT_AND_ORDINARY_V2",mode,specialBody:CHORT,specialShare,attempts:0,specialAttempts:0,elapsedMs:0,specialMs:0,byBody:{},byOrigin:{},byKind:{}};
 const local=new Map(),historical=new Map();
 const node=x=>x.n||x.g?.nodes[x.i??x.node??0];
 const body=x=>node(x)?.body||"UNKNOWN";
 const special=x=>body(x)===CHORT||x.r?.producedSoldierType===CHORT;
 const allocationBody=x=>special(x)?CHORT:body(x);
 const scope=x=>JSON.stringify([special(x)?"shared:"+CHORT:x.g?.origin||"",allocationBody(x)]);
 for(const r of Object.values(historicalRecords)){
  const g=graphs[r.graph],n=g?.nodes[r.node];if(!n)continue;
  const k=scope({g,n,r:{producedSoldierType:r.action==="STR_CHORT_SUMMONING"?CHORT:null}});historical.set(k,(historical.get(k)||0)+1);
 }
 function eligible(x){
  if(mode==="ordinary")return !special(x);
  if(mode==="chort")return special(x);
  if(!special(x))return true;
  return specialShare>0&&metrics.specialAttempts<Math.floor((metrics.attempts+1)*specialShare+1e-9)&&
    (!metrics.specialMs||metrics.specialMs/Math.max(1,metrics.elapsedMs)<=specialShare);
 }
 function compare(a,b){
  // This branch is reached only for candidates within their allocation.
  return Number(special(b))-Number(special(a))||
   (metrics.byBody[allocationBody(a)]||0)-(metrics.byBody[allocationBody(b)]||0)||
   (local.get(scope(a))||0)-(local.get(scope(b))||0)||
   (historical.get(scope(a))||0)-(historical.get(scope(b))||0);
 }
 function choose(xs,cmp=()=>0){
  let best;for(const x of xs)if(eligible(x)&&(!best||(compare(x,best)||cmp(x,best))<0))best=x;return best;
 }
 function run(x,kind,fn){
  if(!eligible(x))throw Error("CAREER_WORK_QUOTA");
  const b=allocationBody(x),o=x.g?.origin||"UNKNOWN",s=special(x),k=scope(x),t=performance.now();
  metrics.attempts++;metrics.specialAttempts+=Number(s);
  metrics.byBody[b]=(metrics.byBody[b]||0)+1;metrics.byOrigin[o]=(metrics.byOrigin[o]||0)+1;
  metrics.byKind[kind]=(metrics.byKind[kind]||0)+1;local.set(k,(local.get(k)||0)+1);
  try{return fn();}finally{const ms=performance.now()-t;metrics.elapsedMs+=ms;if(s)metrics.specialMs+=ms;}
 }
 return {eligible,compare,choose,run,metrics};
}
