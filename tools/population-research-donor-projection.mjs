// Research-only donor projection: base functions persist after a soldier action.
// Preserve the original conditional facility grant at its chronological position,
// but do not transfer the donor soldier's consumables or funds to a new career.
const researchKinds=new Set(["research","repeatResearch","freeResearch","eventResearch","missionResearch","advanceMonth","campaignContext","externalInputs"]);
const soldierKinds=new Set(["recruit","transform","conditionalCapGrowth","conditionalPromotion","conditionalMedal"]);
export function projectResearchDonor(full){
 if(full.some(a=>!researchKinds.has(a.type)&&!soldierKinds.has(a.type)))return null;
 const out=[];
 for(let i=0;i<full.length;i++){
  const a=full[i];
  if(soldierKinds.has(a.type))continue;
  if(a.type==="externalInputs"&&soldierKinds.has(full[i+1]?.type)){
   if(a.assumption===true&&a.reason&&Array.isArray(a.functions)&&a.functions.length){
    out.push({type:"externalInputs",items:{},functions:[...a.functions],funds:0,reason:"Retained conditional base functions: "+a.reason,assumption:true});
   }
   continue;
  }
  out.push(a);
 }
 return out;
}
