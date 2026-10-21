/* Static standard-issue scores supplement the single weapon-mode table. */
(()=>{"use strict";
const el=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=(value,d=1)=>value==null||!Number.isFinite(Number(value))?"—":Number(value).toLocaleString("ko-KR",{maximumFractionDigits:d});
const grade=value=>value==null?"—":String(value);
const byKey=new Map();
let data=null;
function get(raw){
 if(!raw)return null;
 const key=raw.section==="shooting"?raw.itemId+"|"+(raw.ammoId||raw.itemId):
  raw.section==="melee"?"melee:"+raw.itemId:null;
 return key?byKey.get(key)||null:null;
}
function link(section,id,name){
 const hash=section==="items"?"item":section==="manufacture"?"recipe":"research";
 return '<a class="rank-crosslink" href="../'+section+'/#'+hash+'='+encodeURIComponent(id)+'">'+esc(name||id)+'</a>';
}
function field(title,value){return '<div class="box"><strong>'+esc(title)+'</strong>'+value+'</div>'}
function production(row){
 if(!row)return "확인된 제조법 없음";
 const ingredients=(row.ingredients||[]).length?row.ingredients.map(x=>
  esc(x.id)+" × "+fmt(x.qty,0)+" (기회비용 "+fmt(x.subtotal,0)+")").join("<br>"):"명시된 재료 목록 없음";
 return '<p>'+link("manufacture",row.id,row.id)+" · 1회 생산 "+fmt(row.producedQty,0)+"개 · 현금 "+fmt(row.cash,0)+
  "$ · "+fmt(row.engineerHours,0)+" 엔지니어시</p>"+
  "<p>재료: "+ingredients+"</p><p>배치 재료 기회비용: "+fmt(row.materialCost,0)+
  "$ · X그로그 대체수익 상실: "+fmt(row.opportunityProfitLost,0)+
  "$ · 배치 실질 비용: <b>"+fmt(row.economicBatchTotal,0)+
  "$</b> · 완성품 개당: <b>"+fmt(row.economicTotal,2)+"$</b></p>"+
  '<p class="subtle">'+esc(row.completeness||"")+"</p>";
}
function renderDetail(r){
 if(!r)return "";
 const supply=r.supply||{},scenarios=r.type==="원거리"?
  '<table class="rank-detail-table"><tr><th>거리</th><th>경장갑</th><th>중간 장갑</th><th>중장갑</th><th>특수내성</th></tr>'+
  (r.scenarios||[]).map(s=>'<tr><td>'+s.distance+'칸</td>'+
   ["경장갑","중간 장갑","중장갑","특수내성"].map(a=>"<td>"+fmt(s.armor?.[a],1)+"</td>").join("")+"</tr>").join("")+"</table>":
  '<table class="rank-detail-table"><tr><th>공격</th><th>TU%</th><th>횟수</th><th>명중도대리</th><th>TU100 HP</th></tr>'+
  (r.actions||[]).map(a=>"<tr><td>"+esc(a.mode)+"</td><td>"+fmt(a.tu,0)+"</td><td>"+fmt(a.shots||1,0)+
   "</td><td>"+fmt(a.accuracy,2)+"</td><td>"+fmt(a.hp100Tu,1)+"</td></tr>").join("")+"</table>";
 const firemodes=(r.modeScores||[]).map(a=>esc(a.label||a.mode)+" TU "+fmt(a.tu,0)+
  " / TU100 "+fmt(a.tu100Hp??a.hp100Tu,1)).join(" · ");
 const research=(supply.researchIds||[]).length?supply.researchIds.map(id=>link("research",id,id)).join(" "):
  "확인된 직접 구매·연구 연결 없음";
 const manufacture=(supply.manufactureIds||[]).length?supply.manufactureIds.map(id=>link("manufacture",id,id)).join(" "):
  "명시된 제조 연결 없음";
 return '<section class="rank-dossier" aria-label="제식 평가 상세"><h2>제식 평가 · '+esc(r.koName)+'</h2>'+
  '<p class="rank-evidence">규칙 확인과 추정 구분: '+esc(r.scoreConfidence)+' · '+esc(r.stageEvidence)+'</p>'+
  '<div class="detail-grid">'+field("제식점수 / 전투점수",grade(r.score)+" / "+grade(r.combatScore))+
  field("권장 행동",esc(r.bestMode))+
  field("제식 보급 분류",esc(supply.kind))+"</div>"+
  "<h3>거리·대상별 TU100 체력 피해(모형값)</h3><div class='rank-detail-scroll'>"+scenarios+"</div>"+
  '<p class="subtle">발사 방식별 비교: '+firemodes+"</p>"+
  '<div class="detail-grid">'+field("무기 구매가",fmt(r.weaponPrice,0))+
  field("발당 탄약비",fmt(r.costPerShot,2))+
  field("무게 / 장착칸",fmt(r.weight,0)+" / "+r.width+"×"+r.height)+
  field("손 사용",r.twoHanded?"양손":"한손/내장")+
  field("완전 제조원가",r.manufactureEconomics?fmt(r.manufactureEconomics.economicTotal,2)+"$/개":"해당 제조법 미확인")+
  field("점수의 근거",esc(r.scoreConfidence))+"</div>"+
  '<h3>아이템 DB 연결</h3><div class="rank-links">'+link("items",r.weaponId,"무기 상세 · "+r.weaponId)+
  (r.ammoId&&r.ammoId!==r.weaponId?link("items",r.ammoId,"탄약 상세 · "+r.ammoId):"")+"</div>"+
  '<h3>선행 연구</h3><div class="rank-links">'+research+"</div>"+
  (supply.unknownRequirements?.length?
   '<p class="warn">구매 조건 검증 필요: '+supply.unknownRequirements.map(esc).join(", ")+"</p>":"")+
  '<h3>제조 DB / 원가</h3><div class="rank-links">'+manufacture+"</div>"+
  '<div class="rank-costs"><h4>무기 제조</h4>'+production(r.manufactureEconomics)+
  "<h4>탄약 제조</h4>"+production(r.ammoManufactureEconomics)+"</div>"+
  '<p class="rank-footer">평가점수와 TU100 피해량은 모형 추정치입니다. 실제 명중, 복셀, 광역피해, 도탄, 발화, 재장전 TU 및 커스텀 스크립트는 완전 검증되지 않았습니다.</p></section>';
}
function showComparison(keys){
 const chosen=[...new Set(keys)].map(key=>byKey.get(key)).filter(Boolean).slice(0,4);
 if(chosen.length<2)return;
 const metrics=[
  ["제식 종합점수",r=>r.score],["전투 점수",r=>r.combatScore],
  ["4칸 TU100 HP",r=>r.scenarios?.find(s=>s.distance===4)?.tu100Hp??r.dptu],
  ["14칸 TU100 HP",r=>r.scenarios?.find(s=>s.distance===14)?.tu100Hp??r.dptu],
  ["28칸 TU100 HP",r=>r.scenarios?.find(s=>s.distance===28)?.tu100Hp??null],
  ["중장갑·14칸",r=>r.scenarios?.find(s=>s.distance===14)?.armor?.["중장갑"]??null],
  ["특수내성·14칸",r=>r.scenarios?.find(s=>s.distance===14)?.armor?.["특수내성"]??null],
  ["무기 구매가",r=>r.weaponPrice],["발당 탄약비",r=>r.costPerShot],
  ["제조 개당 실질비",r=>r.manufactureEconomics?.economicTotal??null],["획득 단계",r=>r.stage]
 ];
 el("detailBody").innerHTML='<section class="rank-dossier"><h2>제식 무기·탄약 직접 비교</h2>'+
  '<p class="subtle">선택한 탄종은 독립적인 평가 후보입니다. 미확인 비용은 0으로 간주하지 않습니다.</p>'+
  '<div class="rank-detail-scroll"><table class="rank-detail-table"><thead><tr><th>지표</th>'+
  chosen.map(r=>"<th>"+esc(r.koName)+"<small>"+esc(r.ammoKoName||"")+"</small></th>").join("")+"</tr></thead><tbody>"+
  metrics.map(([label,fn])=>"<tr><td>"+esc(label)+"</td>"+chosen.map(r=>"<td>"+
   (typeof fn(r)==="string"?esc(fn(r)):fmt(fn(r),2))+"</td>").join("")+"</tr>").join("")+
  "</tbody></table></div></section>";
 const dialog=el("detailDialog");if(!dialog.open)dialog.showModal();
}
const ready=fetch("../data/standard-evaluation.json?v=20261021-unified").then(async response=>{
 if(!response.ok)throw Error("제식 평가 데이터 HTTP "+response.status);
 data=await response.json();
 const records=[...(data.ranged||[]),...(data.melee||[])];
 if(!records.length)throw Error("제식 평가 데이터가 비어 있습니다");
 for(const r of records)byKey.set(r.key,r);
 return true;
}).catch(error=>{
 console.warn("제식 평가를 불러올 수 없어 일반 무기DB만 표시합니다:",error);
 return false;
});
window.XPStandardEvaluation={ready,get,renderDetail,showComparison,count:()=>byKey.size};
})();