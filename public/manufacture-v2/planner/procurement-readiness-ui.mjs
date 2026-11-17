import { buildProcurementReadiness } from './procurement-readiness-core.mjs';

const $ = id => document.getElementById(id);
const fmt = n => Number.isFinite(n) ? n.toLocaleString('ko-KR') : '미확인';
const make = (parent,tag,text,cls) => {
  const el=document.createElement(tag);
  if(text!==undefined && text!==null)el.textContent=String(text);
  if(cls)el.className=cls;
  parent.appendChild(el);
  return el;
};
const table = (parent,headers) => {
  const root=make(parent,'table');
  const tr=make(make(root,'thead'),'tr');
  for(const label of headers)make(tr,'th',label);
  return make(root,'tbody');
};
const facilityLabel={
  'declared-missing':'명시된 필요 기능 부족',
  'declared-covered':'명시된 필요 기능 존재',
  'no-declared-functions':'명시 기능 요구 없음',
  'not-checked':'시설 자료 미확인'
};
const researchLabel={
  'not-in-discovered':'discovered 미일치',
  'present-in-discovered':'discovered 일치',
  'no-declared-research':'명시 연구 요구 없음',
  'not-checked':'연구 목록 미확인'
};

export function renderProcurementEvidence(planner, comparison, settings, context) {
  const evidence=buildProcurementReadiness(planner,comparison,settings,context);
  const summary=$('queue-readiness-summary');
  const jobs=$('queue-readiness-jobs');
  const supplies=$('queue-readiness-supplies');
  summary.replaceChildren();jobs.replaceChildren();supplies.replaceChildren();
  const cards=[
    ['가상 재료 부족 주문',fmt(evidence.summary.materialShortageJobs)+' / '+fmt(evidence.summary.jobs)],
    ['시설 기능 부족 주문',fmt(evidence.summary.missingFacilityJobs)],
    ['discovered 미일치 주문',fmt(evidence.summary.notDiscoveredResearchJobs)],
    ['추가 가정 수량',fmt(evidence.summary.hypotheticalUnits)+'개']
  ];
  for(const [label,value] of cards){
    const box=make(summary,'div',null,'metric');
    make(box,'span',label);make(box,'strong',value);
  }
  const body=table(jobs,['가상 제조 주문','재료 증거','시설 기능','연구 이력','기타 규칙','우선 확인할 문제']);
  for(const job of evidence.jobs.slice(0,100)){
    const tr=make(body,'tr');
    const name=make(tr,'td');
    make(name,'strong',job.position+'번째 · '+job.name);
    make(name,'code',job.recipeId,'item-id');
    make(tr,'td',job.materialState==='external-shortage'
      ? '외부 부족 '+fmt(job.materialShortageKinds)+'종 / '+fmt(job.materialShortageUnits)+'개'
      : '가상 계획상 부족 없음');
    const facility=make(tr,'td',facilityLabel[job.facilityState]||job.facilityState);
    if(job.missingFunctions.length)
      make(facility,'code',job.missingFunctions.join(', '),'item-id');
    const research=make(tr,'td',researchLabel[job.researchState]||job.researchState);
    if(job.researchNotDiscovered.length)
      make(research,'code',job.researchNotDiscovered.slice(0,10).join(', '),'item-id');
    const rule=make(tr,'td',
      job.blockingFlags.length?'규칙 확인 '+job.blockingFlags.join(', '):'전체 조건 미판정');
    if(job.informationalFlags.length)
      make(rule,'small','참고: '+job.informationalFlags.join(', '),'note');
    make(tr,'td',job.firstAction.detail);
  }
  if(evidence.jobs.length>100)
    make(jobs,'p','표는 주문 100개까지 표시합니다. JSON 저장 결과에는 전부 포함됩니다.','note');

  const meaningful=evidence.supplies.filter(x=>x.baseInput || x.virtualAdded || x.usedCombined);
  if(!meaningful.length){
    make(supplies,'p','현재 비교에는 기초 재고 사용이나 가상 확보 수량이 없습니다.','note');
  } else {
    const stock=table(supplies,[
      '2.1 재료','기초 입력','가상 추가','총 시작 수량','계획상 소비',
      '가상 추가분 소비 가능 범위','합산 남은 수량'
    ]);
    for(const row of meaningful.slice(0,180)){
      const tr=make(stock,'tr');
      const first=make(tr,'td');
      const a=make(first,'a',row.name);
      a.href='../../items-v2/?id='+encodeURIComponent(row.id);
      make(first,'code',row.id,'item-id');
      for(const value of [
        fmt(row.baseInput),fmt(row.virtualAdded),fmt(row.combinedStarting),
        fmt(row.usedCombined),fmt(row.possibleVirtualUsedMin)+'~'+
        fmt(row.possibleVirtualUsedMax),fmt(row.remainingCombined)
      ])make(tr,'td',value);
    }
    if(meaningful.length>180)
      make(supplies,'p','180종 표시, JSON에는 전체 재고 장부 포함','note');
  }
  make(supplies,'p',evidence.caveat,'note');
  return evidence;
}
