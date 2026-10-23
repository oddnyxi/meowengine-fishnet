interface Vector2 {
    x: number;
    y: number;
}

interface Vector3 {
    x: number;
    y: number;
    z: number;
}

interface Vector4 {
    x: number;
    y: number;
    z: number;
    w: number;
}

const WEB_ADDRESS = "https://server.blayzegames.com/OnlineAccountSystem/fairplay_spec.php";
const MAGIC = "1983031920131006";
const SEC_SIZE = 16;

export class FairCollection {
    static #off1: number = 0;
    static #off2: number = 0;
    static #sec1: Uint8Array = new Uint8Array(SEC_SIZE);
    static #sec2: Uint8Array = new Uint8Array(SEC_SIZE);
    static #response: string = "";
    static #enabled: boolean = false;

    static async #initRequest(): Promise<void> {
        try {
            const params = new URLSearchParams();
            params.append('magic', MAGIC);

            const response = await fetch(
                WEB_ADDRESS, {
                    method: 'POST',
                    headers: {
                        accept: '*/*',
                        'accept-language': 'en-US,en;q=0.9',
                        'content-type': 'application/x-www-form-urlencoded'
                    },
                    body: params.toString(),
                }
            );
            
            if (!response.ok) {
                throw Error(response.statusText);
            }
            
            this.#response = await response.text();
        } catch (error) {
            console.error("FairCollection initialization failed:", error);
            throw error;
        }
    }
    
    static #initData(): void {
        const bytes: Uint8Array = this.#hexStringToUint8Array(this.#response);

        if (bytes[1] !== 0) {
            return;
        }

        this.#off1 = bytes[3];
        this.#off2 = bytes[4];

        for (let i = 0; i < SEC_SIZE; ++i) {
            this.#sec1[i] = bytes[i + 5];
            this.#sec2[i] = bytes[i + 5 + SEC_SIZE];
        }
        
        this.#enabled = true;
    }
    
    static #hexStringToUint8Array(hexString: string): Uint8Array {
        if (hexString.length % 2 !== 0) {
            throw new Error('Hex string must have an even number of characters');
        }
        
        const bytes = new Uint8Array(hexString.length / 2);
        
        for (let i = 0; i < hexString.length; i += 2) {
            bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
        }
        
        return bytes;
    }
    
    static #transformArrayBuffer(buf: ArrayBuffer, sec: Uint8Array, off: number): void {
        const bytes = new Uint8Array(buf);
        let k = 0;
        
        for (let i = 0; i < bytes.length; ++i) {
            const secIndex = off + (k >>> 1);
            if (k & 1) {
                bytes[i] ^= sec[secIndex] >>> 4;
            } else {
                bytes[i] ^= sec[secIndex] & 0xF;
            }
            ++k;
            if (k >= sec.length) {
                k = 0;
            }
        }
    }

    static async InitOperation(): Promise<string> {
        let res = "";
        if (!this.#enabled) {
            await this.#initRequest();
            this.#initData();

            res = this.#response;
        }

        return res;
    }

    static GetEncryptedDouble(value: number): number {
        if (!this.#enabled) {
            return value;
        }

        const arr = new Float64Array(1);
        arr[0] = value;
        this.#transformArrayBuffer(arr.buffer, this.#sec1, this.#off1);
        return arr[0];
    }
    
    static GetDecryptedDouble(value: number): number {
        if (!this.#enabled) {
            return value;
        }

        const arr = new Float64Array(1);
        arr[0] = value;
        this.#transformArrayBuffer(arr.buffer, this.#sec2, this.#off2);
        return arr[0];
    }

    static GetEncryptedFloat(value: number): number {
        if (!this.#enabled) {
            return value;
        }

        const arr = new Float32Array(1);
        arr[0] = value;
        this.#transformArrayBuffer(arr.buffer, this.#sec1, this.#off1);
        return arr[0];
    }
    
    static GetDecryptedFloat(value: number): number {
        if (!this.#enabled) {
            return value;
        }

        const arr = new Float32Array(1);
        arr[0] = value;
        this.#transformArrayBuffer(arr.buffer, this.#sec2, this.#off2);
        return arr[0];
    }

    static GetEncryptedInteger(value: number): number {
        if (!this.#enabled) {
            return value;
        }

        const arr = new Int32Array(1);
        arr[0] = value;
        this.#transformArrayBuffer(arr.buffer, this.#sec1, this.#off1);
        return arr[0];
    }
    
    static GetDecryptedInteger(value: number): number {
        if (!this.#enabled) {
            return value;
        }

        const arr = new Int32Array(1);
        arr[0] = value;
        this.#transformArrayBuffer(arr.buffer, this.#sec2, this.#off2);
        return arr[0];
    }

    static GetEncryptedString(value: string): string {
        if (!this.#enabled) {
            return value;
        }

        const arr = new TextEncoder().encode(value);
        this.#transformArrayBuffer(arr.buffer, this.#sec1, this.#off1);
        return new TextDecoder().decode(arr);
    }
    
    static GetDecryptedString(value: string): string {
        if (!this.#enabled) {
            return value;
        }

        const arr = new TextEncoder().encode(value);
        this.#transformArrayBuffer(arr.buffer, this.#sec2, this.#off2);
        return new TextDecoder().decode(arr);
    }

    static GetEncryptedVector2(value: Vector2): Vector2 {
        if (!this.#enabled) {
            return value;
        }

        return {
            x: this.GetEncryptedFloat(value.x),
            y: this.GetEncryptedFloat(value.y)
        };
    }
    
    static GetDecryptedVector2(value: Vector2): Vector2 {
        if (!this.#enabled) {
            return value;
        }

        return {
            x: this.GetDecryptedFloat(value.x),
            y: this.GetDecryptedFloat(value.y)
        };
    }

    static GetEncryptedVector2Int(value: Vector2): Vector2 {
        if (!this.#enabled) {
            return value;
        }

        return {
            x: this.GetEncryptedInteger(value.x),
            y: this.GetEncryptedInteger(value.y)
        };
    }
    
    static GetDecryptedVector2Int(value: Vector2): Vector2 {
        if (!this.#enabled) {
            return value;
        }

        return {
            x: this.GetDecryptedInteger(value.x),
            y: this.GetDecryptedInteger(value.y)
        };
    }

    static GetEncryptedVector3(value: Vector3): Vector3 {
        if (!this.#enabled) {
            return value;
        }

        return {
            x: this.GetEncryptedFloat(value.x),
            y: this.GetEncryptedFloat(value.y),
            z: this.GetEncryptedFloat(value.z)
        };
    }
    
    static GetDecryptedVector3(value: Vector3): Vector3 {
        if (!this.#enabled) {
            return value;
        }

        return {
            x: this.GetDecryptedFloat(value.x),
            y: this.GetDecryptedFloat(value.y),
            z: this.GetDecryptedFloat(value.z)
        };
    }

    static GetEncryptedVector3Int(value: Vector3): Vector3 {
        if (!this.#enabled) {
            return value;
        }

        return {
            x: this.GetEncryptedInteger(value.x),
            y: this.GetEncryptedInteger(value.y),
            z: this.GetEncryptedInteger(value.z)
        };
    }
    
    static GetDecryptedVector3Int(value: Vector3): Vector3 {
        if (!this.#enabled) {
            return value;
        }

        return {
            x: this.GetDecryptedInteger(value.x),
            y: this.GetDecryptedInteger(value.y),
            z: this.GetDecryptedInteger(value.z)
        };
    }

    static GetEncryptedVector4(value: Vector4): Vector4 {
        if (!this.#enabled) {
            return value;
        }

        return {
            x: this.GetEncryptedFloat(value.x),
            y: this.GetEncryptedFloat(value.y),
            z: this.GetEncryptedFloat(value.z),
            w: this.GetEncryptedFloat(value.w)
        };
    }
    
    static GetDecryptedVector4(value: Vector4): Vector4 {
        if (!this.#enabled) {
            return value;
        }

        return {
            x: this.GetDecryptedFloat(value.x),
            y: this.GetDecryptedFloat(value.y),
            z: this.GetDecryptedFloat(value.z),
            w: this.GetDecryptedFloat(value.w)
        };
    }
}

export default FairCollection;