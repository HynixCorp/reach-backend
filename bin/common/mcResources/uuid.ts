import fetch from 'cross-fetch';
import { logger } from '../services/logger.service';

export default async function getMinecraftUUID(username: string): Promise<string | null> {
    try {
        const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`);
        if (!response.ok) {
            throw new Error(`Error fetching UUID for ${username}: ${response.statusText}`);
        }
        const data = await response.json();
        return data.id;
    } catch (error) {
        logger.error("mcResources", `Failed to fetch UUID for ${username}: ${error}`);
        return null;
    }
}
