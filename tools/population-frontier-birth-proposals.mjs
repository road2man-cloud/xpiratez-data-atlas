// Explicit proposals for fixed-research groups with no additional career
// frontier. Base cap is a reference, never an asserted target for a new surgery.
import {key} from "./population-research-career-core.mjs";
import {deterministicRule} from "./population-scalar-upper-bound.mjs";
export function baseBirthProposals(db,data,origin,gi){
 if(db.populationCareerFrontier.groups[gi]?.frontier?.length)return [];
 const group=db.populationAssumedBirthClosure.groups[gi],profile=data.profiles.find(p=>p.id===origin);
 if(!group||!profile)return [];
 const body=profile.soldierType,bodies=new Map(data.soldiers.map(b=>[b.id,b])),result=[];
 const cap={kind:"CAP_TARGET"};
 for(const f of group.frontier||[]){
  if(f.body!==body||f.actions.length!==1||f.actions[0]!=="CAP_TARGET"||!Array.isArray(f.vector))continue;
  const emit=(actions,dest,sourceKind)=>result.push({id:"BIRTHBASE:"+key([gi,group.proofHash,f.id,body,actions]).slice(0,24),body:dest,actions,permanentVector:f.vector,sourceKind,novelPermanent:false});
  emit([cap],body,"BASE_CAP_REPLAY");
  for(const r of data.transformations){
   const dest=r.producedSoldierType||body,b=bodies.get(dest);
   if(!b||!r.allowsLiveSoldiers||r.createsClone||r.producedItem||!r.allowedSoldierTypes?.includes(body)||r.requires.includes("STR_UNAVAILABLE")||!deterministicRule(r,[b]))continue;
   const promotions=Array.from({length:Math.max(0,r.minRank||0)},(_,i)=>({kind:"ASSUMED_PROMOTION",rank:i+1})),action={kind:"TRANSFORM",id:r.id,requiredMedals:r.requiredCommendations||{}};
   emit([cap,...promotions,action,cap],dest,"BIRTH_RESEARCH_PROPOSAL");
   emit([...promotions,action,cap],dest,"BIRTH_RESEARCH_PROPOSAL");
  }
 }
 return result;
}
