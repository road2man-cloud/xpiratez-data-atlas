// Presentation only; probability calculations live in route-birth-screen-frontier.js.
// Keep this embedded in the existing 12-stat soldier detail rather than a new page.
import {BIRTH_STAT_KEYS} from './birth-rng-math.js';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const number=n=>Number(n)>1e8?Number(n).toExponential(2):
  Number(n).toLocaleString('ko-KR',{maximumFractionDigits:2});
const probability=n=>{
  const percent=Number(n)*100;
  return percent>0&&percent<1e-6?percent.toExponential(2)+'%':
    percent.toLocaleString('ko-KR',{maximumFractionDigits:6})+'%';
};
const options=(labels,active)=>BIRTH_STAT_KEYS.map(key=>
  '<option value="'+escape(key)+'"'+(key===active?' selected':'')+'>'+escape(labels[key]||key)+'</option>').join('');

export function renderBirthFloorForm(labels,preferences={}){
  const screenStat=BIRTH_STAT_KEYS.includes(preferences.screenStat)?preferences.screenStat:'tu';
  const objective=preferences.objective==='total'||BIRTH_STAT_KEYS.includes(preferences.objective)?
    preferences.objective:'total';
  const draws=Number.isSafeInteger(preferences.draws)&&preferences.draws>=1&&
    preferences.draws<=10000?preferences.draws:10;
  const slots=Number.isSafeInteger(preferences.trainingSlots)&&preferences.trainingSlots>=1&&
    preferences.trainingSlots<=200?preferences.trainingSlots:3;
  const minimumChance=[0,.5,.8,.95].includes(preferences.requiredChance)?
    String(preferences.requiredChance):'0.5';
  const chosen=value=>String(value)===minimumChance?' selected':'';
  return '<details class="route-birth-floor-explorer">'+
    '<summary>현재 경로: 적합한 신병 초기 능력치 선발선 역산</summary>'+
    '<p class="fine">관측 가능한 신병 초기 <strong>실효 능력치 한 종</strong>에 대해 모든 선발 최솟값을 계산합니다. 다른 능력치의 기존 선발 조건은 적용하지 않는 독립 비교이며, 실제 게임의 모집 기회·재료·전투 경험 획득을 보증하지 않습니다.</p>'+
    '<div class="birth-floor-controls">'+
    '<label>선별할 출생 능력치<select id="birthFloorStat">'+options(labels,screenStat)+'</select></label>'+
    '<label>최종 기대값 목표<select id="birthFloorObjective"><option value="total"'+
      (objective==='total'?' selected':'')+'>12종 합계</option>'+
      options(labels,objective)+'</select></label>'+
    '<label>독립 신규 추첨 기회 N<input id="birthFloorDraws" type="number" min="1" max="10000" step="1" value="'+draws+'"></label>'+
    '<label>선발 대원 중 능력치 요건 검토 상한 K명<input id="birthFloorTrainingSlots" type="number" min="1" max="200" step="1" value="'+slots+'"></label>'+
    '<label>그 안에 능력치 조건 충족자 1명 이상<select id="birthFloorRequiredChance">'+
      '<option value="0"'+chosen(0)+'>확률 제한 없음</option>'+
      '<option value="0.5"'+chosen(.5)+'>50% 이상</option><option value="0.8"'+chosen(.8)+'>80% 이상</option>'+
      '<option value="0.95"'+chosen(.95)+'>95% 이상</option></select></label>'+
    '<button type="button" id="scanBirthFloors">가능한 선발선 전부 계산</button></div>'+
    '<div id="birthFloorResults" role="status" aria-live="polite"><p class="fine">목표와 가상의 독립 신규 추첨 횟수를 지정해 계산하세요.</p></div></details>';
}

export function renderBirthFloorResult(result,labels){
  if(result.kind!=='conditional-screen-frontier')
    return '<p class="failure">선발선 미산출: '+escape(result.reason||'원본 확률 근거 부족')+'</p>';
  const goal=escape(result.objective==='total'?'12종 합계':labels[result.objective]||result.objective);
  const stat=escape(labels[result.screenStat]||result.screenStat);
  const rows=result.enumerated;
  const row=x=>'<tr data-birth-floor="'+x.minimum+'" data-screen-frontier="'+x.onFrontier+'">'+
    '<td>'+stat+' '+number(x.minimum)+' 이상</td>'+
    '<td>'+probability(x.screenProbability)+'</td>'+
    '<td>'+probability(x.pathChance)+'</td>'+
    '<td>'+probability(x.jointChance)+'</td>'+
    '<td>'+probability(x.chanceWithinDraws)+'</td>'+
    '<td>'+probability(x.chanceWithinBudget)+'</td>'+
    '<td>'+probability(x.capOverflowChance)+'</td>'+
    '<td>'+(x.expectedChecksUntilSuccess==null?'—':number(x.expectedChecksUntilSuccess))+'</td>'+
    '<td>'+number(x.expectedScreenDraws)+'</td>'+
    '<td>'+(x.expectedJointDraws==null?'—':number(x.expectedJointDraws))+'</td>'+
    '<td>'+(x.expectedObjective==null?'미산출':number(x.expectedObjective))+'</td>'+
    '<td>'+(x.onFrontier?'2축 비지배':'')+'</td>'+
    '<td><button type="button" data-apply-birth-floor="'+x.minimum+
      '" data-apply-birth-stat="'+escape(result.screenStat)+'">적용</button></td></tr>';
  const table=items=>'<div class="birth-stat-scroll"><table class="birth-floor-table">'+
    '<thead><tr><th>초기 선발선</th><th>선발률</th><th>선발 후 시술 능력치 요건 통과</th>'+
    '<th>신규 추첨 1회당 두 조건 모두 통과</th><th>검토 무제한: '+number(result.draws)+'회 내 1명 이상</th>'+
    '<th>최대 '+number(result.trainingSlots??result.draws)+'명 검토: 1명 이상</th><th>검토 상한을 넘는 선발자 발생</th>'+
    '<th>성공 시 중단하는 평균 능력치 요건 검토 인원</th>'+
    '<th>선발 기준만 통과할 평균 추첨 수</th><th>검토 무제한 시 두 조건 통과까지 평균 추첨 수</th><th>충족자 '+goal+' 기대값</th>'+
    '<th>성과·확률 비교</th><th>기존 입력 연결</th></tr></thead><tbody>'+
    items.map(row).join('')+'</tbody></table></div>';
  const baseline=result.baseline?.kind==='conditional-route-distribution'?
    '<p class="fine">선발하지 않은 원래 출생 집단: 시술 능력치 요건 통과 '+
      probability(result.baseline.statGateProbability)+' · '+number(result.draws)+'회 중 1명 이상 '+
      probability(result.baseline.chanceWithinDraws)+
      (result.trainingSlots!=null?' · 검토 최대 '+number(result.trainingSlots)+'명일 때 '+
        probability(result.baseline.chanceWithinBudget):'')+' · 통과자의 '+goal+
      ' 기대값 '+number(result.baseline.expectedObjective)+'</p>':'';
  const best=result.selected?
    '<p class="candidate-selection-context"><strong>입력한 조건을 충족하는 최고 기대값: '+
      stat+' '+number(result.selected.minimum)+' 이상</strong> · 조건 충족자 '+goal+
      ' 기대값 '+number(result.selected.expectedObjective)+
      ' · '+number(result.draws)+'회 신규 추첨, 검토 최대 '+number(result.trainingSlots??result.draws)+
      '명일 때 1명 이상 '+probability(result.selected.chanceWithinBudget)+
      ' (무제한 검토 '+probability(result.selected.chanceWithinDraws)+')'+
      ' · 성공하면 중단할 때 평균 요건검토 '+number(result.selected.expectedChecksUntilSuccess)+'명'+
      ' · 검토 무제한이면 두 조건 통과까지 평균 독립 추첨 '+number(result.selected.expectedJointDraws)+'회 '+
      '<button type="button" data-apply-birth-floor="'+result.selected.minimum+
      '" data-apply-birth-stat="'+escape(result.screenStat)+'">추천 선발 기준 적용</button></p>':
    '<p class="candidate-selection-context">지정한 신규 추첨 기회 안에서 요구한 확률을 달성하는 선발선이 없습니다. 아래에 계산 가능한 모든 컷오프를 표시합니다.</p>';
  return '<p><strong>'+stat+' 선발선 '+result.sourceValues+'종 · 경로 계산 '+result.candidates+
    '종 · 성능·확률 2축 비지배 '+result.frontierCount+'종</strong></p>'+baseline+best+
    '<p class="fine">같은 출생처를 서로 독립적으로 다시 생성할 수 있다는 <strong>가상 반복 추첨 모델</strong>입니다. '+
    'N회 추첨에서 기준을 통과한 순서대로 최대 K명만 등록 경로의 <strong>능력치 요건</strong>을 검사하고, 한 명이라도 통과할 확률을 계산합니다. '+
    '검토 상한 초과 확률은 실제 비용이 아니라 단지 선발자가 K명을 초과할 확률입니다. '+
    '아래 「적용」은 기존 12종 초기 선발 입력을 초기화하고 한 가지 최솟값만 설정합니다. 연구·시술·자금·실제 모집 시도 횟수는 계산하지 않습니다.</p>'+
    table(rows.slice(0,20))+
    (rows.length>20?'<details class="birth-floor-rest"><summary>나머지 '+(rows.length-20)+
      '개 선발선 모두 보기</summary>'+table(rows.slice(20))+'</details>':'')+
    (result.unverified.length?'<details><summary>미산출 선발선 '+result.unverified.length+'건</summary><ul>'+
      result.unverified.map(x=>'<li>'+number(x.minimum)+' 이상 · '+escape(x.reason)+'</li>').join('')+
      '</ul></details>':'')+
    '<p class="fine">'+escape(result.caveat)+'</p>';
}
