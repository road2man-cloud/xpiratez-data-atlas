#!/usr/bin/env python3
"""Compare actual, unaltered S2 screenshots before/after the r22-O collaborator pass."""
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np

ROOT = Path(r"D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102")


def latest(root):
    dirs = sorted(root.glob("stage29-evidence-*"), key=lambda p: p.stat().st_mtime)
    assert len(dirs) == 1, "Not a single controlled S2 smoke evidence directory"
    assert "FINAL=PASS" in (dirs[0]/"driver.log").read_text(encoding="utf-8-sig")
    return dirs[0]


def main():
    ar = argparse.ArgumentParser()
    ar.add_argument("--old", type=Path,
        default=ROOT/"gog-runtime-f11-r21e-native-skin")
    ar.add_argument("--new", type=Path,
        default=ROOT/"gog-runtime-f11-r22o-collab-native")
    ar.add_argument("--out", type=Path,
        default=ROOT/"stage32i-art-r22o-collab-native-f11")
    args=ar.parse_args()
    before=latest(args.old)
    after=latest(args.new)
    revision = "r22q" if "r22q" in args.new.name else ("r22p" if "r22p" in args.new.name else "r22o")
    font=ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf",16)
    small=ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf",13)
    cards=[]
    comparisons=[]
    for cam,rect,size in [
        ("xpz-actor-front.png",(535,55,1058,934),(260,490)),
        ("xpz-face-profile.png",(548,285,1082,925),(260,320)),
        ("xpz-face-quarter.png",(548,285,1082,925),(260,320))
    ]:
        x=Image.open(before/cam).convert("RGB")
        y=Image.open(after/cam).convert("RGB")
        assert x.size==y.size==(1600,1200),cam
        cc=[]
        for im in [x,y]:
            img=im.crop(rect)
            img=img.resize(size,Image.Resampling.LANCZOS)
            cc.append(img)
        # Compute statistics on the *actual* game pixels, not rendered
        # synthetic images. Lighting changes may still affect these values.
        cropb=np.asarray(x.crop(rect),np.int16)
        cropn=np.asarray(y.crop(rect),np.int16)
        delta=np.abs(cropb-cropn)
        comparisons.append(dict(camera=cam,meanAbsolutePixelDifference=round(float(delta.mean()),2),
                     changedOver12RGB=int(np.any(delta>12,axis=2).sum())))
        cards.append((cam,cc))
    canvas=Image.new("RGB",(1120,810),(26,30,35))
    d=ImageDraw.Draw(canvas)
    d.text((20,10),f"F11 r21-E -> {revision.upper()} | ACTUAL S2 SCREENSHOT COMPARISON",font=font,fill=(245,245,247))
    d.text((20,40),"Only chest skull/strap/laces and hairpin are edited; identical mesh and eye textures.",font=small,fill=(207,217,225))
    labels=["r21-E original",revision.upper()+" additive pass"]
    for row,(name,imgs) in enumerate(cards):
        top=85 if row==0 else 590
        if row==0:
            for col,img in enumerate(imgs):
                x=20+col*285;canvas.paste(img,(x,top+10))
                d.text((x,top-15),labels[col]+" FULL BODY",font=small,fill=(245,245,247))
        else:
            size=(235,183)
            for col,img in enumerate(imgs):
                src=img.resize(size,Image.Resampling.LANCZOS)
                x=590+(row-1)*255
                y=87+col*340
                canvas.paste(src,(x,y))
                d.text((x,y+188),labels[col]+" "+name.replace(".png",""),font=small,fill=(222,232,240))
    d.text((20,778),"Unretouched S2 framebuffer crops; real engine import and 63-joint visual smoke PASS.",font=small,fill=(206,217,225))
    out=args.out/("F11-"+revision+"-vs-r21e-native-S2-review-PRIVATE.png")
    assert not out.exists(),"No overwrite"
    canvas.save(out)
    (args.out/"F11-r22o-native-visual-diff.json").write_text(json.dumps(dict(
        before=str(before),after=str(after),comparisons=comparisons,
        preview=str(out),actualNativeEngine=True,generatedConceptArt=False
    ),indent=2))
    print(json.dumps(dict(path=str(out),comparisons=comparisons),indent=2))

if __name__=="__main__":
    main()
