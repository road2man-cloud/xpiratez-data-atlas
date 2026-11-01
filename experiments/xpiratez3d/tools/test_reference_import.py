#!/usr/bin/env python3
"""Negative provenance tests: no cross-version mixing or unknown->zero."""
from __future__ import annotations
import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'testdata/atlas_2_1_direct_excerpt.json').read_text(encoding='utf-8'))
check_count = 0

with tempfile.TemporaryDirectory(prefix='xp3d-ref-test-') as tmp:
    p = Path(tmp)
    def assert_export(data: dict, expected_ok: bool) -> None:
        global check_count
        (p/'input.json').write_text(json.dumps(data), encoding='utf-8')
        if expected_ok:
            (p/'input.json').write_bytes((ROOT/'testdata/atlas_2_1_direct_excerpt.json').read_bytes())
        run = subprocess.run([sys.executable, str(ROOT/'tools/export_2_1_declarations.py'),
                              '--source', str(p/'input.json'), '--output', str(p/'out.tsv')],
                             capture_output=True, text=True)
        if (run.returncode == 0) != expected_ok:
            raise AssertionError(f'expected success={expected_ok}: {run.stderr or run.stdout}')
        check_count += 1

    assert_export(copy.deepcopy(source), True)
    for key,value in [ ('engine','OXCE 8.6'),('gameVersion','v.o1.1.1'),('schema','unknown') ]:
        case = copy.deepcopy(source);case[key] = value
        assert_export(case, False)
    case = copy.deepcopy(source);case['sourceHashes']['Piratez.rul']='invalid'
    assert_export(case, False)
    case = copy.deepcopy(source);case['items'].pop(0)
    assert_export(case, False)
    case = copy.deepcopy(source);case['items'].append(copy.deepcopy(case['items'][0]))
    assert_export(case, False)
    case = copy.deepcopy(source)
    next(x for x in case['items'] if x['i']=='STR_MINIGUN')['p'] = 0
    # A modified fixture may lie about original source contents:
    # metadata pinning alone is not independent source authentication.
    assert_export(case, False)

print(f'[PASS] {check_count} version/missing-record/duplicate tests; metadata is NOT source authentication')
