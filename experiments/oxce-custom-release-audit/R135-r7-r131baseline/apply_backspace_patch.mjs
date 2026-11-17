import fs from 'node:fs';
import path from 'node:path';
const root='D:/daphne_auto/oxce-r135-r7-r131baseline-20261117/src/Basescape';
function replaceOnce(file,search,replace) {
 const p=path.join(root,file);
 let s=fs.readFileSync(p,'utf8');
 const k=s.indexOf(search);
 if(k<0 || s.indexOf(search,k+search.length)>=0) throw Error(file+': anchor not unique: '+search);
 s=s.slice(0,k)+replace+s.slice(k+search.length);
 fs.writeFileSync(p,s);
 console.log('PATCHED '+file);
}
replaceOnce('SoldiersState.cpp',
 '_btnOk->onKeyboardPress((ActionHandler)&SoldiersState::btnTransformationsOverviewClick, SDLK_t);',
 '_btnOk->onKeyboardPress((ActionHandler)&SoldiersState::btnTransformationsOverviewClick, SDLK_t);\n\t// R135-r7: Backspace from an individual transformation list returns to overview.\n\t_btnOk->onKeyboardPress((ActionHandler)&SoldiersState::btnTransformationsBackClick, SDLK_BACKSPACE);');
replaceOnce('SoldiersState.cpp',
 'void SoldiersState::btnTransformationsOverviewClick(Action *)',
 'void SoldiersState::btnTransformationsBackClick(Action *)\n{\n\tif (_mainOffset > 0 && _cbxScreenActions &&\n\t\t_cbxScreenActions->getSelected() > _mainOffset)\n\t\tbtnTransformationsOverviewClick(nullptr);\n}\n\nvoid SoldiersState::btnTransformationsOverviewClick(Action *)');
replaceOnce('SoldiersState.h',
 'void btnTransformationsOverviewClick(Action *action);',
 'void btnTransformationsOverviewClick(Action *action);\n\tvoid btnTransformationsBackClick(Action *action);');
