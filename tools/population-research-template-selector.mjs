// Fast necessary-condition filter and heuristic ordering of research
// templates. Never used as an impossibility proof for a research goal.
const own=(o,k)=>Number(o?.[k]||0);
const arr=v=>Array.isArray(v)?v:[];
export function templateContext(w){
 return {month:Number(w.month||0),research:[...w.researched].sort(),disabled:[...w.disabled].sort(),functions:[...w.baseFunctions].sort(),items:Object.fromEntries(Object.entries(w.items||{}).filter(([,v])=>v>0).sort(([a],[b])=>a.localeCompare(b))),difficulty:w.difficulty??null};
}
export function preflightTemplate(w,suffix,data){
 if(!Array.isArray(suffix)||!suffix.length)return "EMPTY";
 // The verifier never allows the month to decrease, so a later absolute
 // month below the current one cannot be repaired by any intervening step.
 let month=Number(w.month||0);
 for(const a of suffix)if(a.type==="advanceMonth"){
  if(!Number.isInteger(a.month)||a.month<month)return "MONTH_REGRESSION";
  month=a.month;
 }
 let pending=w.pendingFree,first=null;const items={...w.items},functions=new Set(w.baseFunctions);
 // Only inspect conditions before the first research action. Later research
 // changes and automatic queues can alter the gates; do not guess them.
 for(const a of suffix){
  if(pending&&a.type!=="freeResearch")return "PENDING_FREE";
  if(a.type==="externalInputs"){
   for(const [k,v] of Object.entries(a.items||{}))items[k]=own(items,k)+v;
   for(const f of a.functions||[])functions.add(f);
  }else if(a.type!=="advanceMonth"){first=a;break;}
 }
 if(!first)return null;
 const a=first,rs=w.researched,ds=w.disabled;
 if(a.type==="freeResearch"){
  if(!pending||pending.source!==a.source)return "FREE_SOURCE";
  const choices=pending.choices.filter(k=>!rs.has(k)&&!ds.has(k));
  if(!choices.includes(a.research)||pending.sequential&&choices[0]!==a.research)return "FREE_CHOICE";
 }else if(a.type==="research"||a.type==="repeatResearch"){
  const r=data.researchRules?.[a.id];if(!r||ds.has(a.id))return "RESEARCH_DISABLED";
  if(a.type==="repeatResearch"&&!rs.has(a.id))return "REPEAT_SOURCE_MISSING";
  if(a.type==="research"&&rs.has(a.id))return "RESEARCH_ALREADY_DONE";
  if(r.needItem&&own(items,r.neededItem||a.id)<1)return "ITEM_MISSING";
  if(arr(r.requiresBaseFunc).some(k=>!functions.has(k)))return "FUNCTION_MISSING";
  if(a.type==="repeatResearch"){
   const candidates=[...arr(r.getOneFree)];
   for(const [guard,v] of Object.entries(r.getOneFreeProtected||{}))if(rs.has(guard))candidates.push(...arr(v));
   if(!candidates.some(k=>!rs.has(k)&&!ds.has(k)))return "FREE_POOL_EMPTY";
  }
 }else if((a.type==="eventResearch"||a.type==="missionResearch")&&ds.has(a.research))return "RESEARCH_DISABLED";
 return null;
}
export function rankTemplates(entries,w,data,metrics){
 const cur=templateContext(w),active=new Set(cur.research),disabled=new Set(cur.disabled),functions=new Set(cur.functions),ranked=[];
 for(const entry of entries){
  const reason=preflightTemplate(w,entry.suffix,data);
  if(reason){metrics.templatePreflightRejects++;metrics["preflight_"+reason]=(metrics["preflight_"+reason]||0)+1;continue;}
  const c=entry.context;let score=(entry.successes||0)*2-(entry.failures||0);
  if(c){
   // Similarity is just an ordering heuristic, never a rejection rule.
   const miss=(xs,set)=>xs.reduce((n,x)=>n+Number(!set.has(x)),0);
   score-=3*miss(c.research,active)+2*miss(c.disabled,disabled)+2*miss(c.functions,functions)+Math.abs(c.month-cur.month)*2;
   score-=Object.entries(c.items).reduce((n,[k,v])=>n+Number(own(cur.items,k)<v),0);
   if(c.difficulty!==cur.difficulty)score-=5;
  }
  ranked.push({entry,score});
 }
 return ranked.sort((a,b)=>b.score-a.score||a.entry.suffix.length-b.entry.suffix.length).map(x=>x.entry);
}
