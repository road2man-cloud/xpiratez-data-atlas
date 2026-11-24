import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {createHash} from "node:crypto";

// A lazy-loaded extension of the common registry, not a second DB or viewer.
export function attachExactResourceIndex(db,dir,publicDir){
 const classes={};
 const branches=new Map(db.branches.filter(b=>b.legacyKey).map(b=>[b.legacyKey,b]));
 for(const [cls,combo] of [["damsel","D_W"],["madgal","M_M"]]){
  const filename="branch-soldier-d5-exact-"+cls+".json.gz",bytes=fs.readFileSync(path.join(dir,filename));
  const a=JSON.parse(zlib.gunzipSync(bytes));
  if(a.kind!=="XPZ_D5_EXACT_RESOURCE_INDEX"||a.classKey!==cls||a.depth!==5||a.mode!=="CAP_TARGET"||
   a.sourceMetadataSha256!==db.sourceMetadataSha256||a.stats.join(",")!==db.stats.join(",")||
   a.stateStride!==2+3*a.stats.length||a.labelStride!==4||a.resourceStride!==8||
   a.states.length!==a.metrics.states*a.stateStride||a.labels.length!==a.metrics.labels*a.labelStride||
   a.resources.length!==a.metrics.distinctMultisets*a.resourceStride)throw Error("Exact index version or schema mismatch "+cls);
  for(const [key,pid] of a.parentCases){
   const b=branches.get(key),id=combo+"|CAP_TARGET|"+pid;
   if(!b||b.results?.[combo]?.CAP_TARGET!==id||!db.profiles[id]||!Object.hasOwn(a.profileMasks,pid))
    throw Error("Exact index branch crosswalk mismatch "+key);
  }
  for(const id of a.ruleOrder)if(!db.ruleDetails[id])throw Error("Missing rule "+id);
  const sha256=createHash("sha256").update(bytes).digest("hex");
  classes[cls]={file:filename,sha256,bytes:bytes.length,combo,body:a.body,...a.metrics};
  if(publicDir)fs.writeFileSync(path.join(publicDir,filename),bytes);
 }
 db.summary.exactResourceIndex={schemaVersion:1,mode:"CAP_TARGET",depth:5,classes,
  scope:{allRecordedNodeMultisetLabels:true,staticResearchRiskProfiles:true,
   rankMedalAcquisitionNotSimulated:true,actualCampaignCertified:false}};
 db.sources.EXACTRESOURCE12={kind:"XPZ_D5_EXACT_RESOURCE_INDEX",files:Object.values(classes).map(x=>({file:x.file,sha256:x.sha256}))};
 return db.summary.exactResourceIndex;
}
