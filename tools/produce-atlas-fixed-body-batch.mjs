// Focused fixed-body production: prevent default general-search lanes from
// modifying the graph during a closure-only batch. Existing producer source
// remains untouched so its persisted fingerprint stays compatible.
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import {gunzipSync} from "node:zlib";
import assert from "node:assert/strict";
const options=new Map(process.argv.slice(2).map(a=>{
 const m=/^--([a-z-]+)=(.+)$/.exec(a);assert(m,"Expected --key=value: "+a);return [m[1],m[2]];
}));
const allowed=new Set(["phase","seconds","wave","bodies"]);
for(const k of options.keys())assert(allowed.has(k),"Unknown option "+k);
const phase=options.get("phase")||"all";
assert(["all","produce","attach","complete","index"].includes(phase));
function int(k,d,min,max){const n=Number(options.get(k)||d);assert(Number.isSafeInteger(n)&&n>=min&&n<=max,k);return n;}
const seconds=int("seconds",60,1,600),wave=int("wave",40,1,1000);
const bodies=(options.get("bodies")||"STR_SOLDIER_PEASANT,STR_SOLDIER_OGRE,STR_SOLDIER_SLAVE,STR_SOLDIER_SYNTH,STR_SOLDIER_GNOME,STR_SOLDIER_DOGE").split(",");
const modern=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const known=new Set(modern.transformations.flatMap(r=>r.allowedSoldierTypes||[]));
assert(bodies.length&&bodies.every(x=>known.has(x)),"Unknown soldier body");
const data="public/data/",ledgerFile=data+"soldier-population-missing-origin-career.json.gz",indexFile=data+"soldier-population-missing-origin-career-index.json.gz";
const read=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const initial=read(ledgerFile);
function run(file,args=[]){
 const t=Date.now(),r=spawnSync(process.execPath,["--max-old-space-size=12000",file,...args],{encoding:"utf8",maxBuffer:64*1024*1024});
 if(r.status!==0||r.error){console.error(r.stderr?.slice(-12000)||r.error);throw Error(file+" failed: "+r.status);}
 const output=r.stdout.trim();
 console.log(JSON.stringify({phase:file,elapsedMs:Date.now()-t,...(file.includes("attach-")?{receipt:JSON.parse(output)}:{})}));
}
const quiet=["attempts","coverage-births","shared-scan","closed-recruit","repeat-compact","terminal-transfer","terminal-extension","terminal-event-recruit","trait-chain","terminal","supply-plans","supply-research","terminal-follow","end-stage","end-research","reset-recovery","follow","chain","nodes","research"].map(k=>"--"+k+"=0");
if(["all","produce","index"].includes(phase)){
 run("tools/build-population-shared-career-v97-body-scope.mjs",[...quiet,"--seconds="+seconds,"--closure-wave="+(phase==="index"?0:wave),"--closure-body-scope=1","--closure-preserve-body=1","--closure-bodies="+bodies.join(",")]);
 const l=read(ledgerFile),i=read(indexFile);
 assert.equal(l.sourceGraphSha256,i.sourceGraphSha256);
 const fresh=Object.entries(l.routes).filter(([k])=>!initial.routes[k]);
 const byBody={};for(const [,r] of fresh)byBody[r.body]=(byBody[r.body]||0)+1;
 console.log(JSON.stringify({states:Object.values(l.graphs).reduce((s,g)=>s+g.nodes.length,0),routes:Object.keys(l.routes).length,newRoutes:fresh.length,byBody,closureCandidates:l.summary.closureWave?.scopeNewCandidates||0,closureAttempts:l.summary.closureWave?.attempts||0,closureMetrics:l.summary.closureWave?.byBody}));
}
if(["all","attach"].includes(phase))run("tools/attach-population-missing-origin-career.mjs");
if(["all","complete"].includes(phase)){
 run("tools/build-atlas-career-completion.mjs");
 const c=read(data+"branch-soldier-results.json.gz").careerCompletion;
 console.log(JSON.stringify({finalCount:c.summary.completeCombinations,byFinalBody:c.summary.finalCareer.byFinalBody,researchCombinations:c.researchTraitSets.summary.pairs}));
}
