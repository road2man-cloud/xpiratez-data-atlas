// Browser-only save controls for the X-Piratez 2.1 soldier verifier.
import {importModernSave,modernSoldierProof} from "./save-adapter.js";
import {battleStatsWithEquipment,STAT_KEYS} from "./eligibility.js";
const $=query=>document.querySelector(query);
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

export function initModernSaveControls(data,onSelection){
  let save=null;
  function current(){
    const b=Number($("#saveBase").value),s=Number($("#saveSoldier").value);
    return save&&Number.isInteger(b)&&Number.isInteger(s)
      ?modernSoldierProof(data,save,b,s):null;
  }
  function selectionChanged(){
    onSelection(save,current());
    const proof=current();
    if(proof?.kind==="proof"){
      const battle=battleStatsWithEquipment(proof.state,data,proof.options);
      const out=$("#saveBattleStats");
      const complete=proof.state.exactStats&&proof.options.medalsKnown&&
        battle.stats&&battle.kind!=="blocked"&&
        !Object.keys(proof.options.commendations||{}).includes("STR_MEDAL_WEAPON_PROFICIENCY_NAME");
      if(complete){
        out.innerHTML='<strong>현재 대원 · 실제 장착 방어구 한 벌과 확인된 특성 포함 실효 능력치</strong>'+
          '<div class="stats-grid">'+STAT_KEYS.map(k=>'<div class="statbox"><small>'+
          esc(data.statLabels[k]||k)+'</small><b>'+Number(battle.stats[k]).toLocaleString("ko-KR")+
          '</b></div>').join("")+'</div>';
      }else{
        out.textContent="현재 실효 능력치 보류: "+(battle.reason||"방어구·훈장·능력치의 완전한 증거가 없습니다.");
      }
      $("#saveStatus").textContent="OXCE 8.7.1 / v.o2 · 완료 연구 "+save.research.completed.length+
        "개 · 폐쇄 연구 "+save.research.disabled.length+"개 · 선택 기지 진행 중 연구 "+
        (proof.base.researchComplete?proof.base.researchProjects.size+"개":"미확인")+
        " · 선택 대원 "+proof.soldier.name+
        " · 변신 이력 "+proof.state.history.size+"개 · 상태 "+proof.state.status+
        (save.warnings.length?" · 판독 주의 "+save.warnings.length+"건":"");
    }else{
      $("#saveBattleStats").textContent="";
      $("#saveStatus").textContent=proof?.issues?.join(" · ")||"분석할 주둔 대원이 없습니다.";
    }
  }
  function chooseBase(){
    const b=save?.personnel.bases?.[Number($("#saveBase").value)];
    const sel=$("#saveSoldier");
    sel.innerHTML=(b?.soldiers||[]).map((s,i)=>
      '<option value="'+i+'">'+esc(s.name+" / "+(s.type||"병종 미확인"))+'</option>').join("");
    if(!sel.options.length)sel.innerHTML='<option value="">주둔 대원 없음</option>';
    selectionChanged();
  }
  const input=$("#modernSaveFile");
  input.addEventListener("change",async()=>{
    const file=input.files?.[0];if(!file)return;
    try{
      if(file.size>60*1024*1024)throw Error("60MB 이상 파일은 분석하지 않습니다.");
      save=importModernSave(await file.text(),data);
      $("#modernClearSave").disabled=false;
      $("#analysisMode").querySelector('[value="current"]').disabled=false;
      $("#analysisMode").value="current";
      $("#saveRoster").hidden=false;
      $("#saveBase").innerHTML=save.personnel.bases.map((b,i)=>
        '<option value="'+i+'">'+esc(b.name)+" ("+b.soldiers.length+"명)</option>").join("");
      chooseBase();
    }catch(error){
      save=null;
      $("#analysisMode").value="future";
      $("#saveRoster").hidden=true;
      $("#saveStatus").textContent="세이브 판독 실패: "+error.message;
      $("#saveProof").textContent="";
      $("#saveBattleStats").textContent="";
      onSelection(null,null);
    }
  });
  $("#modernClearSave").onclick=()=>{
    save=null;input.value="";
    $("#modernClearSave").disabled=true;
    $("#analysisMode").value="future";
    $("#analysisMode").querySelector('[value="current"]').disabled=true;
    $("#saveRoster").hidden=true;
    $("#saveStatus").textContent="세이브 미적용 · 미래 경로만 검토합니다.";
    $("#saveProof").textContent="";
    $("#saveBattleStats").textContent="";
    onSelection(null,null);
  };
  $("#saveBase").onchange=chooseBase;
  $("#saveSoldier").onchange=selectionChanged;
  $("#analysisMode").onchange=()=>{
    if($("#analysisMode").value==="current"&&!save)$("#analysisMode").value="future";
    selectionChanged();
  };
}
export function renderModernSaveResults(candidates,proof,mode,plannedSteps){
  const slot=$("#saveProof");
  if(!slot)return;
  if(proof?.kind!=="proof"){
    slot.textContent="";
    return;
  }
  const ready=candidates.filter(x=>x.step.kind==="eligible").length;
  const blocked=candidates.filter(x=>x.step.kind==="blocked").length;
  const conditional=candidates.filter(x=>x.step.kind==="conditional").length;
  slot.textContent=(mode==="current"?"실제 세이브의 즉시 실행 판정":"미래 실행 가정")+
    " · 조건 충족 "+ready+"개 · 미충족 "+blocked+"개 · 불확실 "+conditional+"개."+
    (plannedSteps?" 선택된 변신 후의 자원 소비·능력치는 미래 조건부로만 표시합니다.":"")+
    (proof.issues.length?" 근거 한계: "+proof.issues.join(" · "):"");
}
