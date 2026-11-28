// V147: same-battle Shambler corpse recovery + exact fixed extraction.
// No post-hoc loot injection into already completed V146 battles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const sha=b=>createHash('sha256').update(b).digest('hex');
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
export function createWarriorSupplyGate(data,snapshot,raw,primal,root){
 const {files,items,manufacture,alienRaces,alienMissions,alienDeployments,units,armors}=raw;
 const dir=path.join(root,'tools/headless-simulator/native'),lock=JSON.parse(fs.readFileSync(path.join(dir,'source.lock.json'),'utf8')),archive=path.join(dir,lock.archive);
 assert.equal(sha(fs.readFileSync(archive)),lock.archiveSha256);
 const cpp=execFileSync('tar',['--force-local','-xOf',archive,'./src/Battlescape/DebriefingState.cpp'],{encoding:'utf8',maxBuffer:8*1024*1024});
 assert(cpp.includes('rule->isCorpseRecoverable()')&&cpp.includes('addItemsToBaseStores(corpseUnit->getArmor()->getCorpseGeoscape(), base, 1, true)'));
 const dep='STR_LOC_MONSTER_HUNT_PRIMAL_SHAMBLER',race='STR_MONSTER_RACE',unit='STR_SHAMBLER_TERRORIST',armor='SHAMBLER_ARMOR',corpse='STR_SHAMBLER_CORPSE',recipe='STR_SHAMBLER_CORPSE_EXTRACTION';
 assert.equal(alienMissions[dep].raceWeights[0][race],100);
 assert.equal(alienRaces[race].members[0],unit);
 assert(alienDeployments[dep].data.some(row=>row.alienRank===0&&row.lowQty>=1));
 assert.equal(units[unit].armor,armor);assert.equal(armors[armor].corpseGeo,corpse);
 const body=armors[armor].corpseBattle[0];assert.equal(body,'SHAMBLER_CORPSE_1');assert.equal(items[body].battleType,11);assert(items[body].recover!==false&&items[body].recoverCorpse!==false&&items[corpse]);
 const m=manufacture[recipe];assert.deepEqual(m.requires,[corpse,'STR_SKINNING']);assert.deepEqual(m.requiredItems,{[corpse]:1});assert.deepEqual(m.producedItems,{STR_LUXURY_FUR:3,STR_BIG_BONE:2,STR_MONSTER_TEETH:4,STR_MUTANT_MEAT:9});assert.equal(m.cost,100);assert.equal(m.time,100);
 assert(Object.keys(m).every(k=>['name','category','requires','space','time','cost','requiredItems','producedItems','listOrder'].includes(k)));
 const recoverAction=month=>({type:'conditionalPrimalCorpseVictory',victory:primal.action('Shambler',month),race,unit,armor,battleCorpse:body,item:corpse,count:1,assumeIntactCorpseRecovery:true,sourceFileSha256:files['Piratez_Factions.rul'],armorSourceSha256:files['Piratez_Armors.rul'],nativeArchiveSha256:lock.archiveSha256});
 const extractAction={type:'conditionalWarriorExtraction',recipe,count:1,assumeProductionTime:true,sourceFileSha256:files['Piratez.rul'],nativeArchiveSha256:lock.archiveSha256};
 function apply(w,a){
  if(!['conditionalPrimalCorpseVictory','conditionalWarriorExtraction'].includes(a.type))return primal.apply(w,a);
  try{
   assert.equal(w.sourceFingerprint,snapshot.sourceFingerprint);assert(!w.pendingFree);
   if(a.type==='conditionalPrimalCorpseVictory'){
    assert.deepEqual(a,recoverAction(a.victory.month));assert(!w.completedMissions?.has(dep));
    const r=primal.apply(w,a.victory);assert(r.ok,r.reason);assert(r.world.completedMissions.has(dep));
    r.world.items[corpse]=(r.world.items[corpse]||0)+1;
    r.world.conditionalPrimalCorpseRecoveries=[...(r.world.conditionalPrimalCorpseRecoveries||[]),{deployment:dep,race,unit,armor,item:corpse,count:1,month:a.victory.month}];
    return {...r,assumed:true,notes:[...(r.notes||[]),'same-battle-intact-corpse-recovery-conditional']};
   }
   assert.deepEqual(a,extractAction);assert(m.requires.every(k=>active(w,k)));assert((w.items[corpse]||0)>=1);assert(Number.isFinite(w.funds)&&w.funds>=m.cost,'insufficient funds for extraction');
   const z=structuredClone(w);z.funds-=m.cost;z.items[corpse]--;for(const [k,n] of Object.entries(m.producedItems))z.items[k]=(z.items[k]||0)+n;
   z.conditionalWarriorExtractions=[...(z.conditionalWarriorExtractions||[]),{recipe,month:w.month,hours:m.time,cost:m.cost,input:m.requiredItems,output:m.producedItems}];
   return {ok:true,world:z,assumed:true,notes:['raw-complete-fixed-output','cash-and-materials-debited','production-clock-conditional']};
  }catch(e){return {ok:false,world:w,reason:String(e.message||e)};}
 }
 return {apply,recoverAction,extractAction};
}
