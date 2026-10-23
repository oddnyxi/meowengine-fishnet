import MeowEngine from "./Browser/GlobalTypeDefs";
import UnityMessageWrapper from "./Browser/UnityInteraction/UnityMessageWrapper";
import CustomLogs from "./Browser/Utility/CustomLogs";
import GameUtils from "./Browser/Utility/GameUtils";
import FairCollection from "./Bullet Force/FairPlayAPI/FairCollection";
import HttpRequestManager from "./Photon/HttpRequestManager";
import * as FishNet from "./FishNet/index.js";
import { FishNetSocketManager, FishNetConfig } from "./FishNet/FishNetSocketManager.js";
import { FishNetClientInstance } from "./FishNet/FishNetClient.js";
import { FishNetPatching } from "./FishNet/Patching/FishNetPatching.js";
import { createMeowMenu } from "./UI/MeowMenu.js";

const GAME_FRAME = "https://bullet-force-multiplayer.game-files.crazygames.com/unity/unity2020/bullet-force-multiplayer.html";

function boot() {
  // Logs
  MeowEngine.Log.Instance = new CustomLogs({
    title: "MeowEngine",
    enabled: true,
    showTimestamp: true,
  });

  window.MeowEngine = MeowEngine;
  MeowEngine.FishNet = FishNet;
  MeowEngine.Config.FishNet = FishNetConfig;

  // The WebSocket hook must be in place before the game opens its game-server
  // connection, so install it right away instead of waiting for Unity.
  FishNetSocketManager.overrideSocket();
  FishNetPatching.initPatches();

  MeowEngine.FishNetClient.Instance = FishNetClientInstance;
  MeowEngine.PhotonClient.Instance = FishNetClientInstance; // legacy alias
  MeowEngine.Events = Object.assign(MeowEngine.Events || {}, {
    FishNet: FishNetSocketManager,
  });
  MeowEngine.Networking.TransferOwnership = FishNetClientInstance.TransferOwnership.bind(FishNetClientInstance);
  MeowEngine.LoadBalancingClient.OpRaiseEvent = FishNetClientInstance.OpRaiseEvent.bind(FishNetClientInstance);

  HttpRequestManager.initialize();

  MeowEngine.FairCollection.InitOperation = FairCollection.InitOperation;
  MeowEngine.FairCollection.Instance = FairCollection;

  const startMenu = () => {
    MeowEngine.Menu = createMeowMenu();
    console.log("MeowEngine v2.0 initialized with Odium UI. Press 'Insert' or 'V' to toggle the menu.");
  };
  if (document.body) startMenu();
  else document.addEventListener("DOMContentLoaded", startMenu, { once: true });

  // Unity is only needed for SendMessage based helpers; give it plenty of time to load.
  GameUtils.waitForUnityInstance((instance) => {
    MeowEngine.UnityInstance = instance;
    MeowEngine.Log.Instance.success("Unity instance ready");
  }, 250, 5 * 60 * 1000);

  document.addEventListener("keydown", (event) => {
    if (event.key === "f" && MeowEngine.UnityInstance && MeowEngine.UnityInstance.SendMessage) {
      MeowEngine.Config.flyEnabled = !MeowEngine.Config.flyEnabled;
      if (MeowEngine.Config.flyEnabled) UnityMessageWrapper.fly();
      else UnityMessageWrapper.unfly();
    }
  });
}

// Only run inside the game iframe.
if (window.location.href.includes(GAME_FRAME)) boot();
