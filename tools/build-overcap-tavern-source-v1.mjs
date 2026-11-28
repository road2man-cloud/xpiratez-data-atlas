// V155: exact-source, deployment-specific tavern loot witness.
// The derived artifact is portable. Original game files are read only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const sha=b=>createHash('sha256').update(b).digest('hex');
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const root=arg('source',null);assert(root);
const yaml=createRequire(import.meta.url)(arg('yaml','js-yaml'));
const data=JSON.parse(fs.readFileSync('public/data/soldiers-modern-index.json'));
const hashes=data.meta.source.rules;
assert.equal(sha(fs.readFileSync(path.join(root,'metadata.yml'))),data.meta.source.metadataSha256);
const files=fs.readdirSync(path.join(root,'Ruleset')).filter(f=>f.toLowerCase().endsWith('.rul')).sort((a,b)=>a.localeCompare(b,'en'));
assert.deepEqual(files,hashes.map(x=>x.file).sort((a,b)=>a.localeCompare(b,'en')));
const arr=x=>Array.isArray(x)?x:[];
const wanted={missionScripts:['TavernCellar'],alienMissions:['STR_LOC_TAVERN_CELLAR'],alienDeployments:['STR_LOC_TAVERN_CELLAR'],terrains:['CATACOMBS'],mapScripts:['CATACOMBS_TAVERN_CELLAR'],startingConditions:['STR_STARCON_UNDERGROUND']};
function merge(a,b){if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){const out={...a};for(const [k,v] of Object.entries(b))out[k]=k in out?merge(out[k],v):v;return out;}return b;}
function resolve(v,depth=0){assert(depth<=32);const {refNode,...child}=v;return refNode&&typeof refNode==='object'&&!Array.isArray(refNode)?merge(resolve(refNode,depth+1),child):child;}
const entries=new Map();
for(const f of files){
 const bytes=fs.readFileSync(path.join(root,'Ruleset',f));assert.equal(sha(bytes),hashes.find(x=>x.file===f).sha256,f);
 yaml.loadAll(bytes.toString('utf8').replace(/^\uFEFF/,''),doc=>{
  for(const [k,ids] of Object.entries(wanted))for(const r of arr(doc?.[k])){
   const id=r.type||r.name||r.delete;if(!ids.includes(id))continue;
   if(r.delete){entries.delete(k+':'+id);continue;}
   const old=entries.get(k+':'+id);entries.set(k+':'+id,{value:old?merge(old.value,r):r,files:[...new Set([...(old?.files||[]),f])]});
  }
 },{json:true});
}
function get(k,id){const e=entries.get(k+':'+id);assert(e,k+':'+id);return {value:resolve(e.value),files:e.files};}
const dep=get('alienDeployments','STR_LOC_TAVERN_CELLAR'),script=get('missionScripts','TavernCellar'),mission=get('alienMissions',dep.value.type),terrain=get('terrains','CATACOMBS'),map=get('mapScripts',dep.value.script);
assert.equal(dep.value.script,'CATACOMBS_TAVERN_CELLAR');
assert.deepEqual(dep.value.terrains,['CATACOMBS']);
assert.equal(dep.value.unlockedResearch,'STR_LOC_TAVERN_CELLAR_DONE');
assert.equal(script.value.missionWeights['0'][dep.value.type],100);
const commands=map.value.commands;
assert.deepEqual(commands,[{type:'addBlock',groups:6},{type:'addBlock',groups:8},{type:'addBlock',size:2,groups:5},{type:'fillArea'}]);
const candidates=terrain.value.mapBlocks.filter(b=>b.width===20&&b.length===20&&[b.groups].flat().includes(5));
const blocks=candidates.filter(b=>['CATACOMBS_14','CATACOMBS_23'].includes(b.name)).map(b=>({name:b.name,width:b.width,length:b.length,groups:b.groups,items:b.items,randomizedItems:b.randomizedItems||[]}));
assert.equal(blocks.length,2);
assert.equal(blocks.find(b=>b.name==='CATACOMBS_14').items.STR_BOOK_OF_SERMONS.length,2);
assert.equal(blocks.find(b=>b.name==='CATACOMBS_23').items.STR_BOOK_OF_SERMONS.length,1);
const start=get('startingConditions',dep.value.startingCondition);
const report={schema:'ATLAS_OVERCAP_TAVERN_SOURCE_V1',sourceMetadataSha256:data.meta.source.metadataSha256,sourceFiles:hashes,script,mission,deployment:dep,mapScript:map,terrain:{name:terrain.value.name,defaultScript:terrain.value.script,files:terrain.files},startingCondition:start,candidateNames:candidates.map(b=>b.name),blocks,scope:'Deployment override and eligible map block evidence only. Mission generation, valid squad, placement, loot survival and extraction are conditional.'};
const out='tools/data/overcap-tavern-source-v1-'+sha(JSON.stringify(report)).slice(0,20)+'.json';
if(fs.existsSync(out))assert.deepEqual(JSON.parse(fs.readFileSync(out)),report);else fs.writeFileSync(out,JSON.stringify(report)+'\n',{flag:'wx'});
console.log(JSON.stringify({out,candidates:report.candidateNames,blocks:blocks.map(b=>({id:b.name,book:b.items.STR_BOOK_OF_SERMONS.length,oldBooks:b.randomizedItems.map(x=>({count:x.amount,pool:x.itemList.length,slots:x.itemList.filter(k=>k==='STR_OLD_BOOKS').length}))})),startingCondition:dep.value.startingCondition}));
