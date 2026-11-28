// Narrow opt-in manufactured-origin policy. Validate the complete raw recipe
// and spawn template against the pinned profile before allowing a career.
export const HYBRID_RECIPES=['STR_HYBRID_LONER_RECRUITMENT','STR_HYBRID_HIVER_RECRUITMENT'];
export function configureHybridRecipes(data,manufacture,files){
 const assets=data.campaignAssets;
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const moon=assets.deterministicManufacture.STR_MOONSHINE_XXX;
 if(!moon||moon.cost!==0||moon.time!==200||moon.space!==0||moon.requires.length||!eq(moon.functions,['ALKO'])||!eq(moon.materials,{})||!eq(moon.outputs,{STR_MOONSHINE:5}))throw Error('moonshine-repeat-source-mismatch');
 const specs=[
  {id:HYBRID_RECIPES[0],materials:{STR_MOONSHINE:8},cost:10000,time:200,outputs:{STR_HIDEOUT_CLEANING_BILL:1},armor:'STR_HYBRID_THONG_UC',trait:'STR_SOCIALLY_AWKWARD_TRAIT'},
  {id:HYBRID_RECIPES[1],materials:{STR_SECTOWEED:50},cost:15000,time:400,outputs:{STR_RETICULAN_CORPSE:1},armor:'STR_HYBRID_NUDE_UC',trait:'STR_HIVER_TRAIT'}
 ];
 const origins={};
 for(const s of specs){
  const r=assets.deterministicManufacture[s.id],raw=manufacture[s.id],p=data.profiles.find(x=>x.id==='manufacture:'+s.id);
  if(!r||!raw||!p||p.sourceType!=='manufacture'||p.sourceId!==s.id||p.soldierType!=='STR_SOLDIER_HYBRID'||p.spawnedPersons!==1||p.rank!==0||
    !eq(r.materials,s.materials)||!eq(r.outputs,s.outputs)||r.cost!==s.cost||r.time!==s.time||r.space!==0||!eq(r.requires,['STR_HYBRID_PATH'])||r.functions.length||
    !eq(raw.spawnedSoldier,{armor:s.armor,transformationBonuses:{[s.trait]:1}})||raw.spawnedPersonType!=='STR_SOLDIER_HYBRID'||raw.refund!==true||
    p.armor!==s.armor||!eq(p.traitCounts,{[s.trait]:1})||p.time!==s.time||p.cost!==s.cost||!eq(p.acquisitionRequiredItems,s.materials)||!eq(p.requires,r.requires)||!eq(p.requiresBaseFunc,r.functions)||
    !eq(r.recruitment,{profile:p.id,soldierType:p.soldierType,refundOnCancellation:true}))throw Error('hybrid-recruitment-template-mismatch:'+s.id);
  origins[p.id]={recipe:s.id,soldierType:p.soldierType,trait:s.trait,transferHours:24,sourceSha256:files['Piratez.rul']};
 }
 assets.manufacturedCareerOrigins=origins;
 assets.repeatManufactureLimits={STR_MOONSHINE_XXX:2};
}
