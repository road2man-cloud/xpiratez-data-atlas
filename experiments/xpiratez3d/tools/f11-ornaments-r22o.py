#!/usr/bin/env python3
"""R22-O F11 collaborator patch: skin-safe skull, lacing, and hairpin on native S2 UVs.

Separate additive art pass. Does not edit the main F11 author, body/face mesh,
game installation, or another worker's tree. No vertices or triangles added.
Read existing verified F11 native 63-bone candidate and produce new, immutable
private test assets.

Usage:
    python experiments/xpiratez3d/tools/f11-ornaments-r22o.py
    python .../f11-ornaments-r22o.py --source D:\...\stage32i-art-r21e-native-f11 \
                                     --out D:\...\stage32i-art-r22o-native-f11
"""

import argparse
import copy
import hashlib
import importlib.util
import io
import json
import math
import os
import struct
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102")
SOURCE_ART = Path(
    r"C:\Dioxine_XPiratez_o2.1\Dioxine_XPiratez\user\mods\Piratez\Resources\Armors\Gals"
)
NATIVE_AUTHOR = Path(
    r"D:\daphne_auto\xpiratez-data-atlas\experiments\xpiratez3d\stage32i\author-native-f11-r20.py"
)
SAVE_SHA = "9cae906d79ad9f509412dc19804afd3e80ae7e566e19de5699d9747af0e98f55"
ART_SOURCE_SHA = {
    "Adventurer/Ganger_Outfit_Top.gif":
        "a625a4223409b1d738405a90ebcfbd8a4dfe207f02fdce071936b505a2913828",
    "Adventurer/Adventurer_Outfit_Main.gif":
        "ebc3bb53c04677d12994aabd0abcac90fb7c33759f8b464c41541d1396f9b7ab",
    "Heads/Head_F11_pir.gif":
        "f263fe17f97b062dcf3be55669f7891d6f858a091f73b363bae3eb71ca2d7b92",
}


def ensure(test, message):
    if not test:
        raise ValueError("F11_R22O_COLLABORATOR_REJECT: " + message)


def sha(payload):
    return hashlib.sha256(payload).hexdigest()


def module_from_file(path):
    spec = importlib.util.spec_from_file_location("f11_native_r20_for_r22o", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def nearest_front_surface(parts, part_name, width=1024, height=1024):
    """Original UV triangles -> texel physical X,Y,Z; closest front face wins.

    No assumptions about where the texture islands are in 2D: each texel's
    position is barycentrically interpolated from the *existing* native mesh.
    """
    xx = np.full((height, width), np.nan, np.float32)
    yy = np.full((height, width), np.inf, np.float32)
    zz = np.full((height, width), np.nan, np.float32)
    valid = np.zeros((height, width), bool)
    triangles = 0
    for part in parts:
        if not part_name(part):
            continue
        vertices = np.asarray(part["positions"], np.float64)
        coords = np.asarray(part["uv"], np.float64) * 1024.0
        for tri in np.asarray(part["indices"], np.int32):
            triangles += 1
            points = coords[tri]
            low_x = max(0, int(math.floor(points[:, 0].min())) - 1)
            high_x = min(width - 1, int(math.ceil(points[:, 0].max())) + 1)
            low_y = max(0, int(math.floor(points[:, 1].min())) - 1)
            high_y = min(height - 1, int(math.ceil(points[:, 1].max())) + 1)
            if low_x > high_x or low_y > high_y:
                continue
            a, b, c = points
            den = ((b[1] - c[1]) * (a[0] - c[0]) +
                   (c[0] - b[0]) * (a[1] - c[1]))
            if abs(den) < 1e-8:
                continue
            yi, xi = np.mgrid[low_y:high_y+1, low_x:high_x+1]
            x = xi + .5
            y = yi + .5
            wa = ((b[1] - c[1]) * (x - c[0]) +
                  (c[0] - b[0]) * (y - c[1])) / den
            wb = ((c[1] - a[1]) * (x - c[0]) +
                  (a[0] - c[0]) * (y - c[1])) / den
            wc = 1.0 - wa - wb
            inside = ((np.minimum(np.minimum(wa, wb), wc) >= -1e-5) &
                      (np.maximum(np.maximum(wa, wb), wc) <= 1.00001))
            if not np.any(inside):
                continue
            world = (wa[:, :, None] * vertices[tri[0]] +
                     wb[:, :, None] * vertices[tri[1]] +
                     wc[:, :, None] * vertices[tri[2]])
            front = (inside &
                     (world[:, :, 1] < yy[low_y:high_y+1, low_x:high_x+1]))
            if not np.any(front):
                continue
            xx[low_y:high_y+1, low_x:high_x+1][front] = world[:, :, 0][front]
            yy[low_y:high_y+1, low_x:high_x+1][front] = world[:, :, 1][front]
            zz[low_y:high_y+1, low_x:high_x+1][front] = world[:, :, 2][front]
            valid[low_y:high_y+1, low_x:high_x+1][front] = True
    ensure(triangles > 200, "Original donor triangulation missing")
    return xx, yy, zz, valid, triangles


def smooth(a, b, t):
    x = np.clip((t-a)/(b-a), 0, 1)
    return x*x*(3-2*x)


def line_distance(x, z, ax, az, bx, bz):
    dx = bx-ax
    dz = bz-az
    t = np.clip(((x-ax)*dx + (z-az)*dz) /
                (dx*dx+dz*dz), 0, 1)
    return np.hypot(x-(ax+t*dx), z-(az+t*dz)), t


def blend(arr, mask, color, alpha):
    a = np.asarray(alpha, np.float32)
    if a.ndim == 0:
        a = np.full(mask.shape, float(a), dtype=np.float32)
    a = np.clip(a, 0, 1)*mask
    arr[:, :, :3] = (arr[:, :, :3]*(1-a[:, :, None]) +
                     np.asarray(color, np.float32)[None, None, :]*a[:, :, None])
    return int(np.count_nonzero(a > .30))


def add_metal_ornaments(atlas, pos, original):
    x, y, z, valid, ntri = pos
    px = atlas.astype(np.float32).copy()
    # Target only the front of the native S2 cropped Adventurer top, not bare
    # skin / neck / SMG; all detail follows the correct 3D surface in UV space.
    front = (valid & (y < -.042) & (np.abs(x) < .215) &
             (z >= 1.317) & (z < 1.535))
    # r22-P: guard against decals on the bronze neck and exposed chest.
    # The native grey cropped top is near-neutral; F11 skin has R >> B.
    channels = original[:, :, :3].astype(np.int16)
    lightcloth = ((channels[:, :, 0] > 77) &
                  (channels[:, :, 1] > 73) &
                  (channels[:, :, 2] > 75) &
                  (np.abs(channels[:, :, 0] - channels[:, :, 1]) < 28) &
                  (np.abs(channels[:, :, 1] - channels[:, :, 2]) < 31))
    garment = front & lightcloth

    counts = {}
    # Dark, narrow diagonal brown leather strap: shoulder -> midriff.
    d, t = line_distance(x, z, -.173, 1.532, .177, 1.306)
    ribbon = (d < .0085) & (t >= .012) & (t <= .985) & garment
    counts["leather_strap"] = blend(px, ribbon, [48, 38, 36], .88)
    # Metallic stitched raised rim, two narrow parallel glints.
    trim = ribbon & (d >= .0055) & (d < .0080)
    counts["strap_edge"] = blend(px, trim, [165, 157, 142], .90)
    seam = ribbon & (np.sin(t*94) > .84) & (d < .0039)
    counts["strap_stitches"] = blend(px, seam, [182, 159, 121], .83)

    # Long shoelace-like lacing across the other breastplate. Repeated
    # alternating diagonal segments and eyelets, grounded in the F11 crop top.
    laces = np.zeros_like(front)
    eyelets = np.zeros_like(front)
    for k in range(4):
        mid = 1.388 + k*.028
        # Each segment crosses X, so it reads like garment ties, not plain line.
        diagonal, _ = line_distance(x, z, -.113, mid-.010, -.025, mid+.010)
        opposite, _ = line_distance(x, z, -.113, mid+.010, -.025, mid-.010)
        laces |= ((diagonal < .0027) | (opposite < .0027)) & (np.abs(z-mid) < .012)
        eyelets |= (np.hypot(x+.114, z-mid) < .0048)
        eyelets |= (np.hypot(x+.025, z-mid) < .0048)
    counts["lacing"] = blend(px, laces & garment, [71, 64, 65], .88)
    counts["lace_eyelets"] = blend(px, eyelets & garment, [197, 188, 165], .95)

    # One small silver skull clasp at the center of the strap intersection.
    # Baked into the original native UVs: no billboard, new triangles or bones.
    sx, sz = .076, 1.431
    u = (x-sx)/.027
    v = (z-sz)/.032
    # Real S2 texture resolution cannot preserve a hairline border: the
    # black oval behind the silver skull is deliberately >=2 texels thick.
    head = ((u*u/.71**2 + ((v-.22)/.67)**2) < 1)
    jaw = (np.abs(u) < .50) & (v > -.82) & (v < -.28)
    skull = (head | jaw) & garment
    shadow = (((u/1.25)**2 + ((v+.08)/1.17)**2) < 1) & garment
    counts["skull_backplate"] = blend(px, shadow, [34, 33, 39], .99)
    counts["skull_silver"] = blend(px, skull, [211, 205, 189], .97)
    shade = skull & (u > .35)
    counts["skull_shading"] = blend(px, shade, [121, 121, 128], .58)
    lefteye = ((u+.38)**2/.21**2 + (v-.20)**2/.19**2 < 1)
    righteye = ((u-.36)**2/.21**2 + (v-.20)**2/.19**2 < 1)
    nose = ((np.abs(u) < .13) & (v < -.02) & (v > -.35))
    counts["skull_eye_nose"] = blend(px, (lefteye | righteye | nose) & skull,
                                   [39, 36, 39], 1)
    teeth = np.zeros_like(skull)
    for tooth in [-.40, -.12, .15, .42]:
        teeth |= (np.abs(u-tooth) < .029) & (v < -.55) & (v > -.85)
    counts["skull_teeth"] = blend(px, teeth & skull, [68, 63, 65], .93)
    # Emblem needs to be visible but not dominate the chest silhouette.
    ensure(counts["skull_silver"] >= 5 and counts["lacing"] >= 10,
           "Not enough source S2 texels for skull and lacing: "+str(counts))
    return np.uint8(np.clip(np.rint(px), 0, 255)), counts, ntri


def add_gold_hairpin(atlas, pos):
    x, y, z, valid, ntri = pos
    px = atlas.astype(np.float32).copy()
    # Small two-bar source F11 yellow pin, just above outer brow on one side.
    # Correct on native face-adjacent hair UV island; never paint the S2 eye.
    hair = valid & (y < -.030) & (x > .048) & (x < .137) & (z > 1.701) & (z < 1.844)
    d1, t1 = line_distance(x, z, .063, 1.777, .116, 1.811)
    d2, t2 = line_distance(x, z, .067, 1.764, .120, 1.799)
    dark = hair & (((d1 < .0057) & (t1 > .025) & (t1 < .985)) |
                   ((d2 < .0057) & (t2 > .025) & (t2 < .985)))
    edge = hair & (((d1 < .0030) & (t1 > .025) & (t1 < .985)) |
                   ((d2 < .0030) & (t2 > .025) & (t2 < .985)))
    gold = blend(px, dark, [67, 51, 16], .95)
    highlight = blend(px, edge, [219, 188, 68], 1.0)
    ensure(gold >= 5 and highlight >= 2,
           "Native hairpin UV target too small; preserve original eye geometry")
    return np.uint8(np.clip(np.rint(px), 0, 255)), {
        "hairpin_gold": gold, "hairpin_highlight": highlight
    }, ntri


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--revision", choices=["r22o", "r22p", "r22q"], default="r22q")
    parser.add_argument("--source", type=Path,
                        default=ROOT/"stage32i-art-r21e-native-f11")
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--native-author", type=Path, default=NATIVE_AUTHOR)
    parser.add_argument("--source-save", type=Path,
                        default=ROOT/"stage32g-delivery/source-snapshot.sav")
    args = parser.parse_args()
    if args.out is None:
        args.out = ROOT/("stage32i-art-"+args.revision+"-collab-native-f11")

    ensure(not args.out.exists(), "Output already exists; do not overwrite collaborator data")
    ensure(sha(args.source_save.read_bytes()) == SAVE_SHA, "Source game save changed")
    for rel, expect in ART_SOURCE_SHA.items():
        ensure(sha((SOURCE_ART/rel).read_bytes()) == expect,
               "Original source layer modified: " + rel)
    manifests = list(args.source.glob("source-f11-*-manifest.json"))
    ensure(len(manifests) == 1, "Expected exactly one original F11 source manifest")
    manifest_file = manifests[0]
    before = json.loads(manifest_file.read_text(encoding="utf-8-sig"))
    ensure(before["schema"] ==
           "xpz3d.stage32i.r21.original-F11-pirate-silhouette-native-63bone.v1",
           "Expected original F11 candidate")
    ensure((before["artwork"]["vertices"], before["artwork"]["triangles"]) ==
           (1553, 2410), "The polygon count was already altered")
    for export in before["export"].values():
        ensure(sha((args.source/export["name"]).read_bytes()) == export["sha256"],
               "Input native export changed: "+export["name"])

    model_path = args.source/"authored-native-model-PRIVATE.json"
    source_model = model_path.read_bytes()
    model = json.loads(source_model)
    ensure(len(model["bones"]) == 63, "Original S2 bone budget changed")
    nv = sum(len(p["positions"]) for p in model["parts"])
    nt = sum(len(p["indices"]) for p in model["parts"])
    ensure((nv, nt) == (1553, 2410), "Source parts count changed")

    source_image = Image.open(args.source/"native-diffuse-atlas-PRIVATE.png").convert("RGBA")
    old = np.asarray(source_image, dtype=np.uint8)
    ensure(old.shape == (1024, 1024, 4), "Unexpected 1024 atlas size")
    # Protect the original eyes and gun texture with strict region checks.
    body = nearest_front_surface(
        model["parts"], lambda p: p["name"].startswith("S2 female native body slot "))
    hair = nearest_front_surface(
        model["parts"], lambda p: "continuous green bob" in p["name"])
    body_pixels = old.copy()
    body_pixels, ornaments, body_tri = add_metal_ornaments(body_pixels, body, old)
    out_pixels, pin, hair_tri = add_gold_hairpin(body_pixels, hair)

    pixel_change = np.any(old != out_pixels, axis=2)
    ensure(int(pixel_change.sum()) > 100, "No material decorations generated")
    ensure(not pixel_change[512:, :].any(), "Gun atlas protected")
    ensure(not pixel_change[:256, :512].any(), "Eye/face atlas protected")
    ensure(not pixel_change[256:512, 768:].any(), "Weapon/extra materials protected")
    # Original body garment and original hair islands are the only allowed writes.
    where = np.argwhere(pixel_change)
    ensure(np.all(
        ((where[:,0] >= 256) & (where[:,0] < 512) & (where[:,1] < 768)) |
        ((where[:,0] < 256) & (where[:,1] >= 512))
    ), "Changed another worker's skin/eye/body region")

    n = module_from_file(args.native_author)
    parts = [
        n.part(p["name"], p["group"], p["positions"], p["uv"],
               p["indices"], p["normals"], p["weights"], p.get("source"))
        for p in model["parts"]
    ]
    groups = [n.pack_group(parts, group) for group in range(3)]
    immutable_mesh = n.encode_native(groups, [40, 40, 9])
    immutable_uv = n.encode_uv(groups, [40, 40, 9])
    ensure(sha(immutable_mesh) == before["export"]["native"]["sha256"],
           "Geometry byte-for-byte preservation failed")
    ensure(sha(immutable_uv) == before["export"]["uv"]["sha256"],
           "UV byte-for-byte preservation failed")
    png_buffer = io.BytesIO()
    Image.fromarray(out_pixels, "RGBA").save(png_buffer, "PNG")
    png = png_buffer.getvalue()
    rgba = out_pixels.tobytes()
    tx = struct.pack("<8s4I", b"XPZ32FTX", 1, 1024, 1024, len(rgba)) + rgba
    ensure(sha(tx) != before["export"]["atlas"]["sha256"],
           "Material atlas must have changed")
    inverse = np.asarray(model["inverseBind"], dtype=float)
    weights = n.encode_skin(groups, model["bones"], inverse,
                            [sha(immutable_mesh), sha(immutable_uv), sha(tx)])
    glb = n.glb(groups, model["bones"], inverse, png)

    stem = "unit-57-F11-"+args.revision
    names = {
        "native": (stem + ".s2meshbin", immutable_mesh),
        "uv": (stem + ".xpz32fuv", immutable_uv),
        "atlas": (stem + ".xpz32ftx", tx),
        "skin": (stem + ".xpz20skin", weights),
        "glb": (stem + ".glb", glb)
    }
    m = copy.deepcopy(before)
    # Retain the original native S2 manifest schema; r22Ornaments is an
    # additional optional field and does not alter the original rig contract.
    m["r22Ornaments"] = {
        "revision": args.revision,
        "base": before["r21SourceIdentity"]["revision"],
        "separateWorkerSafe": True,
        "featureScope": ["skull clasp", "X lacing", "leather strap", "gold hairpin"],
        "originalF11ArtSha256": ART_SOURCE_SHA,
        "sourceGameSaveSha256": SAVE_SHA,
        "bodyOriginalTriangles": body_tri,
        "hairOriginalTriangles": hair_tri,
        "materialPixelsChanged": int(pixel_change.sum()),
        "partPixelCounts": ornaments | pin,
        "nativeVertices": nv,
        "nativeTriangles": nt,
        "nativeBones": len(model["bones"]),
        "newVertices": 0,
        "newTriangles": 0,
        "originalFaceAndEyesIdentical": True,
        "originalWeaponMaterialsIdentical": True,
        "originalBodyTopologyAndWeightsIdentical": True,
        "artApproved": False,
        "nativeRunVerified": False
    }
    m["export"] = {
        kind: {"name": fname, "sha256": sha(data), "bytes": len(data)}
        for kind, (fname, data) in names.items()
    }
    ensure(sha(args.source_save.read_bytes()) == SAVE_SHA,
           "Original source save changed during build")
    args.out.mkdir(parents=True)
    for _, (fname, data) in names.items():
        (args.out/fname).write_bytes(data)
    (args.out/"native-diffuse-atlas-PRIVATE.png").write_bytes(png)
    (args.out/"authored-native-model-PRIVATE.json").write_bytes(source_model)
    (args.out/("source-f11-"+args.revision+"-manifest.json")).write_text(
        json.dumps(m, indent=2, ensure_ascii=False), encoding="utf-8")
    # No real native render is claimed until a separate isolated smoke passes.
    print(json.dumps({
        "status": "ASSET_PATCH_WRITTEN_NATIVE_TEST_NOT_YET_RUN",
        "candidate": str(args.out), "vertices": nv, "triangles": nt,
        "originalSkeletonBones": 63,
        "materialPixelsChanged": int(pixel_change.sum()),
        "parts": ornaments | pin,
        "meshHashUnchanged": True, "uvHashUnchanged": True,
        "newAtlasSHA256": m["export"]["atlas"]["sha256"],
        "sourceSaveUnmodified": True,
    }, indent=2))


if __name__ == "__main__":
    main()
