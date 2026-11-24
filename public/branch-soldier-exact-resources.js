// Exact terminal-label search within the published D5 numerical model.
// This extends the same registry: data are loaded only for an explicit query.
import {inflateArchivedGzip} from "./soldiers/modern/origin-gzip-compat.js";
import {summarizeRouteResources} from "./branch-soldier-resources.js";
import {exactColumns,unpackExactResourceIndex} from "./branch-soldier-exact-packed.js?v=1";
const BASE=64;
const resourceAxes=[["fees","직접 지출"],["recovery","회복 합계"],["transfer","이동 합계"],["actions","시술 횟수"]];
let loadedKey=null,loadedPromise=null;
export function exactResourceSpec(db,combo,mode,sha=null){
 const spec=db.summary?.exactResourceIndex;
 if(!spec||mode!==spec.mode)return null;
 const current=Object.values(spec.classes).find(x=>x.combo===combo)||null;
 if(!sha)return current;
 const version=spec.versions?.[sha]||(current?.sha256===sha?current:null);
 return version?.combo===combo?version:null;
}
export function validateExactResourceIndex(db,spec,a){
 const c=exactColumns(a);
 if(a.kind!=="XPZ_D"+(spec.depth??5)+"_EXACT_RESOURCE_INDEX"||a.schemaVersion!==1||a.body!==spec.body||a.depth!==(spec.depth??5)||a.mode!=="CAP_TARGET"||
  a.sourceMetadataSha256!==db.sourceMetadataSha256||a.stats.join(",")!==db.stats.join(",")||
  a.stateStride!==2+3*a.stats.length||a.labelStride!==4||a.resourceStride!==8||
  c.stateCount!==spec.states||c.labelCount!==spec.labels||
  c.resourceCount!==spec.distinctMultisets||a.masks.length!==spec.distinctMasks)
  throw Error("전체 상태 원장 버전/형식 불일치");
 return a;
}
export async function loadExactResourceIndex(db,combo,mode,sha=null){
 const spec=exactResourceSpec(db,combo,mode,sha);
 if(!spec)throw Error("현재 병종·성장 방식에는 전체 상태 검색이 연결되지 않았습니다.");
 const transport=spec.packedTransport||spec;
 const key=transport.file+"|"+transport.sha256;
 if(key!==loadedKey){
  loadedKey=key;
  loadedPromise=(async()=>{
   const url=new URL("./data/"+transport.file,import.meta.url);
   url.searchParams.set("sha",transport.sha256);
   const response=await fetch(url,{cache:"force-cache"});
   if(!response.ok)throw Error("전체 상태 원장 HTTP "+response.status);
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes.length!==transport.bytes)throw Error("전체 상태 원장 크기 불일치");
   if(globalThis.crypto?.subtle){
    const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(x=>x.toString(16).padStart(2,"0")).join("");
    if(hash!==transport.sha256)throw Error("전체 상태 원장 해시 불일치");
   }
   const plain=await inflateArchivedGzip(bytes);
   const a=spec.packedTransport?unpackExactResourceIndex(plain,spec.sha256):JSON.parse(new TextDecoder().decode(plain));
   return validateExactResourceIndex(db,spec,a);
  })().catch(error=>{if(loadedKey===key){loadedKey=null;loadedPromise=null;}throw error;});
 }
 return loadedPromise;
}
function decodeRules(a,code){
 const ids=[];
 while(code){
  const index=code%BASE-1,id=a.ruleOrder[index];
  if(!id)throw Error("전체 상태 경로 인코딩 오류");
  ids.push(id);code=Math.floor(code/BASE);
 }
 return ids;
}
function fullProfileId(a,pid){
 return (a.classKey==="damsel"?"D_W":"M_M")+"|CAP_TARGET|"+pid;
}
function profileEntries(a,profileIds){
 const allowed=profileIds?new Set(profileIds):null;
 return Object.entries(a.profileMasks).map(([pid,mask])=>[fullProfileId(a,pid),BigInt("0x"+mask)])
  .filter(([id])=>!allowed||allowed.has(id));
}
export function exactCompatibleProfiles(a,labelIndex,profileIds=null){
 const c=exactColumns(a),node=c.node(labelIndex),mask=BigInt("0x"+a.masks[c.mask(node)]);
 return profileEntries(a,profileIds).filter(([,blocked])=>(mask&blocked)===0n).map(([id])=>id);
}
function materialVector(a,code,itemIds,ruleItems){
 const sums=new Array(itemIds.length).fill(0);
 while(code){
  const r=code%BASE-1;
  if(!ruleItems[r])throw Error("재료 규칙 인코딩 오류");
  for(let i=0;i<sums.length;i++)sums[i]+=ruleItems[r][i];
  code=Math.floor(code/BASE);
 }
 return sums;
}
function lex(a,b){
 for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];
 return 0;
}
function dominates(a,b){return a.every((x,i)=>x<=b[i]);}
// All labels are scanned. Compress equal resource points only after checking
// BOTH the actual stat targets and the resource limits. The skyline is over
// the union of selected profiles, not a claim of preserving each profile's
// own skyline. Distinct item types are separate dimensions when selected.
export function queryExactResources(db,a,{profileIds,targets=[],resources={},minDepth=0,requiredRuleIds=[],excludedRuleIds=[]}={}){
 const K=a.stats.length,c=exactColumns(a);
 const profiles=profileEntries(a,profileIds),profileCount=profiles.length;
 const axes=[...resourceAxes,...Object.keys(resources.materialLimits||{}).sort().map(id=>[id,id])];
 const itemIds=axes.slice(4).map(([id])=>id);
 const itemLimits=itemIds.map(id=>resources.materialLimits[id]);
 const ruleItems=a.ruleOrder.map(id=>{
  const items=db.ruleDetails[id]?.requiredItems;
  if(!items||Array.isArray(items)||typeof items!=="object")throw Error("재료 규칙 누락: "+id);
  return itemIds.map(k=>{const n=items[k]??0;if(!Number.isSafeInteger(n)||n<0)throw Error("재료 수량 오류: "+id);return n;});
 });
 const maskCache=a.masks.map(m=>BigInt("0x"+m));
 const allowedMask=Uint8Array.from(maskCache,mask=>profiles.some(([,blocked])=>(mask&blocked)===0n)?1:0);
 const resourceCount=c.resourceCount,labelCount=c.labelCount;
 const allowedResource=new Uint8Array(resourceCount),extraItems=new Int32Array(resourceCount*itemIds.length);
 const ridBest=new Int32Array(resourceCount).fill(-1);
 const ridScore=new Float64Array(resourceCount).fill(-Infinity);
 const masksMatched=new Uint8Array(a.masks.length),stateMatched=new Uint8Array(c.stateCount);
 const bestStat=new Int32Array(K).fill(-1),bestStatValue=new Float64Array(K).fill(-Infinity);
 let eligibleResources=0;
 const required=new Set(requiredRuleIds),excluded=new Set(excludedRuleIds);
 function ruleFilter(code){
  if(!required.size&&!excluded.size)return true;
  const found=new Set();
  for(let n=code;n;n=Math.floor(n/BASE)){
   const id=a.ruleOrder[n%BASE-1];
   if(excluded.has(id))return false;
   if(required.has(id))found.add(id);
  }
  return found.size===required.size;
 }
 for(let rid=0;rid<resourceCount;rid++){
  const fee=c.res(rid,1),days=c.res(rid,2),hours=c.res(rid,3),actions=c.res(rid,4);
  if(actions<minDepth||resources.maxActions!=null&&actions>resources.maxActions||
   resources.maxFees!=null&&fee>resources.maxFees||resources.maxRecovery!=null&&days>resources.maxRecovery||
   resources.maxTransfer!=null&&hours>resources.maxTransfer||
   resources.noItems&&c.res(rid,5)||resources.noMedals&&c.res(rid,6)||resources.noFacilities&&c.res(rid,7))continue;
  if(!ruleFilter(c.resCode(rid)))continue;
  if(itemIds.length){
   const v=materialVector(a,c.resCode(rid),itemIds,ruleItems);
   if(v.some((n,j)=>n>itemLimits[j]))continue;
   extraItems.set(v,rid*itemIds.length);
  }
  allowedResource[rid]=1;eligibleResources++;
 }
 function values(rid){
  return [c.res(rid,1),c.res(rid,2),c.res(rid,3),c.res(rid,4),...extraItems.subarray(rid*itemIds.length,(rid+1)*itemIds.length)];
 }
 function score(label){
  const n=c.node(label);
  let total=0;for(let k=0;k<K;k++)total+=c.stat(n,2*K+k);return total;
 }
 function preferLabel(x,y){
  if(y<0)return true;
  const s=score(x)-score(y);if(s)return s>0;
  const rnd=c.random(c.node(x))-c.random(c.node(y));
  return rnd<0||rnd===0&&x<y;
 }
 function cheaperLabel(x,y){
  if(y<0)return true;
  const ar=c.rid(x),br=c.rid(y),d=lex(values(ar),values(br));
  return d<0||d===0&&preferLabel(x,y);
 }
 let matched=0,matchedStates=0;
 for(let label=0;label<labelCount;label++){
  const node=c.node(label),rid=c.rid(label),mi=c.mask(node);
  if(!allowedResource[rid]||!allowedMask[mi]||!targets.every(([k,min])=>c.stat(node,2*K+k)>=min))continue;
  matched++;masksMatched[mi]=1;
  if(!stateMatched[node]){stateMatched[node]=1;matchedStates++;}
  const sum=score(label),old=ridBest[rid];
  if(sum>ridScore[rid]||sum===ridScore[rid]&&preferLabel(label,old)){ridBest[rid]=label;ridScore[rid]=sum;}
  for(let k=0;k<K;k++){
   const v=c.stat(node,2*K+k);
   if(v>bestStatValue[k]||v===bestStatValue[k]&&cheaperLabel(label,bestStat[k])){bestStatValue[k]=v;bestStat[k]=label;}
  }
 }
 const pointMap=new Map();
 let matchedResourceConfigurations=0;
 for(let rid=0;rid<resourceCount;rid++){
  const label=ridBest[rid];if(label<0)continue;
  matchedResourceConfigurations++;
  const vector=values(rid),key=vector.join(","),old=pointMap.get(key);
  if(!old||preferLabel(label,old.label))pointMap.set(key,{label,vector});
 }
 const points=[...pointMap.values()].sort((a,b)=>lex(a.vector,b.vector));
 const skyline=[];
 for(const point of points)if(!skyline.some(p=>dominates(p.vector,point.vector)))skyline.push(point);
 const objectives=axes.map(([id,title],i)=>{
  let best=null;
  for(const p of skyline)if(!best||p.vector[i]<best.vector[i]||
   p.vector[i]===best.vector[i]&&lex(p.vector,best.vector)<0)best=p;
  return {id,title,label:best?.label??null,vector:best?.vector??null};
 });
 const active=maskCache.filter((_,i)=>masksMatched[i]);
 const matchedProfiles=profiles.filter(([,blocked])=>active.some(mask=>(mask&blocked)===0n)).map(([id])=>id);
 return {profileCount,matchedProfiles,labelsScanned:labelCount,eligibleResources,matched,matchedStates,
  matchedResourceConfigurations,resourcePoints:points.length,axes,objectives,skyline,
  best:Array.from(bestStat,(label,i)=>({label:label<0?null:label,value:label<0?null:bestStatValue[i]}))};
}
export function exactResourceWitness(db,a,labelIndex){
 const c=exactColumns(a);
 if(!Number.isSafeInteger(labelIndex)||labelIndex<0||labelIndex>=c.labelCount)throw Error("전체 상태 경로 번호 오류");
 const node=c.node(labelIndex),rid=c.rid(labelIndex),code=c.code(labelIndex),growth=c.growth(labelIndex),K=a.stats.length;
 const raw=c.vector(node,0),bonus=c.vector(node,K),vector=c.vector(node,2*K);
 const ids=decodeRules(a,code),steps=ids.map(id=>({id,count:1}));
 const w={source:"GATE12",sourceKind:"D"+a.depth+"_EXACT_RESOURCE_QUERY",body:a.body,classKey:a.classKey,mode:a.mode,
  raw,bonus,vector,steps,placement:"BINARY_GROWTH",growthBefore:ids.map((_,i)=>Boolean(growth&(1<<i))),
  growthAfterLastAction:true,optimisticRandomPresent:Boolean(c.random(node)),actualGameCertified:false,
  research:[...new Set(ids.flatMap(id=>db.ruleDetails[id]?.requires||[]))].sort(),
  reference:"전체 상태 즉시 검색 · "+a.classKey+" #"+labelIndex,
  graphRun:a.graphLedger,graphNode:node,runtimeExact:true};
 const r=summarizeRouteResources(w,db.ruleDetails);
 if(!["cash","transfer","recovery","actions","items","medals","facilities"].every(k=>r.complete[k])||
  r.grossFees!==c.res(rid,1)||r.recoveryDays!==c.res(rid,2)||
  r.transferHours!==c.res(rid,3)||r.actions!==c.res(rid,4))
  throw Error("전체 상태 대표 경로의 자원 재계산 불일치");
 return {witness:w,resources:r,profiles:exactCompatibleProfiles(a,labelIndex)};
}
