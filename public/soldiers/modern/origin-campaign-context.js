// Joint campaign-context audit, separate from numerical soldier/stat replay.
// A route can replay its local rules yet combine mutually exclusive assumptions.
// Difficulty is one fixed campaign choice; unknown does NOT mean it may change
// between events. Compatible ranges are necessary conditions, never a gameplay proof.
const arr=x=>Array.isArray(x)?x:[];
const routesCache=new WeakMap();
function sourceIndex(data){
  let cached=routesCache.get(data);if(cached)return cached;
  const events=new Map(),missions=new Map(),births=new Map();
  for(const [research,sources] of Object.entries(data.eventResearchSources||{}))
    for(const source of sources)for(const script of arr(source.scripts))
      events.set([research,source.event,script.script].join('|'),script);
  for(const [research,sources] of Object.entries(data.missionResearchSources||{}))
    for(const source of sources)for(const script of arr(source.scripts))
      missions.set([research,source.deployment,script.script].join('|'),script);
  for(const row of arr(data.originRows))for(const script of arr(row.prerequisites?.event?.alternatives))
    births.set([row.id,script.script].join('|'),script);
  cached={events,missions,births};routesCache.set(data,cached);return cached;
}
export function auditOriginCampaignContext(steps,data){
  const source=sourceIndex(data),evidence=[],conflicts=[],unknown=[];
  let allowed=[0,1,2,3,4],configured=false;
  if(!Array.isArray(steps))return {kind:'unknown',allowedDifficulties:[],evidence:[],conflicts:[],unknown:['Witness steps missing']};
  for(const [at,step] of steps.entries()){
    if(step.type==='campaignContext'){
      if(at!==0||configured||!Number.isInteger(step.difficulty)||step.difficulty<0||step.difficulty>4||step.assumption!==true){
        conflicts.push({kind:'INVALID_CONTEXT',at,message:'Campaign difficulty must be explicitly chosen once, before any action'});
      }else{
        configured=true;allowed=allowed.filter(x=>x===step.difficulty);
        evidence.push({at,source:'campaignContext',minDifficulty:step.difficulty,maxDifficulty:step.difficulty});
      }
      continue;
    }
    let rule=null,sourceId=null;
    if(step.type==='eventResearch'){
      sourceId=step.event;rule=source.events.get([step.research,step.event,step.script].join('|'));
    }else if(step.type==='missionResearch'){
      sourceId=step.deployment;rule=source.missions.get([step.research,step.deployment,step.script].join('|'));
    }else if(step.type==='recruit'&&step.script){
      sourceId=step.profile;rule=source.births.get([step.profile,step.script].join('|'));
    }else continue;
    if(!rule){unknown.push({at,source:sourceId,script:step.script,reason:'Original event or mission script unavailable'});continue;}
    const condition=rule.otherConditions||{};
    if(condition.minDifficulty==null&&condition.maxDifficulty==null)continue;
    const min=condition.minDifficulty==null?0:Number(condition.minDifficulty);
    const max=condition.maxDifficulty==null?4:Number(condition.maxDifficulty);
    if(!Number.isInteger(min)||!Number.isInteger(max)){
      unknown.push({at,source:sourceId,script:step.script,reason:'Invalid difficulty bound'});continue;
    }
    const before=[...allowed];
    allowed=allowed.filter(n=>n>=min&&n<=max);
    const proof={at,source:sourceId,script:step.script,research:step.research||null,minDifficulty:min,maxDifficulty:max};
    evidence.push(proof);
    if(before.length&&!allowed.length){
      const lower=evidence.reduce((a,b)=>a.minDifficulty>=b.minDifficulty?a:b);
      const upper=evidence.reduce((a,b)=>a.maxDifficulty<=b.maxDifficulty?a:b);
      conflicts.push({kind:'DIFFICULTY_CONFLICT',at,minimum:lower.minDifficulty,maximum:upper.maxDifficulty,
        lowerSource:lower,upperSource:upper,message:'No single campaign difficulty satisfies all selected event/mission conditions'});
    }
  }
  return {kind:conflicts.length?'inconsistent':unknown.length?'unknown':'compatible',
    allowedDifficulties:allowed,evidence,conflicts,unknown,
    note:'Only shared difficulty consistency is checked; resources, geography, RNG, calendar duration and global optimality remain unverified'};
}
export function candidateMatchesCampaign(candidate,difficulty=null){
  const result=candidate?.campaignContext;
  if(!result||result.kind!=='compatible')return false;
  return difficulty==null||result.allowedDifficulties.includes(Number(difficulty));
}
