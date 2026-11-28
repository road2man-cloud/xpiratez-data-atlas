// Produce source-backed research prefixes only. No soldier RNG/economy simulation.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {campaignStartWorld,availableResearch,replayCampaignStart} from '../public/soldiers/modern/campaign-start-gate-v1.js';
import {createCampaignStartResearchPlanner} from '../public/soldiers/modern/campaign-start-research-planner-v1.js';
const args=Object.fromEntries(process.argv.slice(2).filter(s=>s.includes('=')).map(s=>s.replace(/^--/,'').split(/=(.*)/s).slice(0,2)));
const repo=args.repo||process.cwd(),game=args.game||'C:/Dioxine_XPiratez_o2.1/Dioxine_XPiratez';
const require=createRequire(path.join(repo,'package.json')),yaml=require('js-yaml');
const read=p=>JSON.parse(fs.readFileSync(path.join(repo,p),'utf8'));
const d=read('public/data/soldiers-modern-index.json'),catalog=read('public/data/soldier-source-catalog.json');
if(d.meta.mod.version!=='v.o2')throw Error('wrong-game-version');
d.sourceItemIds=new Set(catalog.itemIds);
const rules=path.join(game,'user/mods/Piratez/Ruleset'),files={},facilities={},items={},research={};
let base,date;
function load(p,expected){
 const bytes=fs.readFileSync(p),h=createHash('sha256').update(bytes).digest('hex');
 if(expected&&expected!==h)throw Error('source-hash-mismatch:'+p);
 files[path.basename(p)]=h;
 const doc=yaml.load(bytes.toString('utf8'),{json:true})||{};
 if(doc.startingBase)base=doc.startingBase;
 if(doc.startingTime)date=doc.startingTime;
 for(const [key,target] of Object.entries({facilities,items,research}))for(const row of doc[key]||[]){
  if(row.delete){delete target[row.delete];continue;}
  const id=row.type||row.name;if(id)target[id]={...target[id],...row};
 }
}
for(const name of ['vars','startingBase','facilities','items','research'])load(path.join(game,'standard/xcom1',name+'.rul'));
for(const e of [...d.meta.source.rules].sort((a,b)=>a.file.localeCompare(b.file,'en')))load(path.join(rules,e.file),e.sha256);
const researchGrants={};
for(const [id,r] of Object.entries(research)){
 const grants={};
 if(r.spawnedItem&&items[r.spawnedItem])grants[r.spawnedItem]=r.spawnedItemCount??1;
 for(const k of r.spawnedItemList||[])if(items[k])grants[k]=(grants[k]||0)+1;
 if(Object.keys(grants).length)researchGrants[id]=grants;
}
d.campaignAssets={sourceFingerprint:d.meta.source.metadataSha256,facilities,items,researchGrants};
const layout=base.facilities.map(f=>({id:f.type,x:f.x,y:f.y,complete:!(f.buildTime>0),readyDay:f.buildTime||0}));
const complete=layout.filter(f=>f.complete),functions=[...new Set(complete.flatMap(f=>facilities[f.id]?.provideBaseFunc||[]))].sort();
const snapshot={sourceFingerprint:d.meta.source.metadataSha256,items:base.items,facilities:complete.map(f=>f.id),functions,baseLayout:layout,
 funds:0,difficulty:Number(args.difficulty??1),researched:[],disabled:[],soldiers:[],startDate:date};
const initial=campaignStartWorld(d,snapshot);
const targets=(args.targets||'STR_JACKSTOWN_SCOUTING,STR_WAT_DO,STR_RECRUIT_PEASANTS,STR_INSPECT_MACHINERY,STR_CAPTAIN_PERSONALITY_TEST,STR_CODEX_GOLD').split(',');
const records=[];
for(const goal of targets){
 const planner=createCampaignStartResearchPlanner(d,snapshot,{maxAttempts:Number(args.attempts||250),maxDepth:40,collectFailures:true});
 const result=planner.ensure([goal]);
 const actions=result.ok?result.node.steps:[];
 const replay=result.ok?replayCampaignStart(actions,d,snapshot):null;
 records.push({goal,status:replay?.ok?'conditional-replay':'repair-pending',actions,reason:result.ok?replay?.reason:result.reason,
  attempts:result.attempts,trace:replay?.trace?.map(t=>({index:t.index,action:t.action,added:t.added,disabled:t.disabled,availableBefore:t.availableBefore,availableAfter:t.availableAfter})),
  failures:result.failures?.slice(-8),deadEnds:result.deadEnds?.slice(-8),gameCertified:false});
}
const out={schema:'ATLAS_CAMPAIGN_RESEARCH_PREFIX_V1',scope:'RESEARCH_ONLY_NO_ECONOMY_NO_START_SOLDIER_RNG',sourceMetadataSha256:d.meta.source.metadataSha256,sourceFiles:files,
 snapshot,initialResearch:availableResearch(initial,d),records,summary:{targets:records.length,produced:records.filter(r=>r.status==='conditional-replay').length}};
if(args.out)fs.writeFileSync(args.out,JSON.stringify(out,null,2));
console.log(JSON.stringify({initialResearch:out.initialResearch,functions,summary:out.summary,records:records.map(r=>({goal:r.goal,status:r.status,actions:r.actions.map(a=>a.id||a.research||a.item||a.type),reason:r.reason,failures:r.failures?.slice(-2)}))}));
