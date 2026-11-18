"""Inspect actual F11 GLB bone topology and skin weights (read-only)."""
from pathlib import Path
import json,sys
sys.path.insert(0,str(Path(r"D:\daphne_auto\XPZ_R144_F11_ACTOR_MESH_20261119")))
from build_f11_native_mesh_r144 import read_glb,accessor_values
for filename in sys.argv[1:]:
 gltf,buf,sha=read_glb(Path(filename))
 skin=gltf["skins"][0]
 bones=[gltf["nodes"][n].get("name","?") for n in skin["joints"]]
 ibms=gltf["accessors"][skin["inverseBindMatrices"]]["count"] if "inverseBindMatrices" in skin else 0
 print("GLB",sha,"BONES",len(bones),"ibm",ibms)
 for j,name in enumerate(bones):
  nd=gltf["nodes"][skin["joints"][j]]
  print(j,name,"translation",nd.get("translation"),"rotation",nd.get("rotation"))
 acc={};tot=0
 for mesh in gltf["meshes"]:
  for prim in mesh["primitives"]:
   if "JOINTS_0" not in prim["attributes"]:continue
   js=accessor_values(gltf,buf,prim["attributes"]["JOINTS_0"])
   ws=accessor_values(gltf,buf,prim["attributes"]["WEIGHTS_0"])
   tot+=len(js)
   for joints,weights in zip(js,ws):
    for b,weight in zip(joints,weights):
     if float(weight)>0.01:acc[int(b)]=acc.get(int(b),0)+1
 print("weighted vertices",tot,"bone influence counts",json.dumps(acc,sort_keys=True))
