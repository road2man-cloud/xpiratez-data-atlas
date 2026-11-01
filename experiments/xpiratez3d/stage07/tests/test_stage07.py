"""Stage07 tests are source-hook & transport tests, NOT an engine battle run."""
from __future__ import annotations
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
CORE=ROOT.parent/'stage06'  # single shared codebase in the existing GitHub repo
if not CORE.is_dir():CORE=ROOT.parent/'xpiratez3d_stage06'/'stage06' # local prototype workspace
sys.path.insert(0,str(ROOT/'tools'))
from apply_impact_overlay import patch, patch_driver, patch_tile, Rejected as PatchRejected
from export_impact_feed import adapt, Rejected as FeedRejected

READY={'event':'native_ready','protocol':1,'backend':'OXCE_NATIVE','parityCertified':False}
UNIT={'id':21,'faction':0,'status':0,'position':[1,2,0],'tu':65,'health':38,'energy':50,'stun':0,'morale':90}
ENEMY={'id':39,'faction':1,'status':0,'position':[6,2,0],'tu':42,'health':33,'energy':49,'stun':0,'morale':75}

def cp(idx,cmd,units):
    return {'event':'checkpoint','file':f'xpz-native-{idx}.sav','phase':'after_action',
            'command_index':cmd,'turn':1,'side':0,'rng':'1234','units':units}

def fixtures():
    h={'event':'xp3d_hit_voxel','command_index':1,'actor':21,'voxel':[99,37,9],
       'part':2,'power':44,'rolled_damage':30,'tile_damage':22,
       'terrain_visibility_changed':1,'ranged':1,
       'evidence':'tile_engine_hit_damage_application_voxel'}
    return [READY,cp(0,0,[UNIT,ENEMY]),cp(1,1,[{**UNIT,'tu':53},{**ENEMY,'health':28}]),
            h,cp(2,1,[{**UNIT,'tu':53},{**ENEMY,'health':28}]),
            {'event':'plan_completed','battleVictoryCertified':False}]

def encoded(rows):return ('\n'.join(json.dumps(row,separators=(',',':')) for row in rows)+'\n').encode()

class TestSourceHook(unittest.TestCase):
    def setUp(self):
        self.tile='''#include "TileEngine.h"
void TileEngine::hit(BattleActionAttack attack, Position center, int power, const RuleDamageType *type, bool rangeAtack, int terrainMeleeTilePart)
{
    int damage = 1;
    const int tileFinalDamage = type->getTileFinalDamage(type->getRandomDamageForTile(power, damage));
    if(part > 2) { calculateFOV(tilePos, 1, false); }
	//and will continue to block visibility at this point in time.
}

/**
 * Handles explosions.
 */
void TileEngine::explode(){}
'''
        self.driver='''#include "../Battlescape/BattlescapeState.h"
void observe(){
        trace << "]}\\n";
        trace.flush();
}
'''
    def test_patch_hooks_and_unchanged_damage_calls(self):
        t=patch_tile(self.tile);d=patch_driver(self.driver)
        self.assertIn('NativeImpactTrace::record(center.x, center.y, center.z',t)
        self.assertIn('NativeImpactTrace::drain(&impactOverflow)',d)
        self.assertEqual(t.count('const int tileFinalDamage = type->getTileFinalDamage('),1)
        self.assertEqual(d.count('trace << "]}\\n";'),1)
        self.assertIn('XPZ3D_IMPACT_QUEUE_OVERFLOW',d)
    def test_patched_native_logger_compiles_emits_real_source_shape(self):
        driver=self.driver.replace('#include "../Battlescape/BattlescapeState.h"',
          '#include "NativeImpactTrace.h"\n#include <sstream>\n#include <iostream>\n#include <cstdlib>')
        driver=driver.replace('void observe(){','int cursor=1;std::ostringstream trace;\nvoid observe(){')
        code=patch_driver(self.driver).replace('#include "../Battlescape/BattlescapeState.h"',
          '#include "NativeImpactTrace.h"\n#include <sstream>\n#include <iostream>\n#include <cstdlib>')
        code=code.replace('#include "../Battlescape/NativeImpactTrace.h"','#include "NativeImpactTrace.h"')
        code=code.replace('void observe(){','namespace NativeImpactTrace=OpenXcom::NativeImpactTrace;\n'
                           'int cursor=1;std::ostringstream trace;\nvoid observe(){')
        code+='\nint main(){\n  setenv("XPZ_NATIVE_IMPACT_TRACE","1",1);\n  OpenXcom::NativeImpactTrace::record(99,37,9,2,44,30,22,1,21,1);\n  observe();\n  auto out=trace.str();\n  auto line=out.find("}\\n");\n  std::cout<<out.substr(line+2);\n}\n'
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);(p/'patched.cpp').write_text(code)
            compile=subprocess.run(['c++','-std=c++14','-Wall','-Wextra','-Werror','-pedantic','-pthread',
                '-I'+str(ROOT/'native'),str(p/'patched.cpp'),'-o',str(p/'patched')],
                capture_output=True,text=True)
            self.assertEqual(compile.returncode,0,compile.stderr)
            out=subprocess.run([str(p/'patched')],capture_output=True,text=True,check=True)
            emitted=json.loads(out.stdout.strip())
            self.assertEqual(emitted['event'],'xp3d_hit_voxel')
            self.assertEqual(emitted['voxel'],[99,37,9])
            rows=fixtures();rows[3]=emitted
            feed,info=adapt(encoded(rows))
            self.assertEqual(info['native_damage_application_voxels'],1)
            self.assertIn(b'\nI\t1\t21\t99\t37\t9\t',feed)

    def test_reject_repeat_patch(self):
        with self.assertRaises(PatchRejected):patch_tile(patch_tile(self.tile))
        with self.assertRaises(PatchRejected):patch_driver(patch_driver(self.driver))
    def test_reject_changed_main_source(self):
        with self.assertRaises(PatchRejected):patch_tile(self.tile.replace('//and will continue','//renamed'))
    def test_new_overlay_keeps_inputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);a=p/'TileEngine.cpp';b=p/'ReplayDriver.h';a.write_text(self.tile);b.write_text(self.driver)
            before=(a.read_bytes(),b.read_bytes())
            meta=patch(a,b,p/'overlay')
            self.assertEqual((a.read_bytes(),b.read_bytes()),before)
            self.assertTrue((p/'overlay/src/Battlescape/NativeImpactTrace.h').is_file())
            self.assertFalse(meta['original_engine_compiled'])
            with self.assertRaises(PatchRejected):patch(a,b,p/'overlay')

class TestDamageFeed(unittest.TestCase):
    def test_add_native_damage_voxel(self):
        wire,report=adapt(encoded(fixtures()))
        self.assertIn(b'XPZ3D3\t',wire)
        self.assertIn(b'\t99\t37\t9\t2\t44\t30\t22\t1\t1\ttile_engine_hit_damage_application_voxel\n',wire)
        self.assertEqual(report['native_damage_application_voxels'],1)
        self.assertEqual(report['actual_projectile_paths_recorded'],0)
        self.assertFalse(report['native_binary_authenticated'])
    def test_with_checkpoint_hash_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)
            for i in range(3):(p/f'xpz-native-{i}.sav').write_bytes(b'checkpoint'+bytes([i]))
            wire,report=adapt(encoded(fixtures()),p)
            self.assertIn(hashlib.sha256(b'checkpoint\x00').hexdigest().encode(),wire)
            self.assertTrue(report['checkpoint_content_hashed'])
    def test_reject_unverified_source_label(self):
        a=fixtures();a[3]['evidence']='guessed_from_requested_aim'
        with self.assertRaises(FeedRejected):adapt(encoded(a))
    def test_reject_missing_voxel(self):
        a=fixtures();a[3]['voxel']=[99,37]
        with self.assertRaises(FeedRejected):adapt(encoded(a))
    def test_reject_mismatched_command(self):
        a=fixtures();a[3]['command_index']=14
        with self.assertRaises(FeedRejected):adapt(encoded(a))
    def test_reject_boolean_numeric(self):
        a=fixtures();a[3]['terrain_visibility_changed']=True
        with self.assertRaises(FeedRejected):adapt(encoded(a))
    def test_reject_unexpected_native_error(self):
        a=fixtures();a.insert(-1,{'event':'error','code':'XPZ3D_IMPACT_QUEUE_OVERFLOW','dropped':1})
        with self.assertRaises(FeedRejected):adapt(encoded(a))
    def test_reject_overridden_hit_power(self):
        a=fixtures();a[3]['power']=0
        with self.assertRaises(FeedRejected):adapt(encoded(a))
    def test_no_events_backward_compat(self):
        a=fixtures();a.pop(3)
        wire,report=adapt(encoded(a));self.assertEqual(report['native_damage_application_voxels'],0)
        self.assertNotIn(b'\nI\t',wire)
    def test_reject_trace_with_no_native_checkpoints(self):
        with self.assertRaises(FeedRejected):adapt(encoded([READY,{'event':'plan_completed'}]))

class TestReceiver(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();cls.exe=Path(cls.temp.name)/'feed_test'
        process=subprocess.run(['c++','-std=c++14','-Wall','-Wextra','-Werror','-pedantic',
                str(CORE/'ss/XPZVisualFeed.cpp'),str(CORE/'ss/visual_feed_test.cpp'),
                '-o',str(cls.exe)],capture_output=True,text=True)
        if process.returncode:raise RuntimeError(process.stderr)
    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()
    def run_cpp(self,wire,expected):
        path=Path(self.temp.name)/'input.feed';path.write_bytes(wire)
        result=subprocess.run([str(self.exe),str(path)],capture_output=True,text=True)
        self.assertEqual(result.returncode,expected,result.stdout+result.stderr)
        return result.stdout+result.stderr
    def test_cpp_valid_real_hit_format(self):
        out=self.run_cpp(adapt(encoded(fixtures()))[0],0)
        self.assertIn('damage_application_voxels=1',out)
        self.assertIn('OXCE_TILE_ENGINE_HIT actor=21 voxel=[99,37,9] part=2',out)
    def test_cpp_reject_untagged_hit(self):
        wire=adapt(encoded(fixtures()))[0].replace(b'tile_engine_hit_damage_application_voxel',b'visual_guess')
        self.assertIn('REJECTED',self.run_cpp(wire,3))
    def test_cpp_reject_v2_impact_record(self):
        wire=adapt(encoded(fixtures()))[0].replace(b'XPZ3D3',b'XPZ3D2',1)
        self.assertIn('REJECTED',self.run_cpp(wire,3))
    def test_cpp_reject_unknown_actor_command(self):
        wire=adapt(encoded(fixtures()))[0].replace(b'I\t1\t21\t',b'I\t5\t21\t')
        self.assertIn('REJECTED',self.run_cpp(wire,3))
    def test_cpp_reject_incomplete_frame(self):
        wire=adapt(encoded(fixtures()))[0]
        wire=wire.rsplit(b'E\t2',1)[0]
        self.assertIn('REJECTED',self.run_cpp(wire,3))

if __name__=='__main__':unittest.main(verbosity=2)
