(() => {
  "use strict";
  const recipes = [
    {id:"STR_GROG_BARREL", facilities:["STR_STILL"]},
    {id:"STR_MUSHROOM_BEER", facilities:["STR_STILL"]},
    {id:"STR_WINE", facilities:["STR_STILL"]},
    {id:"STR_WINE_XXX", facilities:["STR_STILL"]},
    {id:"STR_CIGAR", facilities:["STR_WORKSHOP","STR_MESS_HALL_ADV"]}
  ];
  const housingSelect=document.getElementById("profit-housing");
  const tbody=document.getElementById("profit-rows");
  const status=document.getElementById("profit-status");
  if(!housingSelect||!tbody||!status)return;
  const fmt=(n,d=2)=>n==null||!Number.isFinite(n)?"—":new Intl.NumberFormat("ko-KR",{maximumFractionDigits:d}).format(n);
  Promise.all(["../data/manufacture-index.json","../data/facilities-index.json"].map(async p=>{
    const r=await fetch(p);if(!r.ok)throw Error(p+" HTTP "+r.status);return r.json();
  })).then(([m,f])=>{
    const byRecipe=new Map(m.index.map(x=>[x.id,x]));
    const byFacility=new Map(f.index.map(x=>[x.id,x]));
    function render(){
      const home=byFacility.get(housingSelect.value);
      if(!home||home.personnel<=0)throw Error("숙소 정원 누락");
      const rows=[];
      for(const entry of recipes){
        const recipe=byRecipe.get(entry.id);
        const sites=entry.facilities.map(id=>byFacility.get(id));
        if(!recipe||sites.some(x=>!x)||!recipe.economicComparable||!(recipe.time>0))continue;
        const workCapacity=Math.max(0,sites.reduce((sum,x)=>sum+(x.workshops||0),0));
        if(!workCapacity)continue;
        const workers=workCapacity;
        const facilityArea=sites.reduce((sum,x)=>sum+x.area,0);
        const housingArea=workers*home.area/home.personnel;
        const totalArea=facilityArea+housingArea;
        const monthCost=sites.reduce((sum,x)=>sum+(x.monthlyCost||0),0)+workers*home.monthlyCost/home.personnel;
        const hourlyNet=workers*recipe.opportunityNetPerEngineerHour-monthCost/720;
        const perTile=hourlyNet/totalArea;
        const tr=document.createElement("tr");
        const cells=[
          recipe.koName,
          fmt(recipe.opportunityNetPerEngineerHour)+" /인시",
          fmt(workers,0)+"명",
          fmt(totalArea)+"칸 (설비 "+fmt(facilityArea,0)+" + 숙소 "+fmt(housingArea)+")",
          fmt(perTile)+" /칸·시간"
        ];
        cells.forEach((val,i)=>{
          const td=document.createElement("td");
          if(i===0){
            const a=document.createElement("a");a.href="../manufacture/#recipe="+encodeURIComponent(entry.id);a.textContent=val;td.append(a);
            const sub=document.createElement("small");sub.textContent=sites.map(s=>s.koName).join(" + ");td.append(sub);
          }else td.textContent=val;
          tr.append(td);
        });
        rows.push({tr,perTile});
      }
      rows.sort((a,b)=>b.perTile-a.perTile);
      tbody.replaceChildren(...rows.map(x=>x.tr));
      status.textContent=rows.length+"종 · 최대 작업자는 설비의 workshops 정원 합계 · 기지 면적 기준 내림차순 · 시설 유지비 포함";
    }
    housingSelect.addEventListener("change",render);
    render();
  }).catch(err=>{
    status.textContent="제조 수익표 로드 실패: "+err.message;
    tbody.replaceChildren();
  });
})();
