// V152: preserve old replay namespaces; extend native corpse defaults and
// recursively compose raw manufacture paths with current capture sources.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createResearchSupply} from './campaign-forward-research-supply-v148.mjs';
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const sha=b=>createHash('sha256').update(b).digest('hex');
export function createMedicalSupply(data,snapshot,raw,base,root){
 const dir=path.join(root,'tools/headless-simulator/native'),lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=execFileSync('tar',['--force-local','-xOf',archive,'./src/Mod/Armor.cpp'],{encoding:'utf8',maxBuffer:4*1024*1024});
 assert(cpp.includes('_corpseGeoName = _corpseBattleNames.at(0);')&&cpp.includes('reader["corpseGeo"]'));
 const armors=Object.fromEntries(Object.entries(raw.armors).map(([id,a])=>[id,a.corpseGeo===undefined&&a.corpseBattle?.length?{...a,corpseGeo:a.corpseBattle[0]}:a]));
 const corrected=createResearchSupply(data,snapshot,{...raw,armors},base);
 const recipes=new Map(),allowed=new Set(['name','type','category','requires','requiresBaseFunc','space','time','cost','requiredItems','producedItems','randomProducedItems','refund','listOrder']);
 for(const [id,r] of Object.entries(raw.manufacture)){
  if(!Object.keys(r).every(k=>allowed.has(k)))continue;
  for(const [item,n] of Object.entries(r.producedItems||{}))if(n>0){if(!recipes.has(item))recipes.set(item,[]);recipes.get(item).push({recipe:id,quantity:n});}
 }
 function prove(w,item,seen=new Set(),depth=0,allowStock=true){
  if(!raw.items[item]||seen.has(item)||depth>6)return null;
  if(allowStock&&(w.items[item]||0)>0)return {kind:'stock',item};
  // Use only a freshly checked source, not a previously held item.
  const current={...w,items:{...w.items,[item]:0}};
  const old=base.action(current,item,1);
  if(old)return {kind:'prior-source',action:old};
  // The older abstract catalog ignores some month bounds. For the newly
  // recovered corpse entries, select a currently/future eligible raw route.
  // Do not use an expired early-game script or claim a past recovery.
  const at=(table,m)=>table?.[Object.keys(table||{}).map(Number).filter(k=>k<=m).sort((a,b)=>b-a)[0]]||{};
  for(const candidate of corrected.catalog.get(item)||[]){
   if(candidate.kind!=='mission'||candidate.route!=='corpse')continue;
   const s=raw.missionScripts[candidate.script],m=raw.alienMissions[candidate.mission];
   if(!s||!m||s.useTable!==false||(s.executionOdds??100)<=0)continue;
   const month=Math.max(w.month,s.firstMonth??0);
   if(!Number.isInteger(month)||(s.lastMonth>=0&&month>s.lastMonth))continue;
   if(w.difficulty<(s.minDifficulty??0)||w.difficulty>(s.maxDifficulty??4))continue;
   if(!Object.entries(s.researchTriggers||{}).every(([k,v])=>typeof v==='boolean'&&active(w,k)===v))continue;
   if(!Object.entries(s.facilityTriggers||{}).every(([k,v])=>typeof v==='boolean'&&w.facilities.has(k)===v))continue;
   if(!Object.entries(s.itemTriggers||{}).every(([k,v])=>typeof v==='boolean'&&((w.items[k]||0)+(w.otherItems?.[k]||0)>0)===v))continue;
   if(!(at(s.missionWeights,month)[candidate.mission]>0)||!(at(m.raceWeights,month)[candidate.race]>0))continue;
   const a=armors[raw.units[candidate.unit]?.armor];
   if(a?.corpseGeo!==item)continue;
   return {kind:'native-corpse-default-source',proof:{item,...candidate,access:'eligible-corpse-mission',month}};
  }
  const next=new Set(seen);next.add(item);
  for(const p of recipes.get(item)||[]){
   const r=raw.manufacture[p.recipe];
   if(!(r.requires||[]).every(k=>active(w,k))||!(r.requiresBaseFunc||[]).every(k=>w.baseFunctions.has(k)))continue;
   const inputs=[];let ok=true;
   for(const [k,n] of Object.entries(r.requiredItems||{})){
    if(!Number.isSafeInteger(n)||n<1){ok=false;break;}
    const p=prove(w,k,next,depth+1);if(!p){ok=false;break;}inputs.push({item:k,quantity:n,proof:p});
   }
   if(ok)return {kind:'composed-fixed-manufacture',recipe:p.recipe,quantity:p.quantity,inputs};
  }
  return null;
 }
 function action(w,item,minimum=1){
  if(!Number.isSafeInteger(minimum)||minimum<1||minimum>10000||(w.items[item]||0)>=minimum)return null;
  const old=base.action(w,item,minimum);if(old)return old;
  const proof=prove(w,item,new Set(),0,false);if(!proof)return null;
  return {type:'researchSupplyV152',item,minimum,proof,sourceFingerprint:snapshot.sourceFingerprint,nativeArchiveSha256:lock.archiveSha256,researchOnly:true,assumeSourceAccess:true,assumeRequiredQuantity:true};
 }
 function apply(w,a){
  if(a.type!=='researchSupplyV152')return base.apply(w,a);
  try{
   assert(w.researchOnly===true&&w.sourceFingerprint===snapshot.sourceFingerprint&&!w.pendingFree);
   assert.deepEqual(a,action(w,a.item,a.minimum));
   const z=structuredClone(w);z.items[a.item]=a.minimum;
   return {ok:true,world:z,assumed:true,notes:['native-armor-default-or-composed-raw-manufacture','research-only-source-availability','not-native-certified']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {apply,action,award:base.award,counts:{defaultedCorpseArmors:Object.keys(armors).filter(k=>armors[k].corpseGeo!==raw.armors[k].corpseGeo).length,corrected:corrected.counts,composableItems:recipes.size}};
}
