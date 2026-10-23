import {
    OperationCode,
    ParameterCode
} from "../MeowEngine/Photon/protocol_reader/constants";
import { PacketBuilder } from "../MeowEngine/Photon/protocol_reader/PacketBuilder";
import { EventCaching } from "./Enums/EventCaching";
import { ReceiverGroup } from "./Enums/ReceiverGroup";
import { RaiseEventOptions } from "./StaticDefinitions/RaiseEventOptions";
import { SendOptions } from "./StaticDefinitions/SendOptions";

export class PhotonClient {
    constructor({ originalSend, socket }) {
        this.opParameters = new Map();
        this.socket = socket;
        this.originalSend = originalSend;
    }

    /**
     * Raises an event to be sent to other clients or cached for new clients
     * @param {number} eventCode - Identifies the type of event
     * @param {Object} customEventContent - The custom content/data to be sent with the event
     * @param {RaiseEventOptions} raiseEventOptions - Options that control the behavior of the event
     * @param {SendOptions} sendOptions - Options for the send operation
     * @returns {boolean} True if operation was sent successfully
     */
    OpRaiseEvent(
        eventCode,
        customEventContent,
        raiseEventOptions,
        sendOptions
    ) {
        // Clear the parameters map for reuse
        this.opParameters.clear();

        if (raiseEventOptions) {
            // Handle caching options
            if (raiseEventOptions.CachingOption !== EventCaching.DoNotCache) {
                this.opParameters.set(
                    ParameterCode.Cache,
                    PacketBuilder.types.byte(raiseEventOptions.CachingOption)
                );
            }

            // Handle different caching cases
            switch (raiseEventOptions.CachingOption) {
                case EventCaching.SliceSetIndex:
                case EventCaching.SlicePurgeIndex:
                case EventCaching.SlicePurgeUpToIndex:
                    // In the original code, there's a commented section about CacheSliceIndex
                    // and then immediately returns with SendOperation call
                    return this.SendOperation(
                        OperationCode.RaiseEvent,
                        this.opParameters,
                        sendOptions
                    );

                case EventCaching.SliceIncreaseIndex:
                case EventCaching.RemoveFromRoomCacheForActorsLeft:
                    return this.SendOperation(
                        OperationCode.RaiseEvent,
                        this.opParameters,
                        sendOptions
                    );

                case EventCaching.RemoveFromRoomCache:
                    if (raiseEventOptions.TargetActors) {
                        this.opParameters.set(
                            ParameterCode.ActorList,
                            PacketBuilder.types.integerArray(
                                raiseEventOptions.TargetActors
                            )
                        );
                    }
                    break;

                default:
                    if (raiseEventOptions.TargetActors) {
                        this.opParameters.set(
                            ParameterCode.ActorList,
                            PacketBuilder.types.integerArray(
                                raiseEventOptions.TargetActors
                            )
                        );
                    } else if (raiseEventOptions.InterestGroup !== 0) {
                        this.opParameters.set(
                            ParameterCode.Group,
                            PacketBuilder.types.byte(
                                raiseEventOptions.InterestGroup
                            )
                        );
                    } else if (
                        raiseEventOptions.Receivers !== ReceiverGroup.Others
                    ) {
                        this.opParameters.set(
                            ParameterCode.ReceiverGroup,
                            PacketBuilder.types.byte(
                                raiseEventOptions.Receivers
                            )
                        );
                    }

                    if (raiseEventOptions.Flags.HttpForward) {
                        this.opParameters.set(
                            ParameterCode.EventForward,
                            PacketBuilder.types.byte(
                                raiseEventOptions.Flags.WebhookFlags
                            )
                        );
                    }
                    break;
            }
        }

        // Add event code parameter
        this.opParameters.set(
            ParameterCode.Code,
            PacketBuilder.types.byte(eventCode)
        );

        // Add custom event content if provided
        if (customEventContent !== null && customEventContent !== undefined) {
            // Here we would need to determine the proper type based on the customEventContent
            // For simplicity, we'll use a generic approach
            this.opParameters.set(
                ParameterCode.Data,
                this.convertToPhotonType(customEventContent)
            );
        }

        // Send the operation
        return this.SendOperation(
            OperationCode.RaiseEvent,
            this.opParameters,
            sendOptions
        );
    }

    /**
     * Converts JavaScript values to proper Photon types
     * @param {*} value - Value to convert
     * @returns {Object} - Photon type object
     */
    convertToPhotonType(value) {
        if (value === null || value === undefined) {
            return PacketBuilder.types.null();
        }

        switch (typeof value) {
            case "string":
                return PacketBuilder.types.string(value);
            case "boolean":
                return PacketBuilder.types.boolean(value);
            case "number":
                // Check if it's an integer or float
                if (Number.isInteger(value)) {
                    return PacketBuilder.types.integer(value);
                } else {
                    return PacketBuilder.types.float(value);
                }
            case "object":
                if (Array.isArray(value)) {
                    // Special case for integer arrays which need special handling
                    // This is critical for compatibility with C# int[] expectation
                    if (
                        value.every(
                            item =>
                                typeof item === "number" &&
                                Number.isInteger(item)
                        )
                    ) {
                        return PacketBuilder.types.intArray(value); // Use intArray explicitly
                    }

                    // Determine array type (this is a simplified approach)
                    if (value.length === 0) {
                        return PacketBuilder.types.objectArray([]);
                    }

                    const firstItemType = typeof value[0];
                    if (firstItemType === "string") {
                        return PacketBuilder.types.stringArray(value);
                    } else {
                        // Convert each item in the array and return objectArray
                        const convertedItems = value.map(item =>
                            this.convertToPhotonType(item)
                        );
                        return PacketBuilder.types.objectArray(convertedItems);
                    }
                } else {
                    // For objects, create a hashtable
                    const entries = Object.entries(value).map(([key, val]) => [
                        PacketBuilder.types.string(key),
                        this.convertToPhotonType(val)
                    ]);
                    return PacketBuilder.types.hashTable(entries);
                }
            default:
                // Default to string for any other types
                return PacketBuilder.types.string(String(value));
        }
    }

    /**
     * Sends an operation to the server
     * @param {number} operationCode - The operation code
     * @param {Map} parameters - Map of parameters
     * @param {SendOptions} sendOptions - Options for sending
     * @returns {boolean} True if the operation was sent successfully
     */
    SendOperation(operationCode, parameters, sendOptions) {
        // Create a new request packet
        const packet = PacketBuilder.createRequest(operationCode);

        // Add all parameters from the map
        for (const [key, value] of parameters.entries()) {
            packet.addParam(key, value);
        }

        // For demonstration, just log the packet
        console.log("Sending operation:", {
            code: operationCode,
            parameters: Array.from(parameters.entries()),
            sendOptions,
            buffer: packet.toBuffer()
        });

        let args = [];
        args[0] = packet.toBuffer();
        this.originalSend.apply(this.socket, args);

        // Return true to indicate success (in real implementation, would check if send was successful, since this is NOT the original C# version and its not directly hooked from the game, we cant do that)
        return true;
    }

    TransferOwnership(viewID, playerID) {
        let raiseEventOptions = new RaiseEventOptions();
        raiseEventOptions.CachingOption = EventCaching.AddToRoomCache;
        raiseEventOptions.Receivers = ReceiverGroup.All;

        let sendOptions = new SendOptions();
        sendOptions.Reliability = true;

        return this.OpRaiseEvent(
            210,
            [viewID, playerID],
            raiseEventOptions,
            sendOptions
        );
    }
}

PhotonClient.TransferOwnershipStatic = function (client, viewID, playerID) {
    if (!client || !(client instanceof PhotonClient)) {
        console.error("Invalid PhotonClient instance");
        return false;
    }

    return client.TransferOwnership(viewID, playerID);
};

export default PhotonClient;
