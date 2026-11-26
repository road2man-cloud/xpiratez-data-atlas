"""Headless browser captures; never launches an interactive browser window."""
from pathlib import Path
import json, time
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT=Path(__file__).resolve().parent
report={'engine':'three.js r170 in headless Microsoft Edge; NOT S2/S3','renders':[],'errors':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True,args=['--disable-gpu-sandbox','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1400,'height':980},device_scale_factor=1)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.goto((ROOT/'preview/index.html').as_uri(),wait_until='load',timeout=90000)
    page.wait_for_function('window.TEST_READY === true',timeout=90000)
    page.wait_for_timeout(1400)
    report['model']=page.evaluate('window.MODEL_REPORT')
    for preset in ('head','arm','full'):
        if preset=='arm':page.locator('#arm').fill('12');page.locator('#arm').dispatch_event('input')
        else:page.locator('#arm').fill('55');page.locator('#arm').dispatch_event('input')
        page.evaluate('(v)=>window.setView(v)',preset);page.wait_for_timeout(700)
        name=f'R36KU_COMPARE_{preset.upper()}.png';page.screenshot(path=str(ROOT/'preview'/name),full_page=True)
        report['renders'].append(name)
    page.select_option('#mode','albedo');page.evaluate("window.setView('head')");page.wait_for_timeout(700)
    page.screenshot(path=str(ROOT/'preview/R36KU_ALBEDO_PRESERVED.png'),full_page=True)
    page.select_option('#mode','pbr');page.select_option('#resolution','512');page.wait_for_timeout(700)
    page.screenshot(path=str(ROOT/'preview/R36KU_COMPARE_512.png'),full_page=True)
    report['errors']+=page.evaluate('window.VIEWER_ERRORS')
    report['offlineFileProtocol']=page.url.startswith('file:')
    browser.close()
(ROOT/'output/R36KU_BROWSER_REPORT.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
# Small visual QA proof, readable through remote image tools.
im=Image.open(ROOT/'preview/R36KU_COMPARE_HEAD.png');im.thumbnail((1120,784));im.convert('RGB').save(ROOT/'preview/HEAD_QA.jpg',quality=82)
print(json.dumps(report,indent=2))
