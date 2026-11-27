// SPDX-License-Identifier: MIT
// Standalone C++17 visual model staging bridge; no game source copied.
// Only trust manifests produced locally by model_stage.py. FNV is not cryptographic.
#pragma once
#include <array>
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>
#include <utility>
namespace XPZModel {
struct Caps {
    uint64_t maxJoints, maxMorphs, maxInfluences, maxTexture;
    bool weightTracks, translationTracks, npot;
};
struct Prepared {
    std::vector<uint8_t> glb;
    uint64_t joints, morphs, influenceSlots, maxTexture;
    bool weightTracks, translationTracks, npot;
};
inline uint32_t u32(const std::vector<uint8_t>& b, size_t p) {
    return uint32_t(b.at(p)) | uint32_t(b.at(p+1))<<8 | uint32_t(b.at(p+2))<<16 | uint32_t(b.at(p+3))<<24;
}
inline uint64_t decimal(const std::string& s) {
    if (s.empty() || s.size()>20 || s.find_first_not_of("0123456789")!=std::string::npos) throw std::runtime_error("bad manifest number");
    size_t used=0; auto v=std::stoull(s,&used,10);
    if (used!=s.size()) throw std::runtime_error("bad manifest number");
    return v;
}
inline Prepared ReadStaged(const std::filesystem::path& dir, const Caps& caps) {
    std::ifstream in(dir/"selection.txt",std::ios::binary);
    if (!in) throw std::runtime_error("missing completed selection");
    const std::array<std::string,9> keys={"bytes","fnv64","joints","morphs","weightTracks","translationTracks","influenceSlots","maxTexture","npot"};
    std::array<uint64_t,9> v{};
    std::string line;
    if (!std::getline(in,line) || line!="XPZMODEL1") throw std::runtime_error("bad manifest header");
    for (size_t i=0;i<keys.size();++i) {
        if (!std::getline(in,line) || line.size()>64 || line.compare(0,keys[i].size()+1,keys[i]+" ")!=0) throw std::runtime_error("bad manifest field");
        v[i]=decimal(line.substr(keys[i].size()+1));
    }
    if (std::getline(in,line)) throw std::runtime_error("trailing manifest data");
    if (v[0]<28 || v[0]>64u*1024u*1024u || v[4]>1 || v[5]>1 || v[8]>1) throw std::runtime_error("manifest bounds");
    if (v[2]>caps.maxJoints || v[3]>caps.maxMorphs || v[6]>caps.maxInfluences || v[7]>caps.maxTexture || (v[4]&&!caps.weightTracks) || (v[5]&&!caps.translationTracks) || (v[8]&&!caps.npot)) throw std::runtime_error("engine capability mismatch");
    std::ifstream file(dir/"model.glb",std::ios::binary);
    if (!file) throw std::runtime_error("missing staged model");
    std::vector<uint8_t> data(static_cast<size_t>(v[0]));
    if (!file.read(reinterpret_cast<char*>(data.data()),static_cast<std::streamsize>(data.size())) || file.peek()!=EOF) throw std::runtime_error("model length mismatch");
    uint64_t h=14695981039346656037ull; for(auto x:data) {h^=x;h*=1099511628211ull;}
    if (h!=v[1]) throw std::runtime_error("staged model changed");
    if (u32(data,0)!=0x46546c67 || u32(data,4)!=2 || u32(data,8)!=data.size()) throw std::runtime_error("bad GLB header");
    uint64_t n=u32(data,12), next=20+n;
    if (n%4 || u32(data,16)!=0x4e4f534a || next+8>data.size()) throw std::runtime_error("bad JSON chunk");
    uint64_t m=u32(data,static_cast<size_t>(next));
    if (m%4 || u32(data,static_cast<size_t>(next+4))!=0x004e4942 || next+8+m!=data.size()) throw std::runtime_error("bad BIN chunk");
    return {std::move(data),v[2],v[3],v[6],v[7],bool(v[4]),bool(v[5]),bool(v[8])};
}
// An actual engine adapter supplies an importer returning an owning handle.
// A failed/throwing importer cannot replace active. The importer must validate
// untrusted GLB and keep its own resource side effects transactional.
template<class Resource, class Importer>
bool Replace(std::unique_ptr<Resource>& active, const std::filesystem::path& dir,
             const Caps& caps, Importer importer, std::string& why) {
    try {
        auto prepared=ReadStaged(dir,caps);
        std::unique_ptr<Resource> candidate=importer(prepared);
        if (!candidate) {why="engine importer rejected model";return false;}
        active.swap(candidate); why.clear(); return true;
    } catch(const std::exception& e) {why=e.what();return false;}
}
}
