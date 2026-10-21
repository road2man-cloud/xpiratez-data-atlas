// Ordered, ruleset-driven soldier type changes used by both the generator and
// the live final-build view. A dead-only transformation can be an initial
// theoretical conversion, but cannot be silently chained with living training:
// that would require an unmodeled death/revival transition.
export function enumerateConversionRoutes(origin,transformations){
  const original=new Set(Object.entries(origin.previousTransformations||{})
    .filter(([,value])=>Boolean(value)).map(([id])=>id));
  const routes=[];
  function walk(soldierType,prior,sequence){
    for(const t of transformations||[]){
      if(!t.producedSoldierType||t.createsClone||prior.has(t.id)||sequence.includes(t.id))continue;
      if(sequence.length&&t.allowsLiveSoldiers===false)continue;
      if(t.allowedSoldierTypes?.length&&!t.allowedSoldierTypes.includes(soldierType))continue;
      if((t.forbiddenSoldierTypes||[]).includes(soldierType))continue;
      if((t.requiredPreviousTransformations||[]).some(id=>!prior.has(id)))continue;
      if((t.forbiddenPreviousTransformations||[]).some(id=>prior.has(id)))continue;
      const nextPrior=new Set(prior);
      for(const id of t.removeTransformations||[])nextPrior.delete(id);
      nextPrior.add(t.id);
      const transformationIds=[...sequence,t.id];
      routes.push({
        transformationIds,finalSoldierType:t.producedSoldierType,
        previousTransformations:Object.fromEntries([...nextPrior].map(id=>[id,1])),
        requiresDeadSoldier:t.allowsLiveSoldiers===false
      });
      // Do not assume a corpse-revival operation restores a healthy unit.
      if(t.allowsLiveSoldiers!==false)walk(t.producedSoldierType,nextPrior,transformationIds);
    }
  }
  walk(origin.soldierType,original,[]);
  return routes;
}
