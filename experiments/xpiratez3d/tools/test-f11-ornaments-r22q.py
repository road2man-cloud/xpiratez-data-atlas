#!/usr/bin/env python3
"""Independent regression gate for the collaborative r22-Q native art overlay."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

R=Path(r"D:\daphne_auto\XPZ3D_ENGINE_BUILD_20261102")
BEFORE=R/"stage32i-art-r21e-native-f11"
AFTER=R/"stage32i-art-r22q-collab-native-f11"
RUNTIME=R/"gog-runtime-f11-r22q-collab-native"
SHA=lambda b:hashlib.sha256(b).hexdigest()
def require(ok,m):
 if not ok:raise AssertionError("F11_R22Q_PATCH_QA_FAIL: "+m)
a=json.loads((BEFORE/"source-f11-r21e-manifest.json").read_text())
b=json.loads((AFTER/"source-f11-r22q-manifest.json").read_text())
require(b["artwork"]["vertices"]==a["artwork"]["vertices"]==1553,"Vertex count changed")
require(b["artwork"]["triangles"]==a["artwork"]["triangles"]==2410,"Polygon count changed")
require(b["artwork"]["sourceJoints"]==63,"Native joints changed")
require(b["export"]["native"]["sha256"]==a["export"]["native"]["sha256"],"Native geometry changed")
require(b["export"]["uv"]["sha256"]==a["export"]["uv"]["sha256"],"Original S2 UV mapping changed")
orig=np.asarray(Image.open(BEFORE/"native-diffuse-atlas-PRIVATE.png").convert("RGBA"))
current=np.asarray(Image.open(AFTER/"native-diffuse-atlas-PRIVATE.png").convert("RGBA"))
changes=np.any(orig!=current,axis=2)
require(not changes[:256,:512].any(),"Skin and eyes changed")
require(not changes[256:512,768:].any(),"Clothing overlap outside original body UV")
require(not changes[512:,:].any(),"Weapon or non-target textures changed")
require(np.array_equal(orig[:,:,3],current[:,:,3]),"Atlas alpha format changed")
require(int(changes.sum())>1000,"Insufficient texture evidence")
old_model=(BEFORE/"authored-native-model-PRIVATE.json").read_bytes()
new_model=(AFTER/"authored-native-model-PRIVATE.json").read_bytes()
require(old_model==new_model,"Source S2 rig, hair silhouette or skin weights modified")
for kind,info in b["export"].items():
 require(SHA((AFTER/info["name"]).read_bytes())==info["sha256"],"Corrupt "+kind)
details=b["r22Ornaments"]["partPixelCounts"]
for key in ["leather_strap","lacing","lace_eyelets","skull_silver","skull_backplate","hairpin_gold","hairpin_highlight"]:
 require(details[key]>=10,"Missing visible feature "+key)
dirs=list(RUNTIME.glob("stage29-evidence-*"))
require(len(dirs)==1,"Expected one native isolated runtime")
driver=(dirs[0]/"driver.log").read_text(encoding="utf-8-sig")
require("FINAL=PASS" in driver,"Actual S2 smoke failed")
require("STAGE32E_F11_VISUAL_FOLLOWED_NATIVE_MOVE" in driver,"Visual F11 movement not verified")
require("STAGE32H_R3E_VISUAL_ANIM_ONLY action=anim_fire" in driver,"SMG visual firing not verified")
require("STAGE32H_R3E_VISUAL_ANIM_ONLY action=anim_reload" in driver,"SMG visual reload not verified")
require(SHA((R/"stage32g-delivery"/"source-snapshot.sav").read_bytes())==
 "9cae906d79ad9f509412dc19804afd3e80ae7e566e19de5699d9747af0e98f55","Original campaign save changed")
qa={
 "schema":"xpz3d.f11.r22q.collaborator-addon-checks.v1",
 "originalXpiratezUnit":"F11 / source unit ID 57",
 "nativeActor": "Silent Storm 63-bone female source rig",
 "vertices":1553,"triangles":2410,"newVertices":0,"newTriangles":0,
 "atlasChangedPixels":int(changes.sum()),
 "atlasAffectedTiles":{"originalS2Hair":int(changes[:256,512:].sum()),"originalS2Clothing":int(changes[256:512,:768].sum())},
 "originalFaceAndEyeTexelsUntouched":True,
 "originalBodyAndFaceMeshUntouched":True,
 "originalWeaponTexelsUntouched":True,
 "originalSMGVisualAnimationsVerified":True,
 "nativeGroundPathfindingVerified":False,
 "campaignPortVerified":False,
 "originalGameSaveUnmodified":True,
 "nativeRuntimeFinal":"PASS",
 "featurePixels":details,
 "artUserApproved":False,
 "output":str(AFTER),
 "evidence":str(dirs[0])
}
q=AFTER/"R22Q_NATIVE_COLLAB_QA.json"
require(not q.exists(),"QA receipts are immutable")
q.write_text(json.dumps(qa,indent=2),encoding="utf-8")
print(json.dumps(qa,indent=2))
