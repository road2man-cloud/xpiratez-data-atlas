// Distinct continuation identity for the inherited conditional default-rank policy.
import {key} from "./population-research-career-core.mjs";
import {horizonProposal} from "./population-full-horizon-proposals.mjs";
import {RANK_POLICY} from "./population-frontier-default-rank.mjs";
export const RANK_HORIZON="DEFAULT_RANK_FULL_HORIZON_V1";
export function rankHorizonProposal(data,id,parent,ruleId){
 if(parent?.rankDefault?.policy!==RANK_POLICY.id||parent.rankDefault.exactBuildVerified!==false)return null;
 const f=horizonProposal(data,id,{...parent,rankDefault:undefined},ruleId);
 if(!f)return null;
 return {...f,id:"RANKHORIZON:"+key([RANK_HORIZON,id,parent.fullActionHash,ruleId]).slice(0,24)};
}
