// V54 detail shards: use the existing shared registry index and fetch
// exactly one content-addressed companion on expansion.
import {inflateArchivedGzip} from './origin-gzip-compat.js?v=20261105-legacy-gzip-1';
const fmt=n=>n==null?'—':Number(n).toLocaleString('ko-KR'),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=r=>r.status.startsWith('FULL_')?(r.incompatibleEvents?'논리 재생 완료 · 이벤트 조건 미충족':'논리 재생 완료 · 미확정 조건부'):'재생 중단';
const same=r=>!r.sameSoldierState?'미확인':r.missingOriginalActiveResearchCount?'대원 동일 · 활성 연구 차이':'대원·기존 활성 연구 일치';
const qty=(o,name)=>Object.entries(o||{}).map(([k,v])=>esc(name(k)||k)+' × '+fmt(v)).join(' · ')||'없음';
export function financedCareerHtml(ledger,{activeBranch,originLabel,routeHref,name}){
 if(!ledger)return '';
 const groups=new Map();
 for(const [id,r] of Object.entries(ledger.records||{})){
  if(activeBranch&&r.branch!==activeBranch)continue;
  const a=groups.get(r.routeId)||[];a.push([id,r]);groups.set(r.routeId,a);
 }
 if(!groups.size)return '';
 const total=[...groups.values()].flat();
 return '<details><summary>초기 코덱스 이후 연속 유한자금 육성 달력 ('+fmt(total.length)+'개)</summary><p>V53 원본 시작 재고·기지·조건부 실제 잔액을 인계합니다. 연구비용 추첨, 제조 판매, 고정 국가 지원금, 농장 수입 및 월별 유지비를 연결하고, 월간 이벤트의 자금 조건을 계산합니다. 표본, 시설, 평가 점수, 임무, RNG 및 상호배제 의무는 남을 수 있으며 논리 재생 성공은 완결 조합이 아닙니다. 상세 행동 이력은 펼칠 때만 압축 파일 하나를 읽습니다.</p>'+[...groups.values()].map(list=>{
  const r=list[0][1];return '<details><summary>'+esc(originLabel(r.origin))+' · '+fmt(list.filter(([,x])=>x.status.startsWith('FULL_')).length)+'/'+fmt(list.length)+' 논리 재생 완료</summary><p><a href="'+routeHref(r,r.node)+'">기존 시간순 육성 경로</a></p><div class="table-wrap"><table><thead><tr><th>기술자/연구원 목표</th><th>도달 월</th><th>원본 행동</th><th>잔액</th><th>자금 조건</th><th>상태</th></tr></thead><tbody>'+list.map(([id,x])=>'<tr data-financed-career-row="'+esc(id)+'"><td>'+fmt(x.options.staff)+' / '+fmt(x.options.scientistTarget)+'</td><td>'+fmt(x.months)+'</td><td>'+fmt(x.finishedActions)+' / '+fmt(x.totalActions)+'</td><td>'+fmt(x.closingCash)+'</td><td>'+fmt(x.financeGates.filter(g=>g.met).length)+' / '+fmt(x.financeGates.length)+'</td><td>'+esc(status(x))+'</td></tr>').join('')+'</tbody></table></div>'+list.map(([id,x])=>'<details data-financed-career-detail="'+esc(id)+'"><summary>기술자 '+fmt(x.options.staff)+' · 연구원 '+fmt(x.options.scientistTarget)+' · '+esc(same(x))+' — 상세</summary><div data-financed-career-body>펼칠 때 상세 자료를 읽습니다.</div></details>').join('')+'</details>';
 }).join('')+'</details>';
}
async function loadDetail(r){
 if(!/^[a-f0-9]{64}$/.test(r.detailHash)||r.detailFile!=='data/soldier-financed-career-details/'+r.detailHash+'.json.gz')throw Error('상세 파일 식별자 불일치');
 const res=await fetch(new URL('../../'+r.detailFile,import.meta.url));
 if(!res.ok)throw Error('HTTP '+res.status);
 let bytes=new Uint8Array(await res.arrayBuffer());
 if(bytes[0]===31&&bytes[1]===139)bytes=await inflateArchivedGzip(bytes);
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(bytes.length!==r.detailBytes||hash!==r.detailHash)throw Error('상세 자료 해시 불일치');
 const x=JSON.parse(new TextDecoder().decode(bytes));
 if(x.calendarHash!==r.calendarHash||x.routeId!==r.routeId||x.prefixHash!==r.prefixHash||x.actionHash!==r.actionHash)throw Error('원장 연결 불일치');
 return x;
}
export function bindFinancedCareerDetails(host,ledger,{name}){
 if(!ledger)return;
 const label=id=>esc(name(id)||id||'');
 host.addEventListener('toggle',async e=>{
  const el=e.target,id=el?.dataset?.financedCareerDetail;
  if(!id||!el.open)return;
  const r=ledger.records[id],body=el.querySelector('[data-financed-career-body]');
  if(!r||!body||body.dataset.loaded||body.dataset.loading)return;
  body.dataset.loading='1';body.textContent='압축 상세 이력 읽는 중…';
  try{
   const x=await loadDetail(r);
   body.innerHTML='<p>'+esc(status(r))+' · '+esc(same(r))+' · 코덱스 인계 자금 '+fmt(x.scenario.openingCash)+'달러 · 게임 시작부터 최저 잔액 '+fmt(x.wholePrefixMinimumCash)+'달러 · 종료 잔액 '+fmt(x.closingCash)+'달러 · 미해결 표본·시설 '+fmt(x.unresolved.length)+'건 · 연결된 연구 표본 의무 '+fmt(x.labGateUnresolved.length)+'건.</p>'+(x.blocked?'<p>중단: '+esc(x.blocked.reason)+' · 행동 '+fmt(x.blocked.at)+'</p>':'<p>기존 논리 행동 '+fmt(x.finishedActions)+'개까지 재생. 실제 캠페인 완결은 아님.</p>')+
    '<h4>이벤트 자금 조건</h4><div class="table-wrap"><table><thead><tr><th>이벤트</th><th>최소 자금</th><th>발동 월</th><th>계산 잔액</th><th>판정</th></tr></thead><tbody>'+x.financeGates.map(g=>'<tr><td>'+label(g.event)+'</td><td>'+fmt(g.minimum)+'</td><td>'+fmt(g.dispatchMonth)+'</td><td>'+fmt(g.dispatchCash)+'</td><td>'+(g.met?'자금 조건 충족':'미충족')+'</td></tr>').join('')+'</tbody></table></div>'+
    '<h4>월간 이벤트의 남은 조건</h4><ol>'+x.eventGates.map(g=>'<li>'+label(g.event)+' · '+fmt(g.scheduledMonth)+'월 · '+esc(g.kind)+' · '+[...g.blocked,...g.unknown,...(g.pending||[])].map(esc).join(' / ')+(g.facilityOpen?.length?' · '+g.facilityOpen.map(f=>label(f.id)+' (필요 연구 '+f.missingResearch.map(label).join(', ')+' / 부지 '+(f.hasLayout?'후보 있음':'없음')+' / '+qty(f.materials,name)+' / '+fmt(f.buildCost)+'달러)').join(' · '):'')+'</li>').join('')+'</ol>'+
    '<details><summary>고정 월 이벤트 선행 처리 '+fmt(x.deadlineDispatches.length)+'건</summary><ol>'+x.deadlineDispatches.map(d=>'<li>'+label(d.event)+' · '+fmt(d.month)+'월 · 발동 '+fmt(d.dispatch)+'시간 → 보상 예정 '+fmt(d.due)+'시간</li>').join('')+'</ol></details>'+
    '<details><summary>미충족 원본 활성 연구 '+fmt(x.missingOriginalActiveResearch.length)+'건</summary><div data-financed-list="missingResearch"></div><button type="button" data-financed-more="missingResearch">다음 100개</button></details>'+
    '<details><summary>월별 현금 장부 '+fmt(x.monthly.length)+'건</summary><div data-financed-list="monthly"></div><button type="button" data-financed-more="monthly">다음 100개</button></details>'+
    '<details><summary>연구·조달 행동 '+fmt(x.calendar.length)+'건</summary><div data-financed-list="calendar"></div><button type="button" data-financed-more="calendar">다음 100개</button></details>'+
    '<details><summary>미해결 표본·시설 '+fmt(x.unresolved.length)+'건</summary><div data-financed-list="unresolved"></div><button type="button" data-financed-more="unresolved">다음 100개</button></details>'+
    '<details><summary>조건부 고정 이벤트 보상 '+fmt(x.sourceRewards.length)+'건</summary><ol>'+x.sourceRewards.map(a=>'<li>'+label(a.event)+' · '+fmt(a.hour)+'시간 · '+qty(a.rewards,name)+'</li>').join('')+'</ol></details>'+
    '<details data-financed-cash><summary>현금 거래 '+fmt(x.transactions.length)+'건</summary><div data-financed-list="transactions"></div><button type="button" data-financed-more="transactions">다음 100개</button></details>'+
    '<details><summary>논리 재생 행동 '+fmt(x.logicalSteps.length)+'건</summary><div data-financed-list="logical"></div><button type="button" data-financed-more="logical">다음 100개</button></details>';
   const specs={
    missingResearch:[x.missingOriginalActiveResearch,a=>label(a)],
    monthly:[x.monthly,m=>fmt(m.month)+'월 · 지원금 '+fmt(m.funding)+' · 유지비 '+fmt(m.total)+' · 잔액 '+fmt(m.cash)],
    calendar:[x.calendar,a=>fmt(a.at)+' · '+esc(a.type)+' · '+label(a.id)+' · '+fmt(a.start)+'→'+fmt(a.end)+'시간'+(a.days?' · 연구 '+fmt(a.days)+'일':'')],
    unresolved:[x.unresolved,a=>fmt(a.at)+' · '+label(a.id)+' × '+fmt(a.qty)+' · '+esc(a.kind)],
    transactions:[x.transactions,a=>fmt(a.hour)+'시간 · '+esc(a.reason)+' · '+label(a.id)+' · '+fmt(a.amount)+'달러 · 잔액 '+fmt(a.cash)],
    logical:[x.logicalSteps,a=>fmt(a.at)+' · '+esc(a.action.type)+' · '+label(a.action.id||a.action.event||a.action.transform||a.action.profile||a.action.research)+' · '+fmt(a.month)+'월 · '+fmt(a.funds)+'달러']
   };
   for(const [k,[rows,line]] of Object.entries(specs)){
    const box=body.querySelector('[data-financed-list="'+k+'"]'),more=body.querySelector('[data-financed-more="'+k+'"]'),d=box.closest('details');let at=0;
    const next=()=>{const part=rows.slice(at,at+100),ol=document.createElement('ol');ol.start=at+1;ol.innerHTML=part.map(a=>'<li>'+line(a)+'</li>').join('');box.append(ol);at+=part.length;more.hidden=at>=rows.length;};
    d.addEventListener('toggle',()=>{if(d.open&&!at)next();});more.addEventListener('click',next);
   }
   body.dataset.loaded='1';
  }catch(err){body.textContent='상세 자료 조회 실패: '+err.message;}
  finally{delete body.dataset.loading;}
 },true);
}
