#!/usr/bin/env python3
"""Read self-contained GLB profiles, choose against explicit engine capabilities, stage one.
No engine autodetection, no game-directory writes, no external assets or extensions.
The manifest is a local handoff, not an authentication boundary.
"""
import argparse, hashlib, json, os, struct, sys
from pathlib import Path

LIMIT = 64 * 1024 * 1024
FIELDS = ('bytes', 'fnv64', 'joints', 'morphs', 'weightTracks', 'translationTracks', 'influenceSlots', 'maxTexture', 'npot')


def fnv64(data):
    h = 14695981039346656037
    for v in data:
        h = ((h ^ v) * 1099511628211) & 0xffffffffffffffff
    return h


def need(ok, msg):
    if not ok:
        raise ValueError(msg)


def read_glb(path):
    with Path(path).open('rb') as f:
        raw = f.read(LIMIT + 1)
    need(28 <= len(raw) <= LIMIT, 'GLB size out of range')
    need(struct.unpack_from('<III', raw) == (0x46546c67, 2, len(raw)), 'bad GLB header')
    n, typ = struct.unpack_from('<II', raw, 12)
    need(typ == 0x4e4f534a and n % 4 == 0 and 20+n+8 <= len(raw), 'bad JSON chunk')
    def unique(pairs):
        d = {}
        for k, v in pairs:
            need(k not in d, 'duplicate JSON key')
            d[k] = v
        return d
    g = json.loads(raw[20:20+n], object_pairs_hook=unique)
    m, typ = struct.unpack_from('<II', raw, 20+n)
    start = 28+n
    need(typ == 0x004e4942 and m % 4 == 0 and start+m == len(raw), 'bad BIN chunk')
    need(g['asset']['version'] == '2.0' and not g.get('extensionsRequired'), 'unsupported glTF version or required extension')
    need(len(g['buffers']) == 1 and 'uri' not in g['buffers'][0], 'external/multiple buffers unsupported')
    size = g['buffers'][0]['byteLength']
    need(type(size) is int and 0 <= size <= m <= size+3, 'buffer length mismatch')
    views = g['bufferViews']
    for v in views:
        off, length = v.get('byteOffset', 0), v['byteLength']
        need(v['buffer'] == 0 and type(off) is int and type(length) is int and 0 <= off <= off+length <= size, 'bad bufferView')
    def index(seq, i):
        need(type(i) is int and 0 <= i < len(seq), 'invalid index')
        return seq[i]
    # Conservative metadata preflight, not a full glTF validator/importer.
    maxtex = 0; npot = False
    for im in g.get('images', []):
        need('uri' not in im and im.get('mimeType') == 'image/png', 'only embedded PNG is accepted')
        v = index(views, im['bufferView']); off = start+v.get('byteOffset', 0)
        need(v['byteLength'] >= 33 and raw[off:off+16] == b'\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR', 'invalid PNG header')
        w, h = struct.unpack_from('>II', raw, off+16)
        need(0 < w <= 32768 and 0 < h <= 32768, 'PNG dimensions out of range')
        maxtex = max(maxtex, w, h); npot |= bool(w&(w-1) or h&(h-1))
    nodes = g['nodes']; skins = g.get('skins', []); accessors = g['accessors']
    joints = 0
    for skin in skins:
        js = skin['joints']; need(js and len(set(js)) == len(js), 'empty/duplicate joints')
        for j in js: index(nodes, j)
        joints = max(joints, len(js))
    morphs = slots = 0
    for mesh in g['meshes']:
        counts = set()
        for p in mesh['primitives']:
            a = p['attributes']; index(accessors, a['POSITION'])
            sets = [k for k in a if k.startswith('JOINTS_')]
            ws = [k for k in a if k.startswith('WEIGHTS_')]
            need({k[7:] for k in sets} == {k[8:] for k in ws}, 'joint/weight sets mismatch')
            need(all(index(accessors, a[k])['type'] == 'VEC4' for k in sets+ws), 'non-VEC4 skin influence accessor')
            slots = max(slots, 4*len(sets))
            counts.add(len(p.get('targets', [])))
        need(len(counts) == 1, 'inconsistent morph counts')
        count = counts.pop(); morphs = max(morphs, count)
        if 'weights' in mesh: need(len(mesh['weights']) == count, 'mesh weight count mismatch')
    paths = set()
    for clip in g.get('animations', []):
        for ch in clip['channels']:
            index(clip['samplers'], ch['sampler']); index(nodes, ch['target']['node'])
            paths.add(ch['target']['path'])
    need(paths <= {'rotation', 'translation', 'weights'}, 'unsupported animation target')
    need('weights' not in paths or morphs > 0, 'weight track without morphs')
    return raw, dict(bytes=len(raw), fnv64=fnv64(raw), joints=joints, morphs=morphs,
                     weightTracks=int('weights' in paths), translationTracks=int('translation' in paths),
                     influenceSlots=slots, maxTexture=maxtex, npot=int(npot))


def conflicts(info, caps):
    reasons = []
    for field, cap in [('joints','maxJoints'), ('morphs','maxMorphs'), ('influenceSlots','maxInfluences'), ('maxTexture','maxTexture')]:
        if info[field] > caps[cap]: reasons.append(f'{field}={info[field]} > {caps[cap]}')
    for field, cap in [('weightTracks','weightTracks'), ('translationTracks','translationTracks'), ('npot','npot')]:
        if info[field] and not caps[cap]: reasons.append(f'{field} unsupported')
    return reasons


def stage(candidates, caps, dest):
    dest = Path(dest)
    if dest.exists(): raise FileExistsError('destination already exists; choose a new staging directory')
    results = []; chosen = None
    for p in candidates:  # caller-defined quality priority; never guess engine caps
        try:
            raw, info = read_glb(p); reasons = conflicts(info, caps)
            results.append({'file':str(p), 'requirements':info, 'reasons':reasons})
            if not reasons and chosen is None: chosen = (raw, info, str(p))
        except (OSError, ValueError, KeyError, TypeError, IndexError, struct.error) as e:
            results.append({'file':str(p), 'reasons':[str(e)]})
    if chosen is None: return {'selected':None, 'candidates':results, 'engineApplied':False}
    raw, info, path = chosen
    # Exclusive destination creation, manifest last: incomplete staging cannot load.
    dest.mkdir(parents=False, exist_ok=False)
    report = {'selected':path, 'sha256':hashlib.sha256(raw).hexdigest(), 'requirements':info,
              'caps':caps, 'candidates':results, 'engineApplied':False}
    (dest/'model.glb').write_bytes(raw)
    (dest/'selection.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    manifest = 'XPZMODEL1\n' + ''.join(f'{k} {info[k]}\n' for k in FIELDS)
    pending = dest/'selection.pending'; pending.write_bytes(manifest.encode('ascii'))
    os.replace(pending, dest/'selection.txt')
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--candidate', action='append', required=True, help='repeat in preference order')
    p.add_argument('--out', required=True)
    for cli in ('max-joints','max-morphs','max-influences','max-texture'):
        p.add_argument('--'+cli, required=True, type=int)
    for cli in ('weight-tracks','translation-tracks','npot'):
        p.add_argument('--'+cli, required=True, choices=['yes','no'])
    a = p.parse_args()
    caps = dict(maxJoints=a.max_joints, maxMorphs=a.max_morphs, maxInfluences=a.max_influences,
                maxTexture=a.max_texture, weightTracks=a.weight_tracks=='yes',
                translationTracks=a.translation_tracks=='yes', npot=a.npot=='yes')
    need(all(v >= 0 for v in caps.values()), 'negative capability')
    r = stage(a.candidate, caps, a.out); print(json.dumps(r, indent=2)); return 0 if r['selected'] else 2

if __name__ == '__main__':
    try: sys.exit(main())
    except (ValueError, OSError) as e: print('ERROR:',e,file=sys.stderr); sys.exit(1)
