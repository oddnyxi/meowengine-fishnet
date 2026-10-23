import MeowEngine from '../GlobalTypeDefs';
import CustomLogs from './CustomLogs';

// Define types for Unity instance and related objects
interface UnityInstance {
    SendMessage: (gameObjectName: string, methodName: string, value?: any) => void;
    [key: string]: any;
}

interface PlayerData {
    [key: string]: any;
}

interface GameUtilsOptions {
    logLevel?: string;
    logTitle?: string;
}

interface RoomInfo {
    roomName: string;
    roomId: string;
}

// Declare global Unity instance
declare global {
    var unityGameInstance: UnityInstance | undefined;
    var unityInstance: UnityInstance | undefined;
}

/**
 * Utility class for game-related functionality
 */
class GameUtils {
    // Create a dedicated logger for GameUtils
    static logger = new CustomLogs({ 
        title: 'MeowEngine',
        minLevel: 'DEBUG',
        enabled: true,
        showTimestamp: true
    });

    /**
     * Waits for either Unity instance to be ready before executing a callback
     * @param callback - Function to execute when a Unity instance is ready
     * @param checkInterval - Interval between checks in ms
     * @param timeout - Maximum time to wait in ms
     */
    static waitForUnityInstance(
        callback: (unityInstance: UnityInstance) => void, 
        checkInterval: number = 100, 
        timeout: number = 10000
    ): void {
        const startTime: number = Date.now();
        
        GameUtils.logger.info(`Waiting for Unity instance (either unityGameInstance or unityInstance) (timeout: ${timeout}ms, interval: ${checkInterval}ms)...`);
        
        const checkUnityInstances = (): void => {
            // Log attempt number for debugging
            const elapsedTime: number = Date.now() - startTime;
            const attemptNum: number = Math.floor(elapsedTime / checkInterval) + 1;
            
            GameUtils.logger.debug(`Unity instances check attempt #${attemptNum} (${elapsedTime}ms elapsed)`);
            
            // Check if unityGameInstance is ready
            const unityGameInstanceReady = (
                typeof unityGameInstance !== 'undefined' &&
                unityGameInstance !== null &&
                typeof unityGameInstance.SendMessage === 'function'
            );
            
            // Check if unityInstance is ready
            const unityInstanceReady = (
                typeof unityInstance !== 'undefined' &&
                unityInstance !== null &&
                typeof unityInstance.SendMessage === 'function'
            );
            
            let foundInstance: UnityInstance | null = null;
            let instanceType: string = '';
            
            // Priority: check unityGameInstance first, then unityInstance
            if (unityGameInstanceReady) {
                foundInstance = unityGameInstance!;
                instanceType = 'unityGameInstance';
            } else if (unityInstanceReady) {
                foundInstance = unityInstance!;
                instanceType = 'unityInstance';
            }
            
            if (foundInstance) {
                // Unity instance found
                GameUtils.logger.success(`Unity instance found and ready! (${instanceType})`, {
                    instanceType: instanceType,
                    timeToLoad: `${elapsedTime}ms`,
                    checks: attemptNum
                });
                                
                // Notify the main logger as well
                MeowEngine.Log.Instance?.success(`${instanceType} was found!`);
                
                // Execute callback
                GameUtils.logger.info('Executing Unity ready callback');
                callback(foundInstance);
            } else if (elapsedTime > timeout) {
                // Timeout reached
                const errorMsg: string = `Timeout: No Unity instance ready after ${timeout}ms`;
                GameUtils.logger.error(errorMsg, {
                    checkAttempts: attemptNum,
                    unityGameInstanceExists: typeof unityGameInstance !== 'undefined',
                    unityGameInstanceNull: unityGameInstance === null,
                    unityInstanceExists: typeof unityInstance !== 'undefined',
                    unityInstanceNull: unityInstance === null,
                });
                console.error(errorMsg);
            } else {
                // Continue checking
                setTimeout(checkUnityInstances, checkInterval);
            }
        };
        
        // Start checking
        checkUnityInstances();
    }

    /**
     * Cleans a username by removing color tags and brackets
     * @param rawName - Raw username to clean
     * @returns Cleaned username
     */
    static cleanUsername(rawName: string): string {
        GameUtils.logger.debug(`Cleaning username: "${rawName}"`);
        
        // Track changes for logging
        const changes: string[] = [];
        
        // Remove color tags
        let cleaned: string = rawName.replaceAll(/<color=#[A-Fa-f0-9]{6}>/g, '').replaceAll('</color>', '');
        if (cleaned !== rawName) {
            changes.push('Removed color tags');
        }
        
        // Remove leading brackets
        const beforeBracketRemoval: string = cleaned;
        cleaned = cleaned.replaceAll(/^\[[^\]]+\]/g, '');
        if (cleaned !== beforeBracketRemoval) {
            changes.push('Removed leading brackets');
        }
        
        // Trim whitespace
        const beforeTrim: string = cleaned;
        cleaned = cleaned.trim();
        if (cleaned !== beforeTrim) {
            changes.push('Trimmed whitespace');
        }
        
        GameUtils.logger.info(`Username cleaned: "${rawName}" → "${cleaned}"`, {
            changes: changes.length ? changes : 'No changes needed',
            originalLength: rawName.length,
            newLength: cleaned.length
        });
        
        return cleaned;
    }

    static seperateRoomIdFromRoomName(room: string): RoomInfo {
        const roomName: string = room.split(" (#")[0];
        const roomId: string = `(#${room.split(" (#")[1]}`;

        return { roomName, roomId };
    }

    /**
     * Converts a PhotonView Id to an Actor Number
     * @param viewId - PhotonView Id
     * @returns Returns the PhotonView Id
     */
    static viewIdToActorNr(viewId: number): number {
        // In Photon, viewId is typically calculated as:
        // viewId = actorNr * 1000 + offset (0-9)
        // So to get actorNr from viewId, we divide by 1000 and floor the result
        return Math.floor(viewId / 1000);
    }
  
    /**
     * Gets the offset for the PhotonView Id
     * @param viewId - PhotonView Id
     * @returns Returns the offset for the PhotonView Id
     */
    static getViewIdOffset(viewId: number): number {
        // Get the offset (0-9) from a viewId
        // The offset is the last digit of the viewId
        return viewId % 10;
    }
    
    /**
     * Converts an Actor Number to a PhotonView Id
     * @param actorNr - Actor Number
     * @param viewIdOffset - The PhotonView Id offset
     * @returns Returns the PhotonView Id
     */
    static actorNrToViewId(actorNr: number, viewIdOffset: number = 0): number {
        // Make sure offset is within valid range (0-9)
        if (viewIdOffset < 0 || viewIdOffset > 9) {
            console.warn("ViewID offset should be between 0-9, adjusting to valid range");
            viewIdOffset = Math.abs(viewIdOffset) % 10;
        }
        
        // Default Photon formula: viewId = actorNr * 1000 + offset (0-9)
        return actorNr * 1000 + viewIdOffset;
    }
    
    /**
     * Initialize GameUtils with custom logging settings
     * @param options - Configuration options
     */
    static init(options: GameUtilsOptions = {}): void {
        const { logLevel, logTitle } = options;
        
        if (logLevel) {
            GameUtils.logger.setMinLevel(logLevel as keyof typeof CustomLogs.LEVELS);
            GameUtils.logger.info(`Log level set to: ${logLevel}`);
        }
        
        if (logTitle) {
            GameUtils.logger.setTitle(logTitle);
            GameUtils.logger.info(`Logger title set to: ${logTitle}`);
        }
        
        GameUtils.logger.success('GameUtils initialized');
    }
    
    /**
     * Log a player joining the game
     * @param username - Player's username
     * @param playerData - Additional player data
     */
    static logPlayerJoin(username: string, playerData: PlayerData = {}): void {
        // Clean the username if it has formatting
        const cleanedName: string = GameUtils.cleanUsername(username);
        
        // Log the join event
        GameUtils.logger.join(cleanedName, {
            original: username,
            cleaned: cleanedName !== username,
            ...playerData
        });
        
        // Also log to MeowEngine if available
        if (MeowEngine.Log && MeowEngine.Log.Instance) {
            MeowEngine.Log.Instance.info(`Player joined: ${cleanedName}`);
        }
    }
    
    /**
     * Log a player leaving the game
     * @param username - Player's username
     * @param reason - Reason for leaving (disconnect, kicked, etc.)
     * @param playerData - Additional player data
     */
    static logPlayerLeave(username: string, reason: string = '', playerData: PlayerData = {}): void {
        // Clean the username if it has formatting
        const cleanedName: string = GameUtils.cleanUsername(username);
        
        // Log the leave event
        GameUtils.logger.leave(cleanedName, reason, {
            original: username,
            cleaned: cleanedName !== username,
            ...playerData
        });
        
        // Also log to MeowEngine if available
        if (MeowEngine.Log && MeowEngine.Log.Instance) {
            const reasonText: string = reason ? ` (${reason})` : '';
            MeowEngine.Log.Instance.info(`Player left: ${cleanedName}${reasonText}`);
        }
    }
}

export default GameUtils;