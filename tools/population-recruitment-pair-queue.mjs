// Scheduling only: a finite per-round window must not hide untried donors.
// No replay, admission, or reachability decisions are made here.
export function latestRecruitmentAttempt(previous,next){
 if(!previous)return next;
 if(previous.status==="CONDITIONAL_REPLAY")return previous;
 if(next.status==="CONDITIONAL_REPLAY")return next;
 return (next.variant??-1)>=(previous.variant??-1)?next:previous;
}
export function canRetryRecruitment(a){
 return a?.status!=="CONDITIONAL_REPLAY"&&((a?.variant??-1)<2||!!a?.stage);
}
export function runnableDonorWindow(donors,eligible,compare,limit){
 if(!Number.isSafeInteger(limit)||limit<1)throw Error("Invalid donor window");
 const runnable=[];
 for(const donor of donors){
  const possible=donor.possible.filter(p=>eligible(donor,p));
  if(possible.length)runnable.push({...donor,possible});
 }
 return {donors:runnable.sort(compare).slice(0,limit),exhausted:donors.length-runnable.length,
  deferred:Math.max(0,runnable.length-limit)};
}
export function bestRecruitmentJob(jobs,eligible,compare){
 let best;
 for(const job of jobs)if(eligible(job)&&(!best||compare(job,best)<0))best=job;
 return best;
}
