// This quotient is valid only for the fixed-research model whose transform
// adapter automatically supplies the exact missing funds. It is NOT valid for
// the real campaign, a finite-budget model or any research/resource action.
import {createRepeatQuotient} from "./final-career-repeat-quotient.mjs";
export const POLICY="CONDITIONAL_FUNDS_PRESENCE_V1";
export function createConditionalResourceQuotient(data){
 const repeat=createRepeatQuotient(data);
 const costs=data.transformations.map(r=>r.cost??0);
 const enabled=costs.every(n=>Number.isSafeInteger(n)&&n<=1000000000&&n>=-1000000000);
 function project(w){
  if(!enabled||!Number.isSafeInteger(w.funds)||w.funds<0)return repeat.project(w);
  const copy=structuredClone(w);copy.funds=0;
  return repeat.project(copy);
 }
 return {project,proof:{...repeat.proof,funds:{policy:POLICY,enabled,minCost:Math.min(...costs),maxCost:Math.max(...costs),scope:"Automatic exact missing-funds injection, indexed fixed-research live transformations and cap growth only; no actual resource availability certificate.",preserved:"Concrete replay witnesses retain funds and externalInputs actions; this is a separate model projection."}}};
}
