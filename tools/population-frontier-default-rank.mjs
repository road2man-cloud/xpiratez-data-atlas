// Separate evidence-backed conditional rank policy. Never mutate the base index.
// Upstream OXCE Soldier::getRankString / promoteRank: empty custom names
// fall back to classic ranks; nonempty custom lists and allowPromotion gates remain.
export const RANK_POLICY={id:"OXCE_DEFAULT_RANK_CONDITIONAL_V1",source:"https://github.com/MeridianOXC/OpenXcom/blob/oxce-plus/src/Savegame/Soldier.cpp",ruleSource:"https://github.com/MeridianOXC/OpenXcom/blob/oxce-plus/src/Mod/RuleSoldier.cpp",requiredVersion:"8.7",exactBuildVerified:false,rankIds:["STR_ROOKIE","STR_SQUADDIE","STR_SERGEANT","STR_CAPTAIN","STR_COLONEL","STR_COMMANDER"]};
export function defaultRankData(data){
 const indexed=[];
 const soldiers=data.soldiers.map(b=>{
  if(b.allowPromotion!==true||!b.raw||b.raw.refNode||b.raw.rankStrings!=null&&!Array.isArray(b.raw.rankStrings)||b.raw.rankStrings?.length)return b;
  indexed.push(b.id);return {...b,raw:{...b.raw,rankStrings:[...RANK_POLICY.rankIds]}};
 });
 return {data:{...data,soldiers},indexed:indexed.sort()};
}
