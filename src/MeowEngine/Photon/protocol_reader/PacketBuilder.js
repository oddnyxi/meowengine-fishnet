import { Writer } from "./Old/OldWriter";

export class PacketBuilder {
  /**
   * Creates a new request packet (type 2)
   * @param {number} opCode - The operation code for the request
   * @returns {Object} A new Photon packet object
   */
  static createRequest(opCode) {
      return {
          magic: 0xf3,
          type: 2,
          op_code: opCode,
          encrypted: false,
          relay: false,
          sections: [],
          // Helper method to add a parameter to the packet
          addParam(key, typeObj) {
              this.sections.push([key, typeObj]);
              return this;
          },
          // Serializes the packet to an ArrayBuffer, this is used most of the time, this serializes the data and allows it to be sent back
          toBuffer() {
              const serializer = new Writer(this);
              return serializer.serialize();
          },
          // Converts the packet to a base64 string if needed
          toBase64() {
              const buffer = this.toBuffer();
              const bytes = new Uint8Array(buffer);
              const binary = Array.from(bytes)
                  .map(byte => String.fromCharCode(byte))
                  .join('');
              return btoa(binary);
          },
          // Converts the packet to a hex string, most likely used in rare cases
          toHex() {
              const buffer = this.toBuffer();
              return Array.from(new Uint8Array(buffer))
                  .map(b => b.toString(16).padStart(2, '0'))
                  .join('');
          },
      };
  }

  /**
   * Creates a new event packet (type 4)
   * @param {number} eventId - The event ID
   * @returns {Object} A new Photon packet object
   */
  static createEvent(eventId) {
      return {
          magic: 0xf3,
          type: 4,
          event_id: eventId,
          encrypted: false,
          relay: false,
          sections: [],
          // Helper method to add a parameter to the packet
          addParam(key, typeObj) {
              this.sections.push([key, typeObj]);
              return this;
          },
          // Serializes the packet to an ArrayBuffer
          toBuffer() {
              const serializer = new Writer(this);
              return serializer.serialize();
          },
          // Converts the packet to a base64 string
          toBase64() {
              const buffer = this.toBuffer();
              const bytes = new Uint8Array(buffer);
              const binary = Array.from(bytes)
                  .map(byte => String.fromCharCode(byte))
                  .join('');
              return btoa(binary);
          },
          // Converts the packet to a hex string
          toHex() {
              const buffer = this.toBuffer();
              return Array.from(new Uint8Array(buffer))
                  .map(b => b.toString(16).padStart(2, '0'))
                  .join('');
          },
      };
  }

  /**
   * Creates a new response packet (type 3)
   * @param {number} returnCode - The return code for the response
   * @param {string} debugMessage - Debug message (optional)
   * @returns {Object} A new Photon packet object
   */
  static createResponse(returnCode, debugMessage = '') {
      return {
          magic: 0xf3,
          type: 3,
          return_code: returnCode,
          debug_message: {
              type: 0x73,
              data: debugMessage,
          },
          encrypted: false,
          relay: false,
          sections: [],
          // Helper method to add a parameter to the packet
          addParam(key, typeObj) {
              this.sections.push([key, typeObj]);
              return this;
          },
          // Serializes the packet to an ArrayBuffer
          toBuffer() {
              const serializer = new Writer(this);
              return serializer.serialize();
          },
          // Converts the packet to a base64 string
          toBase64() {
              const buffer = this.toBuffer();
              const bytes = new Uint8Array(buffer);
              const binary = Array.from(bytes)
                  .map(byte => String.fromCharCode(byte))
                  .join('');
              return btoa(binary);
          },
          // Converts the packet to a hex string
          toHex() {
              const buffer = this.toBuffer();
              return Array.from(new Uint8Array(buffer))
                  .map(b => b.toString(16).padStart(2, '0'))
                  .join('');
          },
      };
  }

  /**
   * Creates a new ping packet (magic 0xF0)
   * @param {number} serverTime - Server time
   * @param {number} clientTime - Client time
   * @returns {Object} A new Photon packet object
   */
  static createPing(serverTime, clientTime) {
      return {
          magic: 0xf0,
          server_time: serverTime,
          client_time: clientTime,
          // Serializes the packet to an ArrayBuffer
          toBuffer() {
              const serializer = new Writer(this);
              return serializer.serialize();
          },
          // Converts the packet to a base64 string
          toBase64() {
              const buffer = this.toBuffer();
              return btoa(String.fromCharCode(...new Uint8Array(buffer)));
          },
      };
  }

  /**
   * Helper to create common Photon type objects
   */
  static types = {
      // Null value
      null() {
          return {
              type: 0x2a,
              data: null,
          };
      },
      // String value
      string(value) {
          return {
              type: 0x73,
              data: value,
          };
      },
      // Boolean value
      boolean(value) {
          return {
              type: 0x6f,
              data: !!value,
          };
      },
      // Integer value
      integer(value) {
          return {
              type: 0x69,
              data: value,
          };
      },
      // Short value
      short(value) {
          return {
              type: 0x6b,
              data: value,
          };
      },
      // Byte value
      byte(value) {
          return {
              type: 0x62,
              data: value,
          };
      },
      // Float value
      float(value) {
          return {
              type: 0x66,
              data: value,
          };
      },
      // Double value
      double(value) {
          return {
              type: 0x64,
              data: value,
          };
      },
      // Long value (BigInt)
      long(value) {
          return {
              type: 0x6c,
              data: BigInt(value),
          };
      },
      // ByteArray value
      byteArray(value) {
          return {
              type: 0x78,
              data: value,
          };
      },
      // IntArray value
      intArray(value) {
          return {
              type: 0x6e,
              data: value,
          };
      },
      // StringArray value
      stringArray(value) {
          return {
              type: 0x61,
              data: value,
          };
      },
      // ObjectArray value
      objectArray(value) {
          return {
              type: 0x7a,
              data: value,
          };
      },
      // Dictionary value
      dictionary(keyType, valType, entries = []) {
          const map = new Map();
          for (const [key, val] of entries) {
              map.set(key, val);
          }

          // Add helper methods
          const extendMap = map => {
              map.rawGet = map.get;
              map.rawSet = map.set;
              map.get = function(key) {
                  return map.rawGet(
                      Array.from(map.keys()).find(
                          x => x.type === key.type && x.data === key.data
                      )
                  );
              };
              map.set = function(key, value) {
                  return map.rawSet(
                      Array.from(map.keys()).find(
                          x => x.type === key.type && x.data === key.data
                      ),
                      value
                  );
              };
              map.byIndex = function(idx) {
                  let index = 0;
                  for (const value of map.values()) {
                      if (index === idx) return value;
                      index++;
                  }
                  return undefined;
              };
          };
          extendMap(map);
          return {
              type: 0x44,
              data: {
                  keyType,
                  valType,
                  map,
              },
          };
      },
      // HashTable value
      hashTable(entries = []) {
          const map = new Map();
          for (const [key, val] of entries) {
              map.set(key, val);
          }

          // Add helper methods
          const extendMap = map => {
              map.rawGet = map.get;
              map.rawSet = map.set;
              map.get = function(key) {
                  return map.rawGet(
                      Array.from(map.keys()).find(
                          x => x.type === key.type && x.data === key.data
                      )
                  );
              };
              map.set = function(key, value) {
                  return map.rawSet(
                      Array.from(map.keys()).find(
                          x => x.type === key.type && x.data === key.data
                      ),
                      value
                  );
              };
              map.byIndex = function(idx) {
                  let index = 0;
                  for (const value of map.values()) {
                      if (index === idx) return value;
                      index++;
                  }
                  return undefined;
              };
          };
          extendMap(map);
          return {
              type: 0x68,
              data: map,
          };
      },
      // Vector2 custom type
      vector2(x, y) {
          return {
              type: 0x63,
              data: {
                  variant: 'W',
                  data: {
                      x,
                      y,
                  },
              },
          };
      },
      // Vector3 custom type
      vector3(x, y, z) {
          return {
              type: 0x63,
              data: {
                  variant: 'V',
                  data: {
                      x,
                      y,
                      z,
                  },
              },
          };
      },
      // Quaternion custom type
      quaternion(w, x, y, z) {
          return {
              type: 0x63,
              data: {
                  variant: 'Q',
                  data: {
                      w,
                      x,
                      y,
                      z,
                  },
              },
          };
      },
      // PhotonPlayer custom type
      player(playerId) {
          return {
              type: 0x63,
              data: {
                  variant: 'P',
                  data: {
                      player_id: playerId,
                  },
              },
          };
      },
      integerArray(value) {
          return {
              type: 0x6e,
              data: value,
          };
      },
      array(elementType, elements) {
          return {
              type: 0x79,
              data: {
                  type: elementType,
                  arr: elements,
              },
          };
      },
  };
}

export default PacketBuilder;