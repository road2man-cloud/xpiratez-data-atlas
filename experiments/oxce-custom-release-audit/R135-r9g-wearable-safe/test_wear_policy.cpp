#include <iostream>
#include <string>
#include <cstdlib>
enum BattleType { BT_NONE, BT_MEDIKIT, BT_FLARE };
struct RuleItem { std::string id; BattleType bt; const std::string& getType() const { return id; } BattleType getBattleType() const {return bt;} };
int main() {
        auto r9fWearPriority = [](const RuleItem *rule) -> int {
            if (!rule) return -1;
            const std::string &id = rule->getType();
            // The classic medallion explicitly lowers wearer TU by 2.
            // Treasure-only rings/gems have no confirmed wear effect.
            if (id == "STR_MEDALLION" || id == "STR_RING" ||
                id == "STR_YELLOW_GEM" || id == "STR_BLUE_GEM" ||
                id == "STR_GREEN_GEM" || id == "STR_RED_GEM" ||
                id == "STR_DIAMOND") return -1;
            if (rule->getBattleType() == BT_MEDIKIT) return 10000;
            // Verified from installed Piratez ko.yml item descriptions.
            // No automatic TU-decreasing or merely decorative jewelry.
            if (id == "STR_HELLERIUM_CHARM") return 980;
            if (id == "STR_LUNAR_WARD") return 960;
            if (id == "STR_AVATAR_MEDALLION") return 940;
            if (id == "STR_HAREM_COLLAR") return 920;
            if (id == "STR_AY_GOGGLES") return 900;
            if (id == "STR_BEJEWELED_CAP") return 880;
            // R135-R9G: R9F was overly restrictive for beneficial hats.
            // These seven items have verified *worn* effects in Piratez
            // ko.yml. Keep decorative and drawback-heavy hats excluded.
            if (id == "STR_GOLDEN_MASK") return 950; // stun regen +5, protection
            if (id == "STR_GLITTERSKULL") return 930; // morale/energy regen +3
            if (id == "STR_GAS_MASK") return 910; // suffocation protection
            if (id == "STR_FUR_HAT") return 890; // cold/stun protection
            if (id == "STR_PIRATE_HAT") return 870; // morale/energy regen +1
            if (id == "STR_POLYMAKH_SHAPKA") return 850; // mind/cold protection
            if (id == "STR_RIBBON") return 830; // morale regen +1
            return -1; // Unknown effect => manual wear only.
        };
  int checks=0;
  auto check=[&](const char* id, BattleType type, bool expected){ RuleItem item{id,type}; bool allowed=r9fWearPriority(&item)>=0; if(allowed != expected){std::cerr << "FAILED " << id << " allowed=" << allowed << "\\n"; std::exit(1);} ++checks; std::cout << "PASS " << id << "\\n"; };
  check("STR_RING",BT_FLARE,false);
  check("STR_MEDALLION",BT_FLARE,false);
  check("STR_YELLOW_GEM",BT_FLARE,false);
  check("STR_BLUE_GEM",BT_FLARE,false);
  check("STR_GREEN_GEM",BT_FLARE,false);
  check("STR_RED_GEM",BT_FLARE,false);
  check("STR_DIAMOND",BT_FLARE,false);
  check("STR_ALENIUM_FAKE",BT_FLARE,false);
  check("STR_PSI_RESONATOR",BT_FLARE,false);
  check("STR_DOGE_COLLAR",BT_FLARE,false);
  check("STR_DUST_MASK",BT_FLARE,false);
  check("STR_XMED_MASK",BT_FLARE,false);
  check("STR_HELLERIUM_CHARM",BT_FLARE,true);
  check("STR_LUNAR_WARD",BT_FLARE,true);
  check("STR_AVATAR_MEDALLION",BT_FLARE,true);
  check("STR_HAREM_COLLAR",BT_FLARE,true);
  check("STR_AY_GOGGLES",BT_FLARE,true);
  check("STR_BEJEWELED_CAP",BT_FLARE,true);
  check("STR_GOLDEN_MASK",BT_FLARE,true);
  check("STR_GLITTERSKULL",BT_FLARE,true);
  check("STR_GAS_MASK",BT_FLARE,true);
  check("STR_FUR_HAT",BT_FLARE,true);
  check("STR_PIRATE_HAT",BT_FLARE,true);
  check("STR_POLYMAKH_SHAPKA",BT_FLARE,true);
  check("STR_RIBBON",BT_FLARE,true);
  check("STR_BLACK_MASK",BT_FLARE,false);
  check("STR_HITAYATE",BT_FLARE,false);
  check("STR_UNKNOWN",BT_MEDIKIT,true);
  check("STR_UNKNOWN",BT_FLARE,false);
  std::cout << "RESULT=" << checks << " native C++ wearable priority cases passed\\n";
}
