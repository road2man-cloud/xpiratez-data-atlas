// Reattach route-level suffix evidence to the current shared registry, never
// overwrite unrelated growth, exact-resource or career evidence.
import fs from "node:fs";
import zlib from "node:zlib";
import {createHash} from "node:crypto";
import {decodeOriginReport} from "./origin-report-codec.mjs";
const path="public/data/branch-soldier-results.json.gz",artifact=process.argv[2]||"origin-extension-results.json.gz";
const db=JSON.parse(zlib.gunzipSync(fs.readFileSync(path))),a=JSON.parse(zlib.gunzipSync(fs.readFileSync(artifact)));
const rawArchive=fs.readFileSync("public/data/soldier-origin-candidates.json"),archive=decodeOriginReport(rawArchive);
const sha=x=>createHash("sha256").update(x).digest("hex"),byOrigin=new Map(archive.records.map(r=>[r.profileId,r]));
if(a.sourceMetadataSha256!==db.sourceMetadataSha256||a.archiveSha256!==sha(rawArchive)||a.archiveSourceHash!==archive.sourceHash||a.rows.length!==72||a.summary.actualGameCertified!==0)throw Error("Origin extension source mismatch");
const branches=new Map(db.branches.map(b=>[b.id,b]));
const originRows={},ids=new Set(db.originExtension12?.witnessIds||[]);
let novel=0;const newOrigins=new Set();
for(const row of a.rows){
 const r=byOrigin.get(row.profileId);if(!r)throw Error("Unknown origin");
 const candidates=new Map(r.candidates.map(c=>[c.id,c]));
 const archivedOrders=new Set(r.candidates.map(c=>JSON.stringify(c.transforms)));
 for(const id of row.routeIds){
  const w=a.witnesses[id],e=w.originExtension,seed=candidates.get(e.seed);
  if(!seed||w.originProfile!==r.profileId||w.source!=="ORIGINEXT12"||w.actualGameCertified!==false||w.vector.length!==12||
   JSON.stringify(w.steps.map(s=>s.id))!==JSON.stringify([...seed.transforms,...e.appended])||
   w.branchIds.some(id=>!branches.has(id)||branches.get(id).sourceRootConflict))throw Error("Invalid suffix witness "+id);
  if(!archivedOrders.has(JSON.stringify(w.steps.map(s=>s.id)))){novel++;newOrigins.add(r.profileId);}
  if(db.witnesses[id]&&JSON.stringify(db.witnesses[id])!==JSON.stringify(w))throw Error("Existing suffix witness changed "+id);
  db.witnesses[id]=w;ids.add(id);
 }
 const prior=db.originExtension12?.records?.[row.profileId];
 originRows[row.profileId]={...row,routeIds:[...new Set([...(prior?.routeIds||[]),...row.routeIds])]};
}
const all=[...ids],summary={...a.summary,registered:all.length,novelArchiveOrders:novel,novelOrderOrigins:newOrigins.size,
 extendedOrigins:Object.values(originRows).filter(r=>r.routeIds.length).length,
 bodyCount:new Set(all.map(id=>db.witnesses[id].body)).size,
 branchLinked:all.filter(id=>db.witnesses[id].branchIds.length).length,
 canonicalRootMatchedBranches:new Set(all.flatMap(id=>db.witnesses[id].branchIds)).size};
db.originExtension12={schemaVersion:1,sourceMetadataSha256:a.sourceMetadataSha256,archiveSha256:a.archiveSha256,archiveSourceHash:a.archiveSourceHash,seedsPerOrigin:a.seedsPerOrigin,maxAppendDepth:a.maxAppendDepth,summary,records:originRows,witnessIds:all,scope:"Replayed archive prefix; active research only; deterministic suffix with conditional combat cap placement, assumed direct resources, unchanged actual birth rank. Canonical root equality, not a joined shared research history."};
db.summary.originExtension12=summary;
db.sources.ORIGINEXT12={file:"public/data/soldier-origin-candidates.json",sha256:a.archiveSha256,sourceMetadataSha256:a.sourceMetadataSha256};
db.policies.ORIGINEXT12="기존 출생 연구·시술 이력을 재생한 뒤 실제 활성 연구만 이용해 최대 2회 후속 시술. 전투 성장캡 배치·실물·자금 조건부, 새 연구·승급·훈장 획득 없음. 관측된 정식 분기 뿌리 일치만 연결하며 공통 연구 이력 공동 재생은 미인증.";
db.summary.registeredWitnesses=Object.keys(db.witnesses).length;
fs.writeFileSync(path,zlib.gzipSync(Buffer.from(JSON.stringify(db)),{level:6}));
console.log(JSON.stringify(summary));
