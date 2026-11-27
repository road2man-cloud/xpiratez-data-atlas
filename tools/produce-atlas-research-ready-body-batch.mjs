// Produce real recruitment and fixed-body continuation graphs from already
// replayed research donors. Never treats a donor's research as a proof of
// recruitment or a scheduler candidate as a final career admission.
import assert from "node:assert/strict";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import {spawnSync} from "node:child_process";
const options=new Map();
for(const a of process.argv.slice(2)){
 const m=/^--([a-z-]+)=(.+)$/.exec(a);
 assert(m&&!options.has(m[1]),"Invalid or duplicate option: "+a);
 options.set(m[1],m[2]);
}
const allowed=new Set(["origins","bodies","goals","branches","births","birth-attempts","birth-seconds","rounds","wave","seconds","graph-limit","chain-quantum","root-attempts","rule-attempts","fragment-ms","graphs"]);
for(const k of options.keys())assert(allowed.has(k),"Unknown option "+k);
const csv=k=>[...new Set((options.get(k)||"").split(",").filter(Boolean))];
const int=(k,d,min,max)=>{const n=Number(options.get(k)??d);assert(Number.isSafeInteger(n)&&n>=min&&n<=max,k);return n;};
const modern=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const origins=csv("origins"),bodies=csv("bodies"),goals=csv("goals"),branches=csv("branches"),explicit=csv("graphs");
assert(origins.length&&bodies.length&&goals.length,"Origins, bodies, and goals are required");
assert(origins.every(id=>modern.profiles.some(p=>p.id===id)),"Unknown origin");
assert(bodies.every(id=>modern.soldiers.some(p=>p.id===id)),"Unknown body");
assert(goals.every(id=>Object.hasOwn(modern.researchRules,id)),"Unknown research goal");
const read=p=>JSON.parse(gunzipSync(fs.readFileSync("public/data/"+p+".json.gz")));
const ledger=()=>read("soldier-population-missing-origin-career");
const before=ledger(),db=read("branch-soldier-results");
assert(branches.every(id=>db.branches.some(b=>b.id===id)),"Unknown branch");
assert(explicit.every(id=>before.graphs[id]&&origins.includes(before.graphs[id].origin)),"Unknown or unrelated graph");
const quiet=Object.fromEntries(["attempts","coverage-births","shared-scan","closed-recruit","repeat-compact","terminal-transfer","terminal-fork","terminal-extension","terminal-event-recruit","trait-chain","terminal","supply-plans","supply-research","terminal-follow","end-stage","end-research","reset-recovery","follow","chain","nodes","research","closure-wave"].map(k=>[k,0]));
const births=int("births",2,0,20),rounds=int("rounds",1,0,10),seconds=int("seconds",60,20,300);
function run(file,args){
 const t=Date.now(),r=spawnSync(process.execPath,["--max-old-space-size=12000",file,...args],{encoding:"utf8",maxBuffer:64*1024*1024});
 if(r.error||r.status!==0){console.error(r.stderr?.slice(-10000)||r.error);throw Error(file+" failed: "+r.status);}
 console.log(JSON.stringify({phase:file,elapsedMs:Date.now()-t}));
}
function build(overrides){
 // The builder uses first-occurrence arguments. Emit each key exactly once.
 const flags={...quiet,...overrides};
 run("tools/build-population-shared-career-v104-transitive.mjs",Object.entries(flags).map(([k,v])=>"--"+k+"="+v));
}
if(births)build({seconds:int("birth-seconds",65,20,300),"terminal-extension":births,"extension-scope":"pair","extension-origins":origins.join(","),"extension-goals":goals.join(","),"extension-goal-overlap":goals.length,"extension-branches":branches.join(","),"extension-attempts":int("birth-attempts",8,1,100),"extension-fragment-ms":int("fragment-ms",2000,0,20000)});
const recruited=ledger();
const fresh=Object.entries(recruited.graphs).filter(([id,g])=>!before.graphs[id]&&origins.includes(g.origin)&&bodies.includes(g.nodes[0]?.body)&&!g.blocker).map(([id])=>id);
const graphs=[...new Set([...fresh,...explicit])].slice(0,int("graph-limit",8,1,100));
console.log(JSON.stringify({freshGraphs:fresh,selectedGraphs:graphs,births:recruited.summary.terminalExtension?.births??0}));
if(rounds&&!graphs.length)throw Error("No new or explicitly selected graphs; not falling back to global search.");
for(let i=0;i<rounds;i++){
 const prior=ledger();
 build({seconds,"closure-seconds":Math.max(5,seconds-16),"closure-wave":int("wave",40,1,1000),"closure-chain-quantum":int("chain-quantum",10,1,100),"closure-root-attempts":int("root-attempts",12,1,100),"closure-rule-attempts":int("rule-attempts",3,1,100),"closure-body-scope":1,"closure-medal-preparation":1,"closure-preserve-body":1,"closure-exclude-chort":1,"closure-bodies":bodies.join(","),"closure-ready-graph":1,"closure-graphs":graphs.join(",")});
 const l=ledger(),c=l.summary.closureWave;
 console.log(JSON.stringify({round:i+1,newRoutes:Object.keys(l.routes).length-Object.keys(prior.routes).length,attempts:c.attempts,transformed:c.transformed,addedResearch:c.addedResearch,candidates:c.outcomes}));
}
const end=ledger(),index=read("soldier-population-missing-origin-career-index");
assert.equal(end.sourceGraphSha256,index.sourceGraphSha256);
const added=Object.entries(end.routes).filter(([id])=>!before.routes[id]),byBody={};
for(const [,r] of added)byBody[r.body]=(byBody[r.body]||0)+1;
console.log(JSON.stringify({newRoutes:added.length,byBody,published:Object.keys(end.routes).length,graphHash:end.sourceGraphSha256,finalAdmission:"PENDING_INDEPENDENT_COMPLETION",statComparison:"Existing medal-free permanent vectors retained"}));
