/* Shared decision-first explanation layer for every XPiratez Atlas catalog.
 * No live LLM call: source-grounded cards generated and checked at build time.
 * Does not modify sorting, filters, selection or existing detail panels. */
(() => {
  "use strict";
  const supported=new Set(["starting","captains","soldiers","trainings","crafts","craft-weapons","facilities","armors","items","research","manufacture","events","forces","weapons"]);
  const path=location.pathname.split("/").filter(Boolean);
  const tail=path[path.length-1];
  const kind=tail==="index.html"?path[path.length-2]:tail;
  if(!supported.has(kind))return;

  const selectors={
    starting:"#cards > .card[data-play-id]",
    captains:"#matrixTable tbody tr[data-id], #exclusiveRules .choice-option[data-choice-id]",
    soldiers:"#soldierTable tbody tr[data-row]",
    trainings:"#trainingTable tbody tr[data-id]",
    crafts:"#craftTable tbody tr[data-id]",
    "craft-weapons":"#weaponTable tbody tr[data-id]",
    facilities:"#facilityTable tbody tr[data-id]",
    armors:"#armorTable tbody tr[data-id]",
    items:"#tbody tr[data-id]",
    research:"#tbody tr[data-id]",
    manufacture:"#manufactureTable tbody tr[data-id]",
    events:"#eventTable tbody tr[data-id]",
    forces:"#forceTable tbody tr[data-id]",
    weapons:"#weaponTable tbody tr[data-id]"
  };
  const base="../data/play-guide/"+kind;
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const idOf=row=>{
    try{return decodeURIComponent(row.dataset.playId||row.dataset.choiceId||row.dataset.row||row.dataset.id||"");}
    catch{return row.dataset.playId||row.dataset.choiceId||row.dataset.row||row.dataset.id||"";}
  };
  let previews=null,choicePreviews=null,previewPromise=null,dialog,body,activeRow=null,scheduled=false;
  const cardPromises=new Map();

  const getJson=async url=>{
    const response=await fetch(url);
    if(!response.ok)throw new Error("설명 데이터 HTTP "+response.status);
    if(!url.endsWith(".gz"))return response.json();
    const data=await response.arrayBuffer();
    const bytes=new Uint8Array(data);
    // Some static servers may already decompress Content-Encoding:gzip.
    if(bytes[0]!==0x1f||bytes[1]!==0x8b)return JSON.parse(new TextDecoder().decode(data));
    if(typeof DecompressionStream==="undefined")throw new Error("gzip 해설을 풀 수 없는 구형 브라우저입니다.");
    const decoded=new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(decoded).text());
  };
  const fetchPreviews=()=>previewPromise||(previewPromise=getJson(base+".teasers.json.gz").then(d=>{
    previews=d.titles||{};
    refreshPreviews();
    return previews;
  }).catch(e=>{console.warn("XPiratez play guide previews:",e);previews={};return previews;}));
  const fetchCards=(source=kind)=>{
    if(!cardPromises.has(source))cardPromises.set(source,getJson("../data/play-guide/"+source+".json.gz").then(d=>d.cards||{}).catch(e=>{cardPromises.delete(source);throw e;}));
    return cardPromises.get(source);
  };
  const fetchChoicePreviews=()=>{
    if(kind!=="captains")return;
    void getJson("../data/play-guide/research.teasers.json.gz").then(d=>{choicePreviews=d.titles||{};refreshPreviews();}).catch(e=>console.warn("XPiratez choice guides:",e));
  };
  const text=(tag,cls,content)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    el.textContent=content;
    return el;
  };
  const button=(label,cls)=>{
    const el=document.createElement("button");
    el.type="button";
    el.className=cls;
    el.textContent=label;
    return el;
  };
  const refreshPreviews=()=>{
    for(const row of document.querySelectorAll(selectors[kind])){
      const id=idOf(row),el=row.querySelector(":scope .xpz-guide-teaser");
      if(el&&(row.dataset.choiceId?choicePreviews?.[id]:previews?.[id]))el.textContent=row.dataset.choiceId?choicePreviews[id]:previews[id];
      else if(el&&kind==="soldiers"&&id.startsWith("final:"))
        el.textContent="최종 강화 조합: 현재 필터와 훈련 순서를 기준으로 비교";
    }
  };
  function buildRow(row){
    if(row.dataset.xpzGuideReady)return;
    const cell=row.dataset.choiceId?row:kind==="starting"?row.querySelector(".card-head"):row.querySelector("td");
    if(!cell)return;
    const id=idOf(row);
    if(!id)return;
    row.dataset.xpzGuideReady="1";
    const container=document.createElement("div");
    container.className="xpz-guide-inline";
    const trigger=button("요약 · 판단","xpz-guide-open");
    trigger.setAttribute("aria-label",id+" · 해금, 효과, 실행방법, 판단 보기");
    trigger.title="해금 조건 → 효과 → 실행방법 → 판단 → 주의";
    trigger.addEventListener("click",e=>{
      e.preventDefault();e.stopPropagation();
      void show(id,row);
    });
    const teaser=text("span","xpz-guide-teaser",row.dataset.choiceId?choicePreviews?.[id]||"":previews?.[id]||"");
    container.append(trigger,teaser);
    if(kind==="starting")cell.after(container);
    else cell.append(container);
  }
  function mountRows(){
    scheduled=false;
    for(const row of document.querySelectorAll(selectors[kind]))buildRow(row);
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(mountRows);
  }
  function makeDialog(){
    if(dialog)return;
    dialog=document.createElement("dialog");
    dialog.id="xpz-play-dialog";
    dialog.className="xpz-play-dialog";
    const header=document.createElement("div");
    header.className="xpz-play-toolbar";
    header.append(text("span","xpz-play-eyebrow","XPIRATEZ · 플레이 의사결정"));
    const close=button("닫기 ×","xpz-play-close");
    close.setAttribute("aria-label","요약 닫기");
    close.onclick=()=>dialog.close();
    header.append(close);
    body=document.createElement("div");
    body.className="xpz-play-body";
    dialog.append(header,body);
    dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close();});
    document.body.append(dialog);
  }
  function nativeLink(relation){
    const k=relation?.kind,id=relation?.id;
    if(!supported.has(k)||!id)return null;
    const hash={
      items:"#item=",research:"#research=",trainings:"?training=",
      manufacture:"#recipe=",events:"#event=",forces:"#force="
    }[k]||"";
    return "../"+k+"/"+(hash?hash+encodeURIComponent(id):"");
  }
  function fallbackCard(id,row){
    const title=row.querySelector(".name,.captain-name,h3")?.textContent?.trim()||id;
    return {
      name:title,
      title:kind==="soldiers"?"현재 조건에서 계산된 병종·강화 조합입니다. 같은 기본 병종이라도 초기 특성·상호배제가 다를 수 있습니다.":"현재 목록에서 실시간 계산되는 항목입니다. 표시된 비교값과 선택한 캐릭터·적·상태에 따라 판단하십시오.",
      effect:"현재 비교표에 표시된 적용 능력·효율을 직접 확인하십시오. 이 동적 행에 대한 별도 정적 해설은 제공되지 않습니다.",
      gates:"현재 필터·선택한 병종/기준 캐릭터·연구 분기에 따라 달라질 수 있습니다.",
      action:"원래 상세 데이터 열기 → 요구조건·능력 상한·재료·탄약·배타 규칙 확인.",
      decision:"실제 출격 병력·자원 병목·목표 적을 기준으로 비교하십시오.",
      watch:"이 동적 행에 대한 검증된 단일 원본 해설이 없으므로 추가 효과를 추정하지 않습니다.",
      source:"live calculated UI, fallback (no synthetic rule assertions)",
      links:[]
    };
  }
  const fields=[
    ["실제 효과","effect"],
    ["해금 · 자격 · 비용","gates"],
    ["실행 방법","action"],
    ["언제 가치가 있는가","decision"],
    ["주의 · 예외","watch"]
  ];
  function renderCard(card,id){
    body.replaceChildren();
    body.append(text("h2","xpz-play-title",card.name||id));
    const reason=document.createElement("section");
    reason.className="xpz-play-conclusion";
    reason.append(text("span","xpz-play-label","한눈에 보는 결론"),text("p","xpz-play-summary",card.title));
    body.append(reason);
    const grid=document.createElement("div");
    grid.className="xpz-play-grid";
    for(const [label,key] of fields){
      const value=card[key];
      const section=document.createElement("section");
      section.className="xpz-play-section xpz-play-"+key;
      section.append(text("h3","",label),text("p","",value||"원본에서 확인된 단일 효과 없음. 상세 참조 필요."));
      grid.append(section);
    }
    body.append(grid);
    const bottom=document.createElement("footer");
    bottom.className="xpz-play-footer";
    bottom.append(text("p","xpz-play-source","근거: "+(card.source||"XPiratez 룰셋 파생 데이터")+" · 동적 세이브 보유조건은 별도 검증"));
    const nav=document.createElement("nav");
    nav.className="xpz-play-nav";
    nav.setAttribute("aria-label","관련 데이터 열기");
    if(kind!=="starting"&&activeRow&&!activeRow.dataset.choiceId){
      const open=button("원래 상세 데이터 열기 →","xpz-play-native");
      open.addEventListener("click",()=>{
        const row=activeRow;
        dialog.close();
        if(row?.isConnected)row.click();
      });
      nav.append(open);
    }
    for(const relation of card.links||[]){
      const href=nativeLink(relation);
      if(!href)continue;
      const a=document.createElement("a");
      a.className="xpz-play-link";
      a.href=href;
      a.textContent=relation.label||relation.kind;
      if(relation.kind!==kind){a.target="_blank";a.rel="noopener";}
      nav.append(a);
    }
    bottom.append(nav);
    body.append(bottom);
  }
  async function show(id,row){
    makeDialog();
    activeRow=row;
    body.replaceChildren(text("p","xpz-play-loading","원본과 연결된 해금·효과·실행 정보를 불러오는 중…"));
    if(!dialog.open)dialog.showModal();
    try{
      const all=await fetchCards(row.dataset.choiceId?"research":kind);
      if(!dialog.open||activeRow!==row)return;
      renderCard(all[id]||fallbackCard(id,row),id);
    }catch(error){
      body.replaceChildren(text("p","xpz-play-error","해설 데이터 로드 실패: "+error.message));
    }
  }
  function init(){
    const scope=document.querySelector(kind==="captains"?"main":kind==="starting"?"#cards":kind==="items"||kind==="research"?"#tbody":selectors[kind].split(" tbody")[0].split(" > ")[0]);
    const observerTarget=scope||document.querySelector("main")||document.body;
    new MutationObserver(schedule).observe(observerTarget,{childList:true,subtree:true});
    schedule();
    void fetchPreviews();
    fetchChoicePreviews();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
