import fetch from 'cross-fetch';
import 'colorts/lib/string';

export default async function getMinecraftUUID(username: string): Promise<string | null> {
    try {
        const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`);
        if (!response.ok) {
            throw new Error(`[REACH-SDK - mcResources] Error fetching UUID for ${username}: ${response.statusText}`.red);
        }
        const data = await response.json();
        return data.id;
    } catch (error) {
        console.error(`[REACH-SDK - mcResources] Failed to fetch UUID for ${username}:`.red, error);
        return null;
    }
}
