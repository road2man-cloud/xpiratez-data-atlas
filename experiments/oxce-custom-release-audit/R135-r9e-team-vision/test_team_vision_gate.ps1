$ErrorActionPreference='Stop'
$stage='D:\daphne_auto\oxce-r135-r9e-team-vision-20261117'
$header=Join-Path $stage 'src\Battlescape\TeamVisionGate.h'
$build=Join-Path $stage 'tests'
if(!(Test-Path $build)){New-Item -ItemType Directory -Force -Path $build|Out-Null}
$code=Get-Content -LiteralPath $header -Raw -Encoding UTF8
$start=$code.IndexOf('namespace OpenXcom')
if($start -lt 0){throw 'TeamVisionGate namespace not found'}
$actualHelper=$code.Substring($start)
$mock=@'
#include <cassert>
#include <cstdlib>
#include <iostream>
#include <set>
#include <vector>
namespace OpenXcom {
enum UnitFaction { FACTION_PLAYER, FACTION_HOSTILE, FACTION_NEUTRAL };
struct BattleUnit {
  UnitFaction faction;
  bool out=false;
  bool visible=false;
  std::vector<BattleUnit*> visibleUnits;
  std::vector<BattleUnit*> seenTurn;
  explicit BattleUnit(UnitFaction f):faction(f){}
  UnitFaction getFaction() const {return faction;}
  bool isOut() const {return out;}
  bool getVisible() const {return visible;}
  std::vector<BattleUnit*> *getVisibleUnits(){return &visibleUnits;}
  const std::vector<BattleUnit*> &getUnitsSpottedThisTurn() const{return seenTurn;}
};
struct SavedBattleGame {
  UnitFaction side=FACTION_PLAYER;
  std::vector<BattleUnit*> units;
  UnitFaction getSide() const{return side;}
  std::vector<BattleUnit*> *getUnits(){return &units;}
};
}
'@
$tests=@'
using namespace OpenXcom;
static void expect(bool condition,const char *name) {
 if(!condition){std::cerr<<"FAIL "<<name<<"\n";std::exit(2);}
 std::cout<<"PASS "<<name<<"\n";
}
int main() {
 {
   BattleUnit first(FACTION_PLAYER), runner(FACTION_PLAYER), enemy(FACTION_HOSTILE);
   SavedBattleGame save;save.units={&first,&runner,&enemy};
   first.visibleUnits.push_back(&enemy);
   auto known=r9eCaptureTeamKnown(&save);
   runner.visibleUnits.push_back(&enemy);
   expect(!r9eTeamSawNewHostile(&save,known),"already visible to teammate: do not stop");
 }
 {
   BattleUnit first(FACTION_PLAYER), runner(FACTION_PLAYER), enemy(FACTION_HOSTILE);
   SavedBattleGame save;save.units={&first,&runner,&enemy};
   first.seenTurn.push_back(&enemy);
   auto known=r9eCaptureTeamKnown(&save);
   runner.visibleUnits.push_back(&enemy);
   expect(!r9eTeamSawNewHostile(&save,known),"previously spotted this turn by teammate: do not stop");
 }
 {
   BattleUnit runner(FACTION_PLAYER), enemy(FACTION_HOSTILE);
   SavedBattleGame save;save.units={&runner,&enemy};
   enemy.visible=true;
   auto known=r9eCaptureTeamKnown(&save);
   runner.visibleUnits.push_back(&enemy);
   expect(!r9eTeamSawNewHostile(&save,known),"existing team-visible flag: do not stop");
 }
 {
   BattleUnit runner(FACTION_PLAYER), enemy(FACTION_HOSTILE);
   SavedBattleGame save;save.units={&runner,&enemy};
   auto known=r9eCaptureTeamKnown(&save);
   runner.visibleUnits.push_back(&enemy);
   expect(r9eTeamSawNewHostile(&save,known),"truly new hostile: stop");
   expect(!r9eTeamSawNewHostile(&save,known),"already handled in same action: do not stop twice");
 }
 {
   BattleUnit scout(FACTION_PLAYER), runner(FACTION_PLAYER), enemy(FACTION_HOSTILE);
   SavedBattleGame save;save.units={&scout,&runner,&enemy};
   auto known=r9eCaptureTeamKnown(&save);
   scout.visibleUnits.push_back(&enemy);
   expect(r9eTeamSawNewHostile(&save,known),"enemy first discovered by another teammate during action: stop");
 }
 {
   BattleUnit runner(FACTION_PLAYER), enemy(FACTION_HOSTILE);
   enemy.out=true;
   SavedBattleGame save;save.units={&runner,&enemy};
   auto known=r9eCaptureTeamKnown(&save);
   runner.visibleUnits.push_back(&enemy);
   expect(!r9eTeamSawNewHostile(&save,known),"unconscious/out enemy: ignore");
 }
 {
   BattleUnit runner(FACTION_PLAYER), friendly(FACTION_PLAYER), neutral(FACTION_NEUTRAL);
   SavedBattleGame save;save.units={&runner,&friendly,&neutral};
   auto known=r9eCaptureTeamKnown(&save);
   runner.visibleUnits={&friendly,&neutral};
   expect(!r9eTeamSawNewHostile(&save,known),"friendly and neutral units: ignore");
 }
 {
   BattleUnit runner(FACTION_PLAYER), enemy(FACTION_HOSTILE);
   SavedBattleGame save;save.units={&runner,&enemy};save.side=FACTION_HOSTILE;
   auto known=r9eCaptureTeamKnown(&save);
   runner.visibleUnits.push_back(&enemy);
   expect(!r9eTeamSawNewHostile(&save,known),"enemy turn: do not affect player stop logic");
 }
 std::cout<<"RESULT 8/8 native C++ scenarios passed\n";
 return 0;
}
'@
$cpp=Join-Path $build 'team_vision_gate_test.cpp'
[IO.File]::WriteAllText($cpp,($mock+[Environment]::NewLine+$actualHelper+[Environment]::NewLine+$tests),[Text.UTF8Encoding]::new($false))
$compiler='D:\daphne_auto\tools\winlibs64\mingw64\bin\g++.exe'
$exe=Join-Path $build 'team_vision_gate_test.exe'
$env:PATH=(Split-Path $compiler)+';'+$env:PATH
& $compiler '-std=c++17' '-O2' '-Wall' '-Wextra' $cpp '-o' $exe
if($LASTEXITCODE -ne 0){throw 'Native C++ behavioral test compilation failed'}
& $exe
if($LASTEXITCODE -ne 0){throw 'Native C++ behavioral test failed'}
"TEST_HELPER_SHA256=$((Get-FileHash $header -Algorithm SHA256).Hash)"
