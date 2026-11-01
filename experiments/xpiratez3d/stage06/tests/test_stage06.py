"""Portable unit and integration tests, not real Nival/OXCE runtime tests."""
import copy
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from export_visual_feed import export, Rejected
from make_optin_patches import stage_ss, stage_oxce, PatchError

A={'id':21,'faction':0,'status':0,'position':[1,2,0], 'tu':65,'health':38,'energy':50,'stun':0,'morale':90}
E={'id':39,'faction':1,'status':0,'position':[6,2,0], 'tu':42,'health':33,'energy':49,'stun':0,'morale':75}
def cp(idx,cmd,units,turn=1):
    return {'event':'checkpoint','file':f'xpz-native-{idx}.sav','phase':'after_action',
            'command_index':cmd,'turn':turn,'side':0,'rng':'774','units':units}
def make_trace(with_aim=True):
    records=[{'event':'native_ready','protocol':1,'backend':'OXCE_NATIVE','parityCertified':False},
        cp(0,0,[A,E]),cp(1,1,[{**A,'tu':53}, {**E,'health':28}])]
    if with_aim:
        records.append({'event':'xp3d_visual_fire','command_index':1,'actor':21,'item':4,'mode':'snap',
                        'target':[6,2,0],'evidence':'requested_target_not_impact'})
    records.append(cp(2,1,[{**A,'tu':53},{**E,'health':28}]))
    records.append({'event':'plan_completed','battleVictoryCertified':False})
    return records
def encoded(records):
    return ('\n'.join(json.dumps(x,separators=(',',':')) for x in records)+'\n').encode()

class TestExport(unittest.TestCase):
    def test_native_test_trace_export(self):
        wire,report=export(encoded(make_trace()))
        self.assertEqual(report['frames'],3)
        self.assertEqual(report['requested_aim_events_not_impacts'],1)
        self.assertFalse(report['native_binary_authenticated'])
        self.assertIn(b'\trequested_aim_not_impact\n',wire)
        self.assertNotIn(b'\thit\t',wire)
    def test_reject_forged_backend(self):
        rows=make_trace();rows[0]['backend']='MIMIC'
        with self.assertRaises(Rejected):export(encoded(rows))
    def test_reject_error(self):
        rows=make_trace();rows.insert(-1,{'event':'error','code':'FIRE_NOT_QUEUED'})
        with self.assertRaises(Rejected):export(encoded(rows))
    def test_reject_duplicate_units(self):
        rows=make_trace();rows[1]['units'].append(copy.deepcopy(A))
        with self.assertRaises(Rejected):export(encoded(rows))
    def test_reject_nonmonotonic_command(self):
        rows=make_trace();rows[3]['command_index']=-1
        with self.assertRaises(Rejected):export(encoded(rows))
    def test_reject_fake_impact(self):
        rows=make_trace();rows[3]['evidence']='proven_actual_impact'
        with self.assertRaises(Rejected):export(encoded(rows))
    def test_reject_unknown_event(self):
        rows=make_trace();rows.insert(-1,{'event':'fire_hit','x':8})
        with self.assertRaises(Rejected):export(encoded(rows))
    def test_missing_checkpoint_fail_closed(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(Rejected):export(encoded(make_trace()),pathlib.Path(d))
    def test_real_sha_file_must_be_present(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)
            for i in range(3):(p/f'xpz-native-{i}.sav').write_bytes(b'CHECKPOINT '+bytes([i]))
            wire,info=export(encoded(make_trace()),p)
            self.assertTrue(info['checkpoint_content_hashed'])
            self.assertIn(hashlib.sha256(b'CHECKPOINT \x00').hexdigest().encode(),wire)
    def test_invalid_filename(self):
        rows=make_trace();rows[1]['file']='../private.sav'
        with self.assertRaises(Rejected):export(encoded(rows))
    def test_snapshot_not_mutated(self):
        rows=make_trace();before=copy.deepcopy(rows);export(encoded(rows));self.assertEqual(rows,before)

class TestCppBridge(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        cls.exe=pathlib.Path(cls.tmp.name)/'sink'
        p=subprocess.run(['c++','-std=c++14','-Wall','-Wextra','-pedantic','-Werror',
                          str(ROOT/'ss/XPZVisualFeed.cpp'),str(ROOT/'ss/visual_feed_test.cpp'),
                          '-o',str(cls.exe)],capture_output=True,text=True)
        if p.returncode:raise RuntimeError(p.stderr)
    @classmethod
    def tearDownClass(cls):cls.tmp.cleanup()
    def run_cpp(self,wire,expected=0):
        p=pathlib.Path(self.tmp.name)/'feed.txt';p.write_bytes(wire)
        process=subprocess.run([str(self.exe),str(p)],capture_output=True,text=True)
        self.assertEqual(process.returncode,expected,process.stdout+process.stderr)
        return process.stdout+process.stderr
    def test_cpp_receives_aim_and_unit_updates(self):
        out=self.run_cpp(export(encoded(make_trace()))[0]);self.assertIn('REQUESTED_AIM_ONLY actor=21',out)
        self.assertIn('39 tile=[6,2,0] hp=28',out)
    def test_cpp_rejects_damaged_sequence(self):
        wire=export(encoded(make_trace()))[0].replace(b'F\t1\t',b'F\t6\t')
        self.assertIn('REJECTED',self.run_cpp(wire,3))
    def test_cpp_rejects_truncated_frame(self):
        wire=export(encoded(make_trace()))[0]
        self.assertIn('REJECTED',self.run_cpp(wire.rsplit(b'E\t2',1)[0],3))
    def test_cpp_rejects_unpaired_deletion(self):
        wire=export(encoded(make_trace()))[0]
        wire=wire.replace(b'E\t2\n',b'D\t999\nE\t2\n')
        self.assertIn('REJECTED',self.run_cpp(wire,3))
    def test_cpp_rejects_malformed_number(self):
        wire=export(encoded(make_trace()))[0].replace(b'\t53\t38\t',b'\tX\t38\t')
        self.assertIn('REJECTED',self.run_cpp(wire,3))

class TestPatch(unittest.TestCase):
    def setup_stubs(self,temp):
        root=pathlib.Path(temp)
        (root/'ss/Game').mkdir(parents=True)
        (root/'ss/Game/Main.cpp').write_text('#include "WinFrame.h"\nint WinMain(){\n\t\tNHPTimer::UpdateHPTimerFrequency();\n}\n')
        (root/'ss/CMakeLists.txt').write_text('s2_module(Game win32)\ntarget_link_options(Game PRIVATE /LARGEADDRESSAWARE)\n')
        (root/'oxce').mkdir()
        (root/'oxce/ReplayDriver.h').write_text('    void tick(){\n        if(pending){\n            pending = false;\n            observe(game, "after_action");\n        }\n    }\n')
        return root
    def test_patch_applies_exact_anchors(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.setup_stubs(d)
            s=stage_ss(p/'ss',p/'stage_ss')
            o=stage_oxce(p/'oxce',p/'stage_oxce')
            self.assertIn('XPZVisual::PollWin32();',(p/'stage_ss/Game/Main.cpp').read_text())
            self.assertIn('target_sources(Game PRIVATE',(p/'stage_ss/CMakeLists.txt').read_text())
            self.assertIn('xp3d_visual_fire',(p/'stage_oxce/ReplayDriver.h').read_text())
            self.assertFalse(s['compiled_in_actual_silent_storm']);self.assertFalse(o['compiled_in_original_oxce'])
            self.assertNotIn('XPZVisual',(p/'ss/Game/Main.cpp').read_text())
            self.assertNotIn('xp3d_visual_fire',(p/'oxce/ReplayDriver.h').read_text())
    def test_missing_anchor_fails(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.setup_stubs(d)
            (p/'ss/Game/Main.cpp').write_text('missing')
            with self.assertRaises(PatchError):stage_ss(p/'ss',p/'stage_ss')
    def test_reject_double_patch(self):
        with tempfile.TemporaryDirectory() as d:
            p=self.setup_stubs(d)
            stage_oxce(p/'oxce',p/'stage_oxce')
            with self.assertRaises(PatchError):stage_oxce(p/'stage_oxce',p/'again')

if __name__=='__main__':unittest.main(verbosity=2)
