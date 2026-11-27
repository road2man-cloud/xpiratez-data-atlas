// SPDX-License-Identifier: MIT
#include "mesh.hpp"
#include <iostream>
#include <fstream>
using namespace XPZLJ;
int main(int argc,char**argv){
    std::vector<V3> p={{0,0,0},{1,0,0},{0,1,0},{1,1,0}};
    std::vector<UV> u={{0,0},{1,0},{0,1},{1,1}};
    auto m=build(p,{0,1,2,2,1,3},u,7,true,2);
    check(m.indices.size()==6&&m.polys==std::vector<uint16_t>({0,3,6})&&m.material==7,"layout");
    check(m.vertices[1].p[0]==2&&m.vertices[2].p[2]==2&&m.vertices[0].n[1]==-1,"axis");
    for(auto v:m.vertices){check(std::abs(dot(v.n,v.u))<1e-10&&std::abs(dot(v.n,v.v))<1e-10&&std::abs(dot(v.u,v.v))<1e-10,"basis");}
    auto mirror=build(p,{0,1,2},{{0,0},{-1,0},{0,1},{0,0}});check(dot(cross(mirror.vertices[0].n,mirror.vertices[0].u),mirror.vertices[0].v)<0,"mirrored UV");
    auto fallback=build(p,{0,1,2,0,0,1},std::vector<UV>(4));check(fallback.degenerate==1&&fallback.uvFallback==1&&fallback.isolated==1,"fallback");
    int rejected=0;try{build(p,{0,1,9},u);}catch(...){++rejected;}try{build(p,std::vector<uint32_t>(65538,0),u);}catch(...){++rejected;}try{build(p,{0,1,2},{{16,0},{1,0},{0,1},{0,0}});}catch(...){++rejected;}check(rejected==3,"limits");
    if(argc>1){std::ofstream out(argv[1]);check(bool(out),"OBJ open");for(auto v:m.vertices)out<<"v "<<v.p[0]<<' '<<v.p[1]<<' '<<v.p[2]<<'\n';for(auto v:m.vertices)out<<"vt "<<v.uv[0]<<' '<<v.uv[1]<<'\n';for(size_t i=0;i<m.indices.size();i+=3){out<<"f";for(int k=0;k<3;++k){auto j=m.indices[i+k]+1;out<<' '<<j<<'/'<<j;}out<<'\n';}check(bool(out),"OBJ write");}
    std::cout<<"PASS: 4 vertices, 2 triangles, 3 polygon offsets, mirrored UV, fallback, 3 rejections\n";
}
