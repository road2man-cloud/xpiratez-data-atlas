// A new conditional research/transform extension of an already recorded
// chronological state. The parent's full action hash is part of its identity.
import {key} from "./population-research-career-core.mjs";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
export function chainProposal(data,parentId,parent,ruleId){
 if(!parent||parent.rankDefault||!["BIRTH_RESEARCH_PROPOSAL","BIRTH_RESEARCH_CHAIN"].includes(parent.sourceKind))return null;
 if(parent.order.length<1||parent.order.length>=4)return null;
 const rule=data.transformations.find(r=>r.id===ruleId),body=rule?.producedSoldierType||parent.body;
 const dest=data.soldiers.find(b=>b.id===body);
 if(!rule||!dest||!rule.allowsLiveSoldiers||rule.createsClone||rule.producedItem||!rule.allowedSoldierTypes?.includes(parent.body)||rule.requires.includes("STR_UNAVAILABLE")||!deterministicRule(rule,[dest]))return null;
 const actions=[...parent.order.map(id=>({kind:"TRANSFORM",id})),{kind:"TRANSFORM",id:rule.id},{kind:"CAP_TARGET"}];
 return {id:"BIRTHCHAIN:"+key([parentId,parent.fullActionHash,rule.id]).slice(0,24),body,actions,permanentVector:parent.permanentVector,sourceKind:"BIRTH_RESEARCH_CHAIN",rule};
}
