// Static, read-only X-Piratez v.o2 tactical-map evidence for rare future gear.
// MapBlock placement is NOT a promise that the mission is generated or loot
// recovered. Keep this visibly separate from a verified acquisition.
const esc=x=>String(x).replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const subjects=[
  ["STR_DREAM_ECHO","꿈의 메아리 · 차원 연구 표본"],
  ["STR_GDX_005","GDX 문서 · 학교/선장 일지 경로"],
  ["STR_MYSTERY_BOX","수수께끼 상자 · 아바타 메달리온 추첨"],
  ["STR_AVATAR_MEDALLION","아바타 메달리온 · 희귀 복장 재료"]
];
export function renderRareMapLootProof(node,data){
  if(!node)return;
  const rows=subjects.map(([id,label])=>{
    const supply=data.itemSupply?.[id]||{};
    const map=supply.mapLoot||{};
    const fixed=(map.sources||[]).filter(x=>x.placement==="fixedOnBlock"&&x.missionPaths?.length);
    const random=(map.sources||[]).filter(x=>x.placement==="randomOnBlock"&&x.missionPaths?.length);
    const selected=[...fixed,...random].slice(0,4);
    const summaries=selected.map(x=>{
      const path=x.missionPaths.find(m=>m.deployment===(
        id==="STR_DREAM_ECHO"||id==="STR_MYSTERY_BOX"
          ?"STR_LOC_EMANSION_MAG":id==="STR_GDX_005"
          ?"STR_LOC_GDX_PRISON":""))||x.missionPaths[0];
      const unique=x.blockSelection==="soleCandidateForAddBlock";
      const candidate=x.placement==="fixedOnBlock"?
        "블록 내 고정 "+x.count+"개":"블록 내 무작위 배치 후보";
      return '<li><code>'+esc(x.terrain+" / "+x.block)+'</code> · '+esc(candidate)+
        ' · '+(unique?"맵스크립트에서 유일한 일치 블록":"맵블록 채택은 조건부")+
        (path?'<div class="muted">임무 '+esc(path.deployment)+
          ' · 스크립트 '+esc(path.script)+
          ' · 실행시도 '+esc(path.executionOdds)+'%'+
          (path.researchPositive?.length?' · 필요 연구 '+esc(path.researchPositive.join(", ")):"")+
          (path.researchNegative?.length?' · 금지 연구 '+esc(path.researchNegative.join(", ")):"")+
          '</div>':"")+'</li>';
    }).join("");
    const randomMan=(supply.randomManufacture||[]).slice(0,3).map(x=>
      '<li><code>'+esc(x.id)+'</code> · 결과 가중치 '+
      esc(x.weight)+'/'+esc(x.weightTotal)+' · 재료 '+esc(Object.entries(x.requiredItems||{})
        .map(([k,n])=>k+" ×"+n).join(", ")||"없음")+'</li>').join("");
    return '<article class="box"><h3>'+esc(label)+'</h3><p><code>'+esc(id)+'</code> · '+
      '<a href="../../items/#item='+encodeURIComponent(id)+'">아이템 DB</a></p>'+
      (selected.length?'<ul>'+summaries+'</ul>':
        '<p class="muted">확인된 고정 전술 지도 배치 없음. 이벤트/제조/다른 전리품 출처는 별도 검증</p>')+
      (randomMan?'<p><strong>확률 제조</strong></p><ul>'+randomMan+'</ul>':"")+
      (map.possiblyTruncated?'<p class="muted">지도 출처 전체 '+esc(map.sourceCount)+
        '건 중 주요 출처 '+esc((map.sources||[]).length)+'건만 색인</p>':"")+
      '</article>';
  }).join("");
  node.innerHTML='<p class="muted">원본 2.1 전술 지도 블록 → 지도 생성 스크립트 → 임무 배치 → 월별 임무 스크립트를 연결한 근거입니다. '+
    '<strong>임무 발동·블록 생성·아이템 회수·해당 세이브의 연구 선행조건 달성은 보장되지 않습니다.</strong> '+
    '성녀 복장 재료는 여기서 입수 경로만 표시하며 병종 최종 능력치에는 자동 합산하지 않습니다.</p>'+
    '<div class="detail-grid">'+rows+'</div>';
}
