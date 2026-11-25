// Query necessary stat conditions, not campaign feasibility.
// All requested minima must fit a SINGLE terminal body's independent box.
// Usage: node tools/query-population-career-envelope.mjs --min=health:502,stamina:613 --limit=10
import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
const arg=(name,def)=>process.argv.find(s=>s.startsWith("--"+name+"="))?.slice(name.length+3)??def;
const read=file=>JSON.parse(gunzipSync(fs.readFileSync(file)));
const db=read("public/data/branch-soldier-results.json.gz"),meta=db.populationCareerEnvelope;
assert(meta,"Career envelope is not registered");
const bytes=fs.readFileSync("public/data/"+meta.file);
assert.equal(createHash("sha256").update(bytes).digest("hex"),meta.sha256);
const a=JSON.parse(gunzipSync(bytes));
assert.equal(a.identity,meta.identity);
const requested=arg("min","").split(",").filter(Boolean),minima=new Map();
assert(requested.length,"Specify --min=stat:value[,stat:value]");
for(const s of requested){
 const parts=s.split(":");assert.equal(parts.length,2,"Invalid minimum "+s);
 const i=a.stats.indexOf(parts[0]),n=Number(parts[1]);
 assert(i>=0&&parts[1]!==""&&Number.isSafeInteger(n)&&n>=0,"Invalid minimum "+s);
 minima.set(i,Math.max(minima.get(i)||0,n));
}
const body=arg("body",null),origin=arg("origin",null),branch=arg("branch",null),limit=Number(arg("limit","10"));
assert(Number.isSafeInteger(limit)&&limit>=0);
if(origin)assert(a.origins.includes(origin),"Unknown origin");
if(branch)assert(a.branches.includes(branch),"Unknown branch");
if(body)assert(a.groups.some(g=>g.value.bounds.some(b=>b.body===body)),"Unknown terminal body");
const byGroup=new Map(),selected=new Set(),candidates=new Map();
let pairs=0,rejected=0,oldRejected=0,extraSingleBodyRejected=0;
for(let i=0;i<a.origins.length;i++){
 if(origin&&a.origins[i]!==origin)continue;
 for(let j=0;j<a.branches.length;j++){
  if(branch&&a.branches[j]!==branch)continue;
  const id=a.pairClasses[i][j];pairs++;
  if(!byGroup.has(id))byGroup.set(id,[]);
  byGroup.get(id).push([a.origins[i],a.branches[j]]);
 }
}
function fits(v){return [...minima].every(([k,n])=>v[k]>=n);}
for(const [id,aliases] of byGroup){
 const g=a.groups[id],old=db.populationBranchInvariant.groups[g.baseGroup],x=g.value;
 const previous=old.bounds.filter(b=>!body||b.body===body).some(b=>fits(b.effective));
 if(!previous)oldRejected+=aliases.length;
 const boxCandidates=x.bounds.filter(b=>(!body||b.body===body)&&fits(b.effective));
 if(!boxCandidates.length){
  rejected+=aliases.length;
  if(!body&&fits(x.effectiveMax))extraSingleBodyRejected+=aliases.length;
  continue;
 }
 assert(previous,"Refined upper envelope must not admit a previously excluded target");
 selected.add(id);
 const slack=b=>Math.min(...[...minima].map(([i,n])=>b.effective[i]-n));
 candidates.set(id,{id,pairs:aliases.length,possibleBodies:boxCandidates.map(b=>({body:b.body,slack:slack(b)})),
  priority:Math.max(...boxCandidates.map(slack)),aliases});
}
const ordered=[...candidates.values()].sort((a,b)=>b.priority-a.priority||b.pairs-a.pairs||a.id-b.id);
assert.equal(pairs,rejected+ordered.reduce((n,g)=>n+g.pairs,0));
const all=process.argv.includes("--all");
const out={scope:"Necessary independent numeric upper bounds only; surviving groups are not proven reachable. Rejected targets are not full-game impossible pairs.",
 minima:Object.fromEntries([...minima].map(([i,n])=>[a.stats[i],n])),body,origin,branch,
 pairs,groups:byGroup.size,oldRejected,rejected,newlyRejected:rejected-oldRejected,extraSingleBodyRejected,
 remaining:pairs-rejected,remainingGroups:selected.size,
 queue:ordered.slice(0,all?ordered.length:limit).map(g=>({...g,aliases:all?g.aliases:g.aliases.slice(0,3)}))};
console.log(JSON.stringify(out,null,2));
