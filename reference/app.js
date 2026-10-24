(() => {
  "use strict";
  const snapshots = {o111:window.XPZ_REFERENCE_O111, o2:window.XPZ_REFERENCE_O2};
  const versions = {o111:"v.o1.1.1 · 사이트 DB 기준", o2:"v.o2 / 2.1 · 현재 게임 설치본"};
  const $ = selector => document.querySelector(selector);
  const modeRows=[...document.querySelectorAll("#modes tbody tr")];
  const c = {
    modeSearch:$("#search"), modeStatus:$("#mode-status"),
    version:$("#item-version"), itemSearch:$("#item-search"), itemMode:$("#item-mode"),
    itemStatus:$("#item-status"), itemRows:$("#item-rows"), difference:$("#diff-results")
  };
  if (!snapshots.o111?.items || !snapshots.o2?.items) {
    c.itemStatus.textContent="아이템 데이터 파일을 찾을 수 없습니다. 아래 버전별 JSON 파일을 직접 확인해 주세요.";
    return;
  }

  const params=new URLSearchParams(location.search);
  c.version.value=params.get("version")==="o2"?"o2":"o111";
  c.itemSearch.value=params.get("q")||"";
  const requestedMode=params.get("mode")||"";

  function addCell(row,value,className="",target="") {
    const td=document.createElement("td");
    if(className) td.className=className;
    const node=document.createElement(target?"a":"span");
    node.textContent=String(value);
    if(target)node.setAttribute("href",target);
    td.append(node);row.append(td);return td;
  }
  function filterModes(){
    const q=c.modeSearch.value.trim().toLocaleLowerCase();let n=0;
    for(const tr of modeRows){
      const visible=!q||tr.textContent.toLocaleLowerCase().includes(q);
      tr.classList.toggle("hiddenrow",!visible);if(visible)n++;
    }
    c.modeStatus.textContent=n+" / "+modeRows.length+"개 모드";
  }
  function updateQuery(){
    const p=new URLSearchParams(location.search);
    if(c.version.value==="o2")p.set("version","o2");else p.delete("version");
    const q=c.itemSearch.value.trim();
    if(q)p.set("q",q);else p.delete("q");
    if(c.itemMode.value)p.set("mode",c.itemMode.value);else p.delete("mode");
    const next=location.pathname+(p.toString()?"?"+p.toString():"")+location.hash;
    try{history.replaceState(null,"",next)}catch(_){}
  }
  function updateModeChoices(preserveValue=""){
    const values=[...new Set(snapshots[c.version.value].items.map(it=>it.m))].sort((a,b)=>a-b);
    c.itemMode.replaceChildren(new Option("모든 모드",""));
    for(const n of values){
      const row=document.getElementById("mode-"+n);
      const label=row?.querySelectorAll("td")[1]?.textContent||"";
      c.itemMode.add(new Option(n+" · "+label,String(n)));
    }
    c.itemMode.value=values.some(n=>String(n)===preserveValue)?preserveValue:"";
  }
  function renderItems(){
    const ver=c.version.value,snapshot=snapshots[ver];
    const q=c.itemSearch.value.trim().toLocaleLowerCase(),mode=c.itemMode.value;
    const fragment=document.createDocumentFragment();let count=0;
    const sorted=[...snapshot.items].sort((a,b)=>
      (a.k||a.e||a.i).localeCompare((b.k||b.e||b.i),"ko")||a.i.localeCompare(b.i));
    for(const item of sorted){
      const searchable=(String(item.k||"")+" "+String(item.e||"")+" "+item.i).toLocaleLowerCase();
      if(q&&!searchable.includes(q))continue;
      if(mode&&String(item.m)!==mode)continue;
      count++;
      const tr=document.createElement("tr");tr.id="item-"+item.i;
      const label=document.createElement("td"),a=document.createElement("a"),id=document.createElement("small");
      a.href="#item-"+item.i;a.textContent=item.k||item.e||item.i;
      id.textContent=item.i+(item.e&&item.e!==item.k?" · "+item.e:"");
      label.append(a,id);tr.append(label);
      addCell(tr,item.m,"num","#mode-"+item.m);
      addCell(tr,item.d==null?"—":item.d,"",item.d==null?"":"#damage-"+item.d);
      addCell(tr,item.p==null?"—":item.p);
      addCell(tr,item.f+":"+item.l,"fine");
      fragment.append(tr);
    }
    c.itemRows.replaceChildren(fragment);
    c.itemStatus.textContent=versions[ver]+" · "+count+" / "+snapshot.items.length+
      "개 명시 선언"+(q||mode?" · 검색/필터 적용":"");
    updateQuery();
  }
  function renderVersionDiff(){
    const oldItems=new Map(snapshots.o111.items.map(it=>[it.i,it]));
    const newItems=new Map(snapshots.o2.items.map(it=>[it.i,it]));
    const onlyOld=[...oldItems.keys()].filter(id=>!newItems.has(id)).sort();
    const onlyNew=[...newItems.keys()].filter(id=>!oldItems.has(id)).sort();
    const changed=[...newItems.keys()].filter(id=>
      oldItems.has(id)&&oldItems.get(id).m!==newItems.get(id).m).sort();
    const lines=[
      "공통: "+(oldItems.size-onlyOld.length)+"개 · 공통 ID의 모드 변경: "+changed.length+"개",
      "v.o1.1.1에만 명시: "+onlyOld.length+"개"+(onlyOld.length?" ("+onlyOld.join(", ")+")":""),
      "v.o2에만 명시: "+onlyNew.length+"개"+(onlyNew.length?" ("+onlyNew.join(", ")+")":"")
    ];
    if(changed.length)lines.push("모드 변경: "+changed.map(id=>
      id+": "+oldItems.get(id).m+" → "+newItems.get(id).m).join(", "));
    c.difference.replaceChildren(...lines.map(s=>{
      const p=document.createElement("p");p.textContent=s;return p;
    }));
  }
  function followDeepLink(){
    const hash=decodeURIComponent(location.hash.slice(1));
    if(!hash.startsWith("item-"))return;
    const target=document.getElementById(hash);
    if(target)target.scrollIntoView({block:"nearest"});
    else c.itemStatus.textContent+=" · 해당 ID가 선택 버전/필터에 없습니다.";
  }
  c.modeSearch.addEventListener("input",filterModes);
  c.version.addEventListener("change",()=>{
    updateModeChoices(c.itemMode.value);renderItems();followDeepLink();
  });
  c.itemMode.addEventListener("change",renderItems);
  c.itemSearch.addEventListener("input",renderItems);
  window.addEventListener("hashchange",followDeepLink);
  updateModeChoices(requestedMode);filterModes();renderVersionDiff();renderItems();followDeepLink();
})();
