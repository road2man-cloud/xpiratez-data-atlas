// Local-only, read-only bridge from a registered career witness to a real save.
// A matching saved fact is not proof that the full model action was performed
// at its recorded chronological point. Never mutate a save or grant a rule.
import {importModernSave} from "./save-adapter.js";
const researchKinds=new Set(["research","freeResearch","eventResearch","missionResearch"]);
const labels={research:"연구",freeResearch:"무료 연구",eventResearch:"이벤트 연구",missionResearch:"임무 연구",repeatResearch:"반복 연구",transform:"시술·변신",recruit:"모집",conditionalCapGrowth:"전투캡 성장",conditionalPromotion:"승급",conditionalMedal:"훈장",externalInputs:"자원·시설 조달",advanceMonth:"시간 경과",campaignContext:"캠페인 시작 조건"};
const statusLabels={recorded:"저장 근거 있음",inactive:"비활성 / 차단",ongoing:"진행 중",pending:"미확보",manual:"게임에서 확인",unknown:"이력 미확인",unloaded:"세이브 미선택"};
const actionId=a=>a.transform||a.research||a.id||a.profile||a.source||"";
export function buildLiveCareerGuide(actions,save,person=null){
 const complete=new Set(save?.research?.completed||[]),disabled=new Set(save?.research?.disabled||[]);
 const activeProjects=new Set(save?.personnel?.bases?.flatMap(b=>[...b.researchProjects])||[]);
 const occurrences=new Map();
 return actions.map((a,i)=>{
  const id=actionId(a);let status=save?"manual":"unloaded",note="";
  if(save&&researchKinds.has(a.type)){
   status=disabled.has(id)?"inactive":complete.has(id)?"recorded":activeProjects.has(id)?"ongoing":"pending";
   note=a.type==="research"?"현재 저장본의 연구 상태": "현재 연구 상태만 확인; 해당 획득 경위는 미확인";
  }else if(save&&a.type==="repeatResearch"){note="완료 연구 목록만으로 반복 횟수·순서를 확정할 수 없음";}
  else if(save&&a.type==="transform"){
   const k=(a.soldier||"")+"|"+id,n=(occurrences.get(k)||0)+1;occurrences.set(k,n);
   if(a.soldier==="origin"&&person?.historyComplete){
    const count=Number(person.previousTransformations?.[id]||0);
    status=count>=n?"recorded":"unknown";
    note="현재 보존된 시술 이력 "+count+"회 / 경로상 "+n+"회; 초기화·시점·출생처는 별도 확인";
   }else{status="unknown";note="해당 대원의 실제 시술 이력 선택 필요";}
  }else if(save&&a.type==="recruit"){note="동일 병종만으로 출생처와 동일 개체를 인증할 수 없음";}
  else if(a.type==="externalInputs"){note="모형의 조달 가정; 실제 게임의 재료·시설·자금 확인 필요";}
  else if(a.type==="conditionalCapGrowth"){note="실제 전투·훈련으로 성장캡 도달 필요";}
  else if(a.type==="conditionalPromotion"||a.type==="conditionalMedal"){note="실제 승급·훈장 조건 확인 필요";}
  return {index:i+1,id,type:a.type,status,note,action:a};
 });
}
export function mountLiveCareerGuide({route,actions,modern,name=x=>x,branch,terminalGoals=[]}){
 const el=(tag,t)=>{const x=document.createElement(tag);if(t!==undefined)x.textContent=t;return x;};
 const root=el("details");root.open=true;root.className="live-career-guide";
 root.append(el("summary","실전 진행표 · 내 세이브와 비교"),el("p","실제 X-Piratez v.o2 저장본을 로컬에서 읽어 이 연구·육성 경로와 비교합니다. 저장 파일을 업로드하거나 변경하지 않습니다. 일치 표시는 현재 저장 근거이며 시간순 재생·실제 승리 인증이 아닙니다."));
 const file=el("input");file.type="file";file.accept=".sav,.asav";const fileLabel=el("label","게임 세이브 ");fileLabel.append(file);
 const picker=el("select");picker.disabled=true;const pickerLabel=el("label","대조할 실제 대원 ");pickerLabel.append(picker);
 const mode=el("select");for(const [v,t] of [["next","미확보·차단·진행 연구"],["surgery","모집·시술·성장"],["all","전체 행동"]])mode.add(new Option(t,v));
 const modeLabel=el("label","표시 ");modeLabel.append(mode);
 const controls=el("div");controls.style.display="flex";controls.style.flexWrap="wrap";controls.style.gap="10px";controls.append(fileLabel,pickerLabel,modeLabel);
 const exportBtn=el("button","진행표 저장 (.txt)");exportBtn.type="button";controls.append(exportBtn);
 const message=el("p"),result=el("div"),nav=el("div"),prev=el("button","이전"),next=el("button","다음"),pageText=el("span");prev.type=next.type="button";nav.append(prev,pageText,next);
 root.append(controls,message,result,nav);
 let save=null,people=[],rows=[],page=0,token=0,filename="";
 const cap=80;
 function title(r){const a=r.action;return (labels[r.type]||r.type)+(r.id?" · "+name(r.id):a.rank!==undefined?" · "+a.rank:a.month!==undefined?" · "+a.month+"개월":"");}
 function render(){
  const person=people[Number(picker.value)-1]?.soldier||null;rows=buildLiveCareerGuide(actions,save,person);
  const done=rows.filter(r=>r.status==="recorded").length;
  const blockers=rows.filter(r=>r.status==="inactive").length;
  const goals=[...new Set([...terminalGoals,...(branch?.captain||[]),...Object.values(branch?.choices||{}).filter(Boolean)])];
  const blockedGoals=goals.filter(id=>save?.research?.disabled?.includes(id));
  const missing=rows.filter(r=>["pending","ongoing"].includes(r.status)&&researchKinds.has(r.type));
  message.textContent=save?filename+" · 읽은 대원 "+people.length+"명 · 저장 근거 "+done+"행 · 비활성 연구 "+blockers+"행 · 남은/진행 중 연구 "+missing.length+"행"+(blockedGoals.length?" · 분기/최종 목표 차단 확인: "+blockedGoals.map(name).join(" · "):"")+(save.warnings.length?" · 파싱 경고 "+save.warnings.length+"건":""):"세이브를 선택하면 실제 연구 상태와 시술 기록을 비교합니다.";
  const visible=rows.filter(r=>mode.value==="all"||mode.value==="surgery"&&["recruit","transform","conditionalCapGrowth","conditionalPromotion","conditionalMedal"].includes(r.type)||mode.value==="next"&&researchKinds.has(r.type)&&r.status!=="recorded");
  page=Math.min(page,Math.max(0,Math.ceil(visible.length/cap)-1));
  const table=el("table"),head=el("tr");for(const t of ["순서","행동","저장 근거","설명"])head.append(el("th",t));table.append(head);
  for(const r of visible.slice(page*cap,(page+1)*cap)){const tr=el("tr");for(const t of [r.index,title(r),statusLabels[r.status],r.note])tr.append(el("td",String(t)));table.append(tr);}
  result.replaceChildren(visible.length?table:el("p","해당 표시 조건의 행동이 없습니다."));pageText.textContent=" "+(page+1)+" / "+Math.max(1,Math.ceil(visible.length/cap))+" ";prev.disabled=page===0;next.disabled=(page+1)*cap>=visible.length;
 }
 file.onchange=async()=>{const t=++token;save=null;people=[];filename="";picker.replaceChildren(new Option("선택 안 함","0"));picker.disabled=true;page=0;render();try{const f=file.files?.[0];if(!f)return;if(f.size>60*1024*1024)throw Error("최대 60MB");const parsed=importModernSave(await f.text(),modern);if(t!==token)return;save=parsed;filename=f.name;people=save.personnel.bases.flatMap(b=>b.soldiers.map(s=>({base:b,soldier:s})));people.forEach(({base,soldier:s},i)=>picker.add(new Option((base.name||"기지")+" / "+(s.name||s.id)+" · "+name(s.type),String(i+1))));picker.disabled=!people.length;render();}catch(e){if(t===token)message.textContent="세이브 읽기 실패: "+e.message;}};
 picker.onchange=mode.onchange=()=>{page=0;render();};prev.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};
 exportBtn.onclick=()=>{const text=["X-Piratez 실전 진행표",route.id,filename||"세이브 미선택","현재 저장 근거와 시간순 실행 증명은 다릅니다.",...rows.map(r=>r.index+"\t"+title(r)+"\t"+statusLabels[r.status]+"\t"+r.note)].join("\r\n");const url=URL.createObjectURL(new Blob(["\uFEFF",text],{type:"text/plain;charset=utf-8"})),a=el("a");a.href=url;a.download="XPZ-career-checklist.txt";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 picker.add(new Option("선택 안 함","0"));render();return root;
}
