// A readiness index for concrete research transactions. A rejected proposal
// is not a proof that the topic can never be acquired. All admitted actions
// still run through the chronological replay verifier.
const arr=x=>Array.isArray(x)?x:[];
const active=(w,k)=>w.researched.has(k)&&!w.disabled.has(k);
const primary=new Set(["research","repeatResearch","eventResearch","missionResearch"]);
export function createTransactionReadiness(data){
 const rules=data.researchRules,unlocks=new Map(),events=new Map(),missions=new Map();
 for(const [id,r] of Object.entries(rules))for(const k of arr(r.unlocks)){const a=unlocks.get(k)||[];a.push(id);unlocks.set(k,a);}
 for(const [k,sources] of Object.entries(data.eventResearchSources||{}))for(const s of sources)for(const a of arr(s.scripts))events.set(k+"|"+s.event+"|"+a.script,a);
 for(const [k,sources] of Object.entries(data.missionResearchSources||{}))for(const s of sources)for(const a of arr(s.scripts))missions.set(k+"|"+s.deployment+"|"+a.script,a);
 function check(w,steps){
  const a=steps.find(x=>primary.has(x.type));if(!a)return null;
  const id=a.research||a.id,r=rules[id];if(!r)return null;
  if(w.pendingFree)return "PENDING_FREE";
  if(w.disabled.has(id))return "DISABLED_TOPIC";
  if(a.type==="research"||a.type==="repeatResearch"){
   if(a.type==="research"&&w.researched.has(id))return "ALREADY_RESEARCHED";
   if(a.type==="repeatResearch"&&!active(w,id))return "REPEAT_SOURCE_ABSENT";
   if(arr(r.requires).length)return "DIRECT_REQUIRES";
   // Matches researchStep's completed-topic bypass exactly. Do not confuse
   // dependencies with requires or discard an unlocked laboratory path.
   if(!arr(unlocks.get(id)).some(k=>w.researched.has(k))&&arr(r.dependencies).some(k=>!w.researched.has(k)))return "LAB_DEPENDENCIES";
   for(const f of steps.filter(x=>x.type==="freeResearch")){
    if(w.researched.has(f.research)||w.disabled.has(f.research))return "FREE_TARGET_NOT_AVAILABLE";
    if(f.source!==id)continue; // Nested outcomes are verified by replay.
    const possible=arr(r.getOneFree).includes(f.research)||Object.entries(r.getOneFreeProtected||{}).some(([k,v])=>w.researched.has(k)&&arr(v).includes(f.research));
    if(!possible)return "FREE_PROTECTION";
    break;
   }
  }else{
   if(w.researched.has(id))return "EVENT_TOPIC_ALREADY_ACTIVE";
   const s=a.type==="eventResearch"?events.get(id+"|"+a.event+"|"+a.script):missions.get(id+"|"+a.deployment+"|"+a.script);
   if(s){
    if(arr(s.researchPositive).some(k=>!active(w,k)))return "SCRIPT_POSITIVE_RESEARCH";
    if(arr(s.researchNegative).some(k=>active(w,k)))return "SCRIPT_NEGATIVE_RESEARCH";
    if(arr(s.oneTimeEarlier).some(k=>!w.generatedEvents?.[k]))return "SCRIPT_EARLIER_EVENT";
    if(Number.isFinite(s.firstMonth)&&w.month<s.firstMonth)return "SCRIPT_TOO_EARLY";
    if(Number.isFinite(s.lastMonth)&&w.month>s.lastMonth)return "SCRIPT_TOO_LATE";
   }
  }
  return null;
 }
 return {check};
}
