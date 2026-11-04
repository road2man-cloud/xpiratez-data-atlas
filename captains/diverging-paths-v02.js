/* X-Piratez v.o2 — permanent Diverging Paths editorial, 2026-11-05 */
(() => {
"use strict";
const root=document.getElementById("divergingPathsV02");
if(!root) return;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>Number(n).toLocaleString("ko-KR",{maximumFractionDigits:2});
const pct=n=>Number(n).toFixed(2).replace(/\.00$/,"")+"%";
const q=(script,base)=>base+encodeURIComponent(script);
const outcomeTable=e=>{
 const total=e.outcomes.reduce((a,v)=>a+v[1],0);
 return `<div class="dp-scroll"><table class="dp-table"><thead><tr><th>추첨 결과·실제 지급품</th><th>결과 내 비율</th><th>월간 확률</th></tr></thead><tbody>`+
 e.outcomes.map(([label,weight])=>`<tr><td>${esc(label)}</td><td>${pct(weight/total*100)}</td><td><strong>${pct(e.odds*weight/total)}</strong></td></tr>`).join("")+`</tbody></table></div>`;
};
const list=arr=>`<ul class="dp-list">${arr.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`;
let data,active="peasant",filter="all";
const researchLink=(id,label)=>`<a href="../research/?q=${encodeURIComponent(id)}" title="연구 DB에서 찾기">${esc(label)}</a>`;
function renderTabs(){const tabs=root.querySelector("#dpTabs");tabs.innerHTML=data.paths.map(p=>`<button type="button" class="dp-tab ${active===p.id?"is-active":""}" data-path="${p.id}" aria-pressed="${active===p.id}">${esc(p.name)}</button>`).join("");}
function renderEvents(p){
 const items=p.events.filter(e=>filter==="all"||(filter==="repeat"&&!e.oneTime)||(filter==="once"&&e.oneTime));
 if(!items.length)return `<p class="dp-note">이 조건에 맞는 경로 관련 이벤트가 확인되지 않았습니다. 공통 이벤트는 별도 연구를 통해 발생할 수 있습니다.</p>`;
 return items.map(e=>{
 const tag=e.oneTime?"1회성":"매월 추첨";
 const shared=e.shared?'<span class="dp-chip dp-shared">공통·후속 조건</span>':"";
 return `<details class="dp-event"><summary><span class="dp-event-title">${esc(e.name)}<small>${esc(e.conditions)}</small></span><span class="dp-event-odds">${e.odds}% <small>${tag}</small></span></summary><div class="dp-event-body"><p><b>실행 조건:</b> ${esc(e.conditions)}</p><p class="dp-event-meta">${shared}<span class="dp-chip">${esc(e.script)}</span></p>${outcomeTable(e)}<p class="dp-footnote">월간 결과 확률 = 스크립트 실행 ${e.odds}% × 결과 가중치. 조건 미충족 시 0%이며, 1회성 이벤트의 월간 비율은 해당 이벤트가 미발생인 경우에만 적용됩니다.</p></div></details>`;
 }).join("");
}
function renderPath(){
 const p=data.paths.find(x=>x.id===active);
 root.querySelector("#dpPath").innerHTML=`<div class="dp-path-intro"><h3>${esc(p.name)} <span>${esc(p.subtitle)}</span></h3><p>${esc(p.opening)}</p><div class="dp-provenance">영구 선택: <code>${esc(p.research)}</code> · 다른 네 경로 배제</div></div><div class="dp-procon"><div><h4>이 선택으로 얻는 장점</h4>${list(p.advantages)}</div><div><h4>포기하는 것·주의할 점</h4>${list(p.tradeoffs)}</div></div><div class="dp-subheading"><h4>확률별 원본 이벤트</h4><div class="dp-filter" role="group" aria-label="이벤트 종류">${[["all","모두"],["repeat","월간 반복"],["once","1회성"]].map(([val,label])=>`<button type="button" data-filter="${val}" class="${filter===val?"selected":""}" aria-pressed="${filter===val}">${label}</button>`).join("")}</div></div><div id="dpEvents">${renderEvents(p)}</div>`;
}
function renderSeven(){
 const m=data.magnificentSeven;
 const shell=root.querySelector("#dpSeven");
 shell.innerHTML=`<h3>${esc(m.title)}</h3><p class="dp-note"><b>게임 시작 후 정확히 11개월이 지난 월간 판정</b>에 한정 · 난이도 1 이상 · 나머지 조건 충족 시 실행 100%. 현실 날짜의 11월이 아닙니다.</p><div class="dp-seven-layout"><div><h4>놓치면 복구되지 않는 필수 조건</h4><div class="dp-checklist">${m.requirements.map(([label,key,required],i)=>`<label><input type="checkbox" data-check="${i}"><span>${esc(label)}<small>${esc(key)} · ${required?"완료 필요":"미완료/미보유 필요"}</small></span></label>`).join("")}</div><p id="dpChecklistResult" class="dp-note" role="status" aria-live="polite">위 조건을 모두 확인해 체크하세요. 체크는 현재 페이지에서만 유지되는 참고용이며 세이브를 수정하지 않습니다.</p></div><div><h4>한 번에 받는 보상</h4>${list(m.rewards)}<h4>주의</h4>${list(m.details)}</div></div><p class="dp-footnote">체크리스트는 실제 세이브를 판독하지 않습니다. 특히 '힘을 거부한다' 연구는 '힘을 받아들임' 또는 '드릴 조사'와 배제 관계입니다.</p>`;
}
function renderBloom(){const b=data.purpleBloom;root.querySelector("#dpBloom").innerHTML=`<h3>${esc(b.name)} — 이벤트와 제작·부활 용도</h3><p class="dp-highlight">${esc(b.craft)}</p><div class="dp-facts"><span>제작 작업량 <b>${fmt(b.craftTime)}</b></span><span>현금 비용 <b>${fmt(b.craftCost)}</b></span><span>필요 시설 기능 <b>${esc(b.requiresFacility)}</b></span><span>연구 비용 <b>${fmt(b.researchCost)}</b></span><span>판매가 <b>${fmt(b.costSell)}</b></span><span>보유 월간 비용 효과 <b>+${fmt(-b.monthlyMaintenance)} 절감</b></span></div>${list(b.notes)}<p class="dp-footnote">리자드맨 동상은 게임의 현재 기지 창고·항공기 보유 여부만 검사합니다. 획득한 적이 있어도 현재 없다면 일곱 영웅들의 음성 조건을 충족할 수 있습니다.</p>`;}
async function init(){
 const res=await fetch("diverging-paths-v02.json?v=20261105-1",{cache:"no-store"});
 if(!res.ok)throw Error("HTTP "+res.status);
 data=await res.json();
 root.innerHTML=`<div class="dp-heading"><div><p class="eyebrow">X-Piratez 2.1 원본 검증 · 영구 상호배제 연구</p><h2>다섯 갈림길: 포기하기 전에 보상부터 비교</h2><p>농민·남성·갈·캣·혼종의 월간 지급품, 독립 확률, 특수 1회성 보상과 실기 조건을 직접 비교합니다.</p></div><a class="dp-jump" href="#dpSevenSection">일곱 영웅들 조건 확인</a></div><div class="dp-warning"><b>확률을 읽는 법:</b> 표시된 월별 확률은 필요한 연구·시설·개월·난이도·점수 조건을 이미 충족한 경우에만 적용됩니다. 추가 후속 이벤트 중 일부는 다른 경로에서도 접근할 수 있어 독점 보상으로 합산하면 안 됩니다.</div><div class="dp-tabs" id="dpTabs" role="group" aria-label="다섯 영구 선택 경로"></div><div id="dpPath" class="dp-path-content"></div><div class="dp-separator"></div><section id="dpSevenSection" class="dp-secondary"><div id="dpSeven"></div></section><section id="dpBloomSection" class="dp-secondary"><div id="dpBloom"></div></section><p class="dp-provenance">출처: ${esc(data.source)} · ${esc(data.gameVersion)} / ${esc(data.engineVersion)}. ${esc(data.versionNote)}</p>`;
 renderTabs();renderPath();renderSeven();renderBloom();
 root.addEventListener("click",evt=>{
 const tab=evt.target.closest("[data-path]");if(tab){active=tab.dataset.path;filter="all";renderTabs();renderPath();return;}
 const button=evt.target.closest("[data-filter]");if(button){filter=button.dataset.filter;renderPath();}
 });
 root.addEventListener("change",evt=>{if(!evt.target.matches("[data-check]"))return;const total=data.magnificentSeven.requirements.length;const marked=root.querySelectorAll("[data-check]:checked").length;root.querySelector("#dpChecklistResult").textContent=marked===total?"6개 조건을 모두 확인했습니다. 경과 11개월·난이도 1 이상인지도 확인하세요.":`현재 ${marked}/${total}개 확인 · 남은 ${total-marked}개 조건을 확인하세요.`;});
}
init().catch(err=>{root.innerHTML=`<p class="dp-note" role="alert">보상표를 불러오지 못했습니다. 페이지를 새로고침해 주세요. (${esc(err.message)})</p>`;});
})();
