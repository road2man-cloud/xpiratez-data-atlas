#!/usr/bin/env python3
"""Bake genuine high-poly surface detail into R36KS (Blender 4.x background script).

Usage:
 blender -b -t 4 --python bake_r36kt.py -- --low R36KS_1024.glb --high F11_6000.glb --out R36KT_1024.glb --pairs pairs.json --resolution 1024

pairs.json lists explicit object names, e.g. [{"low":"Body","high":"Body_high"}].
No high-resolution source => no manufactured details and no output.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
    return h.hexdigest()

def parse_args():
    a=argparse.ArgumentParser()
    for flag in ('low','high','out','pairs'):a.add_argument('--'+flag,required=True)
    a.add_argument('--resolution',type=int,default=1024)
    a.add_argument('--ray-distance',type=float,default=0.012)
    a.add_argument('--margin',type=int,default=8)
    return a.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])

def tris(objects):
    return sum(sum(max(0,len(p.vertices)-2) for p in o.data.polygons) for o in objects)

def main():
    args=parse_args()
    import bpy
    for path in (args.low,args.high,args.pairs):
        if not Path(path).is_file():raise FileNotFoundError(path)
    pairs=json.loads(Path(args.pairs).read_text(encoding='utf8'))
    if not isinstance(pairs,list) or not pairs:raise ValueError('Explicit non-empty object mapping required')
    if args.resolution not in (512,1024,2048,4096):raise ValueError('Invalid resolution')
    if not (0 < args.ray_distance <= 0.05):raise ValueError('Invalid ray distance')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.low).resolve()))
    low_all={o.as_pointer() for o in bpy.data.objects}
    low_objects={o.name:o for o in bpy.data.objects if o.type=='MESH'}
    low_names=set(low_objects)
    before_tri=tris(low_objects.values())
    low_material_names={m.name for o in low_objects.values() for m in o.data.materials if m}
    # Rename the imported high-detail scene to make the two namespaces unambiguous.
    bpy.ops.import_scene.gltf(filepath=str(Path(args.high).resolve()))
    # Newly imported GLTF objects may be auto suffixed, and names can collide.
    high_all=[o for o in bpy.data.objects if o.as_pointer() not in low_all]
    high_candidates=[o for o in high_all if o.type=='MESH']
    high_objects={o.name:o for o in high_candidates}
    used_low=set(); used_high=set(); baked=[]
    bpy.context.scene.render.engine='CYCLES'
    bpy.context.scene.cycles.samples=16
    bpy.context.scene.render.bake.use_selected_to_active=True
    bpy.context.scene.render.bake.use_pass_color=False
    bpy.context.scene.render.bake.normal_space='TANGENT'
    bpy.context.scene.render.bake.max_ray_distance=args.ray_distance
    bpy.context.scene.render.bake.margin=args.margin
    # Image nodes on copied materials keep original R36KS material data untouched
    # on disk. Only output copy has extra NORMAL texture linkage.
    for n,entry in enumerate(pairs):
        ln=entry['low']; hn=entry['high']
        if ln in used_low or hn in used_high:raise ValueError('Duplicate mapping')
        used_low.add(ln);used_high.add(hn)
        if ln not in low_objects or hn not in high_objects:
            raise ValueError(f'Bad pair {ln!r} -> {hn!r}; low={sorted(low_objects)} high={sorted(high_objects)}')
        lo=low_objects[ln];hi=high_objects[hn]
        if not lo.data.uv_layers:raise ValueError(f'Missing UVs: {ln}')
        if not lo.data.materials:raise ValueError(f'Missing materials: {ln}')
        # Explicitly require matching coordinate spaces to prevent meaningless baking.
        from mathutils import Vector
        low_center=lo.matrix_world @ Vector((0,0,0))
        high_center=hi.matrix_world @ Vector((0,0,0))
        if (low_center-high_center).length > 0.05:
            raise ValueError(f'Object origins differ by >.05: {ln}/{hn}')
        image=bpy.data.images.new(f'R36KT_{n:02d}_TangentNormal',width=args.resolution,height=args.resolution,
                                  alpha=False,float_buffer=False)
        image.colorspace_settings.name='Non-Color'
        image.generated_color=(0.5,0.5,1.0,1.0)
        for slot,original in enumerate(list(lo.data.materials)):
            if not original:raise ValueError(f'Empty material slot on {ln}')
            mat=original.copy()
            mat.use_nodes=True
            lo.data.materials[slot]=mat
            tree=mat.node_tree
            node=tree.nodes.new('ShaderNodeTexImage')
            node.name='R36KT_BAKE_TARGET'
            node.image=image
            tree.nodes.active=node
            normal=tree.nodes.new('ShaderNodeNormalMap')
            normal.name='R36KT_BAKED_NORMAL'
            normal.space='TANGENT'
            tree.links.new(node.outputs['Color'],normal.inputs['Color'])
            shader=next((x for x in tree.nodes if x.type=='BSDF_PRINCIPLED'),None)
            if shader is None:raise ValueError(f'No Principled shader on {ln}')
            # Preserve any pre-existing normal source only when source is absent.
            # Otherwise fail: blindly replacing authored normals destroys shading.
            if shader.inputs['Normal'].is_linked:
                raise ValueError(f'Existing normal node on {ln}; manual normal blending required')
            tree.links.new(normal.outputs['Normal'],shader.inputs['Normal'])
        bpy.ops.object.select_all(action='DESELECT')
        lo.select_set(True);hi.select_set(True)
        bpy.context.view_layer.objects.active=lo
        bpy.ops.object.bake(type='NORMAL')
        image.file_format='PNG'
        image.filepath_raw=str(Path(args.out).with_suffix(''))+f'_normal_{n:02d}.png'
        image.save()
        image.pack()
        baked.append({'low':ln,'high':hn,'normalPng':image.filepath_raw,'pixels':args.resolution})
    # Export only the low-poly hierarchy, including skin and animations, not the hi mesh.
    for o in high_all:bpy.data.objects.remove(o,do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(Path(args.out).resolve()),export_format='GLB',
                              use_selection=False,export_normals=True,export_tangents=True,
                              export_image_format='AUTO')
    out_meshes=[o for o in bpy.data.objects if o.type=='MESH']
    if tris(out_meshes)!=before_tri:raise AssertionError('Triangle budget changed during bake')
    report={'version':'R36KT','sourceLow':str(args.low),'lowSha256':sha(args.low),
            'sourceHigh':str(args.high),'highSha256':sha(args.high),
            'output':str(args.out),'outputSha256':sha(args.out),
            'trianglesBefore':before_tri,'trianglesAfter':tris(out_meshes),
            'baked':baked,'originalLowMaterialNames':sorted(low_material_names),
            'engineApplied':False,'limitations':'Blender bake; game shader/pose validation not performed'}
    Path(args.out).with_suffix('.bake.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
