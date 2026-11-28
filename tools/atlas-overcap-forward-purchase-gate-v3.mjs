// OXCE PurchaseState.cpp:189-221 and RuleItem.cpp:324-328.
// The original item rule has TWO research requirement lists. Never
// substitute requiresBuy for requires, and never infer omitted full fields.
import assert from "node:assert/strict";
const arr=x=>Array.isArray(x)?x:[];
export function compilePurchaseGate(id,s){
 if(!s?.exists||!Number.isFinite(s.buyCost)||s.buyCost<=0)return {id,status:"NOT_PURCHASABLE_OR_SOURCE_MISSING"};
 if(!["generalRequires","buyRequires","buyRequirements","buyRequiresBaseFunc"].every(k=>Array.isArray(s[k]))||!Object.hasOwn(s,"buyRequiresCountry"))return {id,status:"INCOMPLETE_FULL_PURCHASE_FIELDS"};
 const generalRequires=s.generalRequires,buyRequires=s.buyRequires,extraRequirements=s.buyRequirements;
 if([...generalRequires,...buyRequires,...extraRequirements,...s.buyRequiresBaseFunc].some(k=>typeof k!=="string"))return {id,status:"UNMODELED_PURCHASE_FIELD"};
 const research=[...new Set([...generalRequires,...buyRequires,...extraRequirements])].sort();
 return {id,status:s.buyRequiresCountry?"COUNTRY_GATE_UNRESOLVED":"SOURCE_COMPLETE_CONDITIONAL",cost:s.buyCost,generalRequires,buyRequires,extraRequirements,research,functions:s.buyRequiresBaseFunc,country:s.buyRequiresCountry};
}
export function purchaseGateVerdict(w,id,s){
 const gate=compilePurchaseGate(id,s);
 if(gate.status!=="SOURCE_COMPLETE_CONDITIONAL")return {...gate,ok:false};
 const have=w.researched instanceof Set?w.researched:new Set(arr(w.researched));
 const disabled=w.disabled instanceof Set?w.disabled:new Set(arr(w.disabled));
 const functions=w.baseFunctions instanceof Set?w.baseFunctions:new Set(arr(w.baseFunctions));
 const missingResearch=gate.research.filter(k=>!have.has(k)||disabled.has(k));
 const missingFunctions=gate.functions.filter(k=>!functions.has(k));
 return {...gate,missingResearch,missingFunctions,ok:!missingResearch.length&&!missingFunctions.length};
}
export function assertForwardPurchaseGate(w,action,data){
 if(action.type!=="sourceBuySample")return;
 const v=purchaseGateVerdict(w,action.id,data.itemSupply[action.id]);
 assert(v.ok,"Full purchase gate not established: "+action.id+" "+JSON.stringify(v));
 return v;
}
