#!/usr/bin/env python3
"""Generate deterministic static comparisons and a self-contained offline HTML viewer."""
import json,html
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parent
PRE=ROOT/'preview';PRE.mkdir(exist_ok=True)
R=json.loads((ROOT/'output'/'R36KS_1024_BUILD_REPORT.json').read_text())
colors={'KR':'#64748b','KS':'#3b82f6'}
poses=[('FRONT_6','정면 / 벌림 6°'),('OBLIQUE_32','사선 / 벌림 32°')]
for name,_ in poses:
 for version in ['R36KR','R36KS']:
  img=Image.open(PRE/f'{version}_{name}.png').convert('RGB')
  hip=img.crop((355,475,735,715)).resize((760,480),Image.Resampling.BICUBIC)
  hip.save(PRE/f'{version}_{name}_HIP.png',optimize=True)
  img.save(PRE/f'{version}_{name}.png',optimize=True)
 a=Image.open(PRE/f'R36KR_{name}_HIP.png');b=Image.open(PRE/f'R36KS_{name}_HIP.png')
 board=Image.new('RGB',(a.width+b.width,520),(13,24,36));board.paste(a,(0,40));board.paste(b,(a.width,40));
 dr=ImageDraw.Draw(board);dr.text((18,9),'R36KR  /  BEFORE',fill='white');dr.text((a.width+18,9),'R36KS  /  AFTER',fill='white')
 board.save(PRE/f'COMPARE_{name}_HIP.png',optimize=True)

S={'version':'R36KS','baseline':'R36KR','method':'glTF LBS with 9 synthetic thigh-spread angles; not S2/S3 engine',
 'positionBudget':.00215,'units':'GLB model coordinates','bySide':[],'poses':[]}
for leg in R['poseBySide']:
 b=leg['before'];a=leg['after'];side=leg['primitive'];
 for old,new in zip(b,a):
  S['poses'].append({'side':side,'angle':old['spreadDegrees'],'beforeMean':old['meanGap'],
   'afterMean':new['meanGap'],'beforeMax':old['maxGap'],'afterMax':new['maxGap'],
   'deltaMean':new['meanGap']-old['meanGap']})
 import numpy as np
 x=np.mean([v['meanGap'] for v in b]);y=np.mean([v['meanGap'] for v in a]);
 S['bySide'].append({'side':side,'meanGapBefore':float(x),'meanGapAfter':float(y),
   'relativeReduction':float((x-y)/x),'angleCasesImproved':sum(q['meanGap']>p['meanGap'] for q,p in zip(b,a)),'angleCasesTotal':len(b)})
S['allCasesNonRegressed']=all(p['afterMean']<=p['beforeMean'] and p['afterMax']<=p['beforeMax'] for p in S['poses'])
(ROOT/'output'/'R36KS_POSE_COMPARISON.json').write_text(json.dumps(S,indent=2,ensure_ascii=False)+'\n',encoding='utf8')

# HTML dashboard intentionally standalone: no network dependencies and no file:// JSON fetch.
report=json.dumps(S,ensure_ascii=False)
style='''
:root{color-scheme:dark;font-family:system-ui,"Malgun Gothic",sans-serif}*{box-sizing:border-box}body{max-width:1400px;margin:0 auto;padding:24px;background:#0d1726;color:#edf2f7}.meta{color:#9bafc5}.bar{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:20px 0}.bar button{background:#1d3654;border:1px solid #33516f;color:#fff;border-radius:9px;padding:10px 16px;cursor:pointer}.bar button.on{background:#2563eb} .views{display:grid;grid-template-columns:repeat(2,minmax(250px,1fr));gap:16px}.pane{background:#111e30;border:1px solid #2d3e53;padding:12px;border-radius:14px;overflow:hidden}.pane img{width:100%;height:auto;display:block;border-radius:6px}figcaption{color:#9bafc5;margin:9px 0 3px}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0}.metric{background:#121e2e;padding:15px;border:1px solid #29425e;border-radius:10px}.metric strong{display:block;font-size:2rem;color:#94d5b2;margin-top:7px}svg{max-width:100%;height:auto;background:#111e30;border-radius:9px}.row{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.tag{font-size:12px;color:#90a6bc}.small{font-size:14px;color:#acc0d3}.alert{border-left:3px solid #50617d;padding:8px 12px;margin:15px 0;color:#c4d2dd}
@media(max-width:800px){.views,.metrics{grid-template-columns:1fr}body{padding:12px}}
'''
body='''<h1>XPZ3D · R36KR → R36KS</h1><p class="meta">F11 다리 상단 접합부 · 2,100△ / 63 bones · 동일한 피부색 · 재현 가능한 GLB 기반 비교</p>
<div class="bar"><button id="front" class="on" onclick="switchPose('FRONT_6')">정면 / 벌림 6°</button><button id="oblique" onclick="switchPose('OBLIQUE_32')">사선 / 벌림 32°</button><label><input type="checkbox" id="hip" onchange="switchPose(currentPose)"> 골반부 확대</label></div>
<div class="views"><div class="pane"><div class="row"><b>R36KR 기준</b><span class="tag">BEFORE</span></div><img id="imgKr" alt="R36KR 모델"></div><div class="pane"><div class="row"><b>R36KS 개선</b><span class="tag">AFTER</span></div><img id="imgKs" alt="R36KS 모델"></div></div>
<div class="metrics"><div class="metric">왼쪽 허벅지 / 9개 포즈 평균<strong>−32.6%</strong><span class="small">0.004611 → 0.003106</span></div><div class="metric">오른쪽 허벅지 / 9개 포즈 평균<strong>−32.7%</strong><span class="small">0.004644 → 0.003126</span></div></div>
<h2>포즈별 접합 간격 · 평균 모델 좌표계</h2><svg id="chart" viewBox="0 0 960 400" role="img" aria-label="포즈별 좌우 접합 간격 비교 차트"></svg>
<p class="alert">이 페이지는 실제 GLB를 자체 스키닝 계산 후 래스터화한 이미지입니다. S2/S3 엔진에서 캡처한 화면이 아니며, 메시가 완전히 용접된 결과도 아닙니다.</p>
<p class="small">수정 범위: 허벅지 프리미티브 10/11의 POSITION / NORMAL / WEIGHTS_0. 프리미티브 0–9, 피부 텍스처 및 본 계층은 보존. 이미지들은 같은 조명과 카메라로 렌더링했습니다.</p>
'''
script='''<script>
const report=__REPORT__;
let currentPose='FRONT_6';
function switchPose(pose){currentPose=pose;document.getElementById('front').classList.toggle('on',pose==='FRONT_6');document.getElementById('oblique').classList.toggle('on',pose==='OBLIQUE_32');let hip=document.getElementById('hip').checked?'_HIP':'';['Kr','Ks'].forEach(v=>{document.getElementById('img'+v).src='R36'+(v==='Kr'?'KR':'KS')+'_'+pose+hip+'.png';});}
function chart(){const svg=document.getElementById('chart');const ns='http://www.w3.org/2000/svg',W=960,H=400;
const el=(tag,attrs,content)=>{let n=document.createElementNS(ns,tag);Object.entries(attrs||{}).forEach(([k,v])=>n.setAttribute(k,v));if(content)n.textContent=content;svg.appendChild(n);return n;};
const mx=90,my=38,cw=790,ch=275,maxY=.0065;let Y=v=>my+ch-(v/maxY)*ch,X=i=>mx+i*cw/8;
for(let tick=0;tick<=6;tick++){let y=Y(tick/1000);el('line',{x1:mx,y1:y,x2:mx+cw,y2:y,stroke:'#233c55'});el('text',{x:12,y:y+5,fill:'#a9bfce','font-size':15},(tick/1000).toFixed(3))}
const gs=[...new Set(report.poses.map(p=>p.angle))];gs.forEach((a,i)=>el('text',{x:X(i)-14,y:my+ch+30,fill:'#a9bfce','font-size':15},a+'°'));
[['10','좌측','#5ec6dc'],['11','우측','#ecab66']].forEach(([side,title,color])=>{
 let pts=report.poses.filter(p=>p.side===+side),bf=pts.map((p,i)=>X(i)+','+Y(p.beforeMean)).join(' '),af=pts.map((p,i)=>X(i)+','+Y(p.afterMean)).join(' ');
 el('polyline',{points:bf,fill:'none',stroke:color,'stroke-width':3,'stroke-dasharray':'9 7'});
 el('polyline',{points:af,fill:'none',stroke:color,'stroke-width':4});
 el('text',{x:mx+cw-240,y:25,fill:color,'font-size':18},title+' (점선 KR / 실선 KS)')
});
}switchPose('FRONT_6');chart();
</script>'''.replace('__REPORT__',report)
markup='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>R36KS · 전투용 3D 모션 접합 비교</title><style>'+style+'</style></head><body>'+body+script+'</body></html>'
(PRE/'index.html').write_text(markup,encoding='utf8')
print('created',[(p.name,p.stat().st_size) for p in PRE.iterdir()])
