const S={yes:"✅",late:"◇",no:"❌",warn:"⚠"};
const columns=[
  {key:"ev",label:"총 반복 현금성 EV/월",group:"경제",type:"ev"},
  {key:"hotel",label:"호텔",group:"경제"},
  {key:"vip",label:"VIP Club",group:"경제"},
  {key:"nonprofit",label:"비영리 연구실",group:"경제"},
  {key:"scamming",label:"사기 제조",group:"경제"},
  {key:"bulk",label:"대량 채굴",group:"경제"},
  {key:"ultimateCash",label:"666k 반복 이벤트",group:"경제"},
  {key:"irradiator",label:"방사탑",group:"방어·탐지"},
  {key:"necro",label:"네크로 Flak 우회",group:"방어·탐지"},
  {key:"bunker",label:"벙커 + 14mm 포탑",group:"방어·탐지"},
  {key:"tactical",label:"전술센터 탐지",group:"방어·탐지"},
  {key:"treasure",label:"보물사냥 이벤트",group:"방어·탐지"},
  {key:"boot",label:"신병훈련",group:"병사 강화"},
  {key:"military",label:"군사훈련",group:"병사 강화"},
  {key:"bread",label:"건강미 훈련",group:"병사 강화"},
  {key:"warrior",label:"전사문화 훈련",group:"병사 강화"},
  {key:"charmy",label:"Charmy Dance 훈련",group:"병사 강화"},
  {key:"saint",label:"혼돈의 성자 루트",group:"특수병·마법"},
  {key:"saintReinf",label:"성자 특수병 지원",group:"특수병·마법"},
  {key:"orthodox",label:"정통파 마법사 영애",group:"특수병·마법"},
  {key:"transfig",label:"변신술 의식",group:"특수병·마법"},
  {key:"xlarge",label:"초대형 저장고",group:"인프라"},
  {key:"capsule",label:"캡슐 숙소",group:"인프라"},
  {key:"doubleJail",label:"2배 감옥",group:"인프라"},
  {key:"dungeon",label:"지하감옥 마스터",group:"인프라"},
  {key:"codexGold",label:"금색 코덱스",group:"Codex 상호배타",type:"codex",color:"Gold"},
  {key:"codexGreen",label:"녹색 코덱스",group:"Codex 상호배타",type:"codex",color:"Green"},
  {key:"codexRed",label:"적색 코덱스",group:"Codex 상호배타",type:"codex",color:"Red"},
  {key:"codexGray",label:"회색 코덱스",group:"Codex 상호배타",type:"codex",color:"Gray"}
];

const featureInfo={
  hotel:{short:"+$360k/월 · 인원25 · 훈련12 · 저장50",detail:"호텔 시설. 건설 $1.2m / 28일, 월 유지비가 -$360k라 실제로는 매월 $360k 수입. 인원 +25, 훈련 12, 저장 50, Mana +9/day, 포로수용 50."},
  vip:{short:"+$500k/월 · Lab+1 · 훈련16 · Mana+8",detail:"VIP Club 시설. 건설 $1.35m / 20일, Glamour×240 필요, 매월 $500k 수입. Lab +1, 훈련 16, Mana +8/day, ANAL/DOJO 기능 제공."},
  nonprofit:{short:"+$150k/월 · Lab+3 · Workshop+15",detail:"비영리 연구실. 건설 $750k / 32일, Cultural Wealth×50 + Slave Maid×15. 매월 $150k 수입, Lab +3, Workshop +15, SHOP 기능 제공."},
  scamming:{short:"20 worker-h당 순익 약 $2.4k",detail:"개인 자료(Govt Corpse)를 재료로 돌리는 사기 제조 경로. 현재 사이트 계산 기준 평균 순익 약 $2,431 / 20 worker-hours. 큰 한방보다는 남는 작업시간을 현금화하는 소규모 경제 엔진."},
  bulk:{short:"10개 단위 채굴·정제 · 시간 크게 절약",detail:"대량 굴착/정제 제조를 해금. 큰 바위 10개 채굴은 7,200→3,600 worker-h, 10개 정제는 2,400→1,000 worker-h로 단축. 대신 청소비 아이템이 생기고, 대량 채굴에는 3% Demonic Incursion 위험이 있음."},
  ultimateCash:{short:"63%/월로 +$666k +666점",detail:"궁극의 선장 반복 이벤트. 매월 63% 확률로 자금 +$666,000과 점수 +666. 이벤트 자체 기대값은 +$419,580/월이며 재료 소모나 부채는 없음."},
  irradiator:{short:"기지방어333 · 명중100% · Hyperwave 탐지",detail:"방사탑. 건설 $1.45m / 25일, 유지 $60k/월. 탐지 범위 1600·40% Hyperwave, 기지 공격 시 방어력 333·명중100%. 대신 SickBay -0.35/day라 치료가 느려지는 큰 페널티."},
  necro:{short:"Flak Kit를 Necroplane Parts로 우회 제작",detail:"새 포탑이 아니라 Flak Tower Kit의 대체 제작법. 일반 제작의 소형기관포4+50발상자12 대신 Necroplane Parts×25를 쓰며, 작업량은 1000→2500 worker-h. 귀한 화기/탄약을 아끼는 보급 우회."},
  bunker:{short:"기지방어 맵에 14mm 고정포탑",detail:"벙커 시설. 건설 $150k / 30일 + Prefab×7 + Necroplane Parts×35, 유지 $10k/월. 인원 +10·저장25·Mana+3/day이며 기지방어 맵에 Power66 4발 Burst 14mm 고정포탑을 배치함."},
  tactical:{short:"범위10800 · 매시간 4% 탐지",detail:"전술센터는 공격시설이 아니라 전지구 정보망. 건설 $600k, 유지 $50k/월, 개인 자료×50. 범위 10800에서 매시간 4% 탐지 판정을 제공해 장거리 표적 발견에 특화."},
  treasure:{short:"기지가 있는 지역마다 21%/월 Lootbox",detail:"보물사냥 이벤트 경로. 기지가 존재하는 해당 지역에서 월 21% 판정으로 Lootbox 기회를 생성. 기지 지역을 늘릴수록 판정 기회도 늘어나는 탐험형 보상."},
  boot:{short:"사격+15 · 근력+10 · 기력/용기+10",detail:"신병 훈련. 기력+10, 용기+10, 반응+5, 사격+15, 투척+5, 근력+10, 근접+5, Mana+10. 성장한 병사보다 신병에게 효율이 큰 기본 강화."},
  military:{short:"TU+5 포함 전반 능력치 강화",detail:"군사 훈련. TU+5, 기력+10, 체력+5, 용기+10, 반응+5, 사격+5, 투척+5, 근접+5, Mana+10, Psi Strength+15. Boot Camp 선행 + DOJO 필요, 여러 고급훈련과 상호배타."},
  bread:{short:"탱커형 · 기력≈+31 체력≈+23 근력≈+14",detail:"건강미 훈련 총효과 핵심: 기력≈+31, 체력≈+23, 근력≈+14, 투척+5, Mana+6, 장갑+1. 사격보다 생존력·체력·근력에 치중한 탱커형 성장."},
  warrior:{short:"근접형 · 근접+10 투척+10 용기+10",detail:"전사문화의 자랑스러운 전사 계열. 핵심 총효과는 기력≈+17, 체력+6, 용기+10, 근접+10, 투척+10, 장갑+1. 근접 전투원 육성에 유리."},
  charmy:{short:"TU+10 · 체력+15 · 반응+15 · 장갑+3",detail:"Charmy Dance Training. 캡 미도달 기준 TU+10, 기력+10, 체력+15, 용기+10, 반응+15, Psi Skill+5, Mana+10, 전면/하부장갑+3. DOJO 28일, 용기50+, Glamour×6, Zany Zines×3."},
  saint:{short:"기본 4선장 + 4색 완성 · PUSSY 불가",detail:"혼돈의 성자 루트. 기본 4선장이 빠진 색을 Codex로 채워 4색을 완성하면 진입 가능. PUSSY 계열은 영구 불가. Codex 경로의 드릴 조사는 힘 거부를 배제하므로 야만 여왕·퍼라이어와 양립하지 않습니다. Saint가 되면 기존 Codex G1~G8 신들 보너스 풀은 정지하고 Saint 전용 풀이 켜짐."},
  saintReinf:{short:"특수병 기대 0.652명/월 ≈ 1.53개월/회",detail:"Saint 전용 지원군 풀. 도마뱀 조각상 전 기준 특수인력 기대 획득량 약 0.652명/월, 평균 약 1.53개월당 1회. 전쟁공주·외톨이 클론·인간 영웅 등 희귀 병종이 핵심 가치."},
  orthodox:{short:"Dumbass+Saint 7% 판정 / Pussy+JackLazy에서도 추첨",detail:"정통파 마법사 영애와 $100k 이벤트는 두 대안 경로가 있습니다. Dumbass+Saint는 이벤트 스크립트 실행 확률 7%, Pussy+JackLazy(도둑 및 마법사 계급 포함)는 별도 35% 실행 스크립트의 가중치 45/495 추첨 결과입니다. 35%와 가중치 추첨을 단순히 매월 35% 지급이라고 해석하면 안 됩니다."},
  transfig:{short:"Slave/Maid → Demonic Essence 제조",detail:"변신술 의식 연구는 PSION 시설이 필요한 후기 마법 테크. 연구량77, -1000점. 이후 Slave 또는 Slave Maid×1 + $7,777 + 350 worker-h로 Demonic Essence×1 제조 가능하며 매회 10% Demonic Incursion 위험."},
  xlarge:{short:"저장3000 · Workshop+50",detail:"초대형 저장고. 건설 $2m / 18일, 유지 $30k/월, Slave Robot×12 필요. 저장공간 +3000과 Workshop +50을 한 시설에서 제공."},
  capsule:{short:"인원50 · Mana+3/day · Lab-1/Workshop-10",detail:"캡슐 숙소. 건설 $200k / 16일, 유지 $7.5k/월. 인원 +50과 Mana +3/day 대신 Lab -1, Workshop -10이라는 공간 효율 대가가 있음."},
  doubleJail:{short:"포로수용 30 · 일반 Jail의 2배",detail:"2배 감옥. 건설 $350k / 18일, 유지 $25k/월, Slave×5 필요. 포로수용 30으로 일반 Jail 15의 2배지만 SickBay -0.15/day 치료 페널티가 붙음."},
  dungeon:{short:"포로25 + Workshop5 + 33%/월 보상 이벤트",detail:"지하감옥 마스터가 Dungeon 연구를 무료 해금. Dungeon은 $225k / 20일, 유지 $5k/월, 포로25·Workshop+5·DOJO 제공. 점수3000+에서 시설 보유 시 월 33%로 +$50k, +75점, Zany Zines×10 이벤트."}
};

const rows=window.CAPTAIN_ROWS;

const captainTraits={
  jackass:["jackSore","jackDumb","jackLazy"],
  dumbass:["dumbLazy","jackDumb","soreDumb"],
  lazyass:["dumbLazy","lazySore","jackLazy"],
  soreass:["jackSore","lazySore","soreDumb"],
  pussy:[],
  thief:["jackLazy","dumbLazy"],
  priest:["soreDumb","dumbLazy"],
  mage:["jackLazy","jackSore"],
  ruler:["jackSore","soreDumb"],
  unclassedGate:[],
  dumblazy:["dumbLazy"], lazysore:["lazySore"], soredumb:["soreDumb"],
  jacksore:["jackSore"], jackdumb:["jackDumb"], jacklazy:["jackLazy"],
  pureGate:[], pureGold:[], pureGreen:[], pureRed:[], pureGray:[], ultimate:[]
};
const saintCodexTarget={jackass:"Green",dumbass:"Gray",lazyass:"Red",soreass:"Gold"};
const codexInfo={
  Gold:{
    ko:"금색", direct:"장교의 채찍 · 화염포(결과보고)", awakened:"웃긴 동인지 ×36 (매각합계 $21.6k) + Captain Gold",
    baseGods:["G1"], synergy:{dumbLazy:"G2A",jackLazy:"G8A"},
    reward:"G1 사상 최고의 선물; DumbLazy면 G2A 마법 케이크×3; JackLazy면 G8A 글래머×33"
  },
  Green:{
    ko:"녹색", direct:"생체플라스마 투사기(보고)", awakened:"초차원 사물함(작동중) ×3 (+150 저장공간 또는 매각 $1.2m) + Captain Green",
    baseGods:["G3"], synergy:{dumbLazy:"G2B",soreDumb:"G4B"},
    reward:"G3 시발링가 돌; DumbLazy면 G2B 마법 케이크×3; SoreDumb면 G4B +300점"
  },
  Red:{
    ko:"적색", direct:"리틀'일리야(결과보고)", awakened:"살아있는 유황 ×4 (매각합계 $800k) + 200점 + Captain Red",
    baseGods:["G5"], synergy:{soreDumb:"G4A",jackSore:"G6A"},
    reward:"G5 전쟁의 축복 블러드하운드; SoreDumb면 G4A +300점; JackSore면 G6A 광기의 기록물"
  },
  Gray:{
    ko:"회색", direct:"컨버전 발사기(결과보고)", awakened:"비전서 ×7 (총 매각 $105k; 1개는 연구용) + Captain Gray",
    baseGods:["G7"], synergy:{jackSore:"G6B",jackLazy:"G8B"},
    reward:"G7 비전의 고서 / 악마의 정수×13 / 시끄러운 유령 가중추첨; JackSore면 G6B 광기의 기록물; JackLazy면 G8B 글래머×33"
  }
};
const colorMonthlyEV={Gold:7188.49,Green:-1912.16,Red:10237.50,Gray:3363.66};
const noColorMonthlyEV={Gold:69.13,Green:165.00,Red:-1776.92,Gray:0};
const pureColorMonthlyEV={Gold:3763.64,Green:0,Red:4279.27,Gray:0};
const purePairMonthlyEV=[
  {missing:["Red","Gold"],ev:55300.00},{missing:["Red","Gray"],ev:5833.33},
  {missing:["Red","Green"],ev:53000.00},{missing:["Gold","Gray"],ev:0},
  {missing:["Gold","Green"],ev:291.96},{missing:["Green","Gray"],ev:46666.67}
];
const godMonthlyEV={G1:27600,G2A:8280,G2B:8280,G3:23000,G4A:0,G4B:0,G5:0,G6A:2300,G6B:2300,G7:0,G8A:22770,G8B:22770};
const g7ImmediateAwardEV=7997.73;
const g7PoltergeistMonthlyChance=0.23*77/242;
const saintPoolMonthly={cashEquivalentBeforeStatue:21924.18,cashEquivalentAfterStatue:10962.09,directFundsBeforeStatue:-2444.51,directFundsAfterStatue:-1222.25};
function pairPoolEV(colors){const have=new Set(colors);return purePairMonthlyEV.reduce((sum,pair)=>sum+(pair.missing.every(c=>!have.has(c))?pair.ev:0),0);}
function pureSinglePoolEV(colors){return colors.length===1?(pureColorMonthlyEV[colors[0]]||0):0;}
function money(v){if(!Number.isFinite(Number(v)))return "—";const n=Number(v),sign=n>0?"+":n<0?"-":"";return sign+"$"+(Math.abs(n)/1000).toFixed(1)+"k";}

function codexGods(r,color){
  const info=codexInfo[color], traits=captainTraits[r.id]||[];
  const gods=[...info.baseGods];
  for(const [trait,g] of Object.entries(info.synergy)) if(traits.includes(trait)) gods.push(g);
  return gods;
}
function codexEconomy(r,color){
  if(["pussy","unclassedGate","pureGate"].includes(r.id))return null;
  const before=[...r.colors],after=before.includes(color)?before:[...before,color];
  let delta=0;
  if(!before.includes(color))delta+=(colorMonthlyEV[color]||0)-(noColorMonthlyEV[color]||0);
  if(r.stage==="pure"){delta+=pairPoolEV(after)-pairPoolEV(before);delta+=pureSinglePoolEV(after)-pureSinglePoolEV(before);}
  const post=r.ev+delta,gods=codexGods(r,color),godsEv=gods.reduce((sum,g)=>sum+(godMonthlyEV[g]||0),0);
  const saint=saintCodexTarget[r.id]===color;
  return{before:r.ev,post,delta,gods,godsEv,withGods:post+godsEv,saint};
}
function codexCell(r,color){
  const info=codexInfo[color],gods=codexGods(r,color),eco=codexEconomy(r,color),target=saintCodexTarget[r.id];
  let head="",cls="codex-cell";
  if(target){if(target===color){head="★ 성자";cls+=" codex-saint";}else{head="⚠ 성자봉쇄";cls+=" codex-block";}}
  else if(r.id==="ultimate"){head="⚠ EV변화 +"+info.ko;cls+=" codex-warn";}
  else if(r.colors.includes(color)){head="중복 "+info.ko;cls+=" codex-dup";}
  else{head="+"+info.ko;cls+=" codex-new";}
  const evHtml=eco?'<span class="codex-ev"><b>'+money(eco.before)+'</b> → <b>'+money(eco.post)+'</b><em>'+money(eco.delta)+'</em></span>':'<span class="codex-ev muted">분기 확정 후 계산</span>';
  let godHtml='';
  if(eco&&eco.godsEv)godHtml=eco.saint?'<small class="codex-gods off">신들 '+money(eco.godsEv)+'/월 · Saint 후 정지</small>':'<small class="codex-gods">신들 완성 '+money(eco.godsEv)+'/월 → '+money(eco.withGods)+'</small>';
  else if(eco&&eco.saint)godHtml='<small class="codex-gods off">Saint 전환 후 Codex 신들 보너스 정지</small>';
  if(eco&&gods.includes("G7"))godHtml+='<small class="codex-gods risk">G7 지급품 양수 판매가 환산 '+money(g7ImmediateAwardEV)+'/월 상당 · '+CaptainGlossary.explain("시끄러운 유령")+' 약 '+(g7PoltergeistMonthlyChance*100).toFixed(2)+'%/월</small>';
  const title=info.ko+" 코덱스. 4색 중 하나를 고르는 선택입니다. 월 EV는 직접 funds + 양수 판매가 지급품의 기대환금가치.";
  return '<span class="'+cls+'" title="'+title+'"><strong>'+head+'</strong>'+evHtml+'<small>'+gods.join(" · ")+'</small>'+godHtml+'</span>';
}
function codexDetailHtml(r){
  return '<h3>Codex 선택 · 월 수입 비교</h3><p class="muted">4색 중 하나를 고르는 분기입니다. 월 EV는 직접 현금 + 양수 판매가 지급품의 기대환금가치이며 연구·임무·병사의 전투가치는 0원으로 둡니다.</p>'+
    '<div class="codex-detail-grid">'+Object.keys(codexInfo).map(color=>{
      const i=codexInfo[color],eco=codexEconomy(r,color);let extra='';
      if(eco){
        extra='<p><b>반복 EV:</b> '+money(eco.before)+' → <b>'+money(eco.post)+'</b> /월 ('+money(eco.delta)+')</p>';
        if(eco.godsEv)extra+='<p><b>신들 보너스 만개:</b> '+(eco.saint?'Saint 전 한시 ':'')+money(eco.godsEv)+'/월'+(eco.saint?' → Saint 후 정지':' → 합계 '+money(eco.withGods)+'/월')+'</p>';
        if(eco.saint)extra+='<p><b>Saint 풀:</b> 조각상 전 기대환금가치 약 '+money(saintPoolMonthly.cashEquivalentBeforeStatue)+'/월. 병사 아이템 판매가를 돈으로 센 값이며 직접 funds만 보면 '+money(saintPoolMonthly.directFundsBeforeStatue)+'/월입니다.</p>';
        if(eco.gods.includes("G7"))extra+='<p class="risk-note"><b>G7 주의:</b> 지급품의 양수 판매가만 평균내면 '+money(g7ImmediateAwardEV)+'/월 상당이지만, '+CaptainGlossary.explain("시끄러운 유령")+'이 약 '+(g7PoltergeistMonthlyChance*100).toFixed(2)+'%/월로 발생할 수 있어 안정적 월수입에 더하지 않습니다.</p>';
      }
      return '<div class="detail-box">'+codexCell(r,color)+extra+'<p><b>고유 테크:</b> '+CaptainGlossary.explain(i.direct)+'</p><p><b>승천 보상:</b> '+CaptainGlossary.explain(i.awakened)+'</p><p><b>신들 보상:</b> '+CaptainGlossary.explain(i.reward)+'</p></div>';
    }).join("")+'</div>';
}
function renderCodexCards(){
  const el=document.querySelector("#codexCards"); if(!el)return;
  el.innerHTML=Object.entries(codexInfo).map(([color,i])=>
    '<article class="codex-card card"><p class="eyebrow">'+i.ko+' CODEX</p><h3>'+i.ko+' 코덱스</h3>'+
    '<p><b>선택:</b> Gold / Green / Red / Gray 중 하나.</p>'+
    '<p><b>고유 테크:</b> '+CaptainGlossary.explain(i.direct)+'</p>'+
    '<p><b>승천 보상:</b> '+CaptainGlossary.explain(i.awakened)+'</p>'+
    '<p><b>신들 보상:</b> '+CaptainGlossary.explain(i.reward)+'</p></article>'
  ).join("");
}

function renderCodexEconomyTable(){
  const root=document.querySelector("#codexEconomyTable"); if(!root)return;
  const captains=rows.filter(r=>["jackass","dumbass","lazyass","soreass"].includes(r.id));
  const colors=["Gold","Green","Red","Gray"];
  root.innerHTML='<div class="table-head"><div><p class="eyebrow">초기 4선장 × Codex</p><h3>월 현금성 EV 직접 비교</h3></div><p class="muted">선장 단독 → Codex 각성 후. 신들 보너스는 Saint 이전에만 별도 가산.</p></div>'+
    '<div class="table-scroll"><table class="exclusive-table codex-money-table"><thead><tr><th>선장</th><th>Codex 전</th>'+
    colors.map(c=>'<th>'+codexInfo[c].ko+' Codex</th>').join('')+'</tr></thead><tbody>'+
    captains.map(r=>'<tr><td><b>'+r.name+'</b><small>'+r.code+'</small></td><td><b>'+money(r.ev)+'</b></td>'+
      colors.map(c=>{
        const e=codexEconomy(r,c), saint=e?.saint;
        const god=e?.godsEv||0;
        const godLine=god?(saint?'Saint 전 신들 '+money(god)+'<br><span class="muted">Saint 후 정지</span>':'신들 만개 '+money(e.withGods)):'';
        const saintLine=saint?'<br><span class="saint-mark">★ Saint</span>':'';
        return '<td><b>'+money(e.post)+'</b><br><span class="'+(e.delta>=0?'ev-pos':'ev-neg')+'">'+money(e.delta)+'</span>'+saintLine+(godLine?'<br><small>'+godLine+'</small>':'')+'</td>';
      }).join('')+'</tr>').join('')+
    '</tbody></table></div>'+
    '<div class="interaction-note"><b>소심 + Gold 예:</b> '+money(rows.find(r=>r.id==="soreass").ev)+' → <b>'+money(codexEconomy(rows.find(r=>r.id==="soreass"),"Gold").post)+'</b>/월, 즉 <b>'+money(codexEconomy(rows.find(r=>r.id==="soreass"),"Gold").delta)+'/월</b> 증가. 이후 Saint가 되면 G1 신들 보너스는 정지하고 Saint 지원군 풀이 대신 켜집니다.</div>';
}

const researchLabels={
  STR_CAPTAIN_DUMBASS:"멍청한 선장",STR_CAPTAIN_JACKASS:"무모한 선장",STR_CAPTAIN_LAZYASS:"게으른 선장",STR_CAPTAIN_SOREASS:"소심한 선장",STR_CAPTAIN_PUSSY:"위와는 다른 선장",
  STR_CAPTAIN_THIEF:"도둑 계급",STR_CAPTAIN_PRIEST:"사제 계급",STR_CAPTAIN_MAGE:"마법사 계급",STR_CAPTAIN_RULER:"지도자 계급",STR_CAPTAIN_UNCLASSED_UP:"무직 게이트",
  STR_CAPTAIN_DUMBLAZY_UP:"멋지고 버릇없는",STR_CAPTAIN_JACKDUMB_UP:"대담한",STR_CAPTAIN_JACKLAZY_UP:"진보하는",STR_CAPTAIN_JACKSORE_UP:"두려운",STR_CAPTAIN_LAZYSORE_UP:"합리적",STR_CAPTAIN_SOREDUMB_UP:"보수적인",STR_CAPTAIN_PURE_UP:"Pure 게이트",
  STR_CAPTAIN_GOLD_UP:"고귀한 영혼",STR_CAPTAIN_GREEN_UP:"현명한",STR_CAPTAIN_RED_UP:"강한 전사",STR_CAPTAIN_GRAY_UP:"위대한 몽상가",STR_CAPTAIN_ULTIMATE:"궁극의 선장",
  STR_SCAMMING:"사기 제조",STR_BULK_EXCAVATION:"덩어리 캐내기",STR_DUNGEON_MASTER:"지하감옥 마스터",STR_HOTEL:"호텔",STR_STUDY_ROOM:"학습실",STR_JAIL_DOUBLE:"2배 감옥",STR_GENERAL_STORES_XLARGE:"초대형 저장고",STR_CAPSULE_QUARTERS:"캡슐 숙소",STR_TACTICAL_CENTER:"전술센터",
  STR_CAPTAIN_DOUBLEGOLD:"특성: 다면성",STR_CAPTAIN_DOUBLEGRAY:"특성: 활달함",STR_CAPTAIN_DOUBLERED:"특성: 힘이 넘침",STR_CAPTAIN_DOUBLEGREEN:"특성: 불굴"
};
const exclusiveStages=[
 {title:"1단계 · 기본 성격",rows:[
  ["STR_CAPTAIN_DUMBASS",["STR_CAPTAIN_JACKASS","STR_CAPTAIN_LAZYASS","STR_CAPTAIN_SOREASS","STR_CAPTAIN_PUSSY","STR_BULK_EXCAVATION","STR_DUNGEON_MASTER","STR_HOTEL","STR_STUDY_ROOM","STR_JAIL_DOUBLE","STR_GENERAL_STORES_XLARGE","STR_CAPSULE_QUARTERS","STR_TACTICAL_CENTER"]],
  ["STR_CAPTAIN_JACKASS",["STR_CAPTAIN_DUMBASS","STR_CAPTAIN_LAZYASS","STR_CAPTAIN_SOREASS","STR_CAPTAIN_PUSSY","STR_SCAMMING","STR_BULK_EXCAVATION","STR_HOTEL","STR_JAIL_DOUBLE","STR_GENERAL_STORES_XLARGE","STR_CAPSULE_QUARTERS","STR_TACTICAL_CENTER"]],
  ["STR_CAPTAIN_LAZYASS",["STR_CAPTAIN_JACKASS","STR_CAPTAIN_DUMBASS","STR_CAPTAIN_SOREASS","STR_CAPTAIN_PUSSY","STR_SCAMMING","STR_BULK_EXCAVATION","STR_DUNGEON_MASTER","STR_JAIL_DOUBLE","STR_GENERAL_STORES_XLARGE","STR_CAPSULE_QUARTERS","STR_TACTICAL_CENTER"]],
  ["STR_CAPTAIN_SOREASS",["STR_CAPTAIN_JACKASS","STR_CAPTAIN_DUMBASS","STR_CAPTAIN_LAZYASS","STR_CAPTAIN_PUSSY","STR_SCAMMING","STR_DUNGEON_MASTER","STR_HOTEL","STR_JAIL_DOUBLE","STR_GENERAL_STORES_XLARGE","STR_CAPSULE_QUARTERS"]],
  ["STR_CAPTAIN_PUSSY",["STR_CAPTAIN_JACKASS","STR_CAPTAIN_DUMBASS","STR_CAPTAIN_LAZYASS","STR_CAPTAIN_SOREASS","STR_BULK_EXCAVATION","STR_DUNGEON_MASTER","STR_TACTICAL_CENTER","STR_HOTEL"]]
 ]},
 {title:"2단계 · PUSSY 직업",rows:[
  ["STR_CAPTAIN_THIEF",["STR_CAPTAIN_PRIEST","STR_CAPTAIN_MAGE","STR_CAPTAIN_RULER","STR_CAPTAIN_UNCLASSED_UP"]],
  ["STR_CAPTAIN_PRIEST",["STR_CAPTAIN_THIEF","STR_CAPTAIN_MAGE","STR_CAPTAIN_RULER","STR_CAPTAIN_UNCLASSED_UP"]],
  ["STR_CAPTAIN_MAGE",["STR_CAPTAIN_THIEF","STR_CAPTAIN_PRIEST","STR_CAPTAIN_RULER","STR_CAPTAIN_UNCLASSED_UP"]],
  ["STR_CAPTAIN_RULER",["STR_CAPTAIN_THIEF","STR_CAPTAIN_PRIEST","STR_CAPTAIN_MAGE","STR_CAPTAIN_UNCLASSED_UP"]],
  ["STR_CAPTAIN_UNCLASSED_UP",["STR_CAPTAIN_THIEF","STR_CAPTAIN_PRIEST","STR_CAPTAIN_MAGE","STR_CAPTAIN_RULER"]]
 ]},
 {title:"3단계 · 무직 혼합형",rows:[
  ["STR_CAPTAIN_DUMBLAZY_UP",["STR_CAPTAIN_LAZYSORE_UP","STR_CAPTAIN_SOREDUMB_UP","STR_CAPTAIN_JACKSORE_UP","STR_CAPTAIN_JACKDUMB_UP","STR_CAPTAIN_JACKLAZY_UP","STR_CAPTAIN_PURE_UP"]],
  ["STR_CAPTAIN_JACKDUMB_UP",["STR_CAPTAIN_DUMBLAZY_UP","STR_CAPTAIN_LAZYSORE_UP","STR_CAPTAIN_SOREDUMB_UP","STR_CAPTAIN_JACKSORE_UP","STR_CAPTAIN_JACKLAZY_UP","STR_CAPTAIN_PURE_UP"]],
  ["STR_CAPTAIN_JACKLAZY_UP",["STR_CAPTAIN_DUMBLAZY_UP","STR_CAPTAIN_LAZYSORE_UP","STR_CAPTAIN_SOREDUMB_UP","STR_CAPTAIN_JACKSORE_UP","STR_CAPTAIN_JACKDUMB_UP","STR_CAPTAIN_DOUBLEGOLD","STR_CAPTAIN_DOUBLEGRAY","STR_CAPTAIN_PURE_UP"]],
  ["STR_CAPTAIN_JACKSORE_UP",["STR_CAPTAIN_DUMBLAZY_UP","STR_CAPTAIN_LAZYSORE_UP","STR_CAPTAIN_SOREDUMB_UP","STR_CAPTAIN_JACKDUMB_UP","STR_CAPTAIN_JACKLAZY_UP","STR_CAPTAIN_DOUBLERED","STR_CAPTAIN_DOUBLEGRAY","STR_CAPTAIN_PURE_UP"]],
  ["STR_CAPTAIN_LAZYSORE_UP",["STR_CAPTAIN_DUMBLAZY_UP","STR_CAPTAIN_SOREDUMB_UP","STR_CAPTAIN_JACKSORE_UP","STR_CAPTAIN_JACKDUMB_UP","STR_CAPTAIN_JACKLAZY_UP","STR_CAPTAIN_PURE_UP"]],
  ["STR_CAPTAIN_SOREDUMB_UP",["STR_CAPTAIN_DUMBLAZY_UP","STR_CAPTAIN_LAZYSORE_UP","STR_CAPTAIN_JACKSORE_UP","STR_CAPTAIN_JACKDUMB_UP","STR_CAPTAIN_JACKLAZY_UP","STR_CAPTAIN_DOUBLEGREEN","STR_CAPTAIN_DOUBLERED","STR_CAPTAIN_PURE_UP"]],
  ["STR_CAPTAIN_PURE_UP",["STR_CAPTAIN_DUMBLAZY_UP","STR_CAPTAIN_LAZYSORE_UP","STR_CAPTAIN_SOREDUMB_UP","STR_CAPTAIN_JACKSORE_UP","STR_CAPTAIN_JACKDUMB_UP","STR_CAPTAIN_JACKLAZY_UP"]]
 ]},
 {title:"4단계 · Pure 최종",rows:[
  ["STR_CAPTAIN_GOLD_UP",["STR_CAPTAIN_GOLD_UP","STR_CAPTAIN_GRAY_UP","STR_CAPTAIN_GREEN_UP","STR_CAPTAIN_RED_UP","STR_CAPTAIN_ULTIMATE"]],
  ["STR_CAPTAIN_GREEN_UP",["STR_CAPTAIN_GOLD_UP","STR_CAPTAIN_GRAY_UP","STR_CAPTAIN_RED_UP","STR_CAPTAIN_ULTIMATE"]],
  ["STR_CAPTAIN_RED_UP",["STR_CAPTAIN_GOLD_UP","STR_CAPTAIN_GRAY_UP","STR_CAPTAIN_GREEN_UP","STR_CAPTAIN_ULTIMATE"]],
  ["STR_CAPTAIN_GRAY_UP",["STR_CAPTAIN_GOLD_UP","STR_CAPTAIN_GREEN_UP","STR_CAPTAIN_RED_UP","STR_CAPTAIN_ULTIMATE"]],
  ["STR_CAPTAIN_ULTIMATE",["STR_CAPTAIN_GOLD_UP","STR_CAPTAIN_GRAY_UP","STR_CAPTAIN_GREEN_UP","STR_CAPTAIN_RED_UP"]]
 ]}
];
const codexExclusive=[
 ["?금색 코덱스 선택?","STR_CHOOSE_GOLD_QUERY",["STR_CHOOSE_GREEN_QUERY","STR_CHOOSE_GRAY_QUERY","STR_CHOOSE_RED_QUERY"]],
 ["?녹색 코덱스 선택?","STR_CHOOSE_GREEN_QUERY",["STR_CHOOSE_GRAY_QUERY","STR_CHOOSE_RED_QUERY","STR_CHOOSE_GOLD_QUERY"]],
 ["?적색 코덱스 선택?","STR_CHOOSE_RED_QUERY",["STR_CHOOSE_GREEN_QUERY","STR_CHOOSE_GRAY_QUERY","STR_CHOOSE_GOLD_QUERY"]],
 ["?회색 코덱스 선택?","STR_CHOOSE_GRAY_QUERY",["STR_CHOOSE_GREEN_QUERY","STR_CHOOSE_RED_QUERY","STR_CHOOSE_GOLD_QUERY"]],
 ["금색 코덱스 연구","STR_CODEX_GOLD",["STR_CODEX_GRAY","STR_CODEX_GREEN","STR_CODEX_RED"]],
 ["녹색 코덱스 연구","STR_CODEX_GREEN",["STR_CODEX_GRAY","STR_CODEX_RED","STR_CODEX_GOLD"]],
 ["적색 코덱스 연구","STR_CODEX_RED",["STR_CODEX_GRAY","STR_CODEX_GREEN","STR_CODEX_GOLD"]],
 ["회색 코덱스 연구","STR_CODEX_GRAY",["STR_CODEX_RED","STR_CODEX_GREEN","STR_CODEX_GOLD"]]
];
const captainCodexInteractionRows=[
 ["G1","Gold Awakened + GODS E1 + Saint 아님","23%","Prince's Gift"],
 ["G2A","DumbLazy + Gold Awakened + GODS E2 + Saint 아님","23%","Cake ×3 + 50점"],
 ["G2B","DumbLazy + Green Awakened + GODS E2 + Saint 아님","23%","Cake ×3 + 50점"],
 ["G3","Green Awakened + GODS E3 + Saint 아님","23%","Sivalinga"],
 ["G4A","SoreDumb + Red Awakened + GODS E4 + Saint 아님","23%","+300점"],
 ["G4B","SoreDumb + Green Awakened + GODS E4 + Saint 아님","23%","+300점"],
 ["G5","Red Awakened + GODS E5 + Saint 아님","23%","Bloodoge 특수병 1명 + 전쟁 축복"],
 ["G6A","JackSore + Red Awakened + GODS E6 + Saint 아님","23%","Mad Scribblings"],
 ["G6B","JackSore + Gray Awakened + GODS E6 + Saint 아님","23%","Mad Scribblings"],
 ["G7","Gray Awakened + GODS E7 + Saint 아님","23%","Arcane Book / Demonic Essence×13 / Poltergeist 가중 추첨"],
 ["G8A","JackLazy + Gold Awakened + GODS E8 + Saint 아님","23%","Glamour ×33"],
 ["G8B","JackLazy + Gray Awakened + GODS E8 + Saint 아님","23%","Glamour ×33"],
 ["Lab Accident +1","Gray Codex + Schooling + Basic Electronics + Captain Red 없음","13%","-$250k 실험실 사고 추가 판정"],
 ["Lab Accident +1","Gray Codex + Schooling + Basic Electronics + Captain Green 없음","13%","-$250k 실험실 사고 추가 판정"],
 ["Gambling Night","Gambling + Hierarchy + Gray Codex 없음 + SoreAss 아님","13%","승리 전리품 또는 -$100k; Gray/SoreAss는 이 이벤트를 봉쇄"]
];
function rowForResearchId(id){
  const map={
    STR_CAPTAIN_DUMBASS:"dumbass",STR_CAPTAIN_JACKASS:"jackass",STR_CAPTAIN_LAZYASS:"lazyass",STR_CAPTAIN_SOREASS:"soreass",STR_CAPTAIN_PUSSY:"pussy",
    STR_CAPTAIN_THIEF:"thief",STR_CAPTAIN_PRIEST:"priest",STR_CAPTAIN_MAGE:"mage",STR_CAPTAIN_RULER:"ruler",STR_CAPTAIN_UNCLASSED_UP:"unclassedGate",
    STR_CAPTAIN_DUMBLAZY_UP:"dumblazy",STR_CAPTAIN_JACKDUMB_UP:"jackdumb",STR_CAPTAIN_JACKLAZY_UP:"jacklazy",STR_CAPTAIN_JACKSORE_UP:"jacksore",
    STR_CAPTAIN_LAZYSORE_UP:"lazysore",STR_CAPTAIN_SOREDUMB_UP:"soredumb",STR_CAPTAIN_PURE_UP:"pureGate",
    STR_CAPTAIN_GOLD_UP:"pureGold",STR_CAPTAIN_GREEN_UP:"pureGreen",STR_CAPTAIN_RED_UP:"pureRed",STR_CAPTAIN_GRAY_UP:"pureGray",STR_CAPTAIN_ULTIMATE:"ultimate"
  };
  return rows.find(r=>r.id===map[id]);
}
const choiceStageMeta=[
  {title:"1단계 · 기본 선장 성격",hint:"게임 전체의 큰 방향을 정합니다."},
  {title:"2단계 · PUSSY 직업",hint:"‘위와는 다른 선장’을 선택했을 때만 열립니다."},
  {title:"3단계 · 무직 혼합형",hint:"무직 게이트를 선택했을 때 열리는 3단계입니다."},
  {title:"4단계 · Pure 최종",hint:"Pure 게이트를 선택했을 때의 최종 선택입니다."}
];
function humanExtraLosses(stage,id,blocks){
  const peers=new Set(stage.rows.map(([peerId])=>peerId));
  return blocks.filter(x=>!peers.has(x)&&x!==id);
}
function humanFeatureName(id){
  return researchLabels[id]||id.replace(/^STR_/,"").replaceAll("_"," ");
}
function directEffectsForRow(r){
  if(!r)return[];
  return columns.filter(c=>c.type!=="ev"&&c.type!=="codex"&&(r[c.key]==="yes"||r[c.key]==="warn"));
}
function lateEffectsForRow(r){
  if(!r)return[];
  return columns.filter(c=>c.type!=="ev"&&c.type!=="codex"&&r[c.key]==="late");
}
function choiceEffectSummary(r){
  if(!r)return"";
  const direct=directEffectsForRow(r);
  const late=lateEffectsForRow(r);
  const directHtml=direct.length?'<div class="choice-effect-list">'+direct.map(c=>{
    const i=featureInfo[c.key];
    const full=c.key==="transfig"&&i?.detail?'<small class="choice-effect-detail">'+i.detail+'</small>':'';
    return '<div class="choice-effect '+(r[c.key]==="warn"?"warn-effect":"")+'"><b>'+S[r[c.key]]+' '+c.label+'</b><span>'+(i?.short||"")+'</span>'+full+'</div>';
  }).join("")+'</div>':'<p class="choice-no-direct">이 단계 선택 자체의 즉시 고유효과는 없음. 다음 분기를 여는 게 핵심.</p>';
  const lateHtml=late.length?'<p class="choice-late"><b>후기/추가조건:</b> '+late.map(c=>c.label).join(" · ")+'</p>':'';
  return '<div class="choice-effects-wrap"><span class="choice-effects-title">실제 효과</span>'+directHtml+lateHtml+'</div>';
}
function choiceOptionCard(stage,id,blocks){
  const r=rowForResearchId(id);
  const extras=humanExtraLosses(stage,id,blocks);
  const summary=r?.summary||"";
  const ev=r?.evText||"";
  const colorsHtml=r?colors(r):"";
  const constraint=extras.length?'<p class="choice-consequence"><b>고유 제약:</b> '+extras.map(humanFeatureName).join(" · ")+'</p>':'';
  return '<article class="choice-option" data-choice-id="'+id+'">'+
    '<div class="choice-option-head"><div><strong>'+(researchLabels[id]||id)+'</strong>'+(ev?'<small>'+ev+' /월</small>':'')+'</div>'+colorsHtml+'</div>'+
    (summary?'<p>'+summary+'</p>':'')+
    choiceEffectSummary(r)+
    constraint+
    '</article>';
}
function renderChoiceStage(stage,index){
  const meta=choiceStageMeta[index]||{title:stage.title,hint:""};
  return '<article class="choice-stage card">'+
    '<div class="choice-stage-head"><div><p class="eyebrow">선택 '+(index+1)+'</p><h3>'+meta.title+'</h3><p>'+meta.hint+'</p></div><span class="one-choice-badge">아래 '+stage.rows.length+'개 중 1개 선택</span></div>'+
    '<div class="choice-grid">'+stage.rows.map(([id,blocks])=>choiceOptionCard(stage,id,blocks)).join("")+'</div>'+
    '</article>';
}
function renderCodexChoice(){
  const opts=[
    {color:"Gold",name:"금색 코덱스",id:"STR_CHOOSE_GOLD_QUERY",route:"STR_USE_DRILL_GOLD → Fuego / 가두어진 이변 → Gold Codex",event:"+300점 · 큰 바위×30",reward:"은괴×12 · 금괴×36 · 보물 상자 · 우주복×3 · 제독의 복장 · 장교의 채찍",tech:"장교의 채찍 · 화염포",saint:"소심이면 네 번째 색 → Saint"},
    {color:"Green",name:"녹색 코덱스",id:"STR_CHOOSE_GREEN_QUERY",route:"STR_USE_DRILL_GREEN → Ventura / 고요한 이변 → Green Codex",event:"청소비×15 · 고철더미×7",reward:"치료 젤×20 · 의료 보급품×10 · 간호사 복장 · 완벽한 슈퍼변이체 스테이시스 포드×3",tech:"생체플라스마 투사기",saint:"무모면 네 번째 색 → Saint"},
    {color:"Red",name:"적색 코덱스",id:"STR_CHOOSE_RED_QUERY",route:"STR_USE_DRILL_RED → Metallo / 폭풍 같은 이변 → Red Codex",event:"-$25k",reward:"구식 광선총×2 · 군용 광선총×2 · 광선총 전지×50 · 어그레서 갑옷×8 · 악마 해골",tech:"리틀'일리야",saint:"게으른이면 네 번째 색 → Saint"},
    {color:"Gray",name:"회색 코덱스",id:"STR_CHOOSE_GRAY_QUERY",route:"STR_USE_DRILL_GRAY → Fortuna / 말할 수 없는 이변 → Gray Codex",event:"-210점 · 광기의 기록물×1",reward:"암호화 데이터 디스크×7 · 노움×1 · 똑똑이 복장 · 리베르 오컬터스 · 주술의 책",tech:"컨버전 발사기",saint:"멍청이면 네 번째 색 → Saint"}
  ];
  return '<article class="choice-stage card codex-choice-stage">'+
    '<div class="choice-stage-head"><div><p class="eyebrow">Codex 선택</p><h3>자그마한 드릴 → Codex 4색</h3><p><b>STR_TINY_DRILL_INVESTIGATION</b> 뒤 실제로 고르는 4지선다입니다. 각 query는 연구량 1 / +10점이며, Tiny Drill + Menacing Hull 특수 프로젝트(space 70, time 1, refund)와 Anomaly 연구(cost 4)를 거쳐 실제 Codex를 얻습니다.</p></div><span class="one-choice-badge">아래 4색 중 1개 선택</span></div>'+
    '<div class="choice-grid codex-choice-grid">'+opts.map(o=>'<article class="choice-option codex-human '+o.color.toLowerCase()+'" data-choice-id="'+o.id+'">'+
      '<div class="choice-option-head"><div><strong>'+o.name+'</strong><small>'+o.id+' · 연구량 1 · +10점</small></div><span class="color-pill">'+o.color+'</span></div>'+
      '<p><b>경로:</b> '+o.route+'</p>'+
      '<div class="choice-effects-wrap"><span class="choice-effects-title">실제 결과</span><div class="choice-effect-list">'+
        '<div class="choice-effect"><b>중간 이변</b><span>'+o.event+'</span></div>'+
        '<div class="choice-effect"><b>최종 보상</b><span>'+o.reward+'</span></div>'+
        '<div class="choice-effect"><b>대표 후속</b><span>'+CaptainGlossary.explain(o.tech)+'</span></div>'+
      '</div></div>'+
      '<p class="choice-late"><b>선장 보완:</b> '+o.saint+'</p>'+
      '</article>').join("")+'</div>'+
    '</article>';
}

const divergingPathOptions=[
  {
    name:"슈퍼변이체 계집이 최고다",id:"STR_GALS_ARE_SUPERIOR_PREQ",
    query:"?슈퍼변이체 계집이 최고다?",
    cost:"연구량 24",
    gate:"갈라지는 길",
    score:"완료 시 점수 -250",
    payoff:"용사 고용 · 슈퍼 노예 · 라미아 연계",
    detail:"여성/강화병 중심 분기. 이후 용사 고용과 Super Slave 계열에 연결되지만 완료 점수 -250이라는 명시적 페널티가 있다."
  },
  {
    name:"남성 병사",id:"STR_WE_NEED_MALE_TOUCH_PREQ",
    query:"?우리는 남자가 필요해?",
    cost:"연구량 3",
    gate:"갈라지는 길",
    score:"선택 연구 완료 점수 +25",
    payoff:"노예병 연구 즉시 획득 · Bonding/SS 작전 연계",
    detail:"가장 싼 진입 비용. 선택 연구에서 '노예병' 연구를 공짜로 얻고, 이후 Bonding Ceremony · SS Operations · School of Hard Knocks · ANZUG 축으로 이어진다."
  },
  {
    name:"농부 혁명!",id:"STR_PEASANT_REVOLUTION_PREQ",
    query:"?농부 혁명?",
    cost:"연구량 9",
    gate:"갈라지는 길 + 농부 고용",
    score:"본 연구 완료 시 점수 +100",
    payoff:"혁명 훈련 · 청소부 접촉 · 라미아 연계",
    detail:"농부/혁명 계열의 장기 분기. Revolutionary Training과 Contacts: Scavengers의 핵심 선행이며 라미아 고용 선행도 만족시킨다."
  },
  {
    name:"삶은 혼종이다",id:"STR_HYBRID_PATH_PREQ",
    query:"?삶은 혼종이다?",
    cost:"연구량 20",
    gate:"갈라지는 길 + '섹토위드 어디서 사'",
    score:"본 연구 완료 시 점수 +20",
    payoff:"레티큘란 · 버그아이 · 마고스 · 전용 장비/탈것 축",
    detail:"선택 순간 레티큘란 연구를 공짜로 얻고 레티큘란 접촉 축을 연다. 본 연구 뒤에는 Hiver 특성, 마고스 졸업→버그아이 사이코너트, 버그아이 고용 연계, 레티큘란 플라스마 차저, 정찰/소형 수송기, 버그아이 반항아 갑옷·Technician Suit가 연결된다. 단, 버그아이 고용 자체는 Mutant Alliance·Human-Reticulan Alliance·Hybrid of Twilight 등 별도 선행까지 필요해 즉시 고용은 아니다."
  },
  {
    name:"고양이와 함께 살기",id:"STR_CAT_PATH_PREQ",
    query:"?고양이와 함께 살기?",
    cost:"연구량 32",
    gate:"갈라지는 길 + 외계인 기원 + 통신",
    score:"본 연구 완료 시 점수 +20",
    payoff:"네코미미 병종 · 네트워크 · 파티/의식/고용 연계",
    detail:"선택 연구에서 네코미미 연구를 공짜로 얻는다. 본 연구 뒤 Soldier: Nekomimi와 Nekomimi Network, Party/Ceremony/Recruitment 연관 연구 및 세속의 도덕 축이 열린다."
  }
];
function renderDivergingPathsChoice(){
  return '<article class="choice-stage card">'+
    '<div class="choice-stage-head"><div><p class="eyebrow">장기 사회·병종 분기</p><h3>갈라지는 길</h3><p><b>STR_DIVERGING_PATHS</b> 뒤에 등장하는 별도의 영구 5지선다. 선장 성격/Codex와는 다른 선택축입니다.</p></div><span class="one-choice-badge">아래 5개 중 1개 선택</span></div>'+
    '<div class="choice-grid">'+divergingPathOptions.map(o=>'<article class="choice-option" data-choice-id="'+o.id+'">'+
      '<div class="choice-option-head"><div><strong>'+o.name+'</strong><small>'+o.query+' · '+o.cost+'</small></div></div>'+
      '<p>'+o.detail+'</p>'+
      '<div class="choice-effects-wrap"><span class="choice-effects-title">실제 효과</span>'+
        '<div class="choice-effect-list">'+
          '<div class="choice-effect"><b>선행</b><span>'+o.gate+'</span></div>'+
          '<div class="choice-effect"><b>핵심 이득</b><span>'+o.payoff+'</span></div>'+
          '<div class="choice-effect"><b>점수</b><span>'+o.score+'</span></div>'+
        '</div>'+
      '</div>'+
    '</article>').join("")+'</div>'+
    '<p class="choice-late"><b>중요:</b> 여기서 하나를 고르면 나머지 네 갈래는 함께 선택할 수 없습니다. 카드마다 disable ID를 반복 표기하지 않고, 플레이어 관점의 5지선다로 표시합니다.</p>'+
  '</article>';
}
function renderExclusiveRules(){
  const insight=document.querySelector("#soreassGoldInsight");
  if(insight) insight.innerHTML='<strong>읽는 법</strong><p>대부분의 직접 선택축은 하나만 고를 수 있지만, 닥터 X의 오로라 대체 선택과 Codex 결손색 결과처럼 <b>선행 조건·선택 순서로 갈리는 예외</b>가 있습니다. 카드 아래 <b>완료로 가정</b>을 누르면 다른 카드의 직접 봉쇄 상태가 바뀝니다. ✅는 자연 접근, ⚠는 큰 페널티, ◇는 후기/추가조건입니다. 개별 카드의 고유 제약은 상단 시뮬레이터와 별개로 룰셋 해설을 요약합니다.</p>';
  const root=document.querySelector("#exclusiveRules"); if(!root)return;
  root.innerHTML=exclusiveStages.map((g,i)=>renderChoiceStage(g,i)).join("")+renderCodexChoice()+renderDivergingPathsChoice();
}

function renderCaptainCodexInteractions(){
  const root=document.querySelector("#captainCodexInteractions"); if(!root)return;
  root.innerHTML='<div class="interaction-note"><b>중요:</b> G1~G8 Codex 보너스는 모두 Saint 이전에만 작동합니다. Saint가 되면 이 신들 보너스 풀은 정지하므로 단순 상위호환이 아닙니다.</div>'+
    '<div class="table-scroll"><table class="exclusive-table"><thead><tr><th>이벤트</th><th>조건</th><th>실행확률</th><th>실제 효과</th></tr></thead><tbody>'+
    captainCodexInteractionRows.map(r=>'<tr><td><b>'+r[0]+'</b></td><td>'+r[1]+'</td><td>'+r[2]+'</td><td>'+CaptainGlossary.explain(r[3])+'</td></tr>').join("")+
    '</tbody></table></div>';
}

const featureNames=Object.fromEntries(columns.filter(c=>c.type!=="ev"&&c.type!=="codex").map(c=>[c.key,c.label]));
const stageOrder={initial:0,class:1,unclassed:2,pure:3};
let sortState={key:"stage",dir:1};
// Expensive Codex and status-cell markup is invariant across sorting/filtering.
// Index it once rather than reconstructing the whole matrix per keystroke.
const rowInfo=new Map(rows.map((r,order)=>{
  const keys=Object.entries(r).filter(([key,value])=>value==="yes"||value==="warn"||value==="late").map(([key])=>key);
  return [r.id,{order,search:[r.name,r.code,r.route,r.summary,...r.notes,
    ...keys.map(key=>featureNames[key]||""),
    ...keys.map(key=>featureInfo[key]?.short||""),
    ...keys.map(key=>featureInfo[key]?.detail||"")].join(" ").toLowerCase(),
    available:columns.some(c=>c.type!=="ev"&&c.type!=="codex"&&(r[c.key]==="yes"||r[c.key]==="warn"))}];
}));
const rowMarkup=new Map();
const matrixBody=document.querySelector("#matrixTable tbody");
let searchDebounce=null;

function statusLabel(v){return v==="yes"?"자연 접근":v==="late"?"후기/조건부":v==="warn"?"가능·큰 페널티":"불가/봉쇄";}
function statusCell(v,c){
  const i=featureInfo[c?.key];
  const title=[statusLabel(v),i?.short].filter(Boolean).join(" · ");
  return '<span class="status '+v+'" title="'+title+'">'+S[v]+'</span>';
}
function columnHead(c){
  if(c.type==="ev")return '<span class="col-title">'+c.label+'</span><small class="col-effect">직접 현금 + 판매가 지급품 기대값</small>';
  if(c.type==="codex")return '<span class="col-title">'+c.label+'</span><small class="col-effect">색 이벤트 · 전용보상 · Saint 연계</small>';
  const i=featureInfo[c.key];
  return '<span class="col-title">'+c.label+'</span>'+(i?'<small class="col-effect">'+i.short+'</small>':'');
}
function effectCardsHtml(r){
  const effects=columns.filter(c=>c.type!=="ev"&&c.type!=="codex"&&(r[c.key]==="yes"||r[c.key]==="warn"||r[c.key]==="late"));
  return '<div class="effect-card-grid">'+effects.map(c=>{
    const state=r[c.key],i=featureInfo[c.key]||{};
    return '<article class="effect-card effect-'+state+'"><div class="effect-card-head"><b>'+S[state]+' '+c.label+'</b><span>'+statusLabel(state)+'</span></div><strong>'+i.short+'</strong><p>'+i.detail+'</p></article>';
  }).join("")+'</div>';
}
function evCell(r){
  const cls=r.ev>0?"ev-pos":r.ev<0?"ev-neg":"ev-zero";
  return '<span class="'+cls+'">'+r.evText+'</span>';
}
function stagePill(r){return '<span class="stage-pill">'+r.stageName+'</span>';}
function colors(r){return r.colors.length?r.colors.map(x=>'<span class="color-pill">'+x+'</span>').join(""):'<span class="muted">무색/게이트</span>';}

function renderHead(){
  const thead=document.querySelector("#matrixTable thead");
  const groups=[];
  for(const c of columns){let g=groups.find(x=>x.name===c.group);if(!g){g={name:c.group,count:0};groups.push(g)}g.count++}
  thead.innerHTML='<tr class="group"><th rowspan="2">선장 선택</th><th rowspan="2">단계</th><th rowspan="2">최단 시점</th><th rowspan="2">색</th>'+groups.map(g=>'<th colspan="'+g.count+'">'+g.name+'</th>').join("")+'</tr>'+
  '<tr>'+columns.map(c=>'<th class="feature-head" data-sort="'+(c.key==="ev"?"ev":"")+'" title="'+(featureInfo[c.key]?.detail||"")+'">'+columnHead(c)+'</th>').join("")+'</tr>';
  thead.querySelectorAll("[data-sort=ev]").forEach(th=>{th.style.cursor="pointer";th.title="클릭하여 EV 정렬";th.addEventListener("click",()=>{sortState={key:"ev",dir:sortState.key==="ev"?-sortState.dir:-1};renderRows()})});
}

function filteredRows(){
  const q=document.querySelector("#search").value.trim().toLowerCase();
  const stage=document.querySelector("#stageFilter").value;
  const only=document.querySelector("#onlyAvailable").checked;
  let out=rows.filter(r=>{
    if(stage!=="all"&&r.stage!==stage)return false;
    const info=rowInfo.get(r.id);
    if(q&&!info.search.includes(q))return false;
    if(only&&!info.available)return false;
    return true;
  });
  out.sort((a,b)=>{
    if(sortState.key==="ev")return (a.ev-b.ev)*sortState.dir;
    return (stageOrder[a.stage]-stageOrder[b.stage])||rowInfo.get(a.id).order-rowInfo.get(b.id).order;
  });
  return out;
}
function matrixRow(r){
  if(!rowMarkup.has(r.id))rowMarkup.set(r.id,'<tr data-id="'+r.id+'"><td><span class="captain-name">'+r.name+'</span><span class="captain-code">'+r.code+'</span></td><td>'+stagePill(r)+'</td><td>'+r.from+'</td><td>'+colors(r)+'</td>'+columns.map(c=>'<td>'+(c.type==="ev"?evCell(r):c.type==="codex"?codexCell(r,c.color):statusCell(r[c.key],c))+'</td>').join("")+'</tr>');
  return rowMarkup.get(r.id);
}
function renderRows(){
  matrixBody.innerHTML=filteredRows().map(matrixRow).join("");
}
matrixBody.addEventListener("click",event=>{
  const target=event.target.closest("tr[data-id]");
  if(target&&matrixBody.contains(target))openDetail(target.dataset.id);
});
function openDetail(id){
  const r=rows.find(x=>x.id===id); if(!r)return;
  document.querySelector("#dialogBody").innerHTML='<p class="eyebrow">'+r.stageName+'</p><h2>'+r.name+'</h2><p class="muted">'+r.route+' · '+r.from+'</p><p>'+r.summary+'</p>'+
  '<div class="detail-grid"><div class="detail-box"><strong>반복 이벤트 월 EV</strong>'+r.evText+'</div><div class="detail-box"><strong>색 태그</strong>'+colors(r)+'</div></div>'+
  '<h3>접근 가능한 주요 옵션 · 실제 효과</h3>'+effectCardsHtml(r)+
  codexDetailHtml(r)+'<h3>주의 / 해설</h3><ul>'+r.notes.map(n=>'<li>'+n+'</li>').join("")+'</ul>';
  document.querySelector("#detailDialog").showModal();
}

const timelineData=[
  ["1/26","초기 5선장","무모 / 멍청 / 게으른 / 소심 / 위와는 다른 중 선택"],
  ["2/1","PUSSY 성격검사 2","도둑 / 사제 / 마법사 / 지도자 / 무직 게이트"],
  ["3/1","무직 성격검사 3","6개 혼합형 또는 Pure 게이트"],
  ["4/1","Pure 성격검사 4","Gold / Green / Red / Gray / Ultimate"],
  ["5/1","Ultimate 첫 666k 판정","매월 63% · 이벤트 자체는 무위험"]
];
function renderTimeline(){
 document.querySelector("#timeline").innerHTML=timelineData.map(x=>'<article class="card"><time>'+x[0]+'</time><strong>'+x[1]+'</strong><p>'+x[2]+'</p></article>').join("");
}
const deep=[
 {title:"방사탑",tag:"지오스케이프 기지방어",body:"지나가는 UFO를 자동사격하는 SAM이 아니다. 평소에는 범위 1600 / 40% Hyperwave 탐지, 적이 기지를 실제 공격할 때 Base Defense에서 사격한다.",rows:[["건설/유지","$1.45m / $60k월"],["방어력/명중","333 / 100%"],["Flak 비교","225 / 65%"],["치료 페널티","SickBay -0.35/기 → 기본 회복 1.00→0.65/day"]]},
 {title:"벙커 + 14mm 포탑",tag:"전술 기지방어",body:"기지방어 전투맵 XBR_140에 아군 고정포탑 1기가 실제 스폰된다. 좁은 통로를 14mm 4발 버스트로 막는다.",rows:[["건설","$150k + 프리팹7 + Necroplane Parts35"],["포탑","HP75 / 장갑 75·65·65·60"],["무기","Power66 / 4발 Burst / 30% TU / 무한탄"],["턴당 최대","3 Burst ≈ 12발"]]},
 {title:"전술센터",tag:"전지구 탐지",body:"공격시설이 아니라 정보망. 범위 10800, 매시간 4% 탐지 판정을 제공한다. 한 번 추적된 표적은 범위 내 레이더가 있으면 유지된다.",rows:[["건설/유지","$600k / $50k월"],["재료","개인 자료 50"],["24시간 노출 시","단순 독립가정 약 62.5% 이상 1회 탐지"],["소심 전용","CAPTAIN_SOREASS 직접 요구"]]},
 {title:"네크로방어",tag:"Flak 보급 우회",body:"새 포탑이 아니라 Flak Tower Kit 대체 제작법. 귀한 25mm 기관포와 탄약 대신 네크로비행기 부품을 태운다.",rows:[["일반 Kit","1000 worker-h + 소형기관포4 + 50발상자12"],["Necro Kit","2500 worker-h + Necroplane Parts25"],["완성 Flak","방어225 / 명중65% / 인원+5 / 저장+50"]]},
 {title:"신병→군사 훈련",tag:"정규병 확정 성장",body:"소심과 Ruler는 신병훈련을 열 수 있고, Ruler만 거기서 군사훈련까지 간다. 성장한 스탯 일부를 감산하는 diminishing-return 구조라 신병일수록 효율이 좋다.",rows:[["신병훈련","기력+10 용기+10 반응+5 사격+15 투척+5 근력+10 근접+5 Mana+10"],["군사훈련","TU+5 기력+10 체력+5 용기+10 반응+5 사격+5 투척+5 근접+5 Mana+10 PsiStr+15"],["군사훈련 조건","Ruler + Boot Camp 선행 + DOJO"]]},
 {title:"건강미 / 자랑스러운 전사",tag:"대체 육성",body:"Priest는 탱커형 건강미 훈련, JackDumb·Pure Red·Saint는 전사문화의 자랑스러운 전사에 강점. 군사훈련과 일부 상호배타라 한 병사에 전부 쌓는 구조가 아니다.",rows:[["건강미 총효과 핵심","기력≈+31 체력≈+23 근력≈+14 장갑+1"],["자랑스러운 전사 핵심","기력≈+17 체력+6 용기+10 근접+10 투척+10 장갑+1"]]},
 {title:"Charmy Dance Training",tag:"멍청한 선장 병사 강화",body:"DOJO에서 28일 걸리는 영구 훈련. 훈련 본체의 능력치 상승과 Charmy Dancer Soldier Bonus가 따로 적용된다.",rows:[["훈련 본체","TU+10 · 기력+10 · 체력+10 · 용기+10 · 반응+10 · PSI Skill+5 · Mana+10"],["Charmy Dancer 보너스","체력+5 · 반응+5 · 전면장갑+3 · 하부장갑+3"],["캡 미도달 총합","TU+10 · 기력+10 · 체력+15 · 용기+10 · 반응+15 · PSI Skill+5 · Mana+10 · 전면/하부장갑+3"],["훈련 조건","용기 50+ · DOJO · $1,000 · Glamour×6 · Zany Zines×3 · 회복 28일 · 부상자는 불가"],["적용 병종","일반 Soldier 계열 + Gnome + Ogre"],["상호배타","재훈련 불가 · Biofield Collapse · Military Drill Training"],["성장캡","훈련 본체 +10류는 병종 stat cap에서 하드캡. 체력+5/반응+5 Soldier Bonus는 캡 계산 뒤 별도 가산되어 캡을 넘는 실효치가 가능"]]},
 {title:"혼돈의 성자 지원군",tag:"기본 4선장 장기 보상",body:"PUSSY 계열은 영구 불가. 기본 4선장이 4색을 모두 맞추면 Saint가 가능하고, 도마뱀 조각상 전 기준 특수인력 기대 획득량이 약 0.652명/월이다.",rows:[["평균 간격","약 1.53개월/지원군"],["주요 대박","전쟁공주, 외톨이 클론, 농부 소녀 안내인, 얼음부인, 인간 영웅, 황혼의 신봉자"],["Dumbass 추가","Saint 상태에서 7% 실행 판정 · 정통파 마법사 영애 + $100k (Pussy+JackLazy에도 별도 이벤트 존재)"]]},
 {title:"궁극의 선장",tag:"후불 경제 엔진",body:"$666k 이벤트 자체는 소모·부채·전투 없이 매월 63% 판정. 다만 현재 19(1).sav에서는 최단 4/1에 Ultimate 선택, 첫 월초 판정은 5/1.",rows:[["이벤트 1회","+$666,000 + 666점"],["핵심 월 EV","+$419,580"],["무색 전체 EV","약 +$579,129/월"],["대가","Saint·전술센터·호텔·대량채굴·지하감옥 마스터 포기"]]}
];
function renderDeep(){
 document.querySelector("#deepDiveCards").innerHTML=deep.map(d=>'<article class="deep-card card"><p class="eyebrow">'+d.tag+'</p><h3>'+d.title+'</h3><p>'+d.body+'</p><table><tbody>'+d.rows.map(x=>'<tr><th>'+x[0]+'</th><td>'+x[1]+'</td></tr>').join("")+'</tbody></table></article>').join("");
}

document.querySelector("#search").addEventListener("input",()=>{
  if(searchDebounce!==null)clearTimeout(searchDebounce);
  searchDebounce=setTimeout(()=>{searchDebounce=null;renderRows();},100);
});
document.querySelector("#stageFilter").addEventListener("change",renderRows);
document.querySelector("#onlyAvailable").addEventListener("change",renderRows);
document.querySelector("#resetBtn").addEventListener("click",()=>{if(searchDebounce!==null)clearTimeout(searchDebounce);searchDebounce=null;document.querySelector("#search").value="";document.querySelector("#stageFilter").value="all";document.querySelector("#onlyAvailable").checked=false;sortState={key:"stage",dir:1};renderRows()});
document.querySelector("#dialogClose").addEventListener("click",()=>document.querySelector("#detailDialog").close());
document.querySelector("#detailDialog").addEventListener("click",e=>{if(e.target.id==="detailDialog")e.currentTarget.close()});

renderHead();renderRows();renderCodexEconomyTable();renderCodexCards();renderExclusiveRules();renderCaptainCodexInteractions();CaptainGlossary.render();renderTimeline();renderDeep();
