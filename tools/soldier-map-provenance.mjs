// Source-grounded map loot provenance for X-Piratez 2.1.
// It is deliberately NOT an item award generator: an actual mission must spawn,
// its MapScript must place the block, the item must survive, and the player must
// recover it. All of those have separate checks in OXCE.
const arr=x=>Array.isArray(x)?x:[];
const truth=n=>Number(n)>0;
function missionsFor(deployment,alienMissions,missionScripts){
  const missions=alienMissions.filter(m=>m?.type===deployment.type||
    arr(m?.waves).some(w=>w?.ufo===deployment.type));
  const sources=[];
  for(const mission of missions)for(const script of missionScripts){
    const weighted=Object.entries(script.missionWeights||{}).filter(([,table])=>
      truth(table?.[mission.type]));
    if(weighted.length)sources.push({
      mission:mission.type,script:script.type,
      executionOdds:script.executionOdds??100,
      firstMonth:script.firstMonth??0,lastMonth:script.lastMonth??null,
      researchPositive:Object.keys(script.researchTriggers||{}).filter(k=>
        script.researchTriggers[k]===true),
      researchNegative:Object.keys(script.researchTriggers||{}).filter(k=>
        script.researchTriggers[k]===false),
      itemPositive:Object.keys(script.itemTriggers||{}).filter(k=>
        script.itemTriggers[k]===true),
      itemNegative:Object.keys(script.itemTriggers||{}).filter(k=>
        script.itemTriggers[k]===false),
      monthWeights:weighted.map(([month,table])=>({
        month:Number(month),weight:Number(table[mission.type])
      })).sort((a,b)=>a.month-b.month)
    });
  }
  return sources;
}
function matchingBlocks(blocks,command){
  const size=Number(command.size);
  const group=Number(command.groups);
  return blocks.filter(block=>
    (!Number.isFinite(size)||!size||Number(block.width)===size*10&&Number(block.length)===size*10)&&
    (!Number.isFinite(group)||!group||Number(block.groups)===group));
}
function selectionEvidence(block,blocks,mapScript){
  const commands=arr(mapScript?.commands);
  const witnesses=[];
  for(const [step,command] of commands.entries()){
    if(command?.type!=="addBlock")continue;
    const matching=matchingBlocks(blocks,command);
    if(!matching.includes(block))continue;
    witnesses.push({
      step:step+1,type:command.type,groups:command.groups??null,
      size:command.size??null,executions:command.executions??1,
      candidateCount:matching.length,
      soleCandidate:matching.length===1&&Number(command.executions??1)>0
    });
  }
  return witnesses.sort((a,b)=>Number(b.soleCandidate)-Number(a.soleCandidate)||
    a.candidateCount-b.candidateCount).slice(0,4);
}
export function buildMapLootSources(effectiveMerged,interestingItemIds,options={}){
  const needed=new Set(interestingItemIds);
  const terrains=arr(effectiveMerged.terrains),
    mapScripts=new Map(arr(effectiveMerged.mapScripts).map(x=>[x.type,x])),
    deployments=arr(effectiveMerged.alienDeployments),
    alienMissions=arr(effectiveMerged.alienMissions),
    missionScripts=arr(effectiveMerged.missionScripts);
  const deploymentsByTerrain=new Map();
  for(const d of deployments)for(const name of arr(d.terrains)){
    const list=deploymentsByTerrain.get(name)||[];
    list.push(d);deploymentsByTerrain.set(name,list);
  }
  const result=new Map();
  const maxPerItem=Math.max(4,Number(options.maxPerItem)||10);
  const append=(id,entry)=>{
    if(!needed.has(id))return;
    const list=result.get(id)||[];
    list.push(entry);result.set(id,list);
  };
  for(const terrain of terrains){
    const blocks=arr(terrain.mapBlocks);
    if(!blocks.length)continue;
    const script=mapScripts.get(terrain.script);
    const ds=arr(deploymentsByTerrain.get(terrain.name));
    for(const block of blocks){
      const amounts=new Map();
      for(const [id,positions] of Object.entries(block.items||{}))
        if(needed.has(id))amounts.set(id,arr(positions).length||0);
      const random=new Map();
      for(const choice of arr(block.randomizedItems)){
        const pool=arr(choice.itemList);
        const matches=new Set(pool.filter(x=>needed.has(x)));
        for(const id of matches){
          const lst=random.get(id)||[];
          lst.push({positions:arr(choice.position),
            itemDraws:Number(choice.amount??1),
            occurrences:pool.filter(x=>x===id).length,
            poolLength:pool.length,mixed:choice.mixed===true});
          random.set(id,lst);
        }
      }
      if(!amounts.size&&!random.size)continue;
      const selectors=selectionEvidence(block,blocks,script);
      const guaranteedBlock=selectors.some(x=>x.soleCandidate);
      const missionPaths=ds.flatMap(d=>missionsFor(d,alienMissions,missionScripts)
        .map(m=>({deployment:d.type,...m})));
      const origin={
        terrain:terrain.name,mapScript:terrain.script||null,block:block.name,
        blockWidth:block.width,blockLength:block.length,
        blockSelection:guaranteedBlock?"soleCandidateForAddBlock":"conditional",
        selectors,missionPaths:missionPaths.slice(0,30),
        missionPathsTruncated:missionPaths.length>30,
        evidence:"terrain/mapBlock and faction alienDeployment/missionScript",
        recovery:"requires actual generated mission and extracted loot"
      };
      for(const [id,count] of amounts)if(count>0)
        append(id,{...origin,placement:"fixedOnBlock",count});
      for(const [id,draws] of random)
        append(id,{...origin,placement:"randomOnBlock",draws});
    }
  }
  const priority=x=>Number(x.blockSelection==="soleCandidateForAddBlock")*100+
    Number(x.placement==="fixedOnBlock")*20+
    Number(x.missionPaths.length>0)*5;
  return Object.fromEntries([...result].map(([id,allSources])=>{
    const ranked=[...allSources].sort((a,b)=>priority(b)-priority(a)||
      a.terrain.localeCompare(b.terrain)||a.block.localeCompare(b.block));
    return [id,{sources:ranked.slice(0,maxPerItem),
      sourceCount:allSources.length,maxPerItem,
      possiblyTruncated:allSources.length>maxPerItem}];
  }));
}
