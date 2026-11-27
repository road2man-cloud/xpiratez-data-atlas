"""Build a self-contained offline comparison HTML. No CDN or HTTP server."""
from pathlib import Path
import subprocess,base64,json
ROOT=Path(__file__).resolve().parent
out=ROOT/'preview';out.mkdir(exist_ok=True)
subprocess.run(['node',str(ROOT/'viewer_deps/node_modules/esbuild/bin/esbuild'),'viewer_r36kw.js','--bundle','--minify','--format=iife',f'--outfile={out/"viewer.bundle.js"}'],cwd=ROOT,check=True)
models={}
for s in (1024,512):
 models['before'+str(s)]=ROOT/'input'/f'R36KV_F11_SHARED_UV_{s}_2100TRI.glb'
 models['after'+str(s)]=ROOT/'output'/f'R36KW_F11_NORMAL_UV_REPAIR_{s}_2100TRI.glb'
data={k:base64.b64encode(p.read_bytes()).decode('ascii') for k,p in models.items()}
html='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R36KW | Normal UV Repair</title><style>
*{box-sizing:border-box}body{margin:0;background:#10191f;color:#e7edf1;font:14px/1.55 system-ui,"Malgun Gothic",sans-serif}header{padding:19px 24px 12px;border-bottom:1px solid #34454e}h1{font-size:25px;margin:0 0 5px}.sub{color:#aebfc9}nav{display:flex;gap:17px;align-items:center;flex-wrap:wrap;padding:12px 24px;background:#1a2932}label{white-space:nowrap}select{background:#273a45;color:#fff;border:1px solid #536975;border-radius:5px;padding:6px}input[type=range]{width:115px;vertical-align:middle}.grid{display:grid;grid-template-columns:1fr 1fr;gap:2px}.pane{position:relative;height:580px;min-width:0}.pane canvas{display:block;width:100%;height:100%}.tag{position:absolute;top:12px;left:17px;background:#11212ad9;padding:7px 12px;border-radius:5px;pointer-events:none}.foot{padding:16px 24px;color:#b6c6ce}.foot strong{color:#e7edf1}#status{color:#a8dbc2}small{font-size:12px}@media(max-width:800px){header,nav,.foot{padding-left:14px;padding-right:14px}.pane{height:460px}.tag{font-size:11px;left:6px;padding:5px}h1{font-size:20px}}
</style></head><body><header><h1>R36KW · 노멀맵 UV 70면 보완</h1><div class="sub">왼쪽 R36KV / 오른쪽 R36KW. 왼쪽 화면을 드래그하면 카메라가 함께 움직입니다. 동일 해상도로 비교합니다.</div></header>
<nav><label>시점 <select id="preset"><option value="head">얼굴·헤어</option><option value="legs">다리</option><option value="feet">발·발목</option><option value="full">전신</option><option value="back">뒤쪽</option></select></label><label>해상도 <select id="resolution"><option>1024</option><option>512</option></select></label><label>표시 <select id="mode"><option value="pbr">PBR 비교</option><option value="albedo">색상만 / 조명 없음</option></select></label><label><input id="normal" type="checkbox" checked>노멀맵</label><label><input id="wire" type="checkbox">와이어</label><label>광원 <input id="light" type="range" min="-160" max="160" value="-35"></label></nav>
<nav><label>팔 <input id="arm" type="range" min="0" max="75" value="55"></label><label>다리 <input id="leg" type="range" min="0" max="32" value="6"></label><span id="poseText"></span><small>비교용 합성 포즈이며 S2/S3 애니메이션이 아닙니다.</small></nav>
<div class="grid"><section id="before" class="pane"><span class="tag" id="beforeLabel">R36KV</span></section><section id="after" class="pane"><span class="tag" id="afterLabel">R36KW</span></section></div>
<div class="foot"><div id="status">내장 GLB 로딩 중…</div><strong>2,100삼각형 · 63본 · 12개 메시 프리미티브 유지 / 정점 1,837 → 2,047.</strong><br>색상 UV·기본 색상·원래 메시 형상을 보존하고 노멀맵용 UV를 분리했습니다. 원래 색상 UV의 면적 0인 면은 의도적으로 남아 있습니다.<br>몸통·어깨·다리에 MikkTSpace 탄젠트가 내장됩니다. 헤어 14면은 기존 노멀 표현을 재투영했고, 다리 56면은 새 미세 표면 보강입니다. 고밀도 원본 복원이 아닙니다.<br>노멀 텍스처 영역 확장으로 비압축 RGBA8·밉 제외 추정 텍스처 용량이 1024판 약 4.25MiB, 512판 약 1.25MiB 늘어납니다. 실제 GPU 메모리·FPS는 측정하지 않았습니다.<br><small>three.js r170 / sRGB 출력 / 톤매핑 없음. 최종 S2/S3 색감 기준이 아닙니다. 모델 4개와 렌더러가 이 HTML에 내장되어 인터넷·CDN·서버가 필요 없습니다.</small></div>
<script>window.MODEL_DATA=__MODELS__;</script><script>__VIEWER__</script></body></html>'''
html=html.replace('__MODELS__',json.dumps(data,separators=(',',':'))).replace('__VIEWER__',(out/'viewer.bundle.js').read_text(encoding='utf8').replace('</script','<\\/script'))
(out/'index.html').write_text(html,encoding='utf8')
(out/'THIRD_PARTY_NOTICES.txt').write_text('three.js r170 (including bundled MikkTSpace module)\n'+(ROOT/'viewer_deps/node_modules/three/LICENSE').read_text(encoding='utf8'),encoding='utf8')
print('OFFLINE_VIEWER',out/'index.html',(out/'index.html').stat().st_size)
