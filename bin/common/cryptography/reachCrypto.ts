import { createCipheriv, createDecipheriv } from "crypto";
import {
    sha256,
    bufferToBase64,
    base64ToBuffer
} from "./helpers";

export class ReachC {
    private password: string;
    private iv: Buffer;
    private salt: Buffer;

    constructor(password: string) {
        this.password = password;

        // Derivamos salt e IV fijos desde el password
        const baseHash = sha256(password);
        this.salt = baseHash.subarray(0, 16); // 128 bits
        this.iv = baseHash.subarray(16, 32);  // otros 128 bits
    }

    encryptRaw(data: Buffer | string): Buffer {
        const input = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
        const key = sha256(Buffer.concat([Buffer.from(this.password), this.salt]));
        const cipher = createCipheriv("aes-256-cbc", key, this.iv);
        const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
        return this._mathModelEncrypt(encrypted);
    }

    decryptRaw(data: Buffer): Buffer {
        const key = sha256(Buffer.concat([Buffer.from(this.password), this.salt]));
        const decipher = createDecipheriv("aes-256-cbc", key, this.iv);
        const descrambled = this._mathModelDecrypt(data);
        return Buffer.concat([decipher.update(descrambled), decipher.final()]);
    }

    private _logisticMap(seed: number, iterations: number): number[] {
        let x = seed;
        const r = 3.99;
        const sequence: number[] = [];

        for (let i = 0; i < iterations; i++) {
            x = r * x * (1 - x);
            sequence.push(x);
        }

        return sequence;
    }

    private _mathModelEncrypt(buffer: Buffer): Buffer {
        const keyHash = sha256(Buffer.from(this.password));
        const seed = keyHash[0] / 256;
        const chaosSeq = this._logisticMap(seed, buffer.length);

        const scrambled = Buffer.from(buffer);
        for (let i = 0; i < scrambled.length; i++) {
            const chaosByte = Math.floor(chaosSeq[i] * 256) & 0xff;
            scrambled[i] ^= chaosByte;
        }
        return scrambled;
    }

    private _mathModelDecrypt(buffer: Buffer): Buffer {
        return this._mathModelEncrypt(buffer); // reversible
    }
}
