// Focused fixed-body production: prevent default general-search lanes from
// modifying the graph during a closure-only batch. Existing producer source
// remains untouched so its persisted fingerprint stays compatible.
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import assert from "node:assert/strict";
import {rankNearClosureGraphs} from "./atlas-near-closure-graph-priority.mjs";
const options=new Map(process.argv.slice(2).map(a=>{
 const m=/^--([a-z-]+)=(.+)$/.exec(a);assert(m,"Expected --key=value: "+a);return [m[1],m[2]];
}));
const allowed=new Set(["phase","seconds","wave","bodies","focus","chain-quantum","root-attempts","rule-attempts","fragment-ms","append-base","completion-stage","graphs","graph-limit","ready-graph","recruit-origins","recruit-goals","recruit-branches","recruit-limit","recruit-attempts","recruit-overlap","recruit-seconds","exact-leaves"]);
for(const k of options.keys())assert(allowed.has(k),"Unknown option "+k);
const phase=options.get("phase")||"all";
assert(["all","produce","attach","complete","index","recruit","recruit-close"].includes(phase));
function int(k,d,min,max){const n=Number(options.get(k)||d);assert(Number.isSafeInteger(n)&&n>=min&&n<=max,k);return n;}
const seconds=int("seconds",60,1,600),wave=int("wave",40,1,1000);
const bodies=(options.get("bodies")||"STR_SOLDIER_PEASANT,STR_SOLDIER_OGRE,STR_SOLDIER_SLAVE,STR_SOLDIER_SYNTH,STR_SOLDIER_GNOME,STR_SOLDIER_DOGE").split(",");
const modern=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const known=new Set(modern.transformations.flatMap(r=>r.allowedSoldierTypes||[]));
assert(bodies.length&&bodies.every(x=>known.has(x)),"Unknown soldier body");
const focus=(options.get("focus")||"").split(",").filter(Boolean),rules=new Set(modern.transformations.map(r=>r.id));
assert(focus.every(x=>x==="CAP_GROWTH"||rules.has(x)),"Unknown focused action");
const completionStage=options.get("completion-stage")||"all";assert(["all","prepare","finalize"].includes(completionStage));
const data="public/data/",ledgerFile=data+"soldier-population-missing-origin-career.json.gz",indexFile=data+"soldier-population-missing-origin-career-index.json.gz";
const read=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const initial=read(ledgerFile);
const recruitOrigins=(options.get("recruit-origins")||"").split(",").filter(Boolean),recruitGoals=(options.get("recruit-goals")||"").split(",").filter(Boolean),recruitBranches=(options.get("recruit-branches")||"").split(",").filter(Boolean);
const recruitmentMode=["recruit","recruit-close"].includes(phase);
if(recruitmentMode){
 const profiles=new Map(modern.profiles.map(p=>[p.id,p]));
 assert(recruitOrigins.length&&recruitGoals.length,"Recruitment requires explicit origins and research goals");
 assert(recruitOrigins.every(id=>profiles.has(id)&&bodies.includes(profiles.get(id).soldierType)&&profiles.get(id).sourceType!=="event"),"Invalid recruit origin");
 assert(recruitGoals.every(id=>Object.hasOwn(modern.researchRules,id)),"Unknown recruit research goal");
}
let graphs=(options.get("graphs")||"").split(",").filter(Boolean);
if(graphs.length===1&&graphs[0]==="auto"&&["all","produce"].includes(phase)){
 const db=read(data+"branch-soldier-results.json.gz");
 const picked=rankNearClosureGraphs({ledger:initial,admission:db.careerCompletion?.finalCareerAdmission,bodies,focus,limit:int("graph-limit",3,1,100)});
 graphs=picked.map(x=>x.graph);console.log(JSON.stringify({nearClosureGraphs:picked}));
 if(!graphs.length)throw Error("No archive-backed candidate. Use an unrestricted batch explicitly.");
}else if(graphs.includes("auto"))throw Error("auto is only supported for production");
assert(graphs.every(x=>Object.hasOwn(initial.graphs,x)),"Unknown graph");
if(phase==="recruit-close")assert(!graphs.length,"Recruit-close selects only newly recruited graphs");
function run(file,args=[]){
 const t=Date.now(),r=spawnSync(process.execPath,["--max-old-space-size=12000",file,...args],{encoding:"utf8",maxBuffer:64*1024*1024});
 if(r.status!==0||r.error){console.error(r.stderr?.slice(-12000)||r.error);throw Error(file+" failed: "+r.status);}
 const output=r.stdout.trim();
 console.log(JSON.stringify({phase:file,elapsedMs:Date.now()-t,...(file.includes("attach-")?{receipt:JSON.parse(output)}:{})}));
}
const quiet=["attempts","coverage-births","shared-scan","closed-recruit","repeat-compact","terminal-transfer","terminal-extension","terminal-event-recruit","trait-chain","terminal","supply-plans","supply-research","terminal-follow","end-stage","end-research","reset-recovery","follow","chain","nodes","research"].map(k=>"--"+k+"=0");
if(["all","produce","index","recruit","recruit-close"].includes(phase)){
 const recruitment=recruitmentMode?["--terminal-extension="+int("recruit-limit",4,1,100),"--extension-attempts="+int("recruit-attempts",12,1,100),"--extension-scope=pair","--extension-origins="+recruitOrigins.join(","),"--extension-goals="+recruitGoals.join(","),"--extension-branches="+recruitBranches.join(","),"--extension-goal-overlap="+int("recruit-overlap",recruitGoals.length,0,recruitGoals.length),"--extension-fragment-ms="+int("fragment-ms",1500,0,20000)]:[];
 const producer="tools/build-population-shared-career-v105-exact-leaves.mjs";
 function closureArgs(ids,limit,budget){
  return ["--seconds="+budget,"--closure-wave="+limit,"--closure-body-scope=1","--closure-medal-preparation=1","--closure-preserve-body=1","--closure-bodies="+bodies.join(","),"--closure-graphs="+ids.join(","),"--closure-ready-graph="+int("ready-graph",1,0,1),"--closure-exact-leaves="+(ids.length?int("exact-leaves",3,0,12):0),"--closure-focus-actions="+focus.join(","),"--closure-chain-quantum="+int("chain-quantum",6,1,100),"--closure-root-attempts="+int("root-attempts",8,1,100),"--closure-rule-attempts="+int("rule-attempts",2,1,100),"--closure-fragment-ms="+int("fragment-ms",1500,0,20000)];
 }
 run(producer,[...recruitment,...quiet.filter(x=>!recruitmentMode||!x.startsWith("--terminal-extension=")),...closureArgs(graphs,phase==="index"||recruitmentMode?0:wave,recruitmentMode?int("recruit-seconds",seconds,1,600):seconds)]);
 let l=read(ledgerFile),i=read(indexFile);
 assert.equal(l.sourceGraphSha256,i.sourceGraphSha256);
 if(recruitmentMode){
  const addedGraphs=Object.entries(l.graphs).filter(([k,g])=>!initial.graphs[k]&&!g.blocker&&recruitOrigins.includes(g.origin)&&bodies.includes(g.nodes[0]?.body)).map(([graph,g])=>({graph,origin:g.origin,branch:g.branch,body:g.nodes[0]?.body}));
  console.log(JSON.stringify({newRecruitGraphs:addedGraphs,extension:l.summary.terminalExtension||null}));
  if(phase==="recruit-close"&&addedGraphs.length){
   // Recruitment already persisted an independently indexed ledger.
   // Do not run unrestricted closure when no new graph was produced.
   const before=l;
   run(producer,[...quiet,...closureArgs(addedGraphs.map(x=>x.graph),wave,seconds)]);
   l=read(ledgerFile);i=read(indexFile);
   assert.equal(l.sourceGraphSha256,i.sourceGraphSha256);
   for(const [id,r] of Object.entries(before.routes))assert.equal(l.routes[id]?.fullActionHash,r.fullActionHash,"Recruitment route changed");
   console.log(JSON.stringify({recruitedRoutes:Object.keys(before.routes).length-Object.keys(initial.routes).length,continuations:Object.keys(l.routes).length-Object.keys(before.routes).length}));
  }
 }
 const fresh=Object.entries(l.routes).filter(([k])=>!initial.routes[k]);
 const byBody={};for(const [,r] of fresh)byBody[r.body]=(byBody[r.body]||0)+1;
 console.log(JSON.stringify({states:Object.values(l.graphs).reduce((s,g)=>s+g.nodes.length,0),routes:Object.keys(l.routes).length,newRoutes:fresh.length,byBody,closureCandidates:l.summary.closureWave?.scopeNewCandidates||0,closureAttempts:l.summary.closureWave?.attempts||0,closureMetrics:l.summary.closureWave?.byBody}));
}
if(["all","attach"].includes(phase))run("tools/attach-population-missing-origin-career.mjs",options.has("append-base")?["--append-base="+options.get("append-base")]:[]);
if(["all","complete"].includes(phase)){
 run("tools/build-atlas-career-completion.mjs",["--completion-stage="+completionStage]);
 if(completionStage==="prepare")process.exit(0);
 const c=read(data+"branch-soldier-results.json.gz").careerCompletion;
 console.log(JSON.stringify({finalCount:c.summary.completeCombinations,byFinalBody:c.summary.finalCareer.byFinalBody,researchCombinations:c.researchTraitSets.summary.pairs}));
}

