#pragma once
// XPZ3D R148S10: Ctrl+Alt+F10 toggles visibility, Ctrl+Alt+F9 cycles dock positions.
// The OXCE game is authoritative for tile, visibility, battle rules and saves.
// This is deliberately NOT a same-window renderer, and does not mutate games.
// The S2 viewer's existing R23R mouse-seal MUST remain enabled.
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <string>
#include <vector>
namespace OpenXcom {
namespace XPZ3DLaunchR148S10 {
enum Status {
    RequestQueued=1,
    RequestDebounced=2,
    CompanionMissing=3,
    WindowsProcessFailed=4
};
inline Status SendViewerRequest(bool cycleLayout) {
    // SDL repeats key presses. A short anti-repeat filter still allows a
    // deliberate second press to hide the window without a five-second wait.
    static DWORD lastToggle=0;
    static DWORD lastLayout=0;
    DWORD& lastRequest=cycleLayout?lastLayout:lastToggle;
    const DWORD now=GetTickCount();
    if(lastRequest && DWORD(now-lastRequest)<800u)return RequestDebounced;
    lastRequest=now;

    wchar_t modulePath[MAX_PATH]={0};
    const DWORD len=GetModuleFileNameW(NULL,modulePath,MAX_PATH);
    if(!len || len>=MAX_PATH)return WindowsProcessFailed;
    const std::wstring executable(modulePath,len);
    const size_t slash=executable.find_last_of(L"\\/");
    if(slash==std::wstring::npos)return WindowsProcessFailed;
    const std::wstring folder=executable.substr(0,slash);
    const size_t parentSlash=folder.find_last_of(L"\\/");
    if(parentSlash==std::wstring::npos)return CompanionMissing;
    // Only the script beside THIS EXE's parent directory may be launched:
    // <paired candidate>/oxce-runtime/openxcom.exe and its sibling script.
    const std::wstring runtime=folder.substr(0,parentSlash);
    const std::wstring filename=cycleLayout?
        L"DOCK_XPZ3D_FROM_GAME.ps1":L"TOGGLE_XPZ3D_FROM_GAME.ps1";
    const std::wstring script=runtime+L"\\"+filename;
    const DWORD attributes=GetFileAttributesW(script.c_str());
    if(attributes==INVALID_FILE_ATTRIBUTES ||
       (attributes&FILE_ATTRIBUTE_DIRECTORY))return CompanionMissing;
    wchar_t systemFolder[MAX_PATH]={0};
    const UINT sysLen=GetSystemDirectoryW(systemFolder,MAX_PATH);
    if(!sysLen || sysLen>=MAX_PATH)return WindowsProcessFailed;
    const std::wstring powershell=std::wstring(systemFolder)+
        L"\\WindowsPowerShell\\v1.0\\powershell.exe";
    const DWORD powershellAttributes=GetFileAttributesW(powershell.c_str());
    if(powershellAttributes==INVALID_FILE_ATTRIBUTES ||
       (powershellAttributes&FILE_ATTRIBUTE_DIRECTORY))
        return WindowsProcessFailed;
    // The child script alone knows how to launch an isolated, sealed S2.
    // Do not feed arbitrary command text, save paths or mission data to PS.
    const std::wstring command=L"\""+powershell+
       L"\" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \""+
       script+L"\"";
    std::vector<wchar_t> mutableCommand(command.begin(),command.end());
    mutableCommand.push_back(L'\0');
    STARTUPINFOW startup={};
    startup.cb=sizeof(startup);
    startup.dwFlags=STARTF_USESHOWWINDOW;
    startup.wShowWindow=SW_HIDE;
    PROCESS_INFORMATION process={};
    const BOOL ok=CreateProcessW(powershell.c_str(),mutableCommand.data(),
        NULL,NULL,FALSE,CREATE_NO_WINDOW,NULL,runtime.c_str(),
        &startup,&process);
    if(!ok)return WindowsProcessFailed;
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return RequestQueued;
}
inline Status ToggleViewer(){return SendViewerRequest(false);}
inline Status CycleLayout(){return SendViewerRequest(true);}
} // namespace XPZ3DLaunchR148S10
} // namespace OpenXcom
#endif
