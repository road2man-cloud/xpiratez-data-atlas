// Analyze *nominal* research-dependency cycles, not permanent in-game blocks.
// Dependencies can be bypassed by discovered unlocks, events and RNG; requires
// cannot. A strongly connected component is evidence of a cyclic *listing*
// only, never proof that a player cannot unlock an individual topic.
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const ids = value => (Array.isArray(value) ? value : [])
  .map(x => typeof x === "string" ? x : x?.id)
  .filter(x => typeof x === "string");

export function publishedResearchEventGrants(dir="public/data/event-chunks") {
  const grants = {};
  for (const file of fs.readdirSync(dir).filter(x => x.endsWith(".json.gz")).sort()) {
    const events = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir,file)))).details||{};
    for (const event of Object.values(events)) {
      for (const reward of event.effects?.researchRewards||[]) {
        if (!reward?.id) continue;
        const row = grants[reward.id] ||= [];
        if (!row.some(e=>e.id===event.id))
          row.push({id:event.id,koName:event.koName||event.id});
      }
    }
  }
  return grants;
}

export function auditResearchCycles(topics, eventGrants={}) {
  const byId = new Map(topics.map(t=>[t.id,t]));
  const parents = new Map(topics.map(t=>[t.id,
    [...new Set([...ids(t.dependencies),...ids(t.requires)])].filter(id=>byId.has(id))]));
  const indices=new Map(),low=new Map(),stack=[],stackSet=new Set(),components=[];
  let index=0;
  function visit(id) {
    indices.set(id,index);low.set(id,index++);stack.push(id);stackSet.add(id);
    for(const parent of parents.get(id)||[]) {
      if (!indices.has(parent)) {
        visit(parent);
        low.set(id,Math.min(low.get(id),low.get(parent)));
      } else if(stackSet.has(parent)) {
        low.set(id,Math.min(low.get(id),indices.get(parent)));
      }
    }
    if(low.get(id)===indices.get(id)) {
      const group=[];let last;
      do {last=stack.pop();stackSet.delete(last);group.push(last);} while(last!==id);
      components.push(group);
    }
  }
  for(const t of topics)if(!indices.has(t.id))visit(t.id);

  const unlockedBy=new Map(),freeBy=new Map(),protectedBy=new Map();
  const append=(map,target,source)=>{
    if(!byId.has(target))return;
    const arr=map.get(target)||[];
    if(!arr.includes(source)){arr.push(source);map.set(target,arr);}
  };
  for(const t of topics){
    for(const target of ids(t.unlocks))append(unlockedBy,target,t.id);
    for(const target of ids(t.getOneFree))append(freeBy,target,t.id);
    for(const targets of Object.values(t.getOneFreeProtected||{}))
      for(const target of ids(targets))append(protectedBy,target,t.id);
  }

  function shortestWitness(members) {
    const inside=new Set(members),ordered=[...members].sort();
    let best=null;
    for(const start of ordered){
      for(const next of (parents.get(start)||[]).filter(x=>inside.has(x)).sort()){
        const queue=[[next]],seen=new Set([next]);
        for(let i=0;i<queue.length;i++){
          const path=queue[i],at=path[path.length-1];
          if(at===start){const witness=[start,...path];
            if(!best||witness.length<best.length||
                (witness.length===best.length&&witness.join("|")<best.join("|")))
              best=witness;
            break;
          }
          if(best&&path.length+2>best.length)continue;
          for(const parent of (parents.get(at)||[]).filter(x=>inside.has(x)).sort())
            if(parent===start)queue.push([...path,parent]);
            else if(!seen.has(parent)){seen.add(parent);queue.push([...path,parent]);}
        }
      }
    }
    return best||[];
  }

  const cycles=components.filter(c=>c.length>1||(parents.get(c[0])||[]).includes(c[0]))
    .map(component=>{
      const members=[...component].sort(),inside=new Set(component);
      const examples={unlocks:[],free:[],protected:[],events:[]};
      for(const target of members){
        for(const [key,map] of [["unlocks",unlockedBy],["free",freeBy],["protected",protectedBy]]){
          for(const source of map.get(target)||[])if(!inside.has(source))
            examples[key].push({source,target});
        }
        for(const event of eventGrants[target]||[])
          if(!examples.events.some(x=>x.eventId===event.id&&x.target===target))
            examples.events.push({eventId:event.id,eventName:event.koName||event.id,target});
      }
      const count=Object.fromEntries(Object.entries(examples).map(([key,a])=>[key,a.length]));
      return {
        id:members[0],memberIds:members,witness:shortestWitness(members),
        externalSourceCounts:count,
        externalSourceExamples:Object.fromEntries(Object.entries(examples).map(([key,a])=>[key,a.slice(0,7)]))
      };
    }).sort((a,b)=>b.memberIds.length-a.memberIds.length||a.id.localeCompare(b.id));
  const assigned=new Set(cycles.flatMap(x=>x.memberIds));
  if(assigned.size!==cycles.reduce((n,g)=>n+g.memberIds.length,0))
    throw new Error("Research cycle memberships overlap");
  return {groups:cycles,groupCount:cycles.length,topicCount:assigned.size,
    noIndexedEscape:cycles.filter(g=>Object.values(g.externalSourceCounts).every(n=>n===0)).length};
}
