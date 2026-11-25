// Distinct origin x branch evidence coverage, independent of numeric closure.
// Historical joint status codes are retained; newer registered chronological
// ledgers are unioned live so concurrent writers cannot leave a stale total.
const memo=new WeakMap();
export const chronologicalLedgers=["originExtendedContinuation","originResearchContinuation","originResearchChain","populationGrowthReplay","populationChronologicalCareer","populationResearchCareer","populationFrontierChronology"];
export function integratedCoverage(db){
 if(memo.has(db))return memo.get(db);
 const j=db.populationJointCoverage;if(!j)return null;
 const oi=new Map(j.origins.map((id,i)=>[id,i])),bi=new Map(j.branches.map((id,i)=>[id,i])),width=bi.size,n=oi.size*width;
 const old=new Uint8Array(n),conditional=new Uint8Array(n),latest=new Uint8Array(n),known=new Uint8Array(n);
 for(let i=0;i<oi.size;i++)for(let k=0;k<width;k++){
  const c=Number(j.status[i][k]),p=i*width+k;
  if(c>0)old[p]=known[p]=1;
  if([1,4,5,6].includes(c))conditional[p]=1;
 }
 const ledgers={},outOfScope=[],missingWitness=[];
 for(const name of chronologicalLedgers){
  const l=db[name],pairs=new Set();let records=0;
  for(const id of l?.published||[]){
   const r=l.routes?.[id],w=db.witnesses?.[id];
   if(!r||!w){missingWitness.push([name,id]);continue;}
   const i=oi.get(r.origin),k=bi.get(r.branch);
   if(i===undefined||k===undefined){outOfScope.push([name,id]);continue;}
   if(w.originProfile!==r.origin||!w.branchIds?.includes(r.branch)){missingWitness.push([name,id]);continue;}
   const p=i*width+k;records++;pairs.add(p);latest[p]=known[p]=conditional[p]=1;
  }
  ledgers[name]={records,pairs:pairs.size};
 }
 const count=a=>a.reduce((s,x)=>s+x,0);
 const added=known.reduce((s,x,i)=>s+Number(x&&!old[i]),0),newConditional=conditional.reduce((s,x,i)=>s+Number(x&&![1,4,5,6].includes(Number(j.status[Math.floor(i/width)][i%width]))),0);
 const byOrigin={},byBranch={};for(const [id,i] of oi){let c=0,k=0;for(let b=0;b<width;b++){c+=conditional[i*width+b];k+=known[i*width+b];}byOrigin[id]={conditional:c,known:k,total:width};}
 for(const [id,b] of bi){let c=0,k=0;for(let i=0;i<oi.size;i++){c+=conditional[i*width+b];k+=known[i*width+b];}byBranch[id]={conditional:c,known:k,total:oi.size};}
 const result={total:n,legacyKnown:count(old),known:count(known),conditional:count(conditional),newerChronologicalPairs:count(latest),addedKnown:added,newConditional,ledgers,byOrigin,byBranch,missingWitness,outOfScope,pair:(o,b)=>{const i=oi.get(o),k=bi.get(b);return i===undefined||k===undefined?null:{conditional:!!conditional[i*width+k],known:!!known[i*width+k]};}};
 memo.set(db,result);return result;
}
const fmt=n=>n.toLocaleString("ko-KR"),pct=(n,d)=>(100*n/Math.max(1,d)).toFixed(2)+"%";
export function integratedCoverageText(db){
 const c=integratedCoverage(db);if(!c)return "";
 return " 최신 원장 합집합: 조건부 경로·모집 근거 "+fmt(c.conditional)+"/"+fmt(c.total)+"쌍 ("+pct(c.conditional,c.total)+") · 기존 D모형 포함 근거 "+fmt(c.known)+"쌍 (구 집계 "+fmt(c.legacyKnown)+" + "+fmt(c.addedKnown)+") · 신규 시간순 원장 자체 "+fmt(c.newerChronologicalPairs)+"쌍. 제한 수치 폐쇄 및 전역 완전 판정과 별도.";
}
export function integratedScopeMarkup(db,origin=null,branch=null){
 const c=integratedCoverage(db);if(!c)return "";
 if(origin&&branch){const p=c.pair(origin,branch);return p?'<p class="bs-sub" data-integrated-pair-coverage="true">최신 원장 합집합: '+(p.conditional?"조건부 경로·모집 근거 있음":p.known?"기존 제한 모형 근거만 있음":"이 집계의 근거 없음")+' · 전역 완전 판정과 별도</p>':"";}
 const s=origin?c.byOrigin[origin]:branch?c.byBranch[branch]:null;
 return s?'<p class="bs-sub" data-integrated-scope-coverage="true">최신 원장 합집합 · 조건부 경로·모집 근거 '+fmt(s.conditional)+'/'+fmt(s.total)+'쌍 ('+pct(s.conditional,s.total)+') · 기존 D모형 포함 '+fmt(s.known)+'쌍 · 전역 완료율 아님</p>':"";
}
