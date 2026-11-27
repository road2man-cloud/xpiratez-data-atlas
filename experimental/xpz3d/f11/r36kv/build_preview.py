#!/usr/bin/env python3
"""Produce one self-contained, file://-safe R36KU/R36KV comparison viewer."""
from pathlib import Path
import base64,json,subprocess
ROOT=Path(__file__).resolve().parent;OUT=ROOT/'preview';OUT.mkdir(exist_ok=True)
subprocess.run(['node',str(ROOT/'viewer_deps/node_modules/esbuild/bin/esbuild'),'viewer_r36kv.js','--bundle','--minify','--format=iife',f'--outfile={OUT/"viewer.bundle.js"}'],cwd=ROOT,check=True)
paths={'before':ROOT/'input/R36KU_F11_BALANCED_DETAIL_1024_2100TRI.glb',**{str(s):ROOT/f'output/R36KV_F11_SHARED_UV_{s}_2100TRI.glb' for s in (1024,512)}}
models={k:base64.b64encode(p.read_bytes()).decode() for k,p in paths.items()}
report=json.loads((ROOT/'output/R36KV_1024_BUILD_REPORT.json').read_text())
html='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R36KV | 공유 UV 경량화</title><style>
*{box-sizing:border-box}body{margin:0;background:#10191f;color:#e7edf1;font:14px/1.55 system-ui,"Malgun Gothic",sans-serif}header{padding:18px 26px 12px;border-bottom:1px solid #34454e}h1{font-size:25px;margin:0 0 5px}.sub{color:#aebfc9}nav{display:flex;gap:17px;align-items:center;flex-wrap:wrap;padding:12px 26px;background:#1a2932}label{white-space:nowrap}select{background:#273a45;color:#fff;border:1px solid #536975;border-radius:5px;padding:6px}input[type=range]{width:115px;vertical-align:middle}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0}.pane{position:relative;height:580px;min-width:0}.pane canvas{display:block;width:100%;height:100%}.tag{position:absolute;top:12px;left:17px;background:#11212ae0;padding:7px 12px;border-radius:5px;pointer-events:none}.foot{padding:16px 26px;color:#b6c6ce}.foot strong{color:#e7edf1}#status{color:#a8dbc2}small{font-size:12px}@media(max-width:800px){header,nav,.foot{padding-left:14px;padding-right:14px}.pane{height:440px}.tag{font-size:11px;left:6px;padding:5px}h1{font-size:20px}}
</style></head><body><header><h1>R36KV · 공유 UV 경량화</h1><div class="sub">삼각형 2,100개 · 본 63개 유지 / 정점 4,707 → __VERTS__ / 원본 형상·피부색 보존</div></header>
<nav><label>시점 <select id="preset"><option value="head">얼굴·헤어</option><option value="arm">팔·손</option><option value="full">전신</option></select></label><label>R36KV <select id="resolution"><option>1024</option><option>512</option></select></label><label>표시 <select id="mode"><option value="pbr">PBR 비교</option><option value="albedo">색상만 / 조명 없음</option></select></label><label><input id="detail" type="checkbox" checked>추가 표면 디테일</label><label><input id="wire" type="checkbox">와이어</label><label>광원 <input id="light" type="range" min="-110" max="110" value="-35"></label></nav>
<nav><label>팔 <input id="arm" type="range" min="0" max="75" value="55"></label><label>다리 <input id="leg" type="range" min="0" max="32" value="6"></label><span id="poseText"></span><small>합성 포즈이며 실제 S2/S3 애니메이션이 아닙니다.</small></nav>
<div class="grid"><section id="before" class="pane"><span class="tag">R36KU · 1024 · 4,707 정점</span></section><section id="after" class="pane"><span id="afterLabel" class="tag">R36KV · 1024 · 공유 UV</span></section></div>
<div class="foot"><div id="status">내장 GLB 로딩 중…</div><strong>왼쪽 화면을 드래그하면 양쪽 카메라가 함께 움직입니다.</strong><br>피부 디테일 UV 영역 1,120 → __CHARTS__. 같은 표면 함수를 공유 UV에 재베이크했고, 헤어 색·노멀·거칠기 이미지는 그대로 유지했습니다.<br>원래 피부색 이미지 5장·형상·본·가중치·재질 값은 변경하지 않았습니다. UV와 탄젠트, 피부 보강 노멀/거칠기 2장은 변경되었습니다.<br><small>three.js r170 · sRGB 출력 · 톤매핑 없음 · 인터넷·CDN·로컬 서버 불필요. 고밀도 참조 메시 복원이나 실제 게임 FPS 향상을 입증한 결과가 아닙니다.</small></div>
<script>window.MODEL_DATA=__MODELS__;</script><script>__VIEWER__</script></body></html>'''
html=html.replace('__VERTS__',f"{report['verticesAfter']:,}").replace('__CHARTS__',str(report['atlas']['charts'])).replace('__MODELS__',json.dumps(models,separators=(',',':'))).replace('__VIEWER__',(OUT/'viewer.bundle.js').read_text(encoding='utf8').replace('</script','<\\/script'))
(OUT/'index.html').write_text(html,encoding='utf8')
(OUT/'THIRD_PARTY_NOTICES.txt').write_text('three.js r170\n'+(ROOT/'viewer_deps/node_modules/three/LICENSE').read_text(encoding='utf8'),encoding='utf8')
print('OFFLINE_VIEWER_BYTES',(OUT/'index.html').stat().st_size)
