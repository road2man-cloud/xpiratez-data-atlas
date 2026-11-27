// Exact conditional finite distributions for published career witnesses.
// Preserve immutable replay vectors; do not replace evidence hashes with means.
// This model assumes independent integer-uniform draws and the recorded MIN birth.
export function randomRule(rule, keys) {
  return !!rule && keys.some(k => ['flat','percent','percentGained'].some(f =>
    (rule[f+'Min']?.[k]??0)!==(rule[f+'Max']?.[k]??0)) || rule.rerollStats?.[k]===true);
}

export function careerRandomDistribution(data, row, actions, {keys,initialState,bonusStats,maxStates=20000,maxTransitions=2000000}={}) {
  // This is a probability model for an already admitted fixed chronology and
  // the ledger's minimum birth. It is NOT a new campaign feasibility proof.
  const fail=reason=>({kind:'unverified',reason});
  try {
    const need=(ok,msg)=>{if(!ok)throw Error(msg)};
    const integer=Number.isSafeInteger, list=x=>Array.isArray(x)?x:[];
    const get=(o,k,fallback=0)=>{const v=o?.[k]??fallback;need(integer(v),'Invalid stat field: '+k);return v};
    const range=(a,b)=>{need(integer(a)&&integer(b)&&b>=a&&b-a<=5000,'Invalid integer roll interval');return Array.from({length:b-a+1},(_,i)=>a+i)};
    const add=(m,v,p)=>{if(p>0)m.set(v,(m.get(v)||0)+p)};
    const mass=m=>[...m.values()].reduce((a,b)=>a+b,0);
    const checkMass=m=>need(m.size>0&&m.size<=maxStates&&Math.abs(mass(m)-1)<1e-7,'Probability state budget/mass');
    const floor=k=>k==='health'?1:0;
    const effective=(k,v,b)=>k==='psiSkill'&&v<=0&&b>0?v:Math.max(floor(k),v+b);
    const bodies=new Map(data.soldiers.map(b=>[b.id,b])),rules=new Map(data.transformations.map(r=>[r.id,r]));
    const grow=(b,k,v)=>{
      if(k==='mana'&&!data.growthRules?.manaPrimary&&!data.growthRules?.manaSecondary)return v;
      const cap=b.statCaps?.[k];need(integer(cap),'Missing battle cap: '+b.id+'/'+k);
      return cap>v?k==='bravery'?v+10*Math.floor((cap-v)/10):cap:v;
    };
    const mapValues=(m,f)=>{const out=new Map();for(const [v,p] of m)add(out,f(v),p);checkMass(out);return out};
    need(Array.isArray(keys)&&keys.length===12&&Array.isArray(actions)&&Array.isArray(row.order),'Missing chronology');
    const births=actions.filter(a=>a.type==='recruit'&&a.soldier==='origin');
    need(births.length===1&&births[0].profile===row.origin&&births[0].band==='min','Minimum birth witness missing');
    const transforms=actions.filter(a=>a.type==='transform'&&a.soldier==='origin');
    need(JSON.stringify(transforms.map(a=>a.transform))===JSON.stringify(row.order),'Transformation order mismatch');
    const profile=data.profiles.find(p=>p.id===row.origin);
    need(!!profile,'Unknown origin');
    const state=initialState(data,profile,{band:'min'}),initial=state.initialStats,medals={};
    let body=bodies.get(state.soldierType),dist={},gateProbability=1,rolls=0,transitions=0,born=false;
    need(!!body,'Unknown initial body');
    for(const k of keys) {
      need(integer(initial[k])&&integer(state.currentStats[k]),'Unknown initial/current raw stat: '+k);
      dist[k]=new Map([[state.currentStats[k],1]]);
    }
    const growth=()=>{for(const k of keys)dist[k]=mapValues(dist[k],v=>grow(body,k,v))};
    const gateStats=(r,k,m,bonus)=>{
      const lo=get(r.requiredMinStats,k),hi=get(r.requiredMaxStats,k,9999),out=new Map();
      for(const [v,p] of m)if((r.includeBonusesForMinStats?effective(k,v,bonus):v)>=lo&&
        (r.includeBonusesForMaxStats?effective(k,v,bonus):v)<=hi)add(out,v,p);
      const chance=mass(out);need(chance>0,'Stat gate impossible: '+r.id+'/'+k);
      gateProbability*=Math.min(1,chance);
      for(const [v,p] of out)out.set(v,p/chance);
      checkMass(out);return out;
    };
    for(const a of actions) {
      if(a.soldier!=='origin')continue;
      if(a.type==='recruit'){need(!born,'Duplicate birth');born=true;continue}
      need(born,'Soldier action before birth');
      if(a.type==='conditionalCapGrowth'){need(a.assumption===true,'Unmarked growth');growth();continue}
      if(a.type==='conditionalPromotion')continue; // no raw or bonus change
      if(a.type==='conditionalMedal'){need(typeof a.medal==='string'&&integer(a.level),'Unknown medal');medals[a.medal]=a.level;continue}
      need(a.type==='transform','Unsupported soldier action: '+a.type);
      const r=rules.get(a.transform);
      need(r&&!r.createsClone&&!r.producedItem,'Unsupported same-soldier transform: '+a.transform);
      need(list(r.allowedSoldierTypes).includes(body.id)&&!list(r.forbiddenSoldierTypes).includes(body.id),'Body gate mismatch: '+r.id);
      need(list(r.requiredPreviousTransformations).every(id=>state.history.has(id))&&
        !list(r.forbiddenPreviousTransformations).some(id=>state.history.has(id)),'History gate mismatch: '+r.id);
      const to=bodies.get(r.producedSoldierType||body.id);
      need(!!to,'Unknown destination body: '+r.id);
      const gateBonus=bonusStats(state,data,{commendations:medals});
      for(const k of keys)dist[k]=gateStats(r,k,dist[k],get(gateBonus,k));
      if(randomRule(r,keys))rolls++;
      const soft=Number(r.upperBoundType)===1||((r.upperBoundType==null||Number(r.upperBoundType)===0)&&body.id===to.id);
      for(const k of keys) {
        const flat=range(get(r.flatMin,k),get(r.flatMax,k)),pct=range(get(r.percentMin,k),get(r.percentMax,k)),
          earned=range(get(r.percentGainedMin,k),get(r.percentGainedMax,k));
        let reroll=null;
        if(r.rerollStats?.[k]===true) {
          const lo=get(to.minStats,k),hi=get(to.maxStats,k);
          reroll=k==='psiSkill'?[lo]:k==='bravery'?range(Math.trunc(lo/10),Math.trunc(hi/10)).map(v=>v*10):range(lo,hi);
        }
        const count=dist[k].size*flat.length*pct.length*earned.length*(reroll?.length||1);
        transitions+=count;need(Number.isSafeInteger(count)&&transitions<=maxTransitions,'Probability transition budget');
        const out=new Map(),lower=r.lowerBoundAtMinStats?to.minStats?.[k]:null,
          upper=r.upperBoundAtMaxStats?to.maxStats?.[k]:r.upperBoundAtStatCaps?to.statCaps?.[k]:null;
        need(!r.lowerBoundAtMinStats||integer(lower),'Missing minStats bound: '+r.id+'/'+k);
        need(!(r.upperBoundAtMaxStats||r.upperBoundAtStatCaps)||integer(upper),'Missing upper bound: '+r.id+'/'+k);
        for(const [v,p] of dist[k])for(const f of flat)for(const q of pct)for(const e of earned) {
          let delta=get(r.flatOverallStatChange,k)+f+
            Math.trunc(v*get(r.percentOverallStatChange,k)/100)+Math.trunc(v*q/100)+
            Math.trunc((v-initial[k])*get(r.percentGainedStatChange,k)/100)+Math.trunc((v-initial[k])*e/100);
          if(k==='bravery')delta=Math.trunc((delta+(delta<0?-5:5))/10)*10;
          if(lower!=null)delta=Math.max(delta,lower-v);
          if(upper!=null) {
            if(soft){if(delta>0)delta=v<=upper?Math.min(delta,upper-v):0}
            else delta=Math.min(delta,upper-v);
          }
          for(const result of reroll||[v+delta]){
            need(integer(result)&&result>=floor(k),'Invalid outcome: '+r.id+'/'+k);
            add(out,result,p/(flat.length*pct.length*earned.length*(reroll?.length||1)));
          }
        }
        checkMass(out);dist[k]=out;
      }
      if(r.reset){state.history.clear();state.bonusCounts.clear()}
      else for(const id of list(r.removeTransformations)){
        const n=state.history.get(id)||0;if(!n)continue;
        state.history.delete(id);
        const bonus=rules.get(id)?.soldierBonusType;
        if(bonus){const left=(state.bonusCounts.get(bonus)||0)-n;if(left>0)state.bonusCounts.set(bonus,left);else state.bonusCounts.delete(bonus)}
      }
      state.history.set(r.id,(state.history.get(r.id)||0)+1);
      if(r.soldierBonusType)state.bonusCounts.set(r.soldierBonusType,(state.bonusCounts.get(r.soldierBonusType)||0)+1);
      state.bonusIds=new Set(state.bonusCounts.keys());
      body=to;state.soldierType=body.id;
    }
    need(rolls>0&&body.id===row.body&&gateProbability>0,'No random rule or terminal mismatch');
    const bonus=bonusStats(state,data),sum=v=>v.reduce((a,b)=>a+b,0);
    function summarize(growthProjection,witness){
      need(Array.isArray(witness)&&witness.length===keys.length&&witness.every(integer),'Invalid witness vector');
      const perStat=keys.map(k=>mapValues(dist[k],v=>effective(k,growthProjection?grow(body,k,v):v,get(bonus,k))));
      let total=new Map([[0,1]]);
      for(const m of perStat){
        transitions+=total.size*m.size;need(transitions<=maxTransitions,'Total distribution budget');
        const next=new Map();for(const [a,p] of total)for(const [b,q] of m)add(next,a+b,p*q);
        checkMass(next);total=next;
      }
      const sorted=m=>[...m].sort((a,b)=>a[0]-b[0]);
      const quantile=(m,q)=>{let p=0;for(const [v,w] of sorted(m)){p+=w;if(p>=q-1e-12)return v}return sorted(m).at(-1)[0]};
      const max=perStat.map(m=>sorted(m).at(-1)[0]),min=perStat.map(m=>sorted(m)[0][0]);
      const expected=perStat.map(m=>[...m].reduce((s,[v,p])=>s+v*p,0)/mass(m));
      const witnessProbability=perStat.reduce((p,m,i)=>p*(m.get(witness[i])||0),1);
      need(witnessProbability>0,'Recorded sample not in modeled support');
      const atLeastWitnessTotal=[...total].reduce((s,[v,p])=>s+(v>=sum(witness)?p:0),0);
      const maxProbability=perStat.reduce((p,m,i)=>p*m.get(max[i]),1);
      return {expected,min,max,expectedTotal:sum(expected),p50:quantile(total,.5),p90:quantile(total,.9),p99:quantile(total,.99),
        maxProbability:Math.min(1,maxProbability),witnessProbability:Math.min(1,witnessProbability),
        atLeastWitnessTotal:Math.min(1,atLeastWitnessTotal),rareWitness:gateProbability*atLeastWitnessTotal<=.01};
    }
    return {kind:'conditional-expected',model:'FIXED_MIN_BIRTH_INDEPENDENT_INTEGER_ROLLS_V1',rolls,
      gateProbability,current:summarize(false,row.current),cap:summarize(true,row.cap),
      exactBuildVerified:false,rareThreshold:.01};
  } catch(error){return fail(error.message)}
}

export function projectRandomStandard(row,result) {
  const known=result?.kind==='conditional-expected';
  return {...row,witnessCurrent:row.current,witnessCap:row.cap,
    current:known?result.current.expected:null,cap:known?result.cap.expected:null,
    randomStandard:result||{kind:'unverified',reason:'Probability not calculated'}};
}
