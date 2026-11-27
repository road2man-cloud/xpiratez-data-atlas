// SPDX-License-Identifier: MIT
// Standalone C++17 XPZPKT1 reader and CPU animation evaluator. Not an engine importer.
#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <functional>
#include <limits>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>
namespace XPZPacket {
inline void need(bool ok,const char* why){if(!ok)throw std::runtime_error(why);}
inline uint32_t u32(const uint8_t* p){return uint32_t(p[0])|(uint32_t(p[1])<<8)|(uint32_t(p[2])<<16)|(uint32_t(p[3])<<24);}
struct Section {
    uint32_t kind,rows,cols;std::vector<uint8_t> data;
    size_t count()const{return size_t(rows)*cols;}
    uint32_t u(size_t i)const{need(kind==2&&i<count(),"bad unsigned lookup");return u32(data.data()+4*i);}
    int32_t i(size_t j)const{need(kind==4&&j<count(),"bad signed lookup");uint32_t v=u32(data.data()+4*j);int32_t n;std::memcpy(&n,&v,4);return n;}
    double f(size_t i)const{need(kind==1&&i<count(),"bad float lookup");uint32_t v=u32(data.data()+4*i);float n;std::memcpy(&n,&v,4);need(std::isfinite(n),"nonfinite float");return n;}
    void shape(uint32_t k,uint32_t r,uint32_t c)const{need(kind==k&&rows==r&&cols==c,"section shape mismatch");}
};
struct Packet {
    std::map<std::string,Section> sections;
    explicit Packet(const std::string& path){
        constexpr size_t limit=64u*1024u*1024u;std::ifstream f(path,std::ios::binary|std::ios::ate);need(bool(f),"cannot open packet");auto end=f.tellg();need(end>=12&&end<=static_cast<std::streamoff>(limit),"packet size");std::vector<uint8_t> b(static_cast<size_t>(end));f.seekg(0);need(bool(f.read(reinterpret_cast<char*>(b.data()),b.size())),"packet read failed");
        need(std::memcmp(b.data(),"XPZPKT1\0",8)==0,"bad magic");uint32_t n=u32(b.data()+8);need(n<=100000,"section count limit");size_t off=12;
        for(uint32_t i=0;i<n;i++){
            need(off+20<=b.size(),"truncated section header");auto h=b.data()+off;uint32_t nl=u32(h),k=u32(h+4),r=u32(h+8),c=u32(h+12),sz=u32(h+16);off+=20;
            need(nl>0&&nl<=200&&k>=1&&k<=4&&c>0&&off+nl<=b.size(),"bad section header");uint64_t count=uint64_t(r)*c;need(count<=limit&&count*(k==3?1u:4u)==sz&&off+nl+sz<=b.size(),"bad section size");
            std::string name(reinterpret_cast<char*>(b.data()+off),nl);off+=nl;need(name.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_./-")==std::string::npos,"invalid section name");Section s{k,r,c,{b.begin()+off,b.begin()+off+sz}};off+=sz;need(sections.emplace(name,std::move(s)).second,"duplicate section");
        }need(off==b.size(),"trailing bytes");
    }
    const Section& get(const std::string& k)const{auto it=sections.find(k);need(it!=sections.end(),"missing section");return it->second;}
    const Section* find(const std::string& k)const{auto it=sections.find(k);return it==sections.end()?nullptr:&it->second;}
};
using V3=std::array<double,3>;using V4=std::array<double,4>;using M4=std::array<double,16>;
inline M4 identity(){return {1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1};}
inline M4 mul(const M4&a,const M4&b){M4 c{};for(int i=0;i<4;i++)for(int j=0;j<4;j++)for(int k=0;k<4;k++)c[4*i+j]+=a[4*i+k]*b[4*k+j];return c;}
inline V3 transform(const M4&m,const V3&p){V3 q{};for(int i=0;i<3;i++)q[i]=m[4*i]*p[0]+m[4*i+1]*p[1]+m[4*i+2]*p[2]+m[4*i+3];return q;}
inline V4 normalized(V4 q){double n=0;for(auto x:q)n+=x*x;need(n>1e-16&&std::isfinite(n),"invalid quaternion");for(auto&x:q)x/=std::sqrt(n);return q;}
inline V4 slerp(V4 a,V4 b,double t){a=normalized(a);b=normalized(b);double d=0;for(int k=0;k<4;k++)d+=a[k]*b[k];if(d<0){for(auto&x:b)x=-x;d=-d;}d=std::clamp(d,0.,1.);if(d>.9995){for(int k=0;k<4;k++)a[k]=a[k]*(1-t)+b[k]*t;return normalized(a);}double angle=std::acos(d);for(int k=0;k<4;k++)a[k]=(a[k]*std::sin((1-t)*angle)+b[k]*std::sin(t*angle))/std::sin(angle);return normalized(a);}
inline M4 trs(V3 t,V4 q,V3 s){q=normalized(q);double x=q[0],y=q[1],z=q[2],w=q[3];M4 m={1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),t[0],2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),t[1],2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),t[2],0,0,0,1};for(int i=0;i<3;i++)for(int j=0;j<3;j++)m[4*i+j]*=s[j];return m;}
inline std::vector<double> sample(const Packet&p,const std::string&pre,double time,bool rotation=false){
    auto&t=p.get(pre+"times");auto&v=p.get(pre+"values");auto&step=p.get(pre+"step");need(t.kind==1&&t.cols==1&&t.rows>0&&v.kind==1&&v.rows==t.rows&&v.cols>0,"bad track shape");step.shape(2,1,1);need(step.u(0)<=1,"bad interpolation mode");
    uint32_t a=0,b=0;double first=t.f(0),last=t.f(t.rows-1);for(uint32_t i=1;i<t.rows;i++)need(t.f(i)>t.f(i-1),"unsorted key times");
    if(time>=last)a=b=t.rows-1;else if(time>first){uint32_t lo=0,hi=t.rows-1;while(hi-lo>1){auto mid=(lo+hi)/2;if(t.f(mid)<=time)lo=mid;else hi=mid;}a=lo;b=hi;}
    double alpha=(a==b||step.u(0))?0:(time-t.f(a))/(t.f(b)-t.f(a));std::vector<double> out(v.cols);for(uint32_t k=0;k<v.cols;k++)out[k]=(1-alpha)*v.f(size_t(a)*v.cols+k)+alpha*v.f(size_t(b)*v.cols+k);
    if(rotation){need(v.cols==4,"rotation width");V4 qa{},qb{};for(int k=0;k<4;k++){qa[k]=v.f(4*a+k);qb[k]=v.f(4*b+k);}auto q=slerp(qa,qb,alpha);out.assign(q.begin(),q.end());}return out;
}
struct Geometry{std::vector<V3> positions;std::vector<uint32_t> indices;};
inline Geometry Evaluate(const Packet&p,uint32_t node,uint32_t primitive,int clip,double time){
    if(clip>=0){auto&marker=p.get("anim/"+std::to_string(clip)+"/exists");marker.shape(2,1,1);need(marker.u(0)==1,"invalid clip marker");}
    auto&parents=p.get("node/parent");uint32_t n=parents.rows;need(n>0&&n<=4096&&node<n&&std::isfinite(time)&&clip>=-1,"node/time limit");parents.shape(4,n,1);auto&meshes=p.get("node/mesh");auto&skins=p.get("node/skin");meshes.shape(4,n,1);skins.shape(4,n,1);int mi=meshes.i(node),si=skins.i(node);need(mi>=0&&si>=-1,"node has no mesh");
    std::vector<M4> local(n),world(n);std::vector<int> state(n,0);auto&t=p.get("node/translation");auto&r=p.get("node/rotation");auto&s=p.get("node/scale");t.shape(1,n,3);r.shape(1,n,4);s.shape(1,n,3);
    for(uint32_t i=0;i<n;i++){V3 T{},S{};V4 Q{};for(int k=0;k<3;k++){T[k]=t.f(3*i+k);S[k]=s.f(3*i+k);}for(int k=0;k<4;k++)Q[k]=r.f(4*i+k);if(clip>=0){auto pre="anim/"+std::to_string(clip)+"/"+std::to_string(i)+"/";auto apply=[&](const std::string& name,auto&dst,bool rot=false){if(p.find(pre+name+"/times")){auto v=sample(p,pre+name+"/",time,rot);need(v.size()==dst.size(),"TRS track width");std::copy(v.begin(),v.end(),dst.begin());}};apply("translation",T);apply("rotation",Q,true);apply("scale",S);}local[i]=trs(T,Q,S);}
    std::function<void(uint32_t)> visit=[&](uint32_t i){need(state[i]!=1,"node cycle");if(state[i]==2)return;state[i]=1;auto j=parents.i(i);need(j>=-1&&j<int(n),"parent index");if(j>=0){visit(j);world[i]=mul(world[j],local[i]);}else world[i]=local[i];state[i]=2;};for(uint32_t i=0;i<n;i++)visit(i);
    auto mesh="mesh/"+std::to_string(mi)+"/";auto pre=mesh+"prim/"+std::to_string(primitive)+"/";auto&pos=p.get(pre+"POSITION");need(pos.rows>0&&pos.cols==3&&pos.kind==1,"position shape");auto&ix=p.get(pre+"indices");need(ix.kind==2&&ix.cols==1&&ix.rows%3==0,"index shape");
    std::vector<double> weights;auto*mw=p.find(mesh+"weights");auto*nw=p.find("node/"+std::to_string(node)+"/weights");if(nw)need(mw&&nw->cols==mw->cols,"node weight width");auto*source=nw?nw:mw;if(source){need(source->rows==1&&source->kind==1&&source->cols<=256,"morph weights shape");for(uint32_t k=0;k<source->cols;k++)weights.push_back(source->f(k));}if(clip>=0){auto a="anim/"+std::to_string(clip)+"/"+std::to_string(node)+"/weights/";if(p.find(a+"times")){auto v=sample(p,a,time);need(v.size()==weights.size(),"animated morph width");weights=std::move(v);}}
    std::vector<M4> matrices;const Section*J=nullptr;const Section*W=nullptr;if(si>=0){auto skin="skin/"+std::to_string(si)+"/";auto&j=p.get(skin+"joints");auto&ib=p.get(skin+"inverseBind");need(j.kind==2&&j.cols==1&&j.rows>0,"joint list shape");ib.shape(1,j.rows,16);for(uint32_t i=0;i<j.rows;i++){auto k=j.u(i);need(k<n,"joint node index");M4 m{};for(int row=0;row<4;row++)for(int col=0;col<4;col++)m[4*row+col]=ib.f(16*i+4*col+row);matrices.push_back(mul(world[k],m));}J=&p.get(pre+"JOINTS_0");W=&p.get(pre+"WEIGHTS_0");J->shape(2,pos.rows,4);W->shape(1,pos.rows,4);}
    Geometry result;result.positions.reserve(pos.rows);for(uint32_t i=0;i<pos.rows;i++){V3 v{};for(int k=0;k<3;k++)v[k]=pos.f(3*i+k);for(size_t m=0;m<weights.size();m++){auto*d=p.find(pre+"morph/"+std::to_string(m)+"/POSITION");if(d){d->shape(1,pos.rows,3);for(int k=0;k<3;k++)v[k]+=weights[m]*d->f(3*i+k);}}V3 q{};if(J){double sum=0;for(int k=0;k<4;k++){auto j=J->u(4*i+k);auto w=W->f(4*i+k);need(j<matrices.size()&&w>=0,"invalid influence");auto x=transform(matrices[j],v);for(int a=0;a<3;a++)q[a]+=w*x[a];sum+=w;}need(std::abs(sum-1)<.002,"weight sum");}else q=transform(world[node],v);for(auto x:q)need(std::isfinite(x),"nonfinite geometry");result.positions.push_back(q);}for(uint32_t i=0;i<ix.rows;i++){auto j=ix.u(i);need(j<pos.rows,"triangle index bounds");result.indices.push_back(j);}return result;
}
}
