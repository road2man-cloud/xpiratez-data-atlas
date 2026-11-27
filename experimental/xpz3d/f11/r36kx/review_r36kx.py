"""Capture actual four-GLB output in Edge; compare canvas pixels, not HTML labels."""
from pathlib import Path
import base64,io,json
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent;OUT=ROOT/'preview'
def settle(p):
    p.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))');p.wait_for_timeout(180)
def canvas(p,id):
    encoded=p.locator('#'+id+' canvas').evaluate("c => c.toDataURL('image/png').split(',')[1]")
    return Image.open(io.BytesIO(base64.b64decode(encoded))).convert('RGB')
def compare(p):
    a=np.asarray(canvas(p,'before'),dtype=np.int16);b=np.asarray(canvas(p,'after'),dtype=np.int16);d=np.abs(a-b)
    return {'meanAbsoluteRGB':float(d.mean()),'maxChannelDifference':int(d.max()),'pixelsDifferent':int(np.any(d,axis=-1).sum()),'totalPixels':int(d.shape[0]*d.shape[1])}
def main():
    report={'renderer':'three.js r170 / headless Edge / WebGL2 / file://','actualGameEngineRun':False,'captures':[]}
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True,args=['--allow-file-access-from-files'])
        page=browser.new_page(viewport={'width':1442,'height':1000},device_scale_factor=1);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto((OUT/'index.html').as_uri(),wait_until='load');page.wait_for_function('window.TEST_READY === true',timeout=60000);settle(page)
        report['models']=page.evaluate('window.MODEL_REPORT')
        for size in (1024,512):
            page.select_option('#resolution',str(size))
            for preset in ('head','feet','full','back','far'):
                for filt in (('mip','base') if preset in ('feet','far') else ('mip',)):
                    page.select_option('#preset',preset);page.select_option('#mode','pbr');page.select_option('#sampling',filt);settle(page)
                    name=f'R36KX_{size}_{preset.upper()}_{filt.upper()}.png';page.screenshot(path=str(OUT/name),full_page=True)
                    report['captures'].append({'resolution':size,'preset':preset,'mode':'pbr','sampling':filt,'file':name,**compare(page)})
                    if size==1024 and preset=='head':
                        left=canvas(page,'before');right=canvas(page,'after');pair=Image.new('RGB',(left.width*2,left.height));pair.paste(left);pair.paste(right,(left.width,0));pair.resize((600,242)).save(OUT/'QA_HEAD.jpg',quality=70)
            page.select_option('#sampling','mip');page.select_option('#mode','albedo');page.select_option('#preset','full');settle(page)
            albedo=compare(page);assert albedo['maxChannelDifference']==0,('Color changed',size,albedo)
            name=f'R36KX_{size}_ALBEDO.png';page.screenshot(path=str(OUT/name),full_page=True)
            report['captures'].append({'resolution':size,'preset':'full','mode':'albedo','sampling':'mip','file':name,**albedo})
        page.select_option('#resolution','1024');page.select_option('#mode','pbr');page.select_option('#preset','full')
        page.locator('#arm').fill('70');page.locator('#arm').dispatch_event('input');page.locator('#leg').fill('32');page.locator('#leg').dispatch_event('input');settle(page)
        page.screenshot(path=str(OUT/'R36KX_POSE_70_32.png'),full_page=True)
        report['jsErrors']=errors+page.evaluate('window.VIEWER_ERRORS')
        # Exercise the offline download button and prove it exports the actual production GLB.
        with page.expect_download() as event:page.click('#export')
        exported=event.value;temp=exported.path()
        assert Path(temp).read_bytes()==(ROOT/'output/R36KX_F11_COMPACT_NORMAL_1024_2100TRI.glb').read_bytes()
        report['offlineGLBExportMatchesProduction']=True
        browser.close()
    (OUT/'RENDER_REPORT.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report,indent=2))
    if report['jsErrors']:raise RuntimeError('Browser errors')
if __name__=='__main__':main()
