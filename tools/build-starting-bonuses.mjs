import fs from "node:fs";
import path from "node:path";

const args=process.argv.slice(2);
const arg=(name,fallback=null)=>{const i=args.indexOf(name);return i>=0&&i+1<args.length?args[i+1]:fallback};
const source=arg("--source",process.env.XPIRATEZ_MOD_PATH);
if(!source){
  console.error("Usage: node tools/build-starting-bonuses.mjs --source <.../Piratez>");
  process.exit(2);
}

const eventsPath=path.join(path.resolve(source),"Ruleset","Piratez_Events.rul");
if(!fs.existsSync(eventsPath))throw new Error("Missing "+eventsPath);
const lines=fs.readFileSync(eventsPath,"utf8").replace(/^\uFEFF/,"").split(/\r?\n/);

function splitBlocks(startMarker,itemPrefix){
  const start=lines.findIndex(line=>line.trim()===startMarker);
  if(start<0)return [];
  const out=[];let current=null;
  for(let i=start+1;i<lines.length;i++){
    const line=lines[i];
    if(startMarker==="events:"&&line.trim()==="eventScripts:")break;
    const m=line.match(itemPrefix);
    if(m){
      if(current)out.push(current);
      current={id:m[1],lines:[line]};
    }else if(current)current.lines.push(line);
  }
  if(current)out.push(current);
  return out;
}
const eventBlocks=splitBlocks("events:",/^  - name:\s*(\S+)\s*$/);
const scriptBlocks=splitBlocks("eventScripts:",/^  - type:\s*(\S+)\s*$/);

const esc=s=>s.replace(/[.*+?^$()|[\]{}\\]/g,"\\$&");
function scalar(block,key,indent=4){
  const re=new RegExp("^\\s{"+indent+"}"+esc(key)+":\\s*(.+?)\\s*$");
  const line=block.lines.find(x=>re.test(x));
  if(!line)return null;
  const raw=line.match(re)[1];
  if(/^-?\d+(?:\.\d+)?$/.test(raw))return Number(raw);
  if(raw==="true")return true;if(raw==="false")return false;
  return raw.replace(/^["']|["']$/g,"");
}
function inlineList(block,key){
  const raw=scalar(block,key);
  if(typeof raw!=="string"||!raw.startsWith("[")||!raw.endsWith("]"))return [];
  const inner=raw.slice(1,-1).trim();
  return inner?inner.split(",").map(x=>x.trim()).filter(Boolean):[];
}
function mapUnder(block,key,indent=4){
  const idx=block.lines.findIndex(x=>new RegExp("^\\s{"+indent+"}"+esc(key)+":\\s*$").test(x));
  if(idx<0)return {};
  const out={};
  for(let i=idx+1;i<block.lines.length;i++){
    const line=block.lines[i];
    if(!line.trim())continue;
    const n=line.match(/^\s*/)[0].length;
    if(n<=indent)break;
    const m=line.match(/^\s+([^:#][^:]*):\s*(.+?)\s*$/);
    if(!m)continue;
    const k=m[1].trim(),raw=m[2].trim();
    out[k]=/^-?\d+(?:\.\d+)?$/.test(raw)?Number(raw):raw==="true"?true:raw==="false"?false:raw.replace(/^["']|["']$/g,"");
  }
  return out;
}
function nestedSection(block,parent,key){
  const p=block.lines.findIndex(x=>new RegExp("^\\s{4}"+esc(parent)+":\\s*$").test(x));
  if(p<0)return {index:-1,indent:8};
  for(let i=p+1;i<block.lines.length;i++){
    const line=block.lines[i];
    if(!line.trim())continue;
    const n=line.match(/^\s*/)[0].length;
    if(n<=4)break;
    if(new RegExp("^\\s{8}"+esc(key)+":\\s*$").test(line))return {index:i,indent:8};
  }
  return {index:-1,indent:8};
}
function nestedMap(block,parent,key){
  const hit=nestedSection(block,parent,key);
  if(hit.index<0)return {};
  const out={};
  for(let i=hit.index+1;i<block.lines.length;i++){
    const line=block.lines[i];
    if(!line.trim())continue;
    const n=line.match(/^\s*/)[0].length;
    if(n<=hit.indent)break;
    const m=line.match(/^\s+([^:#][^:]*):\s*(.+?)\s*$/);
    if(!m)continue;
    const raw=m[2].trim();
    out[m[1].trim()]=/^-?\d+(?:\.\d+)?$/.test(raw)?Number(raw):raw.replace(/^["']|["']$/g,"");
  }
  return out;
}
function nestedScalar(block,parent,key){
  const p=block.lines.findIndex(x=>new RegExp("^\\s{4}"+esc(parent)+":\\s*$").test(x));
  if(p<0)return null;
  const re=new RegExp("^\\s{8}"+esc(key)+":\\s*(.+?)\\s*$");
  for(let i=p+1;i<block.lines.length;i++){
    const line=block.lines[i];
    if(!line.trim())continue;
    const n=line.match(/^\s*/)[0].length;
    if(n<=4)break;
    const m=line.match(re);
    if(m){
      const raw=m[1].trim();
      return /^-?\d+(?:\.\d+)?$/.test(raw)?Number(raw):raw.replace(/^["']|["']$/g,"");
    }
  }
  return null;
}
function countItems(block){
  const out=new Map();
  for(const id of inlineList(block,"everyItemList"))out.set(id,(out.get(id)||0)+1);
  for(const [id,qty] of Object.entries(mapUnder(block,"everyMultiItemList")))out.set(id,(out.get(id)||0)+Number(qty||0));
  return [...out].map(([id,qty])=>({id,qty}));
}
function parseEvent(block){
  return{
    eventId:block.id,
    descriptionId:scalar(block,"description"),
    points:scalar(block,"points")??0,
    funds:scalar(block,"funds")??0,
    items:countItems(block),
    research:inlineList(block,"researchList"),
    spawnedPersonType:scalar(block,"spawnedPersonType"),
    spawnedPersons:scalar(block,"spawnedPersons")??0,
    spawnedSoldier:{
      rank:nestedScalar(block,"spawnedSoldier","rank"),
      nationality:nestedScalar(block,"spawnedSoldier","nationality"),
      armor:nestedScalar(block,"spawnedSoldier","armor"),
      transformationBonuses:nestedMap(block,"spawnedSoldier","transformationBonuses"),
      previousTransformations:nestedMap(block,"spawnedSoldier","previousTransformations"),
      currentStats:nestedMap(block,"spawnedSoldier","currentStats")
    },
    timer:scalar(block,"timer"),
    timerRandom:scalar(block,"timerRandom")
  };
}
const eventById=new Map(eventBlocks.filter(x=>x.id.startsWith("STR_START_")).map(x=>[x.id,parseEvent(x)]));

function parseScript(block){
  const firstMonth=scalar(block,"firstMonth"),lastMonth=scalar(block,"lastMonth");
  if(firstMonth!==0||lastMonth!==0)return null;
  const regions=mapUnder(block,"xcomBaseInRegionTriggers");
  const countries=mapUnder(block,"xcomBaseInCountryTriggers");
  const kind=Object.keys(regions).length?"region":Object.keys(countries).length?"country":null;
  if(!kind)return null;
  const triggerMap=kind==="region"?regions:countries;
  const triggerIds=Object.entries(triggerMap).filter(([,v])=>v===true).map(([k])=>k);
  const excludedTriggerIds=Object.entries(triggerMap).filter(([,v])=>v===false).map(([k])=>k);
  const event=eventById.get(block.id);
  if(!event)return null;
  return{
    kind,
    triggerIds,
    excludedTriggerIds,
    scriptId:block.id,
    executionOdds:scalar(block,"executionOdds")??100,
    firstMonth,
    lastMonth,
    ...event
  };
}
const entries=scriptBlocks.map(parseScript).filter(Boolean);
const regions=entries.filter(x=>x.kind==="region");
const countries=entries.filter(x=>x.kind==="country");
const data={
  meta:{
    mod:"XPiratez",
    version:"v.o1.1.1",
    sourceFile:"Piratez_Events.rul",
    rule:"firstMonth: 0 + lastMonth: 0 + base region/country trigger",
    rawEventCount:entries.length,
    regionEventCount:regions.length,
    countryEventCount:countries.length
  },
  regions,
  countries
};
process.stdout.write(JSON.stringify(data,null,2)+"\n");
