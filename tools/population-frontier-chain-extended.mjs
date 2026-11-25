// Bounded six-stage extension. Old proposal identities remain unchanged.
// State aliasing is evidence reuse only: failed searches are never aliases.
import {key} from "./population-research-career-core.mjs";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
const indexes=new WeakMap();
function index(data){
 let x=indexes.get(data);if(x)return x;
 x={rules:new Map(data.transformations.map(r=>[r.id,r])),bodies:new Map(data.soldiers.map(b=>[b.id,b])),eligible:new Map()};indexes.set(data,x);return x;
}
export const MAX_CHAIN_DEPTH=6;
export function extendedChainProposal(data,parentId,parent,ruleId){
 if(!parent||parent.rankDefault||!["BIRTH_RESEARCH_PROPOSAL","BIRTH_RESEARCH_CHAIN"].includes(parent.sourceKind))return null;
 if(parent.order.length<1||parent.order.length>=MAX_CHAIN_DEPTH)return null;
 const x=index(data),rule=x.rules.get(ruleId),body=rule?.producedSoldierType||parent.body,ck=parent.body+"|"+ruleId;
 if(!x.eligible.has(ck)){
  const dest=x.bodies.get(body);
  x.eligible.set(ck,Boolean(rule&&dest&&rule.allowsLiveSoldiers&&!rule.createsClone&&!rule.producedItem&&rule.allowedSoldierTypes?.includes(parent.body)&&!rule.requires.includes("STR_UNAVAILABLE")&&deterministicRule(rule,[dest])));
 }
 if(!x.eligible.get(ck))return null;
 const actions=[...parent.order.map(id=>({kind:"TRANSFORM",id})),{kind:"TRANSFORM",id:rule.id},{kind:"CAP_TARGET"}];
 return {id:"BIRTHCHAIN:"+key([parentId,parent.fullActionHash,rule.id]).slice(0,24),body,actions,permanentVector:parent.permanentVector,sourceKind:"BIRTH_RESEARCH_CHAIN",rule};
}
// Same input, exact full world, branch/group, action budget, depth and
// difficulty intersection. Do not collapse just matching stat vectors.
export function successorKey(parent,ruleId){
 return key([parent.input,parent.branch,parent.sourceGroup,parent.canonicalStateHash,parent.order.length,parent.actions.length,[...parent.allowedDifficulties].sort(),ruleId]);
}
export function successfulSuccessors(routes,attempts){
 const m=new Map();
 for(const [id,t] of Object.entries(attempts)){
  if(t.status!=="CONDITIONAL_CHAIN_REPLAY"||!routes[t.route]||!routes[t.parent])continue;
  const p=routes[t.parent],r=routes[t.route];
  if(r.chainParent!==t.parent||r.chainRule!==t.rule)continue;
  const k=successorKey(p,t.rule);
  if(!m.has(k))m.set(k,{attempt:id,parent:t.parent,route:t.route});
 }
 return m;
}
