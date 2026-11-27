// Select a compatible immutable producer; engine fingerprint checks remain authoritative.
export function selectFixedBodyProducer({schema,producer="auto",supplyMode="source",gameRoot,overcapQueue,overcapQueueBody,overcapSourceId}){
 const versions={
  COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V111_EXACT_LEAVES:111,
  COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V112_PASSIVE_ARMOR:112,
  COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V113_OVERCAP_PASSIVE_ARMOR:113,
  COVERAGE_FIRST_RECRUITMENT_AND_CAREER_V114_OVERCAP_CLOUD:114
 };
 const version=versions[schema];
 if(!Object.hasOwn(versions,schema))throw Error("Unsupported fixed-body ledger schema: "+schema);
 if(!["auto","v106","v108"].includes(producer))throw Error("Unknown producer: "+producer);
 if(!["source","preserve"].includes(supplyMode))throw Error("Unknown supply mode: "+supplyMode);
 if((overcapQueueBody||overcapSourceId)&&!overcapQueue)throw Error("Queue filter requires an overcap queue");
 if(gameRoot&&supplyMode==="preserve")throw Error("game-root is not used in preserve mode");
 const needsV108=version>=113||supplyMode==="preserve"||!!overcapQueue;
 const selected=producer==="auto"?(needsV108?"v108":"v106"):producer;
 if(selected==="v106"&&needsV108)throw Error("V106 cannot process this ledger or supply/queue mode; use V108");
 const file=selected==="v108"?"tools/build-population-shared-career-v108-overcap-cloud.mjs":"tools/build-population-shared-career-v106-passive-armor.mjs";
 const args=[];
 if(selected==="v108")args.push("--supply-mode="+supplyMode);
 if(gameRoot)args.push("--game-root="+gameRoot);
 if(overcapQueue)args.push("--overcap-queue="+overcapQueue);
 if(overcapQueueBody)args.push("--overcap-queue-body="+overcapQueueBody);
 if(overcapSourceId)args.push("--overcap-source-id="+overcapSourceId);
 return {producer:selected,file,args,sourceSchema:schema,supplyMode};
}
