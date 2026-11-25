// Full-horizon continuation proposals. No transformation-count gate.
// A proposal is not evidence: chronological research/growth/action replay
// and independent registration are required. Legacy chainProposal remains unchanged.
import {key} from "./population-research-career-core.mjs";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
export const HORIZON_POLICY="FULL_HORIZON_LIVE_DETERMINISTIC_V1";
export function horizonProposal(data,parentId,parent,ruleId){
 if(!parent||parent.rankDefault||!Array.isArray(parent.order))return null;
 const rule=data.transformations.find(r=>r.id===ruleId),body=rule?.producedSoldierType||parent.body;
 const dest=data.soldiers.find(b=>b.id===body);
 if(!rule||!dest||!rule.allowsLiveSoldiers||rule.createsClone||rule.producedItem||
    !rule.allowedSoldierTypes?.includes(parent.body)||rule.forbiddenSoldierTypes?.includes(parent.body)||
    rule.requires.includes("STR_UNAVAILABLE")||!deterministicRule(rule,[dest]))return null;
 const actions=[...parent.order.map(id=>({kind:"TRANSFORM",id})),{kind:"TRANSFORM",id:rule.id},{kind:"CAP_TARGET"}];
 return {id:"HORIZON:"+key([HORIZON_POLICY,parentId,parent.fullActionHash,rule.id]).slice(0,24),body,actions,permanentVector:parent.permanentVector,sourceKind:"BIRTH_RESEARCH_CHAIN",rule};
}
