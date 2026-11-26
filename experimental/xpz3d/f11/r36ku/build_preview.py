"""Bundle a network-free, file:// safe GLB comparison dashboard."""
from pathlib import Path
import subprocess,base64,json
ROOT=Path(__file__).resolve().parent
out=ROOT/'preview';out.mkdir(exist_ok=True)
subprocess.run(['node',str(ROOT/'viewer_deps/node_modules/esbuild/bin/esbuild'),'viewer_r36ku.js','--bundle','--minify','--format=iife',f'--outfile={out / "viewer.bundle.js"}'],cwd=ROOT,check=True)
models={
 'before':ROOT/'source/output/R36KS_F11_MULTI_POSE_HIP_1024_2100TRI.glb',
 '1024':ROOT/'output/R36KU_F11_BALANCED_DETAIL_1024_2100TRI.glb',
 '512':ROOT/'output/R36KU_F11_BALANCED_DETAIL_512_2100TRI.glb'}
data={k:base64.b64encode(p.read_bytes()).decode('ascii') for k,p in models.items()}
html='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R36KU | Material Detail Comparison</title><style>
*{box-sizing:border-box}body{margin:0;background:#10191f;color:#e7edf1;font:14px/1.55 system-ui,"Malgun Gothic",sans-serif}header{padding:20px 26px 12px;border-bottom:1px solid #34454e}h1{font-size:25px;margin:0 0 5px}.sub{color:#aebfc9}nav{display:flex;gap:17px;align-items:center;flex-wrap:wrap;padding:13px 26px;background:#1a2932}label{white-space:nowrap}select,button{background:#273a45;color:#fff;border:1px solid #536975;border-radius:5px;padding:6px}input[type=range]{width:115px;vertical-align:middle}.grid{display:grid;grid-template-columns:1fr 1fr;gap:2px}.pane{position:relative;height:580px;min-width:0}.pane canvas{display:block;width:100%;height:100%}.tag{position:absolute;top:12px;left:17px;background:#11212ad9;padding:7px 12px;border-radius:5px;pointer-events:none}.foot{padding:16px 26px;color:#b6c6ce}.foot strong{color:#e7edf1}#status{color:#a8dbc2}small{font-size:12px}a{color:#a8d2f0}@media(max-width:800px){header,nav,.foot{padding-left:14px;padding-right:14px}.pane{height:460px}.tag{font-size:11px;left:6px;padding:5px}h1{font-size:20px}}
</style></head><body><header><h1>R36KU · 균형 표면 디테일</h1><div class="sub">R36KS 원본과 R36KU 실물 GLB를 같은 카메라·조명으로 비교합니다. 왼쪽 화면을 드래그하여 회전하고 휠로 확대합니다.</div></header>
<nav><label>시점 <select id="preset"><option value="head">얼굴·헤어</option><option value="arm">팔·손</option><option value="full">전신</option></select></label><label>R36KU <select id="resolution"><option>1024</option><option>512</option></select></label><label>표시 <select id="mode"><option value="pbr">PBR 비교</option><option value="albedo">색상만 / 조명 없음</option></select></label><label><input id="detail" type="checkbox" checked>새 디테일</label><label><input id="wire" type="checkbox">와이어</label><label>광원 <input id="light" type="range" min="-110" max="110" value="-35"></label></nav>
<nav><label>팔 <input id="arm" type="range" min="0" max="75" value="55"></label><label>다리 <input id="leg" type="range" min="0" max="32" value="6"></label><span id="poseText"></span><small>합성 관절 포즈이며 게임 엔진 애니메이션이 아닙니다.</small></nav>
<div class="grid"><section id="before" class="pane"><span class="tag">R36KS · 1024 · 기존 모델</span></section><section id="after" class="pane"><span class="tag" id="afterLabel">R36KU · 1024 · 새 디테일</span></section></div>
<div class="foot"><div id="status">내장 GLB 로딩 중…</div><strong>2,100삼각형 · 63본 유지 / 기존 이미지 5장·피부색·삼각형별 좌표 보존.</strong><br>추가한 것은 얼굴·목·팔·손목·손가락의 미세 표면과 기존 헤어 텍스처 기반 결입니다. 별도 6,044삼각형 공여 메시의 복원본이 아닙니다.<br>UV 분리 때문에 정점 수는 1,249 → 4,707로 증가했습니다. 기존 몸통·다리 재질은 변경하지 않았습니다.<br><small>three.js r170 · sRGB 출력 · 톤매핑 없음 · 조명은 비교용이며 최종 S2/S3 색감 기준이 아닙니다. 모든 모델과 렌더러가 이 HTML 안에 포함되어 있어 인터넷·로컬 서버가 필요하지 않습니다.</small></div>
<script>window.MODEL_DATA=__MODELS__;</script><script>__VIEWER__</script></body></html>'''
html=html.replace('__MODELS__',json.dumps(data,separators=(',',':'))).replace('__VIEWER__',(out/'viewer.bundle.js').read_text(encoding='utf8').replace('</script','<\\/script'))
(out/'index.html').write_text(html,encoding='utf8')
(out/'THIRD_PARTY_NOTICES.txt').write_text('three.js r170\n'+(ROOT/'viewer_deps/node_modules/three/LICENSE').read_text(encoding='utf8'),encoding='utf8')
print('OFFLINE_VIEWER',out/'index.html',(out/'index.html').stat().st_size)
