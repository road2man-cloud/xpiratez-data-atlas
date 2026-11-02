// Source-first X-Piratez 2.1 soldier maxima ledger on the EXISTING atlas.
// A birth profile is NOT interchangeable with another profile of its body.
// Incoming transformations and clones remain unresolved until the parent
// origin, chronology and exact input state have been replayed.
import {initialState,STAT_KEYS} from "./eligibility.js";
import {createStatEnvelope} from "./stat-envelope.js";
import {growStatEnvelope} from "./growth-envelope.js";

export const ACQUISITION_STATS=STAT_KEYS.filter(k=>k!=="mana");
export const ACQUISITION_STATUSES=Object.freeze({
  VERIFIED:"실행 경로 검증",
  CONDITIONAL:"조건부 실행 경로",
  IMPOSSIBLE:"불가능 판정",
  UNVERIFIED:"미검증"
});
const escapeHtml=x=>String(x??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const numeric=x=>Number.isFinite(Number(x))?Number(x):0;
const statRecord=x=>Object.fromEntries(ACQUISITION_STATS.map(k=>[k,numeric(x?.[k])]));
const statBands=x=>x&&x.min&&x.avg&&x.max
  ?{min:statRecord(x.min),avg:statRecord(x.avg),max:statRecord(x.max)}:null;
const orderedCounts=x=>Object.fromEntries(Object.entries(x||{}).filter(([,n])=>numeric(n)>0).sort(([a],[b])=>a.localeCompare(b)));
const statusFields=()=>({
  proofStatus:"UNVERIFIED",proofSteps:[],saveVerified:false,
  finalStats:null,finalStatSum:null,permanentBonusSum:null,
  missingProof:["연구·자원·획득·성장·훈장·변신의 시간순 실행 증명"]
});

export function buildAcquisitionLedger(data){
  if(data?.soldiers?.length!==29||data?.transformations?.length!==83||
    !Array.isArray(data?.profiles))
    throw Error("X-Piratez 2.1 획득형 원본 범위가 예상과 다릅니다");
  const soldiers=new Map(data.soldiers.map(s=>[s.id,s]));
  const entries=[];
  for(const p of data.profiles){
    const soldier=soldiers.get(p.soldierType);
    if(!soldier)throw Error("출생 병종 원본 누락: "+p.id);
    const state=initialState(data,p.id,{band:"avg"});
    const envelope=createStatEnvelope(data,p.id);
    // A relaxed, independent upper envelope; NEVER a replayed growth schedule.
    const trained=growStatEnvelope(
      growStatEnvelope(envelope,state,data,"@BATTLE_GROWTH"),
      state,data,"@PHYS_TRAINING");
    const growthUpper=trained?.kind==="ready"?
      Object.fromEntries(ACQUISITION_STATS.map(k=>[k,
        Math.max(k==="health"?1:0,numeric(trained.high[k])+numeric(p.traitStats?.[k]))])):null;
    entries.push({
      id:p.id,kind:p.sourceType,sourceId:p.sourceId,
      sourceName:p.sourceKoName||p.sourceId,soldierType:p.soldierType,
      soldierName:soldier.koName,sourceFiles:p.sourceFiles||[],
      parentType:null,parentOrigin:null,transformationId:null,
      birth:{
        initialRaw:statBands(p.initialStatsBeforeTraits),
        currentRaw:statBands(p.currentStatsBeforeTraits),
        effective:statBands(p.effectiveStats),
        traitStats:statRecord(p.traitStats),
        history:orderedCounts(p.previousTransformations),
        traits:orderedCounts(p.traitCounts),
        rank:p.rank??0,armor:p.armor||null,
        // This is a theoretical cap, not proof that this newborn can grow to it.
        statCaps:statRecord(p.rawStatCaps||soldier.statCaps),
        trainingStatCaps:statRecord(p.trainingStatCaps||soldier.trainingStatCaps),
        growthUpper,
        growthEvidence:trained?.kind==="ready"?"RELAXED_ENVELOPE":"UNVERIFIED",
        growthNotes:trained?.kind==="ready"?trained.notes:[trained?.reason||"원본 성장 범위 불완전"]
      },
      requirements:{
        research:p.requires||[],baseFunctions:p.requiresBaseFunc||[],
        items:{},cost:p.cost??null,time:p.time??null,
        monthlyLimit:p.monthlyBuyLimit??null,spawnedPersons:p.spawnedPersons??1
      },
      resetHistory:false,clone:false,
      ...statusFields()
    });
  }
  // A body-changing procedure is not a newborn with the target body's caps.
  // Each eligible source body is a distinct unresolved inbound *edge*, not
  // an invented new base soldier. Cloning creates a distinct person, too.
  for(const t of data.transformations){
    if(!t.producedSoldierType&&!t.createsClone)continue;
    const allowed=[...new Set(t.allowedSoldierTypes||[])];
    for(const parentType of allowed){
      const target=t.producedSoldierType||parentType;
      const soldier=soldiers.get(target);
      if(!soldier)throw Error("변신 산출 병종 누락: "+t.id+"/"+target);
      entries.push({
        id:"transform:"+t.id+":"+parentType,
        kind:t.createsClone?"clone":"conversion",
        sourceId:t.id,sourceName:t.koName||t.id,
        soldierType:target,soldierName:soldier.koName,
        sourceFiles:t.sourceFiles||[],
        parentType,parentOrigin:null,transformationId:t.id,birth:null,
        requirements:{
          research:t.requires||[],baseFunctions:t.requiresBaseFunc||[],
          items:t.requiredItems||{},cost:t.cost??null,time:t.time??null,
          requiredHistory:t.requiredPreviousTransformations||[],
          forbiddenHistory:t.forbiddenPreviousTransformations||[],
          requiredMinStats:statRecord(t.requiredMinStats),
          requiredMaxStats:t.requiredMaxStats||null,
          requiredCommendations:t.requiredCommendations||{},
          minRank:t.minRank??0
        },
        resetHistory:t.reset===true,clone:t.createsClone===true,
        ...statusFields(),
        missingProof:["부모 획득처와 실제 변신 직전 능력치·훈장·이력",
          "연구·재료·시설·변신 시술의 시간순 실행 증명"]
      });
    }
  }
  return {
    schemaVersion:1,source:"soldiers-modern-index.json / X-Piratez 2.1",
    // Existing 29-body candidate report is deliberately NOT an input to totals.
    forbiddenInference:"BODY_CAP_PLUS_BONUS_IS_NOT_VERIFIED_MAXIMUM",
    stats:ACQUISITION_STATS,entries,
    summary:{
      bodies:data.soldiers.length,explicitProfiles:data.profiles.length,
      incomingEdges:entries.length-data.profiles.length,
      clones:entries.filter(x=>x.clone).length,
      resets:entries.filter(x=>x.resetHistory).length,
      executed:0,saveVerified:0
    }
  };
}

export function validateAcquisitionLedger(ledger,data){
  if(ledger.schemaVersion!==1||ledger.stats.length!==11||
    ledger.entries.length!==data.profiles.length+ledger.summary.incomingEdges||
    ledger.summary.explicitProfiles!==data.profiles.length)
    throw Error("획득처 원장 스키마/집계 불일치");
  const ids=new Set(),sourceIds=new Set(data.profiles.map(x=>x.id));
  if(sourceIds.size!==data.profiles.length)throw Error("획득처 원본 중복");
  for(const e of ledger.entries){
    if(ids.has(e.id))throw Error("획득처 중복: "+e.id);
    ids.add(e.id);
    if(!data.soldiers.some(x=>x.id===e.soldierType))
      throw Error("출생 병종 누락: "+e.id);
    if(e.proofStatus!=="UNVERIFIED"||e.saveVerified||e.finalStats!==null||
      e.finalStatSum!==null||e.permanentBonusSum!==null)
      throw Error("미검증 출생 경로가 확정 최댓값으로 승격됨: "+e.id);
    if(e.kind==="conversion"||e.kind==="clone"){
      if(e.birth!==null||e.parentOrigin!==null)
        throw Error("부모 이력/성장을 임의 상속한 전환: "+e.id);
      const t=data.transformations.find(x=>x.id===e.transformationId);
      if(!t||!(t.allowedSoldierTypes||[]).includes(e.parentType)||
        (t.producedSoldierType||e.parentType)!==e.soldierType||
        !!t.createsClone!==e.clone||!!t.reset!==e.resetHistory)
        throw Error("변신/클론 원본 변경: "+e.id);
    }else{
      const p=data.profiles.find(x=>x.id===e.id);
      if(!p||p.soldierType!==e.soldierType||!e.birth?.effective||
        JSON.stringify(e.birth.history)!==JSON.stringify(orderedCounts(p.previousTransformations))||
        JSON.stringify(e.birth.traits)!==JSON.stringify(orderedCounts(p.traitCounts)))
        throw Error("초기 이력·보너스 출생 원본 불일치: "+e.id);
    }
  }
  if(data.profiles.some(p=>!ids.has(p.id)))throw Error("누락된 출생 프로필");
  return ledger.summary;
}

const KIND={direct:"직접 모집",manufacture:"제조·모집",event:"이벤트",
  conversion:"병종 전환",clone:"신규 클론"};
const FORMAT_STAT={tu:"행동력",stamina:"기력",health:"체력",bravery:"용기",
  reactions:"반응",firing:"사격",throwing:"투척",strength:"힘",
  psiStrength:"사이오닉 강도",psiSkill:"사이오닉 기술",melee:"근접"};
const pretty=n=>n==null?"—":Number(n).toLocaleString("ko-KR");
const idsList=(value,empty="없음")=>{
  const xs=Array.isArray(value)?value:Object.entries(value||{}).map(([k,n])=>k+" ×"+n);
  return xs.length?xs.map(x=>"<code>"+escapeHtml(x)+"</code>").join(", "):empty;
};

export function initAcquisitionMaxima(data){
  const root=document.querySelector("#acquisitionMaxima");
  if(!root)return;
  const output=root.querySelector("#acquisitionMaximaRows");
  const status=root.querySelector("#acquisitionMaximaStatus");
  try{
    const ledger=buildAcquisitionLedger(data);
    validateAcquisitionLedger(ledger,data);
    const entryById=new Map(ledger.entries.map(x=>[x.id,x]));
    root.querySelector("#acquisitionMaximaSummary").textContent=
      "원본 획득 프로필 "+ledger.summary.explicitProfiles+"개 · 병종 전환/클론 입력 간선 "+
      ledger.summary.incomingEdges+"개 · 대상 병종 "+ledger.summary.bodies+
      "개 · 실행 경로 검증 "+ledger.summary.executed+
      "개 · 세이브 최종 인증 "+ledger.summary.saveVerified+"개";
    const search=root.querySelector("#acquisitionMaximaSearch");
    const kind=root.querySelector("#acquisitionMaximaKind");
    const band=root.querySelector("#acquisitionMaximaBand");
    const details=root.querySelector("#acquisitionMaximaDetails");
    function values(e){
      if(!e.birth)return null;
      if(band.value==="growth")return e.birth.growthUpper;
      return e.birth.effective?.[band.value]||null;
    }
    function render(){
      const term=search.value.trim().toLocaleLowerCase("ko-KR");
      const rows=ledger.entries.filter(e=>(kind.value==="all"||e.kind===kind.value)&&
        (!term||[e.id,e.sourceId,e.sourceName,e.soldierType,e.soldierName,e.parentType]
          .filter(Boolean).join(" ").toLocaleLowerCase("ko-KR").includes(term)));
      output.innerHTML=rows.map(e=>{
        const v=values(e);
        return '<tr><td><button class="maxima-show" data-acquisition-id="'+escapeHtml(e.id)+
          '" type="button">'+escapeHtml(e.sourceName)+'</button>'+
          '<small>'+escapeHtml(e.id)+'</small></td><td>'+escapeHtml(e.soldierName)+
          '<small>'+escapeHtml(e.soldierType)+'</small></td><td>'+
          escapeHtml(KIND[e.kind]||e.kind)+'</td><td class="maxima-uncertain">'+
          escapeHtml(ACQUISITION_STATUSES[e.proofStatus])+'</td>'+
          ACQUISITION_STATS.map(k=>'<td class="maxima-stat">'+
            (v?pretty(v[k]):"—")+'</td>').join("")+
          '<td>—</td></tr>';
      }).join("")||'<tr><td colspan="16">검색 결과가 없습니다.</td></tr>';
      status.textContent=rows.length+"개 획득 경로 표시 · "+(
        band.value==="growth"?"장기 성장의 완화된 상계 (실현 가능성 미증명)":
        "출생 시 고정 특성 포함 "+({min:"최소",avg:"평균",max:"최대"}[band.value])+" 능력치")+
        " · 최종 능력치·훈장·영구 보너스 합계는 시간순 증명 전까지 비공개";
    }
    function show(e){
      const born=e.birth;
      const ths=ACQUISITION_STATS.map(k=>"<th>"+escapeHtml(FORMAT_STAT[k])+"</th>").join("");
      const cells=key=>ACQUISITION_STATS.map(k=>"<td>"+
        (key?pretty(key[k]):"—")+"</td>").join("");
      const provenance=e.parentType?
        '<p><strong>원본 병종:</strong> '+escapeHtml(e.parentType)+
        ' · 부모 획득 프로필/시술 전 상태 미확정. '+(e.clone?
          '복제된 병사는 별도의 신규 대원으로 취급하며 부모 훈장과 이력을 상속하지 않습니다.':
          e.resetHistory?'reset: true · 이전 변신 이력과 영구 보너스 초기화 필요.':
          '이전 이력의 존속 여부는 부모를 지정한 뒤 엔진 규칙으로 재생해야 합니다.')+'</p>':
        '<p><strong>출생 이력:</strong> '+idsList(born.history)+
        ' · <strong>최초 특성:</strong> '+idsList(born.traits)+
        ' · <strong>계급:</strong> '+escapeHtml(born.rank)+
        ' · <strong>방어구:</strong> '+escapeHtml(born.armor||"없음")+'</p>';
      const req=e.requirements;
      details.hidden=false;
      details.innerHTML='<div class="maxima-detail-head"><h3>'+escapeHtml(e.soldierName)+
        ' · '+escapeHtml(e.id)+'</h3><button type="button" id="acquisitionMaximaClose">닫기</button></div>'+
        '<p><strong>판정: 미검증.</strong> 원본의 획득 출처만 확인됐습니다. 여기서 표시한 생성값이나 성장 상계는 실제 최종 능력치가 아닙니다.</p>'+
        provenance+
        '<p><strong>선행 연구:</strong> '+idsList(req.research)+
        ' · <strong>시설 기능:</strong> '+idsList(req.baseFunctions)+
        ' · <strong>재료:</strong> '+idsList(req.items)+'</p>'+
        (e.transformationId?'<p><strong>변신 규칙:</strong> '+escapeHtml(e.transformationId)+
          ' · <strong>최소 계급:</strong> '+escapeHtml(req.minRank)+
          ' · <strong>필수 이력:</strong> '+idsList(req.requiredHistory)+
          ' · <strong>금지 이력:</strong> '+idsList(req.forbiddenHistory)+
          ' · <strong>훈장 요구:</strong> '+idsList(req.requiredCommendations)+'</p>':'')+
        '<p><strong>원본 파일:</strong> '+idsList(e.sourceFiles)+
        ' · <strong>검증 누락:</strong> '+escapeHtml(e.missingProof.join(" / "))+'</p>'+
        '<div class="maxima-route-table"><table><thead><tr><th>구분</th>'+ths+
        '</tr></thead><tbody>'+
        '<tr><th>최초 생생성 최소 (특성 반영)</th>'+cells(born?.effective?.min)+'</tr>'+
        '<tr><th>최초 생성 평균 (특성 반영)</th>'+cells(born?.effective?.avg)+'</tr>'+
        '<tr><th>최초 생성 최대 (특성 반영)</th>'+cells(born?.effective?.max)+'</tr>'+
        '<tr><th>최초 원시 능력치 평균</th>'+cells(born?.currentRaw?.avg)+'</tr>'+
        '<tr><th>출생 시 특성 보정</th>'+cells(born?.traitStats)+'</tr>'+
        '<tr><th>기본 성장 하드캡</th>'+cells(born?.statCaps)+'</tr>'+
        '<tr><th>체력훈련 캡</th>'+cells(born?.trainingStatCaps)+'</tr>'+
        '<tr><th>전투·체력훈련 잠재 상계 (미검증)</th>'+cells(born?.growthUpper)+'</tr>'+
        '<tr><th>실제 실행된 최종 능력치</th>'+cells(e.finalStats)+'</tr>'+
        '</tbody></table></div>'+
        '<p class="muted">능력치 11개는 마나를 제외합니다. 원본 생성 범위·훈장·변신 확률의 동시 실현은 검증되지 않았습니다. 출생 뒤 전투 경험치, 훈장, 연구와 변신은 각각 올바른 시간순 증거가 있어야 합산할 수 있습니다.</p>'+
        (e.kind==="conversion"||e.kind==="clone"?
          '<p><a href="?dataset=transformations&amp;family='+encodeURIComponent(e.parentType)+
            '">기존 변신·훈련 규칙에서 출발 병종 확인</a></p>':
          '<p><a href="?profile='+encodeURIComponent(e.id)+'">기존 출생 프로필 상세 및 육성 경로 계획 열기</a></p>');
      details.querySelector("#acquisitionMaximaClose").addEventListener("click",()=>{
        details.hidden=true;details.innerHTML="";
      });
    }
    for(const select of [search,kind,band])
      select.addEventListener(select===search?"input":"change",render);
    output.addEventListener("click",event=>{
      const button=event.target.closest("button[data-acquisition-id]");
      if(button&&entryById.has(button.dataset.acquisitionId))
        show(entryById.get(button.dataset.acquisitionId));
    });
    render();
  }catch(error){
    status.textContent="획득처별 분석 검증 실패: "+error.message+
      " · 미검증 수치를 확정 최댓값으로 표시하지 않습니다.";
    console.error("Acquisition maxima",error);
  }
}
