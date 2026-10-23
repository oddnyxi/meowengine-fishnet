import MeowEngine from "../../Browser/GlobalTypeDefs";
import GameUtils from "../../Browser/Utility/GameUtils";
import Account from "../../Bullet Force/API/Account";
import EventCode from "../../Photon/Enums/EventCode";
import OperationCode from "../../Photon/Enums/OperationCode";
import PacketType from "../../Photon/Enums/PacketType";
import OnEvent from "../../Photon/Handlers/OnEventHandler";
import OpCode201 from "../../Photon/Handlers/OpCode201";
import OpRaiseEvent from "../../Photon/Handlers/OpRaiseEventHandler";
import PlayerList from "../../Photon/Handlers/PlayerList";
import {
    ParameterCode,
    OperationCode
} from "../Photon/protocol_reader/constants";
import PhotonPacket from "../Photon/protocol_reader/Old/OldPacket";
import PacketBuilder from "../Photon/protocol_reader/PacketBuilder";
import ProtocolReader from "../Photon/protocol_reader/ProtocolReader";

export class Patching {
    static initPatches() {
        // Patch the RaiseEvent / Socket Send func
        OpRaiseEvent.addListener(
            "data",
            async ({ args, data, socket, originalSend }) => {
                const message = args[0];
                let uint8Array = new Uint8Array(message);
                let packet = new PhotonPacket(uint8Array.buffer);

                if (MeowEngine.Config.cacheOutgoingPhotonPackets) {
                    let roomInformation = MeowEngine.RoomInstance.Information;
                    const roomName = `${roomInformation.RoomName} ${roomInformation.RoomId}`;

                    if (!MeowEngine.RoomInstance.CachedOutgoingPackets) {
                        MeowEngine.RoomInstance.CachedOutgoingPackets = {};
                    }

                    if (
                        !MeowEngine.RoomInstance.CachedOutgoingPackets[roomName]
                    ) {
                        MeowEngine.RoomInstance.CachedOutgoingPackets[
                            roomName
                        ] = [];
                    }

                    MeowEngine.RoomInstance.CachedOutgoingPackets[
                        roomName
                    ].push(data);
                }

                if (MeowEngine.Config.debugOutgoingPackets) {
                    MeowEngine.Log.Instance.info("Outgoing packet:", data);
                }

                if (
                    data.code == OperationCode.Authenticate &&
                    data.params["210"] &&
                    data.params["225"]
                ) {
                    let serverSettings = MeowEngine.SDK.PhotonServerSettings;
                    serverSettings.Region = data.params["210"];
                    serverSettings.AppVersion = data.params["220"];
                    serverSettings.AppId = data.params["224"];
                }

                if (data.code == OperationCode.JoinGame) {
                    if (data.params["255"]) {
                        let { roomName, roomId } =
                            GameUtils.seperateRoomIdFromRoomName(
                                data.params["255"]
                            );
                        MeowEngine.RoomInstance.Information.RoomName = roomName;
                        MeowEngine.RoomInstance.Information.RoomId = roomId;
                    }
                }

                // Setting a custom platform on join
                if (
                    data.code === 252 &&
                    data.params["250"] &&
                    data.params["251"]
                ) {
                    MeowEngine.Log.Instance.info(
                        "Packet with code 252 is being changed..."
                    );
                    if (data.params["251"].platform == "WebGLPlayer") {
                        const modifiedPacket = PacketBuilder.createRequest(
                            OperationCode.RaiseEvent
                        )
                            .addParam(244, PacketBuilder.types.byte(252))
                            .addParam(250, PacketBuilder.types.boolean(true))
                            .addParam(
                                251,
                                PacketBuilder.types.string(
                                    MeowEngine.LocalPlayer.Platform
                                )
                            )
                            .addParam(245, PacketBuilder.types.integer(292));

                        const buffer = modifiedPacket.toBuffer();
                        MeowEngine.Log.Instance.info(
                            "Packet with code 252 was changed..."
                        );

                        let newArgs = [];
                        newArgs[0] = buffer;
                        return originalSend.apply(socket, newArgs);
                    }
                }

                if (
                    data.code === 252 &&
                    data.params["251"] &&
                    data.params["251"]["int8 255"] &&
                    data.params["251"]["int8 255"].includes("PC-")
                ) {
                    MeowEngine.Log.Instance.info(
                        "Packet with code 252 is being changed..."
                    );
                    let playerName = `${data.params["251"]["int8 255"]}`;

                    if (MeowEngine.LocalPlayer.ClanTag !== "") {
                        playerName = `[${MeowEngine.LocalPlayer.ClanTag}] ${data.params["251"]["int8 255"]}`;
                    }

                    const modifiedPacket = PacketBuilder.createRequest(
                        OperationCode.RaiseEvent
                    )
                        .addParam(244, PacketBuilder.types.byte(252))
                        .addParam(250, PacketBuilder.types.boolean(true))
                        .addParam(
                            251,
                            PacketBuilder.types.string(`${playerName}`)
                        )
                        .addParam(
                            245,
                            PacketBuilder.types.integer(
                                data.params["254"].value
                            )
                        );

                    const buffer = modifiedPacket.toBuffer();
                    MeowEngine.Log.Instance.info(
                        "Packet with code 252 was changed..."
                    );

                    let newArgs = [];
                    newArgs[0] = buffer;
                    return originalSend.apply(socket, newArgs);
                }

                // This is the main player information packet, you can modify some of these parameters to spoof specific values
                if (
                    data.code === 226 &&
                    data.params["249"] &&
                    data.params["255"] &&
                    data.params["249"]["int8 255"]
                ) {
                    MeowEngine.Log.Instance.info(
                        "Packet with code 226 is being changed...",
                        data.params["249"]["int8 255"]
                    );

                    let platform = MeowEngine.LocalPlayer.SpoofPlatform
                        ? MeowEngine.LocalPlayer.Platform
                        : data.params["249"].platform;
                    let rank = MeowEngine.LocalPlayer.SpoofRank
                        ? MeowEngine.LocalPlayer.Rank
                        : data.params["249"].rank;
                    let throwable_amount = MeowEngine.LocalPlayer
                        .SpoofThrowableAmount
                        ? MeowEngine.LocalPlayer.ThrowableAmount
                        : data.params["249"].throwable_amount;
                    let teamNumber = MeowEngine.LocalPlayer.SpoofTeamNumber
                        ? MeowEngine.LocalPlayer.TeamNumber
                        : data.params["249"].teamNumber;

                    const modifiedPacket = PacketBuilder.createRequest(226);
                    modifiedPacket.addParam(
                        255,
                        PacketBuilder.types.string(data.params["255"])
                    );

                    const perksArray = new Uint8Array(8);
                    perksArray[0] = 1;
                    perksArray[1] = 9;
                    perksArray[2] = 14;
                    perksArray[3] = 2;
                    perksArray[4] = 22;

                    const hashtable249 = PacketBuilder.types.hashTable([
                        [
                            PacketBuilder.types.string("platform"),
                            PacketBuilder.types.string(platform)
                        ],
                        [
                            PacketBuilder.types.string("teamNumber"),
                            PacketBuilder.types.byte(teamNumber)
                        ],
                        [
                            PacketBuilder.types.string("rank"),
                            PacketBuilder.types.byte(rank)
                        ],
                        [
                            PacketBuilder.types.string("killstreak"),
                            PacketBuilder.types.byte(
                                data.params["249"].killstreak
                            )
                        ],
                        [
                            PacketBuilder.types.string("characterCamo"),
                            PacketBuilder.types.byte(
                                data.params["249"].characterCamo
                            )
                        ],
                        [
                            PacketBuilder.types.string("bulletTracerColor"),
                            PacketBuilder.types.byte(
                                data.params["249"].bulletTracerColor
                            )
                        ],
                        [
                            PacketBuilder.types.string("glovesCamo"),
                            PacketBuilder.types.byte(
                                data.params["249"].glovesCamo
                            )
                        ],
                        [
                            PacketBuilder.types.string("unlockedweapons"),
                            PacketBuilder.types.array(0x69, [
                                PacketBuilder.types.integer(0),
                                PacketBuilder.types.integer(0),
                                PacketBuilder.types.integer(0)
                            ])
                        ],
                        [
                            PacketBuilder.types.string(
                                "current_kills_in_killstreak"
                            ),
                            PacketBuilder.types.integer(
                                data.params["249"].current_kills_in_killstreak
                            )
                        ],
                        [
                            PacketBuilder.types.string("kd"),
                            PacketBuilder.types.float(data.params["249"].kd)
                        ],
                        [
                            PacketBuilder.types.string("perks"),
                            PacketBuilder.types.byteArray(perksArray)
                        ],
                        [
                            PacketBuilder.types.string(
                                "current_vehicle_view_id"
                            ),
                            PacketBuilder.types.integer(
                                data.params["249"].current_vehicle_view_id
                            )
                        ],
                        [
                            PacketBuilder.types.string("up_to_date_version"),
                            PacketBuilder.types.string(
                                data.params["249"].up_to_date_version
                            )
                        ],
                        [
                            PacketBuilder.types.string("throwable_type"),
                            PacketBuilder.types.integer(
                                data.params["249"].throwable_type
                            )
                        ],
                        [
                            PacketBuilder.types.string("throwable_amount"),
                            PacketBuilder.types.integer(throwable_amount)
                        ],
                        [
                            PacketBuilder.types.string("nextCreateRoomPass"),
                            PacketBuilder.types.string(
                                data.params["249"].nextCreateRoomPass
                            )
                        ],
                        [
                            PacketBuilder.types.byte(255),
                            PacketBuilder.types.string(
                                `[${MeowEngine.LocalPlayer.ClanTag}] ${data.params["249"]["int8 255"]}`
                            )
                        ]
                    ]);

                    modifiedPacket.addParam(249, hashtable249);
                    modifiedPacket.addParam(
                        250,
                        PacketBuilder.types.boolean(true)
                    );
                    MeowEngine.Log.Instance.info(
                        "Packet with code 226 was changed!"
                    );

                    const buffer = modifiedPacket.toBuffer();
                    let newArgs = [];
                    newArgs[0] = buffer;
                    return originalSend.apply(socket, newArgs);
                }

                if (
                    data.code === 253 &&
                    data.params &&
                    data.params["245"] &&
                    data.params["245"]["int8 10"] &&
                    data.params["245"]["int8 10"].length > 10
                ) {
                    const parser = new OpCode201(data);
                    OpCode201.handleLocalPlayerUpdate(parser.parseOutgoing());
                }

                return originalSend.apply(socket, args);
            }
        );

        // Patch the OnEvent / Message Listener for the socket constructor
        OnEvent.addListener("data", event => {
            if (
                !(event.data instanceof ArrayBuffer) ||
                event.data.byteLength < 1
            )
                return;

            const uint8Array = new Uint8Array(event.data);

            let reader = new ProtocolReader(uint8Array.buffer);
            const packet = reader.readPacket();

            if (MeowEngine.Config.cacheIncomingPhotonPackets) {
                let roomInformation = MeowEngine.RoomInstance.Information;
                const roomName = `${roomInformation.RoomName} ${roomInformation.RoomId}`;

                if (!MeowEngine.RoomInstance.CachedIncomingPackets) {
                    MeowEngine.RoomInstance.CachedIncomingPackets = {};
                }

                if (!MeowEngine.RoomInstance.CachedIncomingPackets[roomName]) {
                    MeowEngine.RoomInstance.CachedIncomingPackets[roomName] =
                        [];
                }

                MeowEngine.RoomInstance.CachedIncomingPackets[roomName].push(
                    packet
                );
            }

            if (MeowEngine.Config.debugIncomingPackets) {
                MeowEngine.Log.Instance.info("Incoming packet:", packet);
            }

            if (packet.code == 201 && packet.params["245"]) {
                const parser = new OpCode201(packet);
                OpCode201.handlePlayerUpdate(parser.parseIncoming());
            }

            if (packet.code == OperationCode.JoinGame && packet.params["249"]) {
                PlayerList.handlePlayerList(packet);
            }

            if (packet.code == OperationCode.Leave) {
                PlayerList.handlePlayerLeave(packet);
            }

            if (packet.code == OperationCode.Join) {
                PlayerList.handlePlayerJoin(packet);
            }
        });
    }
}

export default Patching;
