#!/usr/bin/env python3
"""Capture actual GLB renders locally with headless Edge; no game-engine claims."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent;OUT=ROOT/'preview';errors=[];measures=[]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True,args=['--allow-file-access-from-files'])
    page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto((OUT/'index.html').as_uri(),wait_until='load')
    page.wait_for_function('window.TEST_READY === true',timeout=90000)
    for preset in ('head','arm','full'):
        page.select_option('#preset',preset);page.wait_for_timeout(350)
        page.screenshot(path=str(OUT/f'R36KV_COMPARE_{preset.upper()}.png'),full_page=True)
        measures.append({'preset':preset,'resolution':1024,'mode':'pbr',**page.evaluate('window.measurePixels()')})
    page.select_option('#preset','head');page.select_option('#mode','albedo');page.wait_for_timeout(300)
    page.screenshot(path=str(OUT/'R36KV_ALBEDO_COMPARE.png'),full_page=True)
    albedo=page.evaluate('window.measurePixels()');measures.append({'preset':'head','resolution':1024,'mode':'albedo',**albedo})
    if albedo['maxChannelDifference']>1:raise AssertionError(f'Unexpected albedo regression: {albedo}')
    page.select_option('#mode','pbr');page.select_option('#resolution','512');page.wait_for_timeout(300)
    page.screenshot(path=str(OUT/'R36KV_COMPARE_512.png'),full_page=True)
    measures.append({'preset':'head','resolution':512,'mode':'pbr',**page.evaluate('window.measurePixels()')})
    page.select_option('#resolution','1024');page.select_option('#preset','full')
    page.locator('#arm').evaluate("e=>{e.value=70;e.dispatchEvent(new Event('input',{bubbles:true}));}");page.locator('#leg').evaluate("e=>{e.value=32;e.dispatchEvent(new Event('input',{bubbles:true}));}");page.wait_for_timeout(300)
    page.screenshot(path=str(OUT/'R36KV_POSE_70_32.png'),full_page=True)
    report={'renderer':'three.js r170 / headless Microsoft Edge / file://; NOT S2/S3','models':page.evaluate('window.MODEL_REPORT'),'jsErrors':errors+page.evaluate('window.VIEWER_ERRORS'),'pixelComparisons':measures,'actualGameEngineRun':False}
    browser.close()
    if report['jsErrors']:raise AssertionError(report['jsErrors'])
    (OUT/'RENDER_REPORT.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps(report,indent=2))
