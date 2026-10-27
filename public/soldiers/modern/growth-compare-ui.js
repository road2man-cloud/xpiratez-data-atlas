import {initialState,STAT_KEYS} from "./eligibility.js";
import {createStatEnvelope} from "./stat-envelope.js";
import {growStatEnvelope} from "./growth-envelope.js";
const fmt=x=>Number(x).toLocaleString("ko-KR",{maximumFractionDigits:1});
const pair=(a,b)=>a===b?fmt(a):fmt(a)+" ~ "+fmt(b);
const esc=x=>String(x??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
export function initBaselineGrowthComparison(data){
  const body=document.querySelector("#baselineGrowthTable tbody");
  const summary=document.querySelector("#baselineGrowthSummary");
  if(!body||!summary)return null;
  const profiles=["base:STR_SOLDIER","manufacture:STR_HALF_UBER_GIRL_RECRUITMENT"];
  const results=profiles.map(id=>{
    const state=initialState(data,id);
    const source=createStatEnvelope(data,id);
    const battle=growStatEnvelope(source,state,data,"@BATTLE_GROWTH");
    const physical=growStatEnvelope(source,state,data,"@PHYS_TRAINING");
    const soldier=data.soldiers.find(x=>x.id===state.soldierType);
    if(source.kind!=="ready"||battle.kind!=="ready"||physical.kind!=="ready"||!soldier)
      throw Error("2.1 성장캡 비교를 위한 원본 자료 누락: "+id);
    return {id,state,source,battle,physical,soldier};
  });
  const [gal,half]=results;
  summary.innerHTML=[
    "일반 갈 사격캡 "+gal.soldier.statCaps.firing+
      " · 전투 상계 "+gal.battle.high.firing,
    "반 슈퍼변이체 농부 사격캡 "+half.soldier.statCaps.firing+
      " · 전투 상계 "+half.battle.high.firing,
    "해당 방어구 추가 보조 성장 태그 "+data.armorCatalog.filter(x=>x.extraSecondaryGrowthPercent>0).length+
      "종 · 최대 "+data.growthRules?.maxTaggedArmorSecondaryPercent+"%"
  ].map(x=>'<strong>'+esc(x)+'</strong>').join("");
  body.innerHTML=STAT_KEYS.map(k=>'<tr data-growth-key="'+esc(k)+'">'+
    '<th scope="row">'+esc(data.statLabels[k]||k)+'</th>'+
    '<td data-gal-cap="'+esc(k)+'">'+fmt(gal.soldier.statCaps[k])+'</td>'+
    '<td data-gal-battle="'+esc(k)+'">'+pair(gal.battle.low[k],gal.battle.high[k])+'</td>'+
    '<td data-gal-physical="'+esc(k)+'">'+pair(gal.physical.low[k],gal.physical.high[k])+'</td>'+
    '<td data-half-cap="'+esc(k)+'">'+fmt(half.soldier.statCaps[k])+'</td>'+
    '<td data-half-battle="'+esc(k)+'">'+pair(half.battle.low[k],half.battle.high[k])+'</td>'+
    '<td data-half-physical="'+esc(k)+'">'+pair(half.physical.low[k],half.physical.high[k])+'</td></tr>'
  ).join("");
  return {gal,half};
}
