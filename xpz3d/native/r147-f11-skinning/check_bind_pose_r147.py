"""Tiny read-only sanity check: all R147 glTF inverse-bind transforms
must reconstruct the original source positions in the neutral pose."""
import sys,struct,math
from pathlib import Path
from build_f11_native_mesh_r144 import mul,compose_node,apply,IDENTITY
BONE="<hH3f4f16f"
TRI="<B3x"
VERT="<3f4B4f"
def run(path):
 data=Path(path).read_bytes()
 head=struct.unpack_from("<8sIIIII32s6f",data)
 assert head[0]==b"XPZF11S2" and head[5]==63
 bones=[];offset=84
 for i in range(63):
  tup=struct.unpack_from(BONE,data,offset);offset+=96
  par=tup[0];t=tup[2:5];q=tup[5:9];inv=tup[9:25]
  local=compose_node({"translation":t,"rotation":q})
  world=mul(bones[par][0],local) if par>=0 else local
  bones.append((world,inv))
 skin=[mul(world,inv) for world,inv in bones]
 checks=0;err=0
 for tri in range(head[3]):
  offset+=4
  for v in range(3):
   arr=struct.unpack_from(VERT,data,offset);offset+=32
   xyz=arr[0:3];joints=arr[3:7];weights=arr[7:11]
   if (tri+v)%59!=0:continue
   out=[0.,0.,0.]
   for j,k in enumerate(joints):
    pt=apply(skin[k],xyz)
    for c in range(3):out[c]+=pt[c]*weights[j]
   err=max(err,max(abs(out[c]-xyz[c]) for c in range(3)))
   checks+=1
 print("R147_BIND_POSE_RECONSTRUCTION",path,"samples",checks,"max_abs_error",err)
 assert err<0.0001, "Skinning rest pose differs from source GLB"
if __name__=="__main__":
 for p in sys.argv[1:]:run(p)
