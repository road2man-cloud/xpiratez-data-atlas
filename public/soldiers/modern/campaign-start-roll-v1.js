// Conditional endpoint scenarios for source-indexed transformation ranges.
// No changes to the general transformation engine or native certification.
const rangePairs=[['flatMin','flatMax'],['percentMin','percentMax'],['percentGainedMin','percentGainedMax']];
export function hasConditionalRoll(rule){
 return rangePairs.some(([lo,hi])=>[...new Set([...Object.keys(rule[lo]||{}),...Object.keys(rule[hi]||{})])].some(k=>(rule[lo]?.[k]??0)!==(rule[hi]?.[k]??0)))||Object.values(rule.rerollStats||{}).some(Boolean);
}
export function resolveConditionalRoll(rule,band){
 if(!['min','max'].includes(band)||!hasConditionalRoll(rule))throw Error('conditional-roll-not-applicable');
 if(Object.values(rule.rerollStats||{}).some(Boolean))throw Error('conditional-reroll-unsupported');
 const resolved={...rule},selected={};
 for(const [lo,hi] of rangePairs){
  const out={};
  for(const k of new Set([...Object.keys(rule[lo]||{}),...Object.keys(rule[hi]||{})])){
   const a=rule[lo]?.[k]??0,b=rule[hi]?.[k]??0;
   if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a>b)throw Error('invalid-conditional-roll-range:'+rule.id+'/'+k);
   out[k]=band==='min'?a:b;
  }
  resolved[lo]={...out};resolved[hi]={...out};selected[lo]=out;
 }
 return {resolved,selected};
}
