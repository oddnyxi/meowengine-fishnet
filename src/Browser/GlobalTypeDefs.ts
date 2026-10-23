// Type definitions for MeowEngine
interface PhotonServerSettings {
    Protocol: string;
    Address: string;
    Port: number;
    AppId: string;
    AppVersion: string;
    Region: string;
}

interface FishNetServerSettings {
    Protocol: string;
    Address: string;
    Port: number;
    AppVersion: string;
    Region: string;
}

interface SDKType {
    Account: any;
    FairCollection: any;
    PhotonServerSettings: PhotonServerSettings;
    FishNetServerSettings: FishNetServerSettings;
}

interface PhotonClientType {
    Instance: any;
    gameSocket: any;
}

interface FishNetClientType {
    Instance: any;
    gameSocket: any;
}

interface FairCollectionType {
    InitOperation: any;
    Instance: any;
}

interface NetworkingType {
    TransferOwnership: any;
    Instantiate: any;
}

interface LoadBalancingClientType {
    OpRaiseEvent: any;
}

interface PlayerListCanvasCompType {
    Enabled: boolean;
    Instance: any;
}

interface ToggleStates {
    AllowFlight: boolean;
}

interface ConfigType {
    ToggleStates: ToggleStates;
    version: string;
    debug: boolean;
    debugOutgoingPackets: boolean;
    debugIncomingPackets: boolean;
    flyEnabled: boolean;
    cacheAuthenticationPackets: boolean;
    cacheRPCPackets: boolean;
    cacheJoinAndLeavePackets: boolean;
    cacheOutgoingPhotonPackets: boolean;
    cacheIncomingPhotonPackets: boolean;
    cacheOutgoingPackets: boolean;
    cacheIncomingPackets: boolean;
    FishNet: any;
}

interface UnityInstanceType {
    Module: any;
    SendMessage: ((gameObjectName: string, methodName: string, value?: any) => void) | null;
}

interface Position {
    x: number;
    y: number;
    z: number;
}

interface Rotation {
    w: number;
    x: number;
    y: number;
    z: number;
}

interface RoomInformation {
    RoomName: string;
    RoomId: string;
    PlayerCount: number;
    MaxPlayers: number;
}

interface RoomInstanceType {
    Players: any[];
    Information: RoomInformation;
    CachedOutgoingPackets: any;
    CachedIncomingPackets: any;
}

interface LogInstance {
    warn: (message: string) => void;
    error: (message: string) => void;
    [key: string]: any;
}

interface LogType {
    Instance: LogInstance | null;
}

interface LocalPlayerType {
    ActorNr: number;
    ViewId: number;
    ObjectId: number;
    Username: string;
    Position: Position;
    Rotation: Rotation;
    Pitch: number;
    Yaw: number;
    Health: number;
    Ping: number;
    Perks: any[];
    ClanTag: string;
    Platform: string;
    Rank: number;
    TeamNumber: number;
    ThrowableAmount: number;
    SpoofRank: boolean;
    SpoofPlatform: boolean;
    SpoofTeamNumber: boolean;
    SpoofThrowableAmount: boolean;
}

interface CanvasConsoleType {
    Log: any;
    Enabled: boolean;
}

interface PerformancePanelType {
    Enabled: boolean;
    Instance: any;
}

interface MeowEngineType {
    FishNet?: any;
    Menu?: any;
    Events?: any;
    SDK: SDKType;
    PhotonClient: PhotonClientType;
    FishNetClient?: FishNetClientType;
    FairCollection: FairCollectionType;
    Networking: NetworkingType;
    LoadBalancingClient: LoadBalancingClientType;
    PlayerListCanvasComp: PlayerListCanvasCompType;
    Config: ConfigType;
    UnityInstance: UnityInstanceType;
    RoomInstance: RoomInstanceType;
    Log: LogType;
    LocalPlayer: LocalPlayerType;
    CanvasConsole: CanvasConsoleType;
    PerformancePanel: PerformancePanelType;
}

export const MeowEngine: MeowEngineType = {
    SDK: {
        Account: null,
        FairCollection: null,
        PhotonServerSettings: {
            Protocol: "GpBinaryV16",
            Address: "game-ca-1.blayzegames.com",
            Port: 2053,
            AppId: "8c2cad3e-2e3f-4941-9044-b390ff2c4956",
            AppVersion: "1.104.5_HC_1.105",
            Region: "eu/*",
        },
        FishNetServerSettings: {
            Protocol: "FishNet",
            Address: "game-us-2.blayzegames.com",
            Port: 51000,
            AppVersion: "1.0.0",
            Region: "us/*",
        }
    },
    PhotonClient: {
        Instance: null,
        gameSocket: null,
    },
    FishNetClient: {
        Instance: null,
        gameSocket: null,
    },
    FairCollection: {
        InitOperation: null,
        Instance: null,
    },
    Networking: {
        TransferOwnership: null,
        Instantiate: null
    },
    LoadBalancingClient: {
        OpRaiseEvent: null
    },
    PlayerListCanvasComp: {
        Enabled: true,
        Instance: null
    },
    Config: {
        ToggleStates: {
            AllowFlight: false,
        },
        version: "1.0.0",
        debug: false,
        debugOutgoingPackets: true,
        debugIncomingPackets: false,
        flyEnabled: false,
        cacheAuthenticationPackets: true,
        cacheRPCPackets: true,
        cacheJoinAndLeavePackets: true,
        cacheOutgoingPhotonPackets: false,
        cacheIncomingPhotonPackets: false,
        // FishNet per-room packet cache (Packets tab -> Export room cache)
        cacheOutgoingPackets: false,
        cacheIncomingPackets: false,
        // Set to FishNetConfig at startup (protocol / interception settings)
        FishNet: null
    },
    UnityInstance: {
        Module: null,
        SendMessage: null,
    },
    RoomInstance: {
        // Filled from FishNet: one entry per owning connection (see FishNetPatching.toPlayer)
        Players: [],
        Information: {
            RoomName: "Set later",
            RoomId: "Set later",
            PlayerCount: 0,
            MaxPlayers: 26,
        },
        CachedOutgoingPackets: {},
        CachedIncomingPackets: {}
    },
    Log: {
        Instance: null
    },
    LocalPlayer: {
        ActorNr: 1,
        ViewId: 1001,
        ObjectId: -1,
        Username: "",
        Position: { x: 0, y: 0, z: 0 },
        Rotation: { w: 0, x: 0, y: 0, z: 0 },
        Pitch: 3600,
        Yaw: 3600,
        Health: 10000,
        Ping: 999,
        Perks: [],
        ClanTag: "",
        Platform: "MeowEnginePlayer",
        Rank: 181, // This can be changed to spoof your rank
        TeamNumber: 4,
        ThrowableAmount: 20,
        SpoofRank: true,
        SpoofPlatform: true,
        SpoofTeamNumber: true,
        SpoofThrowableAmount: true,
    },
    CanvasConsole: {
        Log: null,
        Enabled: true
    },
    PerformancePanel: {
        Enabled: true,
        Instance: null
    }
};

export default MeowEngine;