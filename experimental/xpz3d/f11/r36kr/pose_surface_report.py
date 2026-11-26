#!/usr/bin/env python3
"""Quantify rest and synthetic thigh-spread seam distances; NOT game-engine testing."""
import argparse,json
from pathlib import Path
import numpy as np
import trimesh
from glb_io_r36kj import glb_open,a_read
from render_r36kj import skin

p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--root',type=Path,default=Path(__file__).parent);opts=p.parse_args()
root=opts.root
source=root/'source' if (root/'source'/'R36KQ_F11_HIP_TRANSITION_1024_2100TRI.glb').exists() else root.parent/'r36kq'
runs=[]
for size in (1024,512):
  report=json.loads((root/'output'/f'R36KR_{size}_BUILD_REPORT.json').read_text())
  indices={x['primitive']:x['anchorIndices'] for x in report['changes']}
  for version,model in [('R36KQ',source/f'R36KQ_F11_HIP_TRANSITION_{size}_2100TRI.glb'),('R36KR',root/'output'/f'R36KR_F11_POSE_AWARE_HIP_{size}_2100TRI.glb')]:
    _,g,B=glb_open(model);prim=g['meshes'][0]['primitives']
    def skinpoints(pi,angle):
      a=prim[pi]['attributes'];P=a_read(g,B,a['POSITION']).astype('float32');J=a_read(g,B,a['JOINTS_0']).astype(int);W=a_read(g,B,a['WEIGHTS_0']).astype('float32')
      mat=skin(g,B,degrees=0,spread=angle)
      hv=np.column_stack((P,np.ones((len(P),),dtype='float32')))
      out=np.zeros_like(P)
      for k in range(4):
        out+=np.einsum('nij,nj->ni',mat[J[:,k],:3,:],hv)*W[:,k,None]
      return out
    faces=a_read(g,B,prim[7]['indices']).reshape(-1,3).astype(int)
    torso_static=a_read(g,B,prim[7]['attributes']['POSITION'])
    zf=np.all((torso_static[faces][:,:,2]>.85)&(torso_static[faces][:,:,2]<1.04),axis=1)
    for angle in (-32,-24,-16,-8,0,8,16,24,32):
      torso=skinpoints(7,angle)
      for pi,side in ((10,-1),(11,1)):
        leg=skinpoints(pi,angle)
        cand=faces[zf&(torso_static[faces][:,:,0].mean(axis=1)*side>.052)]
        tri=torso[cand]
        distances=[]
        for i in indices[pi]:
          q=leg[i]
          projected=trimesh.triangles.closest_point(tri,np.broadcast_to(q,(len(tri),3)).copy())
          distances.append(float(np.linalg.norm(projected-q,axis=1).min()))
        runs.append({'version':version,'size':size,'spreadDegrees':angle,'primitive':pi,'n':len(distances),
                     'meanGap':float(np.mean(distances)),'maxGap':float(np.max(distances))})
opts.output.write_text(json.dumps({'note':'Synthetic LBS thigh rotations; not S2/S3 engine capture','runs':runs},indent=2)+'\n')
for size in (1024,):
 for angle in (-32,-24,-16,-8,0,8,16,24,32):
  print('ANGLE',angle)
  for side in (10,11):
   line=[r for r in runs if r['size']==size and r['spreadDegrees']==angle and r['primitive']==side]
   print(side,'KQ',round(line[0]['meanGap'],6),'KR',round(line[1]['meanGap'],6),'delta',round(line[1]['meanGap']-line[0]['meanGap'],6))
