#!/usr/bin/env python3
"""Fetch immutable R36KU inputs; never use an unverified local working copy."""
from pathlib import Path
import concurrent.futures,hashlib,json,requests
ROOT=Path(__file__).resolve().parent
COMMIT='d2b576f59ddd9388ec4aff1180c1542d6451fb69'
BASE=f'https://raw.githubusercontent.com/road2man-cloud/xpiratez-data-atlas/{COMMIT}/experimental/xpz3d/f11/r36ku/'
FILES=['MANIFEST_R36KU.json','build_r36ku.py','source/glb_io_r36kj.py','source/compact_gltf.py',
 'source/output/R36KS_F11_MULTI_POSE_HIP_1024_2100TRI.glb','source/output/R36KS_F11_MULTI_POSE_HIP_512_2100TRI.glb',
 'output/R36KU_F11_BALANCED_DETAIL_1024_2100TRI.glb','output/R36KU_F11_BALANCED_DETAIL_512_2100TRI.glb']
def one(p):
    r=requests.get(BASE+p,timeout=40);r.raise_for_status()
    if p=='build_r36ku.py':dest=ROOT/'source'/p
    elif p.startswith('output/'):dest=ROOT/'input'/Path(p).name
    elif p=='MANIFEST_R36KU.json':dest=ROOT/'input'/p
    else:dest=ROOT/p
    dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(r.content)
    return {'sourcePath':p,'localPath':dest.relative_to(ROOT).as_posix(),'bytes':len(r.content),'sha256':hashlib.sha256(r.content).hexdigest()}
if __name__=='__main__':
    rows=list(concurrent.futures.ThreadPoolExecutor(4).map(one,FILES))
    (ROOT/'input'/'SOURCE_RECEIPT.json').write_text(json.dumps({'commit':COMMIT,'files':rows},indent=2)+'\n',encoding='utf8')
    print(json.dumps(rows,indent=2))
