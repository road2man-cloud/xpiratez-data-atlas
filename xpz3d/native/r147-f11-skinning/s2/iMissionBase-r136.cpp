#include "StdAfx.h"
#include "XPZ36ACRealMissionCaptureBridge.h"
#include "Transform.h"
#include "GView.h"
#include "G2DView.h"
#include "GSceneUtils.h"
#include "wInterface.h"
#include "wMainTrace.h"
#include "wUICommands.h"
#include "Sound.h"
#include "RWGame.h"
#include "RPGGame.h"
#include "RPGGlobal.h"
#include "scScenarioTracker.h"
#include "scFlowChartItems.h"
#include "Interface.h"
#include "iMain.h"
#include "iMission.h"
#include "XPZ3DLiveViewConsumer.h"
#include "XPZ3DTerrainGpuOverlayR137.h"
#include "XPZ3DF11SkinR147.h"
#include "XPZ3DActorGpuR143.h"
#include "iMissionExec.h"
#include "iShowHint.h"
#include "iShowClue.h"
#include "iIntroScreen.h"
#include "iCommonUI.h"
#include "iDesktopWindow.h"
#include "..\MiscDll\Commands.h"
#include "..\MiscDll\LogStream.h"
#include "..\DBFormat\DataFormat.h"
#include "..\DBFormat\DataLight.h"
#include "..\DBFormat\DataMap.h"
#include "..\FileIO\BasicChunk1.h"   // START_REGISTER / FINISH_REGISTER (the ui_followcamera cvar)
////////////////////////////////////////////////////////////////////////////////////////////////////
// NGame::CMissionBase -- the retail mission base class bodies (release iBase.obj; serialization-
// convergence W4.2 structural split; see iMission.h for the class banner and the tag table).
//
// Everything here only touches CMissionBase's own members. The retail mission pump (Step @0x1a3ad0 /
// InternalStep @0x1a29f0 / ProcessEvent @0x1a2010 / ExecWorldCommand @0x1a30c0) and the exit/save/
// load bind dispatch stay on the dev CMission monolith -- deferred behaviour leg.
////////////////////////////////////////////////////////////////////////////////////////////////////
namespace XPZ36AV { void BridgeTick(NWorld::IWorld*, NGame::IPlayerTracker*); int AuthenticatedActiveSourceActors(const NWorld::IWorld*); }

namespace NGame
{
////////////////////////////////////////////////////////////////////////////////////////////////////
// Shared retail CMissionBase BeginZone dispatch. Chapter scripts use this too
// (the final chapters contain only BeginZone("ffight")).
bool CMissionBase::ExecWorldBeginZoneCommand( NWorld::CUICmd *pCmd )
{
	CDynamicCast<NWorld::CUICmdBeginZone> pBeginZone( pCmd );
	if ( !pBeginZone )
		return false;
	if ( !pGlobalGame->pScenarioTracker->IsScenarioAvailable() )
		csSystem << "ERROR: Scenario not available!" << endl;
	else
	{
		NScenario::CScenarioZone *pZone = pGlobalGame->pScenarioTracker->GetZoneByName( pBeginZone->szZone );
		if ( IsValid( pZone ) )
			NMainLoop::Command( new CICBeginMission( pZone, -1, vector<string>(), pGlobalGame, true ) );
		else
			csSystem << "ERROR: Zone not found " << pBeginZone->szZone << " !" << endl;
	}
	return true;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// Shared sound branch of retail ExecWorldCommand (v1.2 0x5a4510..0x5a4619).
// Menus run world scripts too. The scene owns channels, not the queued command.
bool CMissionBase::ExecWorldSoundCommand( NWorld::CUICmd *pCmd )
{
	CDynamicCast<NWorld::CUICmdPlaySound> pSound( pCmd );
	if ( !pSound )
		return false;
	if ( IsValid( pSound->pChannel ) )
	{
		for ( list<CObj<CObjectBase> >::iterator i = soundsList.begin(); i != soundsList.end(); ++i )
			if ( *i == pSound->pChannel )
			{
				soundsList.erase( i );
				break;
			}
	}
	else if ( IsValid( pSound->pSound ) )
	{
		if ( pSound->b3DSound )
			// CSound has a single CObjectBase base at offset zero; its definition is private to Sound.cpp.
			pSound->pChannel = reinterpret_cast<CObjectBase *>( GetSoundScene()->Add3DSound(
				pSound->pSound, new NGScene::CCVec3( pSound->vPos ), 0 ) );
		else
			pSound->pChannel = GetSoundScene()->Add2DSound( pSound->pSound );
		soundsList.push_back( pSound->pChannel.GetPtr() );
	}
	return true;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// Retail v1.2 0x5a3c80: shared by tactical, strategic and front-end worlds.
bool CMissionBase::ExecWorldCommonCommand( NWorld::CUICmd *pCmd )
{
	if ( CDynamicCast<NWorld::CUICmdCameraLocator> pLoc = pCmd )
	{
		if ( IsValid( pExecLocator ) && !MustReplaceCameraExecutor( pExecLocator->GetPriority(), pLoc->GetPriority() ) )
			return true;
		if ( IsValid( pExecLocator ) )
			pExecLocator->Cancel();
		pExecLocator = CreateCameraExecutor( pLoc, this );
	}
	else if ( CDynamicCast<NWorld::CUICmdShowHint> pHint = pCmd )
	{
		if ( NGlobal::GetVar( "ui_showhints" ).GetFloat() == 1.0f || bTutorialMode )
			NMainLoop::Command( new CICShowHint( this, pHint->GetID(), pHint->pHint, pGlobalGame ) );
		else
			DoEvent( new NWorld::CCmdInterfaceEvent( pHint->GetID() ) );
	}
	else if ( CDynamicCast<NWorld::CUICmdTutorialMode> pTutorial = pCmd )
		bTutorialMode = pTutorial->bTutorial;
	else if ( CDynamicCast<NWorld::CUICmdShowClue> pClue = pCmd )
	{
		if ( IsValid( pClue->pClue ) )
			NMainLoop::Command( new CICShowClue( this, pClue->GetID(), pGlobalGame, GetActivePlayer()->GetGlobalPlayer(), pClue->pClue ) );
	}
	else if ( CDynamicCast<NWorld::CUICmdLockCamera> pLock = pCmd )
	{
		GetCamera()->FreezeCamera( pLock->bLock );
		if ( bTutorialMode )
			pActivePlayer->GetCamera()->FreezeCamera( pLock->bLock );
	}
	else if ( CDynamicCast<NWorld::CUICmdSetCameraClipDistance> pClip = pCmd )
		GetCamera()->SetClipDistance( pClip->fMinDistance, pClip->fMaxDistance );
	else if ( CDynamicCast<NWorld::CUICmdSetFloor> pFloor = pCmd )
		SetCutFloor( pFloor->nFloor );
	else if ( CDynamicCast<NWorld::CUICmdAIUnitWillMove> pMove = pCmd )
	{
		if ( IsValid( pMove->pUnit ) && IsValid( pActivePlayer ) && IsValid( pWorld ) )
		{
			NDb::EDiplomacyState state = pWorld->GetDiplomacyState( pActivePlayer->GetPlayer(), pMove->pUnit->GetPlayer() );
			if ( state == NDb::DS_ENEMY )
				pRender->FlashUnit( pMove->pUnit, CVec4( 78.0f / 255, 20.0f / 255, 0, 0 ) );
			else if ( state == NDb::DS_NEUTRAL || state == NDb::DS_ALLY )
				pRender->FlashUnit( pMove->pUnit, CVec4( 0, 77.0f / 255, 78.0f / 255, 0 ) );
		}
	}
	else if ( CDynamicCast<NWorld::CUICmdSetAmbient> pAmbient = pCmd )
	{
		NDb::CAmbientLightReal *pDefault = pWorld->GetDefaultLight();
		if ( pAmbient->bImmediate && pDefault )
			GetScene()->SetAmbient( pDefault );
		else if ( !pAmbient->pLight )
			SetLightMode( nLightMode );
		else
		{
			static SRand rnd;
			CPtr<NDb::CAmbientLightReal> pLight = pAmbient->pLight->GetLight( &rnd, pWorld->GetCreateFlags() );
			if ( IsValid( pLight ) )
				GetScene()->SetAmbient( pLight );
		}
	}
	else if ( CDynamicCast<NWorld::CUICmdSetAmbientEffect> pAmbient = pCmd )
	{
		static SRand rnd;
		NDb::CEffect *pEffect = IsValid( pAmbient->pEffect ) ? pAmbient->pEffect->GetEffect( &rnd, pWorld->GetCreateFlags() ) : 0;
		GetScene()->SetAmbientEffect( pEffect, pRender->GetTime()->GetValue(), pRender->GetTime() );
	}
	else if ( CDynamicCast<NWorld::CUICmdPlayEffect> pEffect = pCmd )
	{
		static SRand rnd;
		if ( IsValid( pEffect->pEffect ) )
		{
			SFBTransform place;
			MakeMatrix( &place, CVec3( 1, 1, 1 ), pEffect->vPos, 0 );
			pEffect->pHandle = GetScene()->CreateParticles( pEffect->pEffect->GetEffect( &rnd, pWorld->GetCreateFlags() ),
				pRender->GetTime()->GetValue(), pRender->GetTime(), place );
		}
	}
	else if ( ExecWorldBeginZoneCommand( pCmd ) || ExecWorldSoundCommand( pCmd ) )
	{
	}
	else if ( CDynamicCast<NWorld::CUICmdPlayVideo> pVideo = pCmd )
		PlayVideoSequence( this, pVideo->GetID(), pVideo->szFileName, false );
	else
		return false;
	return true;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
void CMissionBase::UpdateWorldCameraCommand( const STime &sTime )
{
	if ( IsValid( pExecLocator ) && pExecLocator->Update( sTime ) )
	{
		pExecLocator->Finished();
		pExecLocator = 0;
	}
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail NGame::iBaseInit::iBaseInit @0x1a4610 (iBase.obj): registers the "ui_followcamera" cvar
// (default 1) backing bCameraShowEnemyActions -- the "camera follows enemy actions" game option.
// CMissionBase::GetFollowCameraState @0x1a1790 returns it; it gates the GetCamera selector's
// enemy-turn-follow and camera-locator legs (@0x1a1ee0). Retail binds the bool directly through
// RegisterVar; the dev RegisterVar is handler-based (same pattern as cheat_showall).
static bool bCameraShowEnemyActions = true;
static void VarFollowCamera( const string &szID, const NGlobal::CValue &sValue, void *pContext )
{
	bCameraShowEnemyActions = sValue.GetFloat() != 0;
}
START_REGISTER(iMissionBase)
	REGISTER_VAR( "ui_followcamera", VarFollowCamera, 1, true )   // retail iBaseInit @0x1a4610: bSave=true (line in config.cfg)
FINISH_REGISTER
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::CMissionBase @0x1a2c70 (default ctor member defaults; the retail exit/save/
// load binds constructed there stay on the dev CMission). The time counters are wired exactly like
// retail: pTimeFunc/pUITimeFunc adopt the counters' CCTime nodes.
CMissionBase::CMissionBase():
	bPause( false ), bRenderWorld( true ), nDeltaTime( 0 ),
	bHideInterface( false ), bSpecialHideInterface( false ),
	bWaitForPartFinished( false ), nLightMode( 0 ), bCheatVisibility( false ), bTutorialMode( false ),
	bCanSave( true ), bCanRestart( false ),
	sLastUpdateTime( 0 ), sMinFrameTime( 0 ), sFPSLimitLastTime( 0 )
{
	pTimeFunc = sTimeCounter.GetTime();
	pUITimeFunc = sUITimeCounter.GetTime();
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::Command @0x1a18f0: forward to the active player's commander
void CMissionBase::Command( NWorld::CCommand *pCmd )
{
	ASSERT( pCmd );
	pActivePlayer->GetCommander()->Do( pCmd );
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::DoEvent @0x1a2fa0 (mission vtbl+0x2c): forward to the active player's
// commander EVENTS channel -- never forces an interrupt, drained unconditionally each CWorld::Segment
void CMissionBase::DoEvent( NWorld::CCommand *pCmd )
{
	ASSERT( pCmd );
	pActivePlayer->GetCommander()->DoEvent( pCmd );
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::OnGetFocus @0x1a19c0: back on top of the interface stack -- re-baseline the
// render/mixer timers over the covered gap and resume every frozen channel
void CMissionBase::OnGetFocus()
{
	pRender->ResetTiming();	// retail @0x2cb190 forwards to both sound mixers
	pSoundScene->Pause( false );
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::OnLostFocus @0x1a19e0: a menu covered the mission -- freeze every live channel
// (this is why retail goes silent in the pause MENU but not on the Pause/Break realtime pause)
void CMissionBase::OnLostFocus()
{
	pSoundScene->Pause( true );
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::Command @0x1a15b0: wrap in CCmdSetCommand (+ CCmdContinue when instant),
// dispatched through the virtual single-command slot
void CMissionBase::Command( NWorld::CUnit *pUnit, NWorld::CCmd *pCmd, bool bInstantly )
{
	ASSERT( pUnit );
	ASSERT( pCmd );
	Command( new NWorld::CCmdSetCommand( pUnit, pCmd ) );

	if ( bInstantly )
		Command( new NWorld::CCmdSetCommand( pUnit, new NWorld::CCmdContinue ) );
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::StopAction @0x1a29d0
void CMissionBase::StopAction()
{
	pActivePlayer->GetCommander()->StopAction();
}
////////////////////////////////////////////////////////////////////////////////////////////////////
bool CMissionBase::IsReady() const
{
	// Retail v1.2 0x5a2a20: client sequence, AI player, turn/action, then top desktop.
	if ( IsSequence() || pActivePlayer->IsAIPlayer() )
		return false;

	if ( !IsRealTime() && ( IsActionExecuted() || ( pWorld->GetCurrentPlayer() != pActivePlayer->GetPlayer() ) ) )
		return false;

	NUI::CDesktopWindow *pDesktop = GetDesktop();
	return !IsValid( pDesktop ) || pDesktop->IsReady();
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::IsActionExecuted @0x1a3e30
bool CMissionBase::IsActionExecuted() const
{
	return pWorld->IsExecuting() || pActivePlayer->GetCommander()->HasCommands();
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::IsRealTime @0x1a1900
bool CMissionBase::IsRealTime() const
{
	return pWorld->GetCurrentPlayer() == 0;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::PauseGame @0x1a16a0 / IsGamePaused @0x1a16b0
void CMissionBase::PauseGame( bool bState )
{
	bPause = bState;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
bool CMissionBase::IsGamePaused() const
{
	return bPause;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::GetActivePlayer @0x1a1950
IPlayerTracker* CMissionBase::GetActivePlayer() const
{
	ASSERT( pActivePlayer );
	return pActivePlayer;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::SetActivePlayer @0x1a2480
void CMissionBase::SetActivePlayer( IPlayerTracker* pPlayer )
{
	ASSERT( find( playersSet.begin(), playersSet.end(), pPlayer ) != playersSet.end() );
	pActivePlayer = pPlayer;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::GetPlayers @0x1a3f90
void CMissionBase::GetPlayers( vector< CPtr<IPlayerTracker> > *pPlayersSet ) const
{
	ASSERT( pPlayersSet );
	pPlayersSet->clear();
	pPlayersSet->resize( playersSet.size() );
	for ( int nTemp = 0; nTemp < playersSet.size(); nTemp++ )
		(*pPlayersSet)[nTemp] = playersSet[nTemp].GetPtr();
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::GetUnits @0x1a1960 / GetSelectedUnits @0x1a1970 / CountSelected @0x1a1980 /
// Select @0x1a1990 / SelectNext @0x1a19a0 / SelectPrev @0x1a19b0 -- forwards to the active tracker
void CMissionBase::GetUnits( vector< CPtr<IUnitTracker> > *pUnits ) const
{
	pActivePlayer->GetUnits( pUnits );
}
////////////////////////////////////////////////////////////////////////////////////////////////////
void CMissionBase::GetSelectedUnits( vector< CPtr<IUnitTracker> > *pUnits ) const
{
	pActivePlayer->GetSelectedUnits( pUnits );
}
////////////////////////////////////////////////////////////////////////////////////////////////////
int CMissionBase::CountSelected()
{
	return pActivePlayer->CountSelected();
}
////////////////////////////////////////////////////////////////////////////////////////////////////
void CMissionBase::Select( NWorld::CUnit *pUnit, bool bAdditive )
{
	pActivePlayer->Select( pUnit, bAdditive );
}
////////////////////////////////////////////////////////////////////////////////////////////////////
void CMissionBase::SelectNext()
{
	pActivePlayer->SelectNext();
}
////////////////////////////////////////////////////////////////////////////////////////////////////
void CMissionBase::SelectPrev()
{
	pActivePlayer->SelectPrev();
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::IsPlayerTurn @0x1a1910: false only in turn-based play while the world's
// current player (world vtbl+0x60 GetCurrentPlayer) is not the active tracker's player.
bool CMissionBase::IsPlayerTurn() const
{
	if ( !IsRealTime() && pWorld->GetCurrentPlayer() != pActivePlayer->GetPlayer() )
		return false;
	return true;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::GetFollowCameraState @0x1a1790: the ui_followcamera option flag.
bool CMissionBase::GetFollowCameraState() const
{
	return bCameraShowEnemyActions;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::GetCamera @0x1a1ee0 -- the camera SELECTOR. The mission owns TWO kinds of
// camera: its own pCamera (base tag 18) is the CINEMATIC camera (sequences, enemy-turn follow,
// camera-locator focus -- the camera the scripts lock/steer, routinely saved with nLockCount >= 1),
// and each player tracker owns the camera the PLAYER drives (tracker tag 10). Selection:
//  - a scripted sequence -> the cinematic camera, unconditionally;
//  - enemy turn with ui_followcamera on -> the cinematic camera;
//  - a live camera-locator exec with ui_followcamera on, outside the HQ base (world vtbl+0x1dc =
//    CWorld::IsBase @0x376e20) -> the cinematic camera;
//  - else -> the ACTIVE PLAYER's camera; the cinematic camera's unlock-intent latches are cleared
//    by a net-zero FreezeCamera(true)/(false) pair (@0xcffc0 clears them on the freeze).
// Tail: if the chosen camera reports UserWantedItToUnlock (@0xd0020 -- the user gave camera input
// while it was locked/following), hand control back to the player's camera, carrying the current
// pose over on the one-shot bJustWanted so the view does not jump.
ICamera* CMissionBase::GetCamera() const
{
	if ( IsSequence() )
		return pCamera;

	ICamera *pCam;
	if ( GetFollowCameraState() && !IsPlayerTurn() )
		pCam = pCamera;
	else if ( GetFollowCameraState() && IsValid( pExecLocator ) && !GetWorld()->IsBase() )
		pCam = pCamera;
	else
	{
		pCamera->FreezeCamera( true );
		pCamera->FreezeCamera( false );
		pCam = pActivePlayer->GetCamera();
	}

	bool bJustWanted = false;
	if ( pCam->UserWantedItToUnlock( &bJustWanted ) )
	{
		if ( bJustWanted && pCam != pActivePlayer->GetCamera() )
		{
			ICamera::SCameraPos sPos;
			pCam->GetPlacement( &sPos );
			pActivePlayer->GetCamera()->SetPlacement( sPos );
		}
		pCam = pActivePlayer->GetCamera();
	}
	return pCam;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::FocusCameraOnUnit @0x1a16e0: anchor the camera on the unit + cut the scene
// to the unit's floor. Retail focuses the LIVE camera (@0x5a16e8 GetCamera, mission vtbl+0xb8), not
// pCamera -- which is usually NOT the rendered one, so focusing it moved nothing.
void CMissionBase::FocusCameraOnUnit( NWorld::CUnit *pUnit )
{
	ICamera *pCam = GetCamera();
	CVec3 pt = pUnit->GetPosition().pos.GetCP();
	pt.z += 0.5f;
	pCam->FocusOnPlace( pt, pUnit->GetPosition().pos.GetFloor() );
	GetScene()->SetCutFloor( pCam->GetCutFloor() );
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::FocusCameraOnItem @0x1a1740 (mission vtbl+0xc4): anchor the camera on the
// item's position and cut the scene to the item's floor -- the same camera anchor+floor call as
// FocusCameraOnUnit @0x1a16e0, minus that path's +0.5z lift (items anchor on their pos).
// Fired by the in-world hint/clue icons' RBUTTONUP (retail SEvent 0x6000034).
void CMissionBase::FocusCameraOnItem( NWorld::IItem *pItem )
{
	ICamera *pCam = GetCamera();							// @0x5a1740: the LIVE camera, as above
	pCam->FocusOnPlace( pItem->GetPos(), pItem->GetFloor() );
	GetScene()->SetCutFloor( pCam->GetCutFloor() );
}
////////////////////////////////////////////////////////////////////////////////////////////////////
NUI::ICursor* CMissionBase::GetCursor() const
{
	return pCursor;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
NUI::CInterface* CMissionBase::GetInterface() const
{
	return pInterface;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::IsInterfaceHidden @0x19de80
bool CMissionBase::IsInterfaceHidden() const
{
	return bHideInterface;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::SetWaitForPartFinished @0x19de90 / IsWaitForPartFinished @0x19dea0
void CMissionBase::SetWaitForPartFinished( bool bState )
{
	bWaitForPartFinished = bState;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
bool CMissionBase::IsWaitForPartFinished() const
{
	return bWaitForPartFinished;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::PopDesktop @0x1a2fc0: pop from the back until the requested desktop popped
void CMissionBase::PopDesktop( NUI::CDesktopWindow *pDesktop )
{
	for ( int nTemp = 0; nTemp < desktopWindowsList.size(); nTemp++ )
	{
		NUI::CDesktopWindow *pTempWnd = desktopWindowsList.back();
		desktopWindowsList.pop_back();

		if ( pTempWnd == pDesktop )
			break;
	}
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::PushDesktop @0x1a3030
void CMissionBase::PushDesktop( NUI::CDesktopWindow *pDesktop )
{
	desktopWindowsList.push_back( pDesktop );
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::GetDesktop @0x1a2000 returns the list back UNCHECKED (the retail mission
// desktop always sits at the bottom of the list); the dev adds the empty guard for the
// CRenderBaseInterface-family, whose list stays empty.
NUI::CDesktopWindow* CMissionBase::GetDesktop() const
{
	if ( !desktopWindowsList.empty() )
		return desktopWindowsList.back();

	return 0;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::SetCheatVisibility @0x19deb0 / GetCheatVisibility @0x19dec0
void CMissionBase::SetCheatVisibility( bool bState )
{
	bCheatVisibility = bState;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
bool CMissionBase::GetCheatVisibility() const
{
	return bCheatVisibility;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::GetRPGGame @0x19df10 / GetWorld / GetScene @0x103d20 / GetSoundScene
// @0x19df20 / GetRenderGame @0x19df30
NRPG::CGlobalGame* CMissionBase::GetRPGGame() const
{
	return pGlobalGame;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
NWorld::IWorld* CMissionBase::GetWorld() const
{
	return pWorld;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
NGScene::IGameView* CMissionBase::GetScene() const
{
	return pScene;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
NSound::ISoundScene* CMissionBase::GetSoundScene() const
{
	return pSoundScene;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
NRender::IRenderGame* CMissionBase::GetRenderGame() const
{
	return pRender;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail COMDAT-stub default (out-of-line: CTransformStack is forward-declared in iMission.h);
// CMission overrides with its real per-frame transform.
const CTransformStack& CMissionBase::GetCameraTransform() const
{
	static CTransformStack ts;
	return ts;
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::SetLightMode @0x1a2640 -- ONE body on the base (the dev previously carried
// identical copies on CMission and CRenderBaseInterface; consolidated here)
void CMissionBase::SetLightMode( int _nLightMode )
{
	CDBTable<NDb::CTAmbientLight> *pTable = NDatabase::GetTable<NDb::CTAmbientLight>();
	CDBIterator<NDb::CTAmbientLight> it( *pTable );
	int nCount = _nLightMode;
	while ( it.MoveNext() )
	{
		SRand rnd;
		CPtr<NDb::CAmbientLightReal> pLight = it.Get()->GetLight( &rnd );
		if ( !pLight->bInGameUse )
			continue;
		if ( nCount == 0 )
		{
			nLightMode = _nLightMode;
			pLightSource = 0;
			csSystem << "Light with ID = " << it.Get()->GetRecordID() << " selected" << endl;
			GetScene()->SetAmbient( pLight );
			return;
		}
		nCount--;
	}
	if ( _nLightMode == 0 )
	{
		// no lighting in table, using default one
		nLightMode = 0;
		GetScene()->SetAmbient( 0 );
		pLightSource = GetScene()->AddDirectionalLight( CVec3(0.5f,0.4f,0.45f), CVec3( 0.6f,1.4f,-1), CVec3(5,5,0), CVec2( 150, 150 ), 20 );
		GetScene()->SetAmbient( CVec3( 0.20f, 0.20f, 0.20f ), CVec3( 0.20f, 0.20f, 0.20f ) );
	}
	else
		SetLightMode( 0 );
}
////////////////////////////////////////////////////////////////////////////////////////////////////
// retail CMissionBase::RenderFrame @0x1a19f0 (was the dev CMission::RenderFrame -- the body only
// touches base members, so it lands here per the retail placement; CMission no longer overrides it).
// Param 2 is the ADVANCE flag (retail PDB: (int,bool,ICamera*,bool)) -- the old dev `const STime&`
// was a mis-decode. Interface rendering uses GetUITime(); sound now follows the Sentinels fix below.
void CMissionBase::RenderFrame( int nMode, bool bAdvanceTime, ICamera *pCamera, bool bShowUnits )
{
    // Only the original tactical CMission's own active ICamera, viewport,
    // actual IGScene draw and UI composition can arm the capture.
    bool xpz36acWorldDrawn=false;
    bool xpz36acMissionHudDrawn=false;
    float xpz36acViewport[4]={0.f,0.f,0.f,0.f};
    // r24AU real in-process S2 player tracker accounting. This observes
    // the actual deployed Nival IUnitTracker objects; never invents units
    // or edits OXCE data, AI, camera, or the actor simulation.
    if ((nMode & N_RENDERMODE_3D) && IsValid(pWorld) && IsValid(pActivePlayer))
        XPZ36AV::BridgeTick(pWorld.GetPtr(), pActivePlayer.GetPtr());
    static bool xpz36auRealRosterRecorded=false;
    if(!xpz36auRealRosterRecorded && IsValid(pActivePlayer) &&
       IsValid(pWorld) && (nMode&N_RENDERMODE_3D)){
        char deployedGate[8]={0},navBypass[8]={0};
        const bool optin=GetEnvironmentVariableA(
          "XPZ3D_STAGE36_R24AU_RECORD_ACTUAL_DEPLOYED_UNITS",
          deployedGate,sizeof(deployedGate))==1&&deployedGate[0]=='1';
        const bool noNavBypass=GetEnvironmentVariableA(
          "XPZ3D_STAGE36_R24AJ_VISUAL_ONLY_SKIP_NAV_COLOUR",
          navBypass,sizeof(navBypass))==1&&navBypass[0]=='0';
        if(optin&&noNavBypass){
          vector< CPtr<IUnitTracker> > actualUnits;
          pActivePlayer->GetUnits(&actualUnits);
          FILE* fp=0;
          if(fopen_s(&fp,"_xpz_stage25_map.log","a")==0&&fp){
            fprintf(fp,"event=r24au_actual_native_s2_player_units"
              " real_tracker_units=%u native_nav_bypass=0"
              " source_game_executable=1 actor_identity_from_live_S2=1\\n",
              (unsigned)actualUnits.size());
            fclose(fp);
          }
          xpz36auRealRosterRecorded=true;
        }
    }
	if ( nMode & N_RENDERMODE_3D )
	{
        // Stage 36 r24AP: position the REAL Nival S2 ICamera over the
        // source-certified 40x40 X-Piratez scene. Prior no-deploy harness
        // camera anchor was near (0,0,0), outside nearly all source mesh.
        // This changes no geometry, render logic or D3D drawing path.
        // Diagnostic only: stage35 gameplay camera remains untouched.
        char xpzR24APVisualOnly[8]={0};
        const bool xpzR24APCenter=
            GetEnvironmentVariableA("XPZ3D_STAGE36_R24AP_REAL_S2_CAMERA_CENTER",
                xpzR24APVisualOnly,sizeof(xpzR24APVisualOnly))==1 &&
            xpzR24APVisualOnly[0]=='1';
        if(xpzR24APCenter && pCamera && IsValid(pScene)){
            char cameraPreset[8]={0};
            const DWORD pn=GetEnvironmentVariableA(
                "XPZ3D_STAGE36_R24AP_CAMERA_PRESET",cameraPreset,sizeof(cameraPreset));
            const int cameraMode=pn==1 && cameraPreset[0]>='0' &&
                cameraPreset[0]<='3' ? (cameraPreset[0]-'0') : 0;
            ICamera::SCameraPos realS2Pose;
            pCamera->GetPlacement(&realS2Pose);
            realS2Pose.ptAnchor=CVec3(25.f,25.f,4.0f);
            realS2Pose.fRod=44.f;
            realS2Pose.fPitch=-1.134464f;
            realS2Pose.fYaw=-1.134464f;
            realS2Pose.fRoll=0.f;
            realS2Pose.fFOV=45.f;
            if(cameraMode==1){
                realS2Pose.ptAnchor=CVec3(25.f,25.f,0.f);
                realS2Pose.fRod=65.f;
                realS2Pose.fPitch=-1.35f;
                realS2Pose.fFOV=50.f;
            } else if(cameraMode==2){
                realS2Pose.ptAnchor=CVec3(15.f,20.f,4.f);
                realS2Pose.fRod=37.f;
                realS2Pose.fPitch=-0.78f;
                realS2Pose.fYaw=-0.58f;
            } else if(cameraMode==3){
                realS2Pose.ptAnchor=CVec3(8.f,20.f,3.f);
                realS2Pose.fRod=30.f;
                realS2Pose.fPitch=-1.0f;
                realS2Pose.fYaw=-0.85f;
            }
            pCamera->SetPlacement(realS2Pose);
            pCamera->SetCutFloor(11);
            pScene->SetCutFloor(11);
            static bool logged=false;
            if(!logged){
                FILE *fp=0;
                if(fopen_s(&fp,"_xpz_stage25_map.log","a")==0&&fp){
                    fprintf(fp,"event=r24ap_real_s2_camera_centered preset=%d x=%.2f y=%.2f z=%.2f rod=%.2f pitch=%.3f yaw=%.3f cut_floor=%d real_s2_game_3d=1\n",
                        cameraMode,realS2Pose.ptAnchor.x,realS2Pose.ptAnchor.y,
                        realS2Pose.ptAnchor.z,realS2Pose.fRod,
                        realS2Pose.fPitch,realS2Pose.fYaw,pScene->GetCutFloor());
                    fclose(fp);
                }
                logged=true;
            }
        }
        // r24-EH: override only the existing S2 camera placement using
        // authoritative OXCE camera telemetry. S2 still owns and executes
        // the identical native IGScene/Direct3D render path.
        // No additional renderer, no GPU texture readback, no images.
        const bool xpzS2CameraLinked=XPZ3DLiveViewConsumer::Apply(pCamera);
        // R142: native visual-only chunk mesh; OXCE retains collision authority.
        static XPZ3DTerrain::RingConsumer terrainReceiver;
        static XPZ3DTerrain::DirtyChunkCache terrainCache;
        static XPZ3DTerrain::NativeGpuOverlay terrainOverlay;
        XPZ3DTerrainPacket terrainChunk={};
        for(int budget=0;budget<4 && terrainReceiver.Next(terrainChunk);++budget) {
            terrainOverlay.SyncSession(GetScene(),terrainChunk);
            if(!terrainCache.Apply(terrainChunk))continue;
            const XPZ3DTerrain::VisualChunk mesh=XPZ3DTerrain::BuildVisualChunk(terrainChunk);
            terrainOverlay.Apply(GetScene(),terrainChunk,mesh);
        }
        // R143: visual-only OXCE unit roster, player fog remains authoritative.
        static XPZ3DActorR143::Consumer actorReader;
        static XPZ3DActorR143::NativeActorOverlay actorOverlay;
        static XPZ3DF11R147::NativeOverlay f11Overlay;
        static DWORD actorLastReceived=0;
        XPZ3DActorFrameR143 actorFrame={};
        if(actorReader.Read(actorFrame)) {
            actorLastReceived=GetTickCount();
            actorOverlay.Apply(GetScene(),actorFrame);
            f11Overlay.Apply(GetScene(),actorFrame);
        } else if(actorLastReceived && DWORD(GetTickCount()-actorLastReceived)>1500u) {
            actorOverlay.Reset();
            f11Overlay.Reset();
            actorLastReceived=0;
        }
        // R136: record real native render-frame progress at a bounded rate.
        // No screenshot, simulated frames, or gameplay state modifications.
        static DWORD xpz136LastFrameTrace=0;
        const DWORD xpz136Now=GetTickCount();
        if(!xpz136LastFrameTrace || DWORD(xpz136Now-xpz136LastFrameTrace)>=2000u)
        {
            char xpz136Path[MAX_PATH]={0};
            const DWORD n=GetEnvironmentVariableA("XPZ3D_R136_FRAME_TRACE",
                                                   xpz136Path,MAX_PATH);
            if(n>0 && n<MAX_PATH)
            {
                FILE *f=fopen(xpz136Path,"ab");
                if(f)
                {
                    fprintf(f,"R136_S2_RENDER_FRAME pid=%lu tick=%lu camera_applied=%d mode=%d\n",
                        (unsigned long)GetCurrentProcessId(),
                        (unsigned long)xpz136Now,
                        xpzS2CameraLinked?1:0,nMode);
                    fclose(f);
                }
            }
            xpz136LastFrameTrace=xpz136Now;
        }
		CTransformStack ts;
		pCamera->GetTransform( &ts, pScene->GetScreenRect() );

		// ORIGINAL RETAIL BUG FIXED: v1.2 0x5a2613 passes raw GetTime(), which omits
		// fast-forwarded enemy turns. Sentinels 0x497fb1 calls GetGameTime (0x49aca0)
		// instead, keeping playback on the epoch used to stamp world sound events.
		// The mixer must also consume the full delta (RWSound.cpp), not clamp it once.
		pRender->UpdateSound( bAdvanceTime, &ts, GetGameTime() );

		const CTRect<float> &rScreen = pCamera->GetScreenRect();
		if ( ( rScreen.Width() != 0 ) && ( rScreen.Height() != 0 ) )
		{
			NGScene::IGameView::SDrawInfo drawInfo;
			drawInfo.pTS = &ts;
			drawInfo.vOrigin = CVec2( rScreen.x1, rScreen.y1 );
			drawInfo.vSize = CVec2( rScreen.x2 - rScreen.x1, rScreen.y2 - rScreen.y1 );
			drawInfo.bUseDefaultClearColor = true;
			drawInfo.vClearColor = CVec3(0.25f,0.25f,0.25f); // not used due to using default clear color
			pScene->Draw( drawInfo );
            xpz36acWorldDrawn=true;
            xpz36acViewport[0]=rScreen.x1;
            xpz36acViewport[1]=rScreen.y1;
            xpz36acViewport[2]=rScreen.x2;
            xpz36acViewport[3]=rScreen.y2;
		}
	}

	if ( !bHideInterface && !bSpecialHideInterface && ( nMode & N_RENDERMODE_2D ) )
    {
		pInterface->Draw( GetUITime() );	// original S2 tactical HUD
        xpz36acMissionHudDrawn=true;
    }

	float fFrameTime = NGScene::GetFrameTime();
	static float fMinFrameTime = 1, fMaxFrameTime = 1e-4f, fElapsed = 0;
	static int nFrames;
	fMinFrameTime = Min( fMinFrameTime, fFrameTime );
	fMaxFrameTime = Max( fMaxFrameTime, fFrameTime );
	fElapsed += fFrameTime;
	++nFrames;
	if ( fElapsed > 3 )
	{
		DebugTrace( "min %f max %f average %f\n", 1 / fMaxFrameTime, 1 / fMinFrameTime, nFrames / fElapsed );
		fMinFrameTime = 1;
		fMaxFrameTime = 1e-4f;
		fElapsed = 0;
		nFrames = 0;
	}

    // Stage r24-DX: preview-only native S2 real-scene presentation.
    // We never change AI, actor, or game HUD behaviour for normal gameplay.
    // Rendering must have already happened via the actual pScene->Draw().
    char r24dxFlag[4]={0},r24dxView[4]={0},
         r24dxSeal[4]={0},r24dxHeadless[4]={0};
    const bool r24dxRequested=
        GetEnvironmentVariableA("XPZ3D_STAGE36_R24DX_SOURCE_SCENE_PRESENT",
          r24dxFlag,sizeof(r24dxFlag))==1u&&r24dxFlag[0]=='1' &&
        GetEnvironmentVariableA("XPZ3D_STAGE36_R24DT_RENDER_PREVIEW_ONLY",
          r24dxView,sizeof(r24dxView))==1u&&r24dxView[0]=='1' &&
        GetEnvironmentVariableA("XPZ3D_STAGE35_R23R_INPUT_SEAL",
          r24dxSeal,sizeof(r24dxSeal))==1u&&r24dxSeal[0]=='1' &&
        GetEnvironmentVariableA("XPZ3D_STAGE35_R23P_HEADLESS_PASSIVE",
          r24dxHeadless,sizeof(r24dxHeadless))==1u&&r24dxHeadless[0]=='1';
    const bool sourceReady=XPZ36ACSignedSourceReady()!=0;
    const bool authenticPreview=r24dxRequested&&xpz36acWorldDrawn&&
          sourceReady&&IsValid(pWorld)&&IsValid(pScene)&&pCamera!=0;
    // r24-DY: native gameplay source soldier roster, not visual-only preview.
    // Require real S2 actor presence in THIS world, original nav path, and
    // the existing authenticated X-Piratez spawn bridge. Without all gates
    // the retail S2 RenderFrame/Flip code is bit-for-bit behaviourally intact.
    char liveFlag[4]={0},nativeFlag[4]={0},navFlag[4]={0};
    const bool r24dyEnabled=
        GetEnvironmentVariableA("XPZ3D_STAGE36_R24DY_LIVE_SOURCE_ACTORS",
          liveFlag,sizeof(liveFlag))==1u&&liveFlag[0]=='1' &&
        GetEnvironmentVariableA("XPZ3D_STAGE36_R24AV_NATIVE_UNIT_BRIDGE",
          nativeFlag,sizeof(nativeFlag))==1u&&nativeFlag[0]=='1' &&
        GetEnvironmentVariableA("XPZ3D_STAGE36_R24AJ_VISUAL_ONLY_SKIP_NAV_COLOUR",
          navFlag,sizeof(navFlag))==1u&&navFlag[0]=='0' &&
        !r24dxRequested&&IsValid(pWorld)&&IsValid(pActivePlayer)&&
        IsValid(pScene)&&pCamera!=0;
    const int activeSourceActors=r24dyEnabled?
        XPZ36AV::AuthenticatedActiveSourceActors(pWorld.GetPtr()):0;
    const bool sourceActorWorldDrawn=r24dyEnabled&&
        activeSourceActors>0&&xpz36acWorldDrawn&&sourceReady;
    static bool r24dyVisibleLogged=false;
    if(sourceActorWorldDrawn&&!r24dyVisibleLogged){
        FILE *f=0;
        if(fopen_s(&f,"_xpz_stage25_map.log","a")==0&&f){
            fprintf(f,"event=r24dy_real_oxce_soldiers_native_igscene"
                      " actors=%d source_mcd=1 actual_s2_world=1"
                      " full_native_nav=1 render_preview=0\\n",
                    activeSourceActors);
            fclose(f);
        }
        r24dyVisibleLogged=true;
    }
    static bool r24dxDiagnosticLogged=false,r24dxForcedOnce=false;
    if(r24dxRequested&&!r24dxDiagnosticLogged) {
        FILE *f=0;
        if(fopen_s(&f,"_xpz_stage25_map.log","a")==0&&f) {
            fprintf(f,"event=r24dx_real_s2_RenderFrame"
              " nMode=%d scene=%d hud=%d signed=%d world=%d"
              " render_only=1\n",nMode,
              xpz36acWorldDrawn?1:0,xpz36acMissionHudDrawn?1:0,
              sourceReady?1:0,IsValid(pWorld)?1:0);
            fclose(f);
        }
        r24dxDiagnosticLogged=true;
    }
    // Retail mode 8 suppresses NGScene::Flip. Only permit ONE bounded
    // override for an already drawn, signed real S2 3D world in the
    // sealed preview; never substitute for gameplay frame/HUD validation.
    const bool r24dxForce=(nMode&8)&&(authenticPreview||sourceActorWorldDrawn)&&!r24dxForcedOnce;
    if(!(nMode&8)||r24dxForce) {
        if(r24dxForce)r24dxForcedOnce=true;
        if(xpz36acWorldDrawn&&sourceReady&&IsValid(pScene)&&pCamera &&
           (xpz36acMissionHudDrawn||authenticPreview||sourceActorWorldDrawn)) {
            ICamera::SCameraPos realPose;
            pCamera->GetPlacement(&realPose);
            XPZ36ACMissionFrameComposed(
                xpz36acViewport[0],xpz36acViewport[1],
                xpz36acViewport[2],xpz36acViewport[3],
                pScene->GetCutFloor(),1,
                xpz36acMissionHudDrawn?1:0,1,
                realPose.ptAnchor.x,realPose.ptAnchor.y,realPose.ptAnchor.z,
                realPose.fRod,realPose.fPitch,realPose.fYaw,
                realPose.fRoll,realPose.fFOV);
        }
        NGScene::Flip(); // true native game DX9 backbuffer
        if(r24dxForce) {
            FILE *f=0;
            if(fopen_s(&f,"_xpz_stage25_map.log","a")==0&&f) {
                fprintf(f,"event=r24dx_actual_igscene_dx9_flip_forced"
                   " world_drawn=1 source_certified=1 hud=%d"
                   " gameplay_parity_claim=0\n",
                   xpz36acMissionHudDrawn?1:0);
                fclose(f);
            }
        }
    }
}
////////////////////////////////////////////////////////////////////////////////////////////////////
} // NAMESPACE
////////////////////////////////////////////////////////////////////////////////////////////////////
/* XPZ_R24AP_END_SOURCE */