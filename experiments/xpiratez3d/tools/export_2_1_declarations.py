#!/usr/bin/env python3
"""Export explicit X-Piratez 2.1 item declarations, never effective ballistics.

Accepts the *existing atlas* public/reference/items.json or a provenance-tagged
subset test fixture. No source content is downloaded or silently invented.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
from pathlib import Path

PIRATEZ_RUL_SHA256 = 'ac42ed92d3f86f8414e5a1451dc207b0f3eee9e15bac0b949e93371e172b32f6'
SELECT = (
    'STR_GATLING_LASER', 'STR_FLECHETTE_CANNON', 'STR_BORING_PISTOL',
    'STR_STUN_BATON', 'STR_MINIGUN', 'STR_PIR_CANNON', 'STR_WAKIZASHI',
    'STR_HELL_CHAINGUN', 'AUX_TANK_LASER',
)


def export(source: Path, target: Path) -> dict:
    raw = source.read_bytes()
    data = json.loads(raw)
    if data.get('schema') != 'xp-atlas.latest-item-training.v1':
        raise ValueError('Unexpected atlas schema')
    if data.get('gameVersion') != 'v.o2 / 2.1' or data.get('engine') != 'OXCE 8.7.1':
        raise ValueError('Ruleset version mismatch; no cross-version blending')
    if data.get('sourceHashes', {}).get('Piratez.rul') != PIRATEZ_RUL_SHA256:
        raise ValueError('Underlying Piratez.rul SHA-256 mismatch')
    records = {}
    for item in data['items']:
        if not isinstance(item['i'], str) or item['i'] in records:
            raise ValueError('Duplicate or invalid item ID')
        records[item['i']] = item
    missing = set(SELECT) - records.keys()
    if missing:
        raise ValueError(f'Missing 2.1 direct declarations: {sorted(missing)}')
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('w', encoding='utf-8', newline='') as f:
        print('# scope=EXPLICIT_DIRECT_DECLARATION_ONLY_NOT_EFFECTIVE', file=f)
        print('# gameVersion=v.o2 / 2.1; engine=OXCE 8.7.1', file=f)
        print('# piratez_rul_sha256=' + PIRATEZ_RUL_SHA256, file=f)
        print('# input_sha256=' + hashlib.sha256(raw).hexdigest(), file=f)
        writer = csv.writer(f, dialect='excel-tab', lineterminator='\n')
        writer.writerow(['id','power_direct','damage_type_direct','training_mode_direct',
                         'source_file','source_line'])
        for id in SELECT:
            item = records[id]
            assert item['f'] == 'Piratez.rul' and isinstance(item['l'], int)
            writer.writerow([id, item['p'] if item['p'] is not None else 'UNKNOWN',
                             item['d'] if item['d'] is not None else 'UNKNOWN',
                             item['m'], item['f'], item['l']])
    return {'source_sha256': hashlib.sha256(raw).hexdigest(),
            'item_count': len(records), 'selected': len(SELECT),
            'known_direct_power': sum(records[i]['p'] is not None for i in SELECT),
            'missing_direct_power': sum(records[i]['p'] is None for i in SELECT),
            'candidate_effective_count': 0, 'path': str(target)}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', type=Path, required=True,
                   help='Existing atlas public/reference/items.json or tagged subset')
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    print(json.dumps(export(a.source, a.output), ensure_ascii=False, sort_keys=True))


if __name__ == '__main__':
    main()
