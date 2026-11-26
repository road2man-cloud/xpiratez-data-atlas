// Default producer for the research-tree model. Do not create more detailed
// economic calendars here. Resume the exact existing graph; budgets are
// scheduling limits, not a declaration of terminal closure.
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import {RESEARCH_TREE_PRODUCER_ARGS} from "./atlas-research-tree-policy.mjs";
const extra=process.argv.slice(2);
if(extra.some(a=>/^--(?:supply-plans|supply-research|terminal-follow|attempts|shared-scan)(?:=|$)/.test(a)))throw Error("Use the research-tree producer's ordinary-effort defaults");
function run(file,args=[]){return execFileSync(process.execPath,[file,...args],{encoding:"utf8",maxBuffer:64*1024*1024});}
console.log(run("tools/build-population-shared-career-v23.mjs",[...extra,...RESEARCH_TREE_PRODUCER_ARGS]));
console.log(run("tools/attach-population-missing-origin-career.mjs"));
const b=run("tools/export-atlas-career-branches.mjs").trim();JSON.parse(b);
const file="public/data/soldier-atlas-career-branches.json";
if(JSON.stringify(JSON.parse(fs.readFileSync(file)))!==JSON.stringify(JSON.parse(b)))fs.writeFileSync(file,b+"\n");
console.log(run("tools/build-atlas-career-completion.mjs"));
