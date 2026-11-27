"""Capture actual GLBs in offline Edge/three.js, not in the S2/S3 game engine."""
from pathlib import Path
import io,json,base64
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent;OUT=ROOT/'preview'

def settle(page):
 page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))')
 page.wait_for_timeout(250)

def pixels(page,pane):
 # Read the WebGL canvas itself, excluding overlaid HTML labels and controls.
 encoded=page.locator('#'+pane+' canvas').evaluate("c => c.toDataURL('image/png').split(',')[1]")
 data=base64.b64decode(encoded)
 return np.asarray(Image.open(io.BytesIO(data)).convert('RGB'),dtype=np.int16)

def main():
 report={'renderer':'three.js r170 / headless Microsoft Edge / file://; NOT S2/S3','captures':[],'actualGameEngineRun':False}
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True,args=['--allow-file-access-from-files'])
  page=browser.new_page(viewport={'width':1442,'height':970},device_scale_factor=1);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto((OUT/'index.html').as_uri(),wait_until='load');page.wait_for_function('window.TEST_READY === true',timeout=60000);settle(page)
  report['models']=page.evaluate('window.MODEL_REPORT')
  for size in (1024,512):
   page.select_option('#resolution',str(size))
   for preset in ('head','feet','legs','full','back'):
    page.select_option('#preset',preset);page.select_option('#mode','pbr');settle(page)
    left=pixels(page,'before');right=pixels(page,'after');delta=np.abs(left-right)
    name=f'R36KW_{size}_{preset.upper()}_PBR.png';page.screenshot(path=str(OUT/name),full_page=True)
    row={'preset':preset,'resolution':size,'mode':'pbr','file':name,'meanAbsoluteRGB':float(delta.mean()),'maxChannelDifference':int(delta.max()),'differentPixels':int(np.any(delta!=0,axis=2).sum()),'totalPixels':int(delta.shape[0]*delta.shape[1])};report['captures'].append(row)
    if size==1024 and preset in ('head','feet','full'):
     page.select_option('#mode','albedo');settle(page);left=pixels(page,'before');right=pixels(page,'after');delta=np.abs(left-right)
     name=f'R36KW_{size}_{preset.upper()}_ALBEDO.png';page.screenshot(path=str(OUT/name),full_page=True)
     report['captures'].append({'preset':preset,'resolution':size,'mode':'albedo','file':name,'meanAbsoluteRGB':float(delta.mean()),'maxChannelDifference':int(delta.max()),'differentPixels':int(np.any(delta!=0,axis=2).sum()),'totalPixels':int(delta.shape[0]*delta.shape[1])})
  page.select_option('#resolution','1024');page.select_option('#mode','pbr');page.select_option('#preset','full')
  page.locator('#arm').fill('70');page.locator('#arm').dispatch_event('input');page.locator('#leg').fill('32');page.locator('#leg').dispatch_event('input');settle(page)
  page.screenshot(path=str(OUT/'R36KW_POSE_70_32.png'),full_page=True)
  report['jsErrors']=errors+page.evaluate('window.VIEWER_ERRORS');browser.close()
 (OUT/'RENDER_REPORT.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
 # A small face comparison for visual QA transfer; not a generated or edited portrait.
 im=Image.open(OUT/'R36KW_1024_HEAD_PBR.png');im.crop((0,215,1442,795)).resize((721,290)).save(OUT/'QA_HEAD.jpg',quality=82)
 print(json.dumps(report,indent=2))
 if report['jsErrors']:raise RuntimeError('Browser errors')
if __name__=='__main__':main()
