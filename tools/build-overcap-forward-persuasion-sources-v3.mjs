// Narrow source compiler: social prerequisites, expedition procurement and
// rank gates. Reject unknown rule fields rather than infer a source.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const dir=process.argv.find(x=>x.startsWith("--rules="))?.slice(8);assert(dir);
const data=JSON.parse(fs.readFileSync("public/data/soldiers-modern-index.json"));
const sha=b=>createHash("sha256").update(b).digest("hex"),defs=new Map();
for(const {file,sha256} of data.meta.source.rules){
 const b=fs.readFileSync(path.join(dir,file));assert.equal(sha(b),sha256,file);
 const a=b.toString("utf8").replace(/^\uFEFF/,"").split(/\r?\n/);let section="";
 for(let i=0;i<a.length;i++){
  const t=a[i].match(/^([A-Za-z][A-Za-z0-9_]*):/);if(t)section=t[1];
  const m=a[i].match(/^  - (?:name|type): (\w+)\s*(?:#.*)?$/);
  if(!m||!["events","eventScripts","items","manufacture"].includes(section))continue;
  let j=i+1;while(j<a.length&&!/^  - |^[A-Za-z][A-Za-z0-9_]*:/.test(a[j]))j++;
  const lines=a.slice(i,j),key=section+":"+m[1];if(!defs.has(key))defs.set(key,[]);
  defs.get(key).push({lines,anchor:{file,sha256,startLine:i+1,endLine:j,blockSha256:sha(lines.join("\n"))}});i=j-1;
 }
}
function get(sec,id){const a=defs.get(sec+":"+id)||[];assert.equal(a.length,1,sec+":"+id);return a[0];}
const scalar=(d,k)=>d.lines.find(l=>l.startsWith("    "+k+": "))?.slice(k.length+6).trim()??null;
function integer(d,k,def){const s=scalar(d,k);if(s===null)return def;assert(/^-?\d+$/.test(s));return Number(s);}
function only(d,fields){for(const l of d.lines)if(/^    \w+:/.test(l))assert(fields.includes(l.trim().split(":")[0]),l);}
function list(d,k){const s=scalar(d,k);if(s===null)return [];assert(/^\[.*\]$/.test(s));return s.slice(1,-1).split(", ").filter(Boolean);}
function map(d,k){const i=d.lines.indexOf("    "+k+":");const o={};if(i<0)return o;for(let j=i+1;j<d.lines.length&&/^      STR_/.test(d.lines[j]);j++){const [id,v]=d.lines[j].trim().split(": ");assert(/^\d+$/.test(v));o[id]=Number(v);}return o;}
function ev(id){
 const d=get("events",id);only(d,["description","background","music","researchList","everyItemList","everyMultiItemList","randomItemList","points","funds","timer","timerRandom","interruptResearch"]);
 const fixed=map(d,"everyMultiItemList");for(const k of list(d,"everyItemList"))fixed[k]=(fixed[k]||0)+1;
 return {id,fixed,pool:list(d,"randomItemList"),research:list(d,"researchList"),interrupt:scalar(d,"interruptResearch"),points:integer(d,"points",0),funds:integer(d,"funds",0),timer:integer(d,"timer",30),timerRandom:integer(d,"timerRandom",0),anchor:d.anchor};
}
function script(id,event,ownerId=id){
 const d=get("eventScripts",id),owner=get("eventScripts",ownerId);
 only(d,["eventWeights","firstMonth","lastMonth","executionOdds","researchTriggers","minScore"]);
 const i=owner.lines.findIndex(l=>/^    eventWeights:/.test(l));assert(owner.lines[i+1]==="      0:");
 const weights={};for(let j=i+2;j<owner.lines.length&&/^        STR_/.test(owner.lines[j]);j++){const [k,v]=owner.lines[j].trim().split(": ");weights[k]=Number(v);}
 if(ownerId!==id){const alias=scalar(d,"eventWeights");assert(alias?.startsWith("*")&&scalar(owner,"eventWeights")==="&"+alias.slice(1));}
 const positive=[],negative=[];for(const l of d.lines){const m=l.match(/^       (STR_\w+): (true|false)$/);if(m)(m[2]==="true"?positive:negative).push(m[1]);}
 assert(weights[event]>0);
 return {id,event,positive,negative,firstMonth:integer(d,"firstMonth",0),lastMonth:integer(d,"lastMonth",-1),executionOdds:integer(d,"executionOdds",100),minScore:integer(d,"minScore",null),weight:weights[event],totalWeight:Object.values(weights).reduce((a,b)=>a+b,0),anchor:d.anchor,weightsAnchor:owner.anchor};
}
const events=["STR_JACKLAZY_BEST_BARGAIN","STR_JACKLAZY_MAN_OF_THE_CLOTH","STR_GAMBLING_NIGHT_WIN","STR_CAPTAINS_RANK_01","STR_CAPTAINS_RANK_02"].map(ev);
const scripts=[script("STR_CAPTAIN_JACKLAZY_EVENTS_1",events[0].id),script("STR_CAPTAIN_JACKLAZY_EVENTS_2",events[1].id,"STR_CAPTAIN_JACKLAZY_EVENTS_1"),script("STR_NOGREEN_YESGOLD_EVENTS",events[2].id),script(events[3].id,events[3].id),script(events[4].id,events[4].id)];
assert(events[0].research.includes("STR_VODKA")&&events[0].pool.includes("STR_VODKA"));assert.equal(events[1].fixed.STR_MUTANT_BLESSINGS,1);assert.equal(events[2].fixed.STR_LINGERIE,3);
assert.equal(scripts[3].minScore,2000);assert.equal(scripts[4].minScore,3000);
const item=get("items","STR_EXPEDITION_RESEARCH"),supply=data.itemSupply.STR_EXPEDITION_RESEARCH;
only(item,["categories","requiresBuy","size","costBuy","costSell","transferTime","listOrder"]);
assert.equal(integer(item,"costBuy",null),supply.buyCost);assert.equal(integer(item,"transferTime",null),960);
assert.deepEqual(item.lines.filter(l=>/^      - STR_/.test(l)).map(l=>l.trim().slice(2)),supply.buyRequires);
const purchase={id:"STR_EXPEDITION_RESEARCH",cost:supply.buyCost,requires:supply.buyRequires,transferHours:960,size:integer(item,"size",null),anchor:item.anchor};
function recipe(id){
 const d=get("manufacture",id),r={id,requires:[],functions:[],inputs:{},fixed:{},outcomes:[],anchor:d.anchor};let mode=null;
 for(const l of d.lines.slice(1)){
  if(!l.trim()||/^\s*#/.test(l))continue;let m;
  if((m=l.match(/^    (requires|requiredItems|producedItems|randomProducedItems):\s*$/))){mode=m[1];continue;}
  if((m=l.match(/^    (space|time|cost|listOrder): (\d+)\s*$/))){r[m[1]]=Number(m[2]);mode=null;continue;}
  if((m=l.match(/^    category: (STR_\w+)\s*$/))){r.category=m[1];mode=null;continue;}
  if((m=l.match(/^    refund: (true|false)\s*$/))){r.refundOnCancellation=m[1]==="true";mode=null;continue;}
  if(mode==="requires"&&(m=l.match(/^      - (STR_\w+)\s*$/))){r.requires.push(m[1]);continue;}
  if(["requiredItems","producedItems"].includes(mode)&&(m=l.match(/^      (STR_\w+): (\d+)\s*$/))){(mode==="requiredItems"?r.inputs:r.fixed)[m[1]]=Number(m[2]);continue;}
  if(mode==="randomProducedItems"&&(m=l.match(/^      - \[(\d+), \{(.*)\}\]\s*$/))){
   const items={};for(const x of m[2]?m[2].split(", "):[]){const z=x.match(/^(STR_\w+|CIVILIAN_\w+): (\d+)$/);assert(z,x);items[z[1]]=Number(z[2]);}
   r.outcomes.push({weight:Number(m[1]),items});continue;
  }throw Error("Unmodeled recipe line "+l);
 }
 r.totalWeight=r.outcomes.reduce((n,o)=>n+o.weight,0);assert.equal(r.cost,0);assert.equal(r.space,0);return r;
}
const recipes=[recipe("STR_EXPEDITION_DEBRIEF"),recipe("STR_LOOTBOX_EXPEDITION_EX")];assert.equal(recipes[0].fixed.STR_LOOTBOX_EXPEDITION,1);assert(recipes[1].outcomes.some(o=>o.items.STR_BOOK_OF_SERMONS===1));
const out={schema:"ATLAS_FORWARD_PERSUASION_SOURCES_V3",sourceMetadataSha256:data.meta.source.metadataSha256,nativeArchiveSha256:sha(fs.readFileSync("tools/headless-simulator/native/oxce-source.tar.gz")),events,scripts,purchase,recipes,rankPolicy:{formula:"SavedGame::getCurrentScore: previous/current indexed research score + 400 if monthsPassed > 1 + region XCOM activity - alien activity",context:"Absolute score unobserved; no rank grant is admitted.",source:"src/Savegame/SavedGame.cpp:3130-3140"},scope:"Source-backed conditional event, purchase and manufacture choices. Cost, stock, timing and monthly eligibility recorded; no inferred score or rank. Actual funds, storage, labor and full calendar remain unobserved."};
fs.writeFileSync("tools/data/overcap-forward-persuasion-sources-v3.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({events:events.map(e=>[e.id,e.fixed,e.pool.length,e.research,e.funds]),purchase,recipes:recipes.map(r=>[r.id,r.time,r.totalWeight,r.outcomes.length]),ranks:scripts.slice(-2)},null,2));
