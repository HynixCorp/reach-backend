import { nanoid } from "nanoid";
import { cryptManager } from "./cesar";

export async function generateTemporaryToken(organizationId: string) {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    let token = nanoid(8);

    for (let i = 0; i < 32; i++) {
        token += letters[Math.floor(Math.random() * letters.length)];
    }

    return cryptManager.start().encrypt(organizationId, token);
}