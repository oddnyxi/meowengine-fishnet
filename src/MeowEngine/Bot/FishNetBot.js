import WebSocket from "ws";

// DOES NOT WORK YET

export class FishNetBot {
  constructor(username, password, serverAddress = "wss://game-us-2.blayzegames.com:51000") {
    // Bot Identity
    this.botId = this.generateRandomID();
    this.username = username;
    this.password = password;
    
    // Network Configuration
    this.serverAddress = serverAddress;
    this.socket = null;
    this.isConnected = false;
    this.connectionId = -1;
    
    // Authentication & Account
    this.account = null;
    this.authToken = "";
    this.isAuthenticated = false;
    
    // Game State
    this.players = new Map();
    this.gameObjects = new Map();
    this.isInGame = false;
    this.localClientId = -1;
    
    // Timing & Synchronization
    this.startTime = Date.now();
    this.serverTimeOffset = 0;
    this.lastPingTime = 0;
    this.pingInterval = null;
    
    // FishNet Protocol Constants
    this.MessageType = {
      // Connection
      CONNECTION_REQUEST: 0,
      CONNECTION_APPROVED: 1,
      CONNECTION_REJECTED: 2,
      DISCONNECTION: 3,
      
      // Authentication
      AUTHENTICATE: 10,
      AUTH_RESPONSE: 11,
      
      // Game Management
      SPAWN_OBJECT: 20,
      DESPAWN_OBJECT: 21,
      CHANGE_OWNERSHIP: 22,
      
      // Data Synchronization
      RPC_RELIABLE: 30,
      RPC_UNRELIABLE: 31,
      SYNC_VAR: 32,
      TRANSFORM_SYNC: 33,
      
      // System
      PING: 40,
      PONG: 41,
      TIME_SYNC: 42
    };
    
    // Bot Configuration
    this.config = {
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectDelay: 3000,
      pingInterval: 2000,
      enableLogging: true,
      playerData: {
        rank: Math.floor(Math.random() * 200) + 1,
        kd: (Math.random() * 10).toFixed(2),
        team: Math.floor(Math.random() * 2),
        kills: 0,
        deaths: 0,
        platform: "FishNetBot"
      }
    };
    
    this.reconnectAttempts = 0;
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================
  
  /**
   * Generates a random 16-character hexadecimal ID
   * @returns {string} Random ID
   */
  generateRandomID() {
    const array = new Uint8Array(8);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generates a UUID v4
   * @returns {string} UUID string
   */
  generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Hashes input using SHA-512
   * @param {string} input - Input to hash
   * @returns {Promise<string>} Hashed string
   */
  async hashSHA512(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Bot logging function
   * @param {...any} args - Arguments to log
   */
  botLog(...args) {
    if (this.config.enableLogging) {
      console.log(`[FishNetBot ${this.botId}]:`, ...args);
    }
  }

  /**
   * Gets current server time
   * @returns {number} Server time in milliseconds
   */
  getServerTime() {
    return Date.now() + this.serverTimeOffset;
  }

  /**
   * Cleans username by removing markup and brackets
   * @param {string} rawName - Raw username
   * @returns {string} Cleaned username
   */
  cleanUsername(rawName) {
    return rawName
      .replace(/<[^>]*>/g, '') // Remove HTML/Unity rich text tags
      .replace(/^\[[^\]]+\]/g, '') // Remove clan tags
      .trim();
  }

  // ===========================================
  // ACCOUNT & AUTHENTICATION
  // ===========================================

  /**
   * Generates account credentials
   * @returns {Promise<Object>} Account details
   */
  async generateAccount() {
    this.account = {
      username: this.username,
      password: this.password,
      hashedPassword: await this.hashSHA512(this.password),
      uuid: this.generateUUID(),
      clientId: this.generateRandomID()
    };
    
    this.botLog("Account generated:", this.account.username);
    return this.account;
  }

  /**
   * Authenticates with the FishNet server
   * @returns {Promise<boolean>} Authentication success
   */
  async authenticate() {
    if (!this.account) {
      await this.generateAccount();
    }

    const authData = {
      username: this.account.username,
      passwordHash: this.account.hashedPassword,
      clientId: this.account.clientId,
      version: "1.0.0",
      platform: this.config.playerData.platform
    };

    this.sendMessage(this.MessageType.AUTHENTICATE, authData);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Authentication timeout"));
      }, 10000);

      const originalHandler = this.onAuthResponse;
      this.onAuthResponse = (success, token) => {
        clearTimeout(timeout);
        this.onAuthResponse = originalHandler;
        if (success) {
          this.authToken = token;
          this.isAuthenticated = true;
          this.botLog("Authentication successful");
          resolve(true);
        } else {
          this.botLog("Authentication failed");
          resolve(false);
        }
      };
    });
  }

  // ===========================================
  // NETWORK COMMUNICATION
  // ===========================================

  /**
   * Connects to the FishNet server
   * @returns {Promise<boolean>} Connection success
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.botLog("Connecting to server:", this.serverAddress);
        this.socket = new WebSocket(this.serverAddress, "fishnet-protocol");
        
        this.socket.onopen = () => {
          this.botLog("Connected to FishNet server");
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startPingLoop();
          this.sendConnectionRequest();
          resolve(true);
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.socket.onclose = (event) => {
          this.botLog("Connection closed:", event.code, event.reason);
          this.isConnected = false;
          this.isAuthenticated = false;
          this.handleDisconnection();
        };

        this.socket.onerror = (error) => {
          this.botLog("Connection error:", error);
          reject(error);
        };

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error("Connection timeout"));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Sends connection request to server
   */
  sendConnectionRequest() {
    const connectionData = {
      protocolVersion: "1.0",
      clientVersion: "1.0.0",
      uuid: this.account?.uuid || this.generateUUID()
    };

    this.sendMessage(this.MessageType.CONNECTION_REQUEST, connectionData);
  }

  /**
   * Sends a message to the server
   * @param {number} messageType - Type of message
   * @param {Object} data - Message data
   */
  sendMessage(messageType, data = {}) {
    if (!this.isConnected || !this.socket) {
      this.botLog("Cannot send message: not connected");
      return;
    }

    const message = {
      type: messageType,
      timestamp: this.getServerTime(),
      data: data
    };

    try {
      this.socket.send(JSON.stringify(message));
    } catch (error) {
      this.botLog("Error sending message:", error);
    }
  }

  /**
   * Handles incoming messages from server
   * @param {string|ArrayBuffer} data - Received data
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case this.MessageType.CONNECTION_APPROVED:
          this.handleConnectionApproved(message.data);
          break;
          
        case this.MessageType.CONNECTION_REJECTED:
          this.handleConnectionRejected(message.data);
          break;
          
        case this.MessageType.AUTH_RESPONSE:
          this.handleAuthResponse(message.data);
          break;
          
        case this.MessageType.SPAWN_OBJECT:
          this.handleSpawnObject(message.data);
          break;
          
        case this.MessageType.DESPAWN_OBJECT:
          this.handleDespawnObject(message.data);
          break;
          
        case this.MessageType.RPC_RELIABLE:
        case this.MessageType.RPC_UNRELIABLE:
          this.handleRPC(message.data);
          break;
          
        case this.MessageType.SYNC_VAR:
          this.handleSyncVar(message.data);
          break;
          
        case this.MessageType.TRANSFORM_SYNC:
          this.handleTransformSync(message.data);
          break;
          
        case this.MessageType.PONG:
          this.handlePong(message.data);
          break;
          
        case this.MessageType.TIME_SYNC:
          this.handleTimeSync(message.data);
          break;
          
        default:
          this.botLog("Unknown message type:", message.type);
      }
    } catch (error) {
      this.botLog("Error handling message:", error);
    }
  }

  // ===========================================
  // MESSAGE HANDLERS
  // ===========================================

  /**
   * Handles connection approval from server
   * @param {Object} data - Connection data
   */
  handleConnectionApproved(data) {
    this.connectionId = data.connectionId;
    this.localClientId = data.clientId;
    this.botLog("Connection approved, ID:", this.connectionId);
    
    // Auto-authenticate after connection
    if (!this.isAuthenticated) {
      this.authenticate();
    }
  }

  /**
   * Handles connection rejection
   * @param {Object} data - Rejection data
   */
  handleConnectionRejected(data) {
    this.botLog("Connection rejected:", data.reason);
    this.disconnect();
  }

  /**
   * Handles authentication response
   * @param {Object} data - Auth response data
   */
  handleAuthResponse(data) {
    if (this.onAuthResponse) {
      this.onAuthResponse(data.success, data.token);
    }
  }

  /**
   * Handles object spawn events
   * @param {Object} data - Spawn data
   */
  handleSpawnObject(data) {
    const { objectId, prefabId, ownerId, position, rotation } = data;
    
    const gameObject = {
      id: objectId,
      prefabId: prefabId,
      ownerId: ownerId,
      position: position,
      rotation: rotation,
      spawnTime: this.getServerTime()
    };
    
    this.gameObjects.set(objectId, gameObject);
    this.botLog("Object spawned:", objectId, "Owner:", ownerId);
    
    // If this is a player object
    if (prefabId === "Player") {
      this.handlePlayerSpawn(gameObject);
    }
  }

  /**
   * Handles object despawn events
   * @param {Object} data - Despawn data
   */
  handleDespawnObject(data) {
    const { objectId } = data;
    
    if (this.gameObjects.has(objectId)) {
      this.gameObjects.delete(objectId);
      this.botLog("Object despawned:", objectId);
    }
  }

  /**
   * Handles RPC calls
   * @param {Object} data - RPC data
   */
  handleRPC(data) {
    const { methodName, objectId, parameters, senderId } = data;
    this.botLog("RPC received:", methodName, "from:", senderId);
    
    // Handle specific RPC methods
    switch (methodName) {
      case "PlayerJoined":
        this.handlePlayerJoined(parameters);
        break;
      case "PlayerLeft":
        this.handlePlayerLeft(parameters);
        break;
      case "ChatMessage":
        this.handleChatMessage(parameters);
        break;
    }
  }

  /**
   * Handles sync var updates
   * @param {Object} data - Sync var data
   */
  handleSyncVar(data) {
    const { objectId, varName, value } = data;
    
    if (this.gameObjects.has(objectId)) {
      const obj = this.gameObjects.get(objectId);
      if (!obj.syncVars) obj.syncVars = {};
      obj.syncVars[varName] = value;
    }
  }

  /**
   * Handles transform synchronization
   * @param {Object} data - Transform data
   */
  handleTransformSync(data) {
    const { objectId, position, rotation, velocity } = data;
    
    if (this.gameObjects.has(objectId)) {
      const obj = this.gameObjects.get(objectId);
      obj.position = position;
      obj.rotation = rotation;
      if (velocity) obj.velocity = velocity;
    }
  }

  /**
   * Handles pong response
   * @param {Object} data - Pong data
   */
  handlePong(data) {
    const now = Date.now();
    const rtt = now - this.lastPingTime;
    this.botLog("Ping RTT:", rtt + "ms");
  }

  /**
   * Handles time synchronization
   * @param {Object} data - Time sync data
   */
  handleTimeSync(data) {
    const { serverTime } = data;
    this.serverTimeOffset = serverTime - Date.now();
    this.botLog("Server time synchronized, offset:", this.serverTimeOffset + "ms");
  }

  // ===========================================
  // GAME ACTIONS
  // ===========================================

  /**
   * Handles player spawn
   * @param {Object} playerObject - Player game object
   */
  handlePlayerSpawn(playerObject) {
    const player = {
      objectId: playerObject.id,
      ownerId: playerObject.ownerId,
      username: "Unknown",
      rank: 0,
      kills: 0,
      deaths: 0,
      team: 0,
      ...this.config.playerData
    };
    
    this.players.set(playerObject.ownerId, player);
    this.botLog("Player spawned:", player.username);
  }

  /**
   * Handles player joined event
   * @param {Object} data - Player data
   */
  handlePlayerJoined(data) {
    const { playerId, username, playerData } = data;
    
    const player = {
      playerId: playerId,
      username: this.cleanUsername(username),
      joinTime: this.getServerTime(),
      ...playerData
    };
    
    this.players.set(playerId, player);
    this.botLog("Player joined:", player.username);
  }

  /**
   * Handles player left event
   * @param {Object} data - Player data
   */
  handlePlayerLeft(data) {
    const { playerId } = data;
    
    if (this.players.has(playerId)) {
      const player = this.players.get(playerId);
      this.botLog("Player left:", player.username);
      this.players.delete(playerId);
    }
  }

  /**
   * Handles chat messages
   * @param {Object} data - Chat data
   */
  handleChatMessage(data) {
    const { senderId, message, isGlobal } = data;
    const sender = this.players.get(senderId);
    const senderName = sender ? sender.username : "Unknown";
    
    this.botLog(`Chat [${senderName}]: ${message}`);
  }

  /**
   * Sends a chat message
   * @param {string} message - Message to send
   * @param {boolean} isGlobal - Whether message is global
   */
  sendChatMessage(message, isGlobal = true) {
    if (!this.isAuthenticated) return;
    
    this.sendRPC("ChatMessage", {
      message: message,
      isGlobal: isGlobal
    });
  }

  /**
   * Sends an RPC call
   * @param {string} methodName - RPC method name
   * @param {Object} parameters - RPC parameters
   * @param {boolean} reliable - Whether RPC should be reliable
   */
  sendRPC(methodName, parameters = {}, reliable = true) {
    const rpcData = {
      methodName: methodName,
      parameters: parameters,
      senderId: this.localClientId
    };
    
    const messageType = reliable ? 
      this.MessageType.RPC_RELIABLE : 
      this.MessageType.RPC_UNRELIABLE;
    
    this.sendMessage(messageType, rpcData);
  }

  /**
   * Spawns the bot's player object
   */
  spawnPlayer() {
    if (!this.isAuthenticated) return;
    
    this.sendRPC("SpawnPlayer", {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      playerData: this.config.playerData
    });
  }

  // ===========================================
  // CONNECTION MANAGEMENT
  // ===========================================

  /**
   * Starts ping loop to maintain connection
   */
  startPingLoop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    this.pingInterval = setInterval(() => {
      if (this.isConnected) {
        this.lastPingTime = Date.now();
        this.sendMessage(this.MessageType.PING, { timestamp: this.lastPingTime });
      }
    }, this.config.pingInterval);
  }

  /**
   * Handles disconnection and attempts reconnection
   */
  handleDisconnection() {
    this.isConnected = false;
    this.isAuthenticated = false;
    this.connectionId = -1;
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Auto-reconnect if enabled
    if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.botLog(`Attempting reconnection ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`);
      
      setTimeout(() => {
        this.connect().catch(error => {
          this.botLog("Reconnection failed:", error);
        });
      }, this.config.reconnectDelay);
    }
  }

  /**
   * Disconnects from the server
   */
  disconnect() {
    this.botLog("Disconnecting...");
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.socket && this.isConnected) {
      this.socket.close();
    }
    
    this.isConnected = false;
    this.isAuthenticated = false;
  }

  // ===========================================
  // PUBLIC API
  // ===========================================

  /**
   * Gets all connected players
   * @returns {Array} Array of player objects
   */
  getAllPlayers() {
    return Array.from(this.players.values());
  }

  /**
   * Gets a specific player by ID
   * @param {number} playerId - Player ID
   * @returns {Object|null} Player object or null
   */
  getPlayer(playerId) {
    return this.players.get(playerId) || null;
  }

  /**
   * Checks if bot is connected and authenticated
   * @returns {boolean} Connection status
   */
  isReady() {
    return this.isConnected && this.isAuthenticated;
  }

  /**
   * Main method to join a game session
   * @param {string} serverAddress - Server address (optional)
   * @returns {Promise<boolean>} Success status
   */
  async joinGame(serverAddress = null) {
    if (serverAddress) {
      this.serverAddress = serverAddress;
    }

    try {
      this.botLog("Starting FishNet bot...");
      
      // Generate account if not exists
      if (!this.account) {
        await this.generateAccount();
      }
      
      // Connect to server
      await this.connect();
      
      // Wait for authentication
      await new Promise(resolve => {
        const checkAuth = () => {
          if (this.isAuthenticated) {
            resolve();
          } else {
            setTimeout(checkAuth, 100);
          }
        };
        checkAuth();
      });
      
      // Spawn player
      this.spawnPlayer();
      
      this.botLog("Successfully joined game!");
      return true;
      
    } catch (error) {
      this.botLog("Failed to join game:", error);
      return false;
    }
  }

  /**
   * Leaves the current game
   */
  leaveGame() {
    this.botLog("Leaving game...");
    this.sendRPC("DespawnPlayer");
    this.disconnect();
  }
}

export default FishNetBot;