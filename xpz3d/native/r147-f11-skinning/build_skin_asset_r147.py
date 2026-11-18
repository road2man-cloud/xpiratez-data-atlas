#!/usr/bin/env python3
"""Build original F11 63-joint weighted native S2 mesh asset (no source GLB edits).

R147 preserves indexed source positions and full float4 weights. It does not
claim to import glTF animation clips, morph targets, or texture shaders.
"""
from __future__ import annotations
import argparse,hashlib,json,math,struct
from pathlib import Path
from collections import Counter
from build_f11_native_mesh_r144 import read_glb,accessor_values,IDENTITY,compose_node

HEADER="<8sIIIII32s6f"    # 84 bytes
BONE="<hH3f4f16f"          # 96 bytes
VERTEX="<3f4B4f"           # 32 bytes
TRIPREFIX="<B3x"           # 4 bytes
assert struct.calcsize(HEADER)==84
assert struct.calcsize(BONE)==96
assert struct.calcsize(VERTEX)==32
MAX_TRIANGLES=20000

def mat4_accessor(gltf,blob,accessor_id):
    acc=gltf["accessors"][accessor_id]
    if acc.get("sparse") or acc["type"]!="MAT4" or acc["componentType"]!=5126:
        raise ValueError("Need packed float32 MAT4 IBM accessor")
    view=gltf["bufferViews"][acc["bufferView"]]
    stride=view.get("byteStride",64)
    start=view.get("byteOffset",0)+acc.get("byteOffset",0)
    stop=view.get("byteOffset",0)+view["byteLength"]
    if stride<64: raise ValueError("Bad IBM stride")
    out=[]
    for i in range(acc["count"]):
        o=start+i*stride
        if o+64>stop or o+64>len(blob):raise ValueError("IBM out of bounds")
        m=struct.unpack_from("<16f",blob,o)
        if not all(math.isfinite(x) for x in m):raise ValueError("Nonfinite IBM")
        out.append(m)
    return out

def convert(src,dst,manifest):
    gltf,blob,sha=read_glb(src)
    skins=gltf.get("skins",[])
    if len(skins)!=1:raise ValueError("Require exactly one GLB skin")
    skin=skins[0]
    joints=skin["joints"]
    if len(joints)!=63:raise ValueError("Require original F11 63 joints")
    nodes=gltf["nodes"]
    joint_index={node:j for j,node in enumerate(joints)}
    parent_map={}
    for p,node in enumerate(nodes):
        for child in node.get("children",[]):
            if child in parent_map:raise ValueError("Non-tree skeleton")
            parent_map[child]=p
    ibm=mat4_accessor(gltf,blob,skin["inverseBindMatrices"])
    if len(ibm)!=63:raise ValueError("IBM count mismatch")
    bones=[]
    for j,nodeid in enumerate(joints):
        node=nodes[nodeid]
        parent=parent_map.get(nodeid)
        while parent is not None and parent not in joint_index:
            ancestor=nodes[parent]
            if "matrix" in ancestor or any(abs(v-1)>1e-5 for v in ancestor.get("scale",[1,1,1])):
                raise ValueError("Nonjoint transforms unsupported")
            if any(abs(v)>1e-5 for v in ancestor.get("translation",[0,0,0])) or any(abs(v-b)>1e-5 for v,b in zip(ancestor.get("rotation",[0,0,0,1]),[0,0,0,1])):
                raise ValueError("Nonjoint skeleton transforms unsupported")
            parent=parent_map.get(parent)
        pi=joint_index.get(parent,-1)
        if pi>=j:raise ValueError("Joint order must put parent before child")
        if "matrix" in node:raise ValueError("R147 expects joint TRS (not matrix)")
        t=node.get("translation",[0,0,0])
        q=node.get("rotation",[0,0,0,1])
        scale=node.get("scale",[1,1,1])
        if any(abs(x-1)>1e-5 for x in scale):
            raise ValueError("Non-unit joint scale unsupported")
        if len(t)!=3 or len(q)!=4 or not all(math.isfinite(v) for v in t+q):
            raise ValueError("Nonfinite joint pose")
        bones.append(struct.pack(BONE,pi,0,*t,*q,*ibm[j]))
    minv=[float("inf")]*3
    maxv=[-float("inf")]*3
    triangles=[]
    counts=Counter()
    mesh_node_count=0
    for node in nodes:
        if "mesh" not in node:continue
        mesh_node_count+=1
        if node.get("skin")!=0:raise ValueError("Mesh is not bound to F11 skin")
        if any(abs(a-b)>1e-6 for a,b in zip(compose_node(node),IDENTITY)):
            raise ValueError("Animated mesh node is not identity; requires separate transform")
        for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
            if primitive.get("mode",4)!=4:continue
            attr=primitive["attributes"]
            if not all(x in attr for x in ("POSITION","JOINTS_0","WEIGHTS_0")):
                raise ValueError("Skinned primitive lacks POSITION/JOINTS_0/WEIGHTS_0")
            verts=accessor_values(gltf,blob,attr["POSITION"])
            weights=accessor_values(gltf,blob,attr["WEIGHTS_0"])
            boneids=accessor_values(gltf,blob,attr["JOINTS_0"])
            if not len(verts)==len(weights)==len(boneids):
                raise ValueError("GLB attribute count mismatch")
            if "indices" in primitive:
                indices=[row[0] for row in accessor_values(gltf,blob,primitive["indices"])]
            else:indices=list(range(len(verts)))
            if len(indices)%3:raise ValueError("Invalid triangle indices")
            material=int(primitive.get("material",0))
            if not 0<=material<8:raise ValueError("More than 8 material groups")
            for tri in range(0,len(indices),3):
                chunk=[struct.pack(TRIPREFIX,material)]
                for k in range(3):
                    vi=indices[tri+k]
                    p=verts[vi]
                    js=boneids[vi]
                    ws=weights[vi]
                    total=sum(float(a) for a in ws)
                    if not 0.85<=total<=1.15:raise ValueError("Unnormalized joint weights")
                    if any(not math.isfinite(v) or abs(v)>1000 for v in p):
                        raise ValueError("Invalid F11 vertex position")
                    if any(int(b)<0 or int(b)>=63 for b in js):
                        raise ValueError("Out-of-bounds GLB joint")
                    for j in range(3):
                        minv[j]=min(minv[j],p[j]);maxv[j]=max(maxv[j],p[j])
                    chunk.append(struct.pack(VERTEX,*p,*map(int,js),*(float(w)/total for w in ws)))
                triangles.append(b"".join(chunk))
                counts[material]+=1
    if mesh_node_count!=1 or not 0<len(triangles)<=MAX_TRIANGLES:
        raise ValueError("Unexpected F11 source scene")
    if maxv[2]-minv[2]<0.3:raise ValueError("F11 mesh not Z-up")
    dst.parent.mkdir(parents=True,exist_ok=True)
    hdr=struct.pack(HEADER,b"XPZF11S2",2,struct.calcsize(HEADER),len(triangles),max(counts)+1,63,bytes.fromhex(sha),*minv,*maxv)
    dst.write_bytes(hdr+b"".join(bones)+b"".join(triangles))
    expected=len(hdr)+63*struct.calcsize(BONE)+len(triangles)*(4+3*struct.calcsize(VERTEX))
    if dst.stat().st_size!=expected:raise AssertionError("R147 wrong asset length")
    result={
      "schema":"xpz3d.r147.f11.63bone_weighted_native_mesh/v1",
      "source_glb":str(src),"source_sha256":sha,
      "native_skin":str(dst),"native_skin_sha256":hashlib.sha256(dst.read_bytes()).hexdigest(),
      "native_size":expected,"bone_count":63,
      "triangle_count":len(triangles),"material_triangles":dict(counts),
      "vertex_weights":"original glTF float32 WEIGHTS_0, renormalized; 4 influences",
      "inverse_bind_matrices":"original glTF MAT4 inverseBindMatrices",
      "motion":"procedural bend/walk on glTF joints using game-driven position/kneel; no authored animations",
      "geometry_decimated":False,"glb_source_modified":False
    }
    manifest.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf8")
    print("R147_SKIN_ASSET",dst,expected,sha,len(triangles),flush=True)

if __name__=="__main__":
    a=argparse.ArgumentParser()
    a.add_argument("source_glb",type=Path)
    a.add_argument("target_skin",type=Path)
    a.add_argument("target_manifest",type=Path)
    n=a.parse_args()
    convert(n.source_glb,n.target_skin,n.target_manifest)
