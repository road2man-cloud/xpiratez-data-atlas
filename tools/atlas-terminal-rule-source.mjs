// Source-backed terminal campaign targets. No complete-campaign claim is
// made from a research unlock or a static deployment alone.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import yaml from "js-yaml";
import {sha,key} from "./population-research-career-core.mjs";
export function extractTerminalRules(modern,gameRoot){
 const root=path.join(gameRoot,"user/mods/Piratez");
 const manifest=JSON.parse(fs.readFileSync("public/ruleset/manifest.json"));
 assert.equal(manifest.sourceVersion,"v.o2");
 const files={},maps={},refs={};
 function merge(section,rows,file){
  if(!Array.isArray(rows))return;
  const m=maps[section]??=new Map();
  for(const r of rows){
   if(!r||typeof r!=="object")continue;
   if(r.delete){m.delete(r.delete);continue;}
   const id=r.name||r.type||r.id;if(!id)continue;
   m.set(id,{...m.get(id),...r});
   (refs[section+"|"+id]??=[]).push(file);
  }
 }
 const sections=["research","alienDeployments","cutscenes","crafts","manufacture","missionScripts","alienMissions","startingConditions"];
 function parse(bytes,file,allowed=sections){const d=yaml.load(bytes.toString("utf8"),{json:true});for(const s of allowed)merge(s,d?.[s],file);}
 const base="standard/xcom1/alienDeployments.rul",baseBytes=fs.readFileSync(path.join(gameRoot,base));
 parse(baseBytes,base,["alienDeployments"]);files[base]=sha(baseBytes);
 // Manifest-bound mod files. json:true matches the project's treatment of
 // repeated YAML keys; merged base fields survive an incremental override.
 const manifestRules=manifest.files.filter(x=>x.path.startsWith("Ruleset/")&&x.path.endsWith(".rul")).sort((a,b)=>a.path.localeCompare(b.path,"en"));
 for(const e of manifestRules){const bytes=fs.readFileSync(path.join(root,e.path));assert.equal(sha(bytes),e.sha256,e.path);assert.equal(bytes.length,e.bytes,e.path);files[e.path]=e.sha256;parse(bytes,e.path);}
 const lang=manifest.files.find(e=>e.path==="Language/ko.yml"),lb=fs.readFileSync(path.join(root,lang.path));assert.equal(sha(lb),lang.sha256);files[lang.path]=lang.sha256;
 const names=yaml.load(lb.toString("utf8"),{json:true}).ko;
 const get=(s,id)=>maps[s]?.get(id);
 const evidence=(s,id)=>({id,name:names?.[id]||id,sources:refs[s+"|"+id]||[]});
 const fields=(r,keys)=>Object.fromEntries(keys.filter(k=>r?.[k]!==undefined).map(k=>[k,r[k]]));
 const researchFlags=[...maps.research].filter(([,r])=>r.unlockFinalMission===true).map(([id,r])=>({...evidence("research",id),...fields(r,["requires","dependencies","requiresBaseFunc","unlockFinalMission","cost"])}));
 const winners=[...maps.cutscenes].filter(([,r])=>r.winGame===true).map(([id])=>({...evidence("cutscenes",id),winGame:true}));
 const winSet=new Set(winners.map(x=>x.id));
 const deployments=[...maps.alienDeployments].filter(([,r])=>winSet.has(r.winCutscene)).map(([id,r])=>({...evidence("alienDeployments",id),...fields(r,["winCutscene","nextStage","startingCondition","finalDestination","loseCutscene","abortCutscene"])}));
 const spacecraft=[...maps.crafts].filter(([,r])=>r.spacecraft===true).map(([id,r])=>({...evidence("crafts",id),...fields(r,["requires","spacecraft","pilots","soldiers","fuelMax"]),manufacture:fields(get("manufacture",id),["requires","requiresBaseFunc","requiredItems","cost","time","space"])}));
 function chain(id){const list=[],seen=new Set();while(id){assert(!seen.has(id),"Deployment cycle "+id);seen.add(id);const r=get("alienDeployments",id);assert(r,"Unknown deployment "+id);list.push({...evidence("alienDeployments",id),...fields(r,["nextStage","winCutscene","startingCondition","finalDestination","loseCutscene","abortCutscene"])});// Engine advances a successful nextStage before considering cutscenes.
   if(r.nextStage){id=r.nextStage;continue;}
   return winSet.has(r.winCutscene)?list:null;}return null;}
 const targets=[];
 for(const [id,r] of maps.alienDeployments)if(r.finalDestination===true){const stages=chain(id);if(!stages)continue;const sc=get("startingConditions",r.startingCondition);
  const allowed=(sc?.allowedCraft||spacecraft.map(c=>c.id));
  for(const c of spacecraft.filter(c=>allowed.includes(c.id))){const goals=[...new Set([...researchFlags.map(x=>x.id),...(c.requires||[]),...(c.manufacture.requires||[])])];targets.push({id:"CRAFT:"+c.id,kind:"FINAL_DESTINATION",researchGoals:goals,requiredItems:c.manufacture.requiredItems||{},baseFunctions:c.manufacture.requiresBaseFunc||[],craft:c.id,stages,launchConditions:["SINGLE_CRAFT","FULL_FUEL","PILOTS_ONBOARD","STARTING_CONDITION"],sourceScope:"BASE_XCOM1_PLUS_HASH_MATCHED_MOD"});}
 }
 for(const [id,r] of maps.missionScripts){
  const missionIds=[...new Set(Object.values(r.missionWeights||{}).flatMap(o=>Object.entries(o).filter(([,n])=>n>0).map(([k])=>k)))];
  for(const m of missionIds){const am=get("alienMissions",m);if(!am?.siteType)continue;const stages=chain(am.siteType);if(!stages)continue;
   targets.push({id:"SCRIPT:"+id+":"+m,kind:"MISSION_SCRIPT",script:id,mission:m,scriptRule:{...evidence("missionScripts",id),...fields(r,["researchTriggers","itemTriggers","executionOdds","startDelay","randomDelay","targetBaseOdds","useTable","minMonth","maxMonth","difficulty","conditionals","maxRuns"])},researchGoals:Object.entries(r.researchTriggers||{}).filter(([,v])=>v===true).map(([k])=>k),inactiveResearch:Object.entries(r.researchTriggers||{}).filter(([,v])=>v===false).map(([k])=>k),requiredItems:Object.fromEntries(Object.entries(r.itemTriggers||{}).filter(([,v])=>v===true).map(([k])=>[k,1])),itemTriggerValues:r.itemTriggers||{},stages,sourceScope:"HASH_MATCHED_MOD"});
  }
 }
 // Retain the complete direct research dependency list as a scheduling index,
 // not an AND proof: dependencies may be bypassed by actual unlock actions.
 for(const t of targets){
  const seen=new Set(),q=[...t.researchGoals];
  while(q.length){const k=q.pop();if(seen.has(k))continue;seen.add(k);const r=get("research",k);if(r)q.push(...(r.requires||[]),...(r.dependencies||[]));}
  t.dependencyTopics=[...seen].sort();t.researchRules=Object.fromEntries(t.researchGoals.map(k=>[k,{...evidence("research",k),...fields(get("research",k),["requires","dependencies","needItem","destroyItem","cost","requiresBaseFunc"])}]));
  t.terminalCutscene=t.stages.at(-1).winCutscene;
 }
 const archive="tools/headless-simulator/native/oxce-source.tar.gz",src={};
 const patterns={"src/Geoscape/SelectDestinationState.cpp":["getSpacecraft()","getFinalResearch()","getFuelPercentage() < 100","arePilotsOnboard"],"src/Geoscape/ConfirmCydoniaState.cpp":["isFinalDestination()","setMissionType(ad)"],"src/Battlescape/BattlescapeState.cpp":["getNextStage()","getWinCutscene()","getWinGame()","setEnding(END_WIN)"],"src/Mod/RuleResearch.cpp":["unlockFinalMission"],"src/Mod/AlienDeployment.cpp":["finalDestination","winCutscene"]};
 for(const [p,ss] of Object.entries(patterns)){const b=execFileSync("tar",["-xOf",archive,"./"+p],{maxBuffer:16*1024*1024}),lines=b.toString().split(/\r?\n/);src[p]={sha256:sha(b),markers:ss.map(s=>{const line=lines.findIndex(l=>l.includes(s))+1;assert(line,s);return {marker:s,line};})};}
 const result={schema:"ATLAS_TERMINAL_RULE_SOURCE_V1",status:"RULES_AND_PRESERVED_ENGINE_EXTRACTED",sourceMetadataSha256:modern.meta.source.metadataSha256,modVersion:"v.o2",modRuleFiles:manifestRules.length,sourceFiles:files,baseRuleHash:files[base],engine:{archiveSha256:sha(fs.readFileSync(archive)),scope:"PRESERVED_OXCE_8_7_1_SOURCE_NOT_INSTALLED_BINARY_PARITY",files:src},researchFlags,winners,deployments,spacecraft,targets,limitations:["Effective active-mod load order and installed executable parity not certified","Research readiness does not prove mission spawn or victory","No campaign resource, growth, survival or successor closure proof"]};
 return {...result,fingerprint:key(result)};
}
