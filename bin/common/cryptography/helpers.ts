// bin/common/cryptography/helpers.ts
import { createHash, randomBytes } from "crypto";

export function sha256(data: string | Buffer): Buffer {
    return createHash("sha256").update(data).digest();
}

export function generateKey(password: string, salt: Buffer): Buffer {
    return sha256(Buffer.concat([Buffer.from(password), salt]));
}

export function generateIV(): Buffer {
    return randomBytes(16);
}

export function bufferToBase64(data: Buffer): string {
    return data.toString("base64");
}

export function base64ToBuffer(data: string): Buffer {
    return Buffer.from(data, "base64");
}