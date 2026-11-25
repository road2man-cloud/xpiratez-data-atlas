// Keep all variants of an origin + research branch in one worker.
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
export const pairKey=r=>JSON.stringify([r.origin,r.branch]);
export const depthOf=s=>s.actions.filter(a=>a.type==="transform").length;
export function pairShard(r,count,manifest=null){
 if(!r||!Number.isSafeInteger(count)||count<1)throw Error("Invalid pair shard");
 if(manifest){const i=manifest.assignment[pairKey(r)];assert(Number.isSafeInteger(i)&&i>=0&&i<count);return i;}
 return createHash("sha256").update(pairKey(r)).digest().readUInt32BE(0)%count;
}
// Estimate work from unresolved states, not from published route counts.
// Longest-estimated-job-first packing never prunes a state.
export function weightedPairManifest(seedMap,states,count,{minDepth=0,initialOnly=false,seedQuota=0}={}){
 const jobs=new Map(),known=new Set(),workBySeed=new Map();
 for(const [id,r] of Object.entries(seedMap)){const k=pairKey(r),j=jobs.get(k)||{key:k,weight:0,seeds:0};j.seeds++;jobs.set(k,j);}
 for(const s of Object.values(states)){
  const r=seedMap[s.seed];assert(r);const d=depthOf(s);
  if(!d)known.add(s.seed);
  if(!s.done&&d>=minDepth&&(!initialOnly||!d))workBySeed.set(s.seed,(workBySeed.get(s.seed)||0)+1+Math.min(5,d));
 }
 if(minDepth===0)for(const [id,r] of Object.entries(seedMap))if(!known.has(id))workBySeed.set(id,1);
 for(const [id,weight] of workBySeed)jobs.get(pairKey(seedMap[id])).weight+=seedQuota>0?Math.min(seedQuota,weight):weight;
 const loads=Array(count).fill(0),seeds=Array(count).fill(0),pairs=Array(count).fill(0),assignment={};
 for(const j of [...jobs.values()].sort((a,b)=>b.weight-a.weight||b.seeds-a.seeds||a.key.localeCompare(b.key))){
  let best=0;for(let i=1;i<count;i++){
   const a=j.weight?[loads[i],seeds[i],pairs[i]]:[seeds[i],pairs[i],loads[i]],b=j.weight?[loads[best],seeds[best],pairs[best]]:[seeds[best],pairs[best],loads[best]];
   if(a[0]<b[0]||a[0]===b[0]&&(a[1]<b[1]||a[1]===b[1]&&a[2]<b[2]))best=i;
  }
  assignment[j.key]=best;loads[best]+=j.weight;seeds[best]+=j.seeds;pairs[best]++;
 }
 return {schema:1,count,mode:"WEIGHTED_PENDING_PAIR_QUOTA",minDepth,initialOnly,seedQuota,assignment,loads,seeds,pairs};
}
