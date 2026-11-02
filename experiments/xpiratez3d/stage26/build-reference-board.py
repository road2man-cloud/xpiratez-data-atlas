#!/usr/bin/env python3
"""Generate PRIVATE reference boards for 3D modelers from the owned game art.

This is NOT a 3D mesh, texture bake, depth-estimation model, or permission
to redistribute asset pixels. The X-Piratez sprite worklist is authoritative
for source selection and sha; save *all* output outside the Atlas repository.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

MODULE_SOURCE = "xpz3d.stage26.art-reference-board.v1"
BACKGROUND = (21, 27, 36, 255)
PANEL = (41, 47, 57, 255)
INK = (232, 235, 240, 255)
SOFT = (172, 178, 190, 255)

def sha(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1<<20), b""):
            h.update(chunk)
    return h.hexdigest()

def font(size):
    p=Path(r"C:\Windows\Fonts\arial.ttf")
    try:
        return ImageFont.truetype(str(p), size)
    except (OSError, ValueError):
        return ImageFont.load_default()

def source_path(game_root, src):
    parts=Path(src).parts
    if any(x==".." for x in parts):
        raise ValueError("Invalid reference path")
    p=game_root / "user" / "mods" / "Piratez"
    for part in parts:
        entries={c.name.lower(): c for c in p.iterdir()}
        if part.lower() not in entries:
            raise FileNotFoundError(src)
        p=entries[part.lower()]
    if not p.is_file():
        raise FileNotFoundError(src)
    return p

def compose_catalog(catalog, game, output, unit_id=56):
    players=catalog["playerSpawnEquipment"]
    match=next((p for p in players if p["unitId"]==unit_id), None)
    if match is None:
        raise ValueError("Unit ID not found in actual Stage24 battle")
    armor=next(a for a in catalog["armorCatalog"] if a["armorRule"]==match["armorRule"])
    candidates=[i for i in match["handItems"] if i["itemRule"].startswith("STR_")]
    if not candidates:
        raise ValueError("No known actual equipment rules")
    weapon_rule=next((x["itemRule"] for x in candidates if x["itemRule"]=="STR_SMG_10MM"),candidates[0]["itemRule"])
    weapon=next(x for x in catalog["itemCatalog"] if x["itemRule"]==weapon_rule)
    appearance=match.get("sourceAppearance")
    selectedVariant=next((v for v in armor.get("actualActorVariants",[]) if v["unitId"]==unit_id),None)
    if appearance and selectedVariant and selectedVariant.get("resolvedLayerKey")!=armor.get("representativeVariant"):
        raise ValueError("Armor worklist representative variant belongs to a different actor; build source-specific board")
    references=[]
    for e in armor["sourceSheetRefs"]:
        for img in e["images"][:2]:
            references.append(("Original tactical sprite sheet",img["ref"],img["source"]["sha256"]))
    for layer in armor["selectedLayerSourceRefs"]:
        for entry in layer["resolved"][:1]:
            for img in entry["images"][:1]:
                references.append((f"Layer slot {layer['slot']}: {layer['textureKey']}",img["ref"],
                                   img["source"]["sha256"]))
    for kind in ["hand","big","floor"]:
        for entry in weapon["spriteSources"][kind][:1]:
            for img in entry["images"][:1]:
                references.append((f"{weapon_rule} / {kind} sprite",img["ref"],img["source"]["sha256"]))
    # Stable order with exact distinct references, retaining per-layer source information.
    seen=set()
    resolved=[]
    for label,rel,expected_sha in references:
        if (label,rel) in seen:
            continue
        seen.add((label,rel))
        file=source_path(game,rel)
        if sha(file).lower()!=expected_sha.lower():
            raise ValueError("Original sprite hash changed since worklist: "+rel)
        resolved.append((label,rel,file))
    W,H=1920,1330
    sheet=Image.new("RGBA",(W,H),BACKGROUND)
    d=ImageDraw.Draw(sheet)
    d.text((36,24),"XPZ3D / ORIGINAL GRAPHICS REFERENCE / NOT A FINISHED 3D ASSET",fill=INK,font=font(26))
    d.text((36,62),f"Source unit #{unit_id}: {match['name']}  |  {match['armorRule']}  |  {weapon_rule}",
           fill=SOFT,font=font(18))
    if appearance and selectedVariant:
        selection=(f"Unit source look: gender={appearance['gender']} look={appearance['look']} "
                   f"variant={appearance['lookVariant']}  ->  OXCE armor layer key {selectedVariant['resolvedLayerKey']}")
    else:
        selection='No geoscape appearance variant found; art references unconfirmed'
    d.text((36,88),selection,fill=SOFT,font=font(16))
    # Large original directional atlas on left; no invented details.
    x0,y0,w,h=28,128,770,1170
    d.rounded_rectangle((x0,y0,x0+w,y0+h),radius=14,fill=PANEL)
    right=[r for r in resolved if "sprite sheet" not in r[0].lower()]
    atlas=next((r for r in resolved if "sprite sheet" in r[0].lower()),None)
    if atlas:
        with Image.open(atlas[2]) as i:
            sprite=i.convert("RGBA")
        scale=min((w-34)/sprite.width,(h-82)/sprite.height)
        sprite=sprite.resize((round(sprite.width*scale),round(sprite.height*scale)),Image.Resampling.NEAREST)
        px=x0+(w-sprite.width)//2;py=y0+47
        sheet.alpha_composite(sprite,(px,py))
        d.text((x0+16,y0+12),atlas[1],fill=INK,font=font(18))
    else:
        d.text((x0+16,y0+14),"Armor sprite source not resolved",fill=INK,font=font(18))
    # Layer + weapon references keep item IDs, source-file provenance and look consistent.
    cell_w=340;cell_h=276
    col_count=3;startx=826;starty=128
    cap=(W-startx)//cell_w*4
    for index,(label,rel,p) in enumerate(right[:12]):
        row=index//col_count;col=index%col_count
        x=startx+col*(cell_w+12);y=starty+row*(cell_h+8)
        d.rounded_rectangle((x,y,x+cell_w,y+cell_h),radius=12,fill=PANEL)
        d.text((x+12,y+10),label[:38],fill=INK,font=font(16))
        with Image.open(p) as img:
            ref=img.convert("RGBA")
        max_x,max_y=cell_w-25,cell_h-100
        sz=min(max_x/ref.width,max_y/ref.height,6.0)
        ref=ref.resize((max(1,round(ref.width*sz)),max(1,round(ref.height*sz))),Image.Resampling.NEAREST)
        sheet.alpha_composite(ref,(x+(cell_w-ref.width)//2,y+45))
        d.text((x+12,y+cell_h-49),Path(rel).name[:37],fill=SOFT,font=font(15))
        d.text((x+12,y+cell_h-27),"local original game resource",fill=SOFT,font=font(12))
    d.text((35,H-22),"Private modeling reference only. Native character mesh, rig, PBR texture, animations and weapon sockets: NOT BUILT.",
           fill=SOFT,font=font(16))
    output.mkdir(parents=True,exist_ok=True)
    filename=output/f"unit-{unit_id}-original-art-reference.png"
    sheet.convert("RGB").save(filename,optimize=True)
    metadata={
        "schema":MODULE_SOURCE,"battleId":catalog["source"]["battleId"],
        "sourceUnitId":unit_id,"name":match["name"],"armorRule":match["armorRule"],
        "sourceTile":match["sourceTile"],"sourceWeaponRule":weapon_rule,
        "sourceSheets":[{"label":name,"relativePath":rel,"sha256":sha(p)} for name,rel,p in resolved],
        "board":filename.name,"boardSha256":sha(filename),
        "privateLicensedPixels":True,"suitableForRedistribution":False,
        "s2ModelImported":False,"skinRigged":False,"animationsComplete":False,
        "sourceAppearance":appearance,
        "exactSourceAppearanceVariantConfirmed":bool(selectedVariant and selectedVariant.get('exactLayerVariant')),
        "resolvedOriginalLayerKey":selectedVariant.get('resolvedLayerKey') if selectedVariant else None,
        "purpose":"Identify authoring references for a future real X-Piratez 3D character and weapon"
    }
    report=output/f"unit-{unit_id}-art-reference.json"
    report.write_text(json.dumps(metadata,indent=2,ensure_ascii=False)+"\n",encoding="utf8")
    return {"boardPath":str(filename),"referenceCount":len(resolved),
            "metadataPath":str(report),"native3DReady":False}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--catalog",type=Path,required=True)
    p.add_argument("--game-root",type=Path,required=True)
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--unit-id",type=int,default=56)
    a=p.parse_args()
    c=json.loads(a.catalog.read_text(encoding="utf8"))
    print(json.dumps(compose_catalog(c,a.game_root,a.out,a.unit_id),
        ensure_ascii=False,indent=2))
