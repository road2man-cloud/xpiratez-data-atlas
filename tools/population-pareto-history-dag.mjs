// One-body irreversible-history relaxation: future action depth is unbounded.
// A finite DAG is indexed by newly acquired transformation IDs, not by depth.
// Repetitions at a node must reach a scalar post-fixed point. Every admitted
// upper vector must be covered by a concrete witness; otherwise fail open.
const ge=(a,b)=>a.every((v,i)=>v>=b[i]);
const vmax=(a,b)=>a.map((v,i)=>Math.max(v,b[i]));
export function coverHistoryDAG({rules,history,bonuses,rawStart,bonusVector,minimum,refs,transition,maxStates=512,maxRepeats=64,expired=()=>false}){
 const metrics={states:0,edges:0,repeats:0,merges:0,open:0,uncovered:0,exhausted:0};
 const fail=reason=>({covered:false,reason,metrics,proofs:[]});
 const fixedHistory=new Set(history),fixedBonuses=new Set(bonuses),newRules=rules.filter(r=>!fixedHistory.has(r.id));
 if(newRules.length>30||new Set(rules.map(r=>r.id)).size!==rules.length||rules.some(r=>r.reset||r.removeTransformations?.length))return fail("OUTSIDE_HISTORY_MODEL");
 const bits=new Map(newRules.map((r,i)=>[r.id,1<<i])),width=rawStart.length;
 const finite=v=>Array.isArray(v)&&v.length===width&&v.every(Number.isSafeInteger);
 if(!finite(rawStart)||!finite(minimum))return fail("INVALID_START");
 const has=(mask,id)=>fixedHistory.has(id)||!!(mask&(bits.get(id)||0));
 const allowed=(mask,r)=>!(r.requiredPreviousTransformations||[]).some(id=>!has(mask,id))&&!(r.forbiddenPreviousTransformations||[]).some(id=>has(mask,id));
 const layers=Array.from({length:newRules.length+1},()=>new Map());layers[0].set(0,rawStart);
 // A pre-owned history ID need not imply the corresponding bonus in a
 // recruitment profile. Its repeat may grant a missing bonus, so relax it
 // to an optional positive vector for every history state.
 const optionalOld=new Set(rules.filter(r=>fixedHistory.has(r.id)&&r.soldierBonusType&&!fixedBonuses.has(r.soldierBonusType)).map(r=>r.soldierBonusType));
 const proofs=new Map();let allocated=1;
 for(let depth=0;depth<layers.length;depth++)for(const [mask,start] of layers[depth]){
  if(expired()||metrics.states>=maxStates){metrics.exhausted++;return fail("BUDGET");}
  metrics.states++;let upper=start;
  const can=rules.filter(r=>allowed(mask,r)),repeat=can.filter(r=>has(mask,r.id));
  let stable=false;
  for(let turn=0;turn<maxRepeats;turn++){
   if(expired()){metrics.exhausted++;return fail("BUDGET");}
   let next=upper;
   for(const r of repeat){
    const v=transition(r,upper);metrics.repeats++;if(!finite(v)){metrics.open++;return fail("REPEAT_OPEN");}
    next=vmax(next,v);
   }
   if(ge(upper,next)){stable=true;break;}
   upper=next;
  }
  if(!stable){metrics.open++;return fail("REPEAT_NOT_FIXED");}
  const owned=new Set(fixedBonuses);
  for(const r of newRules)if(has(mask,r.id)&&r.soldierBonusType)owned.add(r.soldierBonusType);
  const bonus=Array(width).fill(0);
  for(const id of owned){const v=bonusVector(id);if(!finite(v))return fail("BONUS_UNKNOWN");for(let i=0;i<width;i++)bonus[i]+=v[i];}
  for(const id of optionalOld)if(!owned.has(id)){const v=bonusVector(id);if(!finite(v))return fail("BONUS_UNKNOWN");for(let i=0;i<width;i++)bonus[i]+=Math.max(0,v[i]);}
  const effective=upper.map((v,i)=>Math.max(minimum[i],v+bonus[i]));
  if(!finite(effective))return fail("OVERFLOW");
  const witness=refs.find(q=>ge(q.current,effective)&&ge(q.cap,effective));
  if(!witness){metrics.uncovered++;return fail("UNCOVERED_STATE");}
  const old=proofs.get(witness.id);proofs.set(witness.id,{witness,upper:old?vmax(old.upper,effective):effective});
  for(const r of can){
   if(has(mask,r.id))continue;
   const next=mask|bits.get(r.id),v=transition(r,upper);metrics.edges++;
   if(!finite(v)){metrics.open++;return fail("NEW_RULE_OPEN");}
   const layer=layers[depth+1],before=layer.get(next);
   if(before){layer.set(next,vmax(before,v));metrics.merges++;}
   else{if(++allocated>maxStates){metrics.exhausted++;return fail("STATE_BUDGET");}layer.set(next,v);}
  }
 }
 return {covered:true,metrics,proofs:[...proofs.values()]};
}
