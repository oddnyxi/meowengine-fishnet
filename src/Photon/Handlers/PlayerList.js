import MeowEngine from "../../Browser/GlobalTypeDefs";
import GameUtils from "../../Browser/Utility/GameUtils";

class PlayerList {
  static handlePlayerList(packet) {
    for (const [key, value] of Object.entries(packet.params["249"])) {
      if (!key.startsWith("int32")) continue;

      // Grab the information from the packet
      let actorNr = key.split(" ")[1];
      const name = GameUtils.cleanUsername(value["int8 255"] ?? "Unknown");
      let rank = value.rank?.value ?? 0;
      const kd = value.kd?.value ?? 0;
      let team = value.teamNumber?.value ?? 0;
      let kills = value.current_kills_in_killstreak?.value ?? 0;
      const platform = value.platform ?? "Unknown";

      MeowEngine.Log.Instance.info(`[${actorNr}] ${name} joined the game`);
      MeowEngine.CanvasConsole.Log(`[<color=#00ffaa>MeowEngine</color>] [<color=#9B59B6>JOIN</color>]: [${actorNr}] ${name}`)

      // Utilize the player entry
      let usrEntry = {};

      // Do some parsing
      actorNr = parseInt(actorNr);
      rank = parseInt(rank);
      kills = parseInt(kills);
      team = parseInt(team);

      // Create the player entry
      usrEntry[actorNr] = {
        actorNr,
        name,
        rank,
        kd,
        team,
        kills,
        platform,
        position: {},
        rotation: {},
        pitch: 0,
        yaw: 0,
        health: 0,
        ping: 0,
      };

      // Add the player entry to the list
      MeowEngine.RoomInstance.Players.push(usrEntry);
    }

    let playerCount = MeowEngine.RoomInstance.Players.length;
    MeowEngine.RoomInstance.Information.PlayerCount = playerCount;
    MeowEngine.PlayerListCanvasComp.Instance.updateTitle(`(${playerCount}) Active Players`);
  }

  static handlePlayerJoin(packet) {
    const actorNr = packet.params["254"].value;

    // Assuming packet is your JSON object
    for (const [key, value] of Object.entries(packet.params)) {
      if (key === "249") {
        // For param 249, extract username directly
        const name = GameUtils.cleanUsername(value["int8 255"] ?? "Unknown");
        let rank = value.rank?.value ?? 0;
        const kd = value.kd?.value ?? 0;
        let team = value.teamNumber?.value ?? 0;
        let kills = value.current_kills_in_killstreak?.value ?? 0;
        const platform = value.platform ?? "Unknown";

        MeowEngine.Log.Instance.join(`[${actorNr}] ${name}`);

        if (name.includes("[MeowEngine Network Bot]")) {
          MeowEngine.CanvasConsole.Log(`<color=#00ffaa>MeowEngine</color>] [<color=#9B59B6>JOIN</color>]: A <color=#00ffaa>MeowEngine</color> <color=#ff0000>Bot</color> has joined the room. Be sure to have your <color=#ff0000>Anti-Crash</color> on!`);
        } else {
          MeowEngine.CanvasConsole.Log(`[<color=#00ffaa>MeowEngine</color>] [<color=#9B59B6>JOIN</color>]: [${actorNr}] ${name}`);
        }

        // Create the player entry
        let usrEntry = {};
        usrEntry[actorNr] = {
          actorNr,
          name,
          rank,
          kd,
          team,
          kills,
          platform,
          position: {},
          rotation: {},
          pitch: 0,
          yaw: 0,
          health: 0,
          ping: 0,
        };

        // Add the player entry to the list
        MeowEngine.RoomInstance.Players.push(usrEntry);
      }
    }

    let playerCount = MeowEngine.RoomInstance.Players.length;
    MeowEngine.RoomInstance.Information.PlayerCount = playerCount;
    MeowEngine.PlayerListCanvasComp.Instance.updateTitle(`(${playerCount}) Active Players`);
  }

  static handlePlayerLeave(packet) {
    // Get the player ID from params 254
    const leavingPlayerId = packet.params["254"].value;

    // Find the player in the Players array
    // The array appears to contain objects where each key is a player ID
    let playerIndex = -1;
    for (let i = 0; i < MeowEngine.RoomInstance.Players.length; i++) {
      const playerEntry = MeowEngine.RoomInstance.Players[i];
      // Check if this entry has the leaving player ID as a key
      if (leavingPlayerId in playerEntry) {
        playerIndex = i;
        break;
      }
    }

    // If player found, log and remove them
    if (playerIndex !== -1) {
      const playerEntry = MeowEngine.RoomInstance.Players[playerIndex];
      const player = playerEntry[leavingPlayerId];
      MeowEngine.Log.Instance.leave(player.name);

      MeowEngine.CanvasConsole.Log(`[<color=#00ffaa>MeowEngine</color>] [<color=#34495E>LEAVE</color>]: [${leavingPlayerId}] ${player.name}`)

      // Remove the player from the array
      MeowEngine.RoomInstance.Players.splice(playerIndex, 1);
    } else {
      MeowEngine.Log.Instance.warn(
        `Player with ID ${leavingPlayerId} not found in Players array`
      );
    }

    let playerCount = MeowEngine.RoomInstance.Players.length;
    MeowEngine.RoomInstance.Information.PlayerCount = playerCount;
    MeowEngine.PlayerListCanvasComp.Instance.updateTitle(`(${playerCount}) Active Players`);
  }

  static clearPlayerlist() {
    MeowEngine.RoomInstance.Players = [];
  }
}

export default PlayerList;
