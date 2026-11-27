// Reconstruct a successor's full chronological witness without duplicating
// the parent actions in every published source record.
export function expandOvercapSuccessor(parent,row){
 if(!parent||parent.id!==row.sourceRecordId||parent.origin!==row.origin||parent.body!==row.body||parent.difficulty!==row.difficulty||parent.status!=='CONDITIONAL_LIFECYCLE_COMPLETE'||parent.conditionalReplayVerified!==true||parent.soldierBirthReplayed!==true||row.status!=='PRODUCTIVE_CONDITIONAL_SUCCESSOR'||row.conditionalReplayVerified!==true||row.finalAdmission!==false||row.actualGameCertified!==false||row.materialBudgetVerified!==false||row.commendationStatsIncluded!==false||!Array.isArray(row.suffix)||!row.suffix.length)throw Error('successor source mismatch: '+row.id);
 const actions=[...parent.actions,...row.suffix],assumedItems={},functions=new Set();let assumedFunds=0;
 for(const a of actions)if(a.type==='externalInputs'){
  for(const [k,n] of Object.entries(a.items||{})){
   if(!Number.isSafeInteger(n)||n<0)throw Error('invalid input quantity '+k);
   if(n)assumedItems[k]=(assumedItems[k]||0)+n;
  }
  for(const k of a.functions||[])functions.add(k);
  if(!Number.isSafeInteger(a.funds||0)||(a.funds||0)<0)throw Error('invalid funds');
  assumedFunds+=a.funds||0;
 }
 if(JSON.stringify(actions.filter(a=>a.type==='transform'&&a.soldier==='origin').map(a=>a.transform))!==JSON.stringify(row.order))throw Error('successor transformation order mismatch '+row.id);
 return {...row,sourceKind:'successor',parentRecordId:parent.id,actions,assumedItems,assumedFunds,assumedBaseFunctions:[...functions].sort(),milestones:[...(parent.milestones||[]),{type:'successorEndpoint',at:actions.length,body:row.body,rank:row.rank,raw:row.raw,effective:row.effective,traits:row.traits}],status:'CONDITIONAL_LIFECYCLE_COMPLETE',soldierBirthReplayed:true};
}
