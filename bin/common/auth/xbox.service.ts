/**
 * Xbox Authentication Service
 * 
 * Handles Xbox Live and Minecraft authentication flow:
 * 1. User authenticates with Microsoft via Better-Auth
 * 2. Exchange Microsoft token for Xbox Live token
 * 3. Exchange Xbox Live token for XSTS token
 * 4. Exchange XSTS token for Minecraft access token
 * 5. Get Minecraft profile (UUID and username)
 * 
 * This service is used after Better-Auth Microsoft OAuth to get Minecraft credentials.
 */

import axios from "axios";
import { logger } from "../services/logger.service";

// Xbox Live API endpoints
const XBOX_USER_AUTH_URL = "https://user.auth.xboxlive.com/user/authenticate";
const XBOX_XSTS_AUTH_URL = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MINECRAFT_AUTH_URL = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MINECRAFT_PROFILE_URL = "https://api.minecraftservices.com/minecraft/profile";
const MINECRAFT_ENTITLEMENTS_URL = "https://api.minecraftservices.com/entitlements/mcstore";

export interface XboxLiveToken {
  token: string;
  userHash: string;
  expiresOn: Date;
}

export interface XSTSToken {
  token: string;
  userHash: string;
  xuid: string;
  gamertag: string;
  expiresOn: Date;
}

export interface MinecraftToken {
  accessToken: string;
  username: string;
  expiresIn: number;
  expiresOn: Date;
}

export interface MinecraftProfile {
  id: string; // UUID without dashes
  name: string; // Username
  skins: Array<{
    id: string;
    state: string;
    url: string;
    variant: string;
  }>;
  capes: Array<{
    id: string;
    state: string;
    url: string;
    alias: string;
  }>;
}

export interface MinecraftOwnership {
  items: Array<{
    name: string;
    signature: string;
  }>;
  signature: string;
  keyId: string;
}

export interface XboxAuthResult {
  success: boolean;
  error?: string;
  xboxLiveToken?: XboxLiveToken;
  xstsToken?: XSTSToken;
  minecraftToken?: MinecraftToken;
  profile?: MinecraftProfile;
  ownsMinecraft?: boolean;
}

/**
 * Exchange Microsoft OAuth token for Xbox Live token
 */
export async function getXboxLiveToken(msAccessToken: string): Promise<XboxLiveToken> {
  logger.debug("XboxAuth", "Exchanging Microsoft token for Xbox Live token...");
  
  try {
    const response = await axios.post(XBOX_USER_AUTH_URL, {
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: `d=${msAccessToken}`
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT"
    }, {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });

    const data = response.data;
    return {
      token: data.Token,
      userHash: data.DisplayClaims.xui[0].uhs,
      expiresOn: new Date(data.NotAfter)
    };
  } catch (error: any) {
    logger.error("XboxAuth", `Failed to get Xbox Live token: ${error.response?.data || error.message}`);
    throw new Error(`Xbox Live authentication failed: ${error.response?.data?.XErr || error.message}`);
  }
}

/**
 * Exchange Xbox Live token for XSTS token
 */
export async function getXSTSToken(xboxLiveToken: XboxLiveToken): Promise<XSTSToken> {
  logger.debug("XboxAuth", "Exchanging Xbox Live token for XSTS token...");
  
  try {
    const response = await axios.post(XBOX_XSTS_AUTH_URL, {
      Properties: {
        SandboxId: "RETAIL",
        UserTokens: [xboxLiveToken.token]
      },
      RelyingParty: "rp://api.minecraftservices.com/",
      TokenType: "JWT"
    }, {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });

    const data = response.data;
    const xui = data.DisplayClaims.xui[0];
    
    return {
      token: data.Token,
      userHash: xui.uhs,
      xuid: xui.xid,
      gamertag: xui.gtg,
      expiresOn: new Date(data.NotAfter)
    };
  } catch (error: any) {
    const xerr = error.response?.data?.XErr;
    let errorMessage = "XSTS authentication failed";
    
    // Handle specific Xbox errors
    switch (xerr) {
      case 2148916233:
        errorMessage = "No Xbox account found. Please create an Xbox account first.";
        break;
      case 2148916235:
        errorMessage = "Xbox Live is not available in your region.";
        break;
      case 2148916236:
      case 2148916237:
        errorMessage = "Adult verification required. Please complete verification on Xbox.com";
        break;
      case 2148916238:
        errorMessage = "This account is a child account. Add it to a family on Xbox.com";
        break;
    }
    
    logger.error("XboxAuth", `XSTS authentication failed: ${errorMessage}`);
    throw new Error(errorMessage);
  }
}

/**
 * Exchange XSTS token for Minecraft access token
 */
export async function getMinecraftToken(xstsToken: XSTSToken): Promise<MinecraftToken> {
  logger.debug("XboxAuth", "Exchanging XSTS token for Minecraft token...");
  
  try {
    const response = await axios.post(MINECRAFT_AUTH_URL, {
      identityToken: `XBL3.0 x=${xstsToken.userHash};${xstsToken.token}`
    }, {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });

    const data = response.data;
    return {
      accessToken: data.access_token,
      username: data.username,
      expiresIn: data.expires_in,
      expiresOn: new Date(Date.now() + data.expires_in * 1000)
    };
  } catch (error: any) {
    logger.error("XboxAuth", `Failed to get Minecraft token: ${error.response?.data || error.message}`);
    throw new Error("Minecraft authentication failed. Please try again.");
  }
}

/**
 * Get Minecraft profile (UUID and username)
 */
export async function getMinecraftProfile(minecraftToken: MinecraftToken): Promise<MinecraftProfile> {
  logger.debug("XboxAuth", "Fetching Minecraft profile...");
  
  try {
    const response = await axios.get(MINECRAFT_PROFILE_URL, {
      headers: {
        "Authorization": `Bearer ${minecraftToken.accessToken}`,
        "Accept": "application/json"
      }
    });

    return response.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error("This Microsoft account does not own Minecraft Java Edition.");
    }
    logger.error("XboxAuth", `Failed to get Minecraft profile: ${error.response?.data || error.message}`);
    throw new Error("Failed to retrieve Minecraft profile.");
  }
}

/**
 * Check if account owns Minecraft
 */
export async function checkMinecraftOwnership(minecraftToken: MinecraftToken): Promise<boolean> {
  logger.debug("XboxAuth", "Checking Minecraft ownership...");
  
  try {
    const response = await axios.get(MINECRAFT_ENTITLEMENTS_URL, {
      headers: {
        "Authorization": `Bearer ${minecraftToken.accessToken}`,
        "Accept": "application/json"
      }
    });

    const data: MinecraftOwnership = response.data;
    // Check for game_minecraft or product_minecraft entitlement
    const ownsGame = data.items.some(item => 
      item.name === "game_minecraft" || 
      item.name === "product_minecraft"
    );
    
    return ownsGame;
  } catch (error: any) {
    logger.error("XboxAuth", `Failed to check Minecraft ownership: ${error.response?.data || error.message}`);
    return false;
  }
}

/**
 * Complete Xbox/Minecraft authentication flow
 * 
 * Takes a Microsoft OAuth access token and returns full authentication result
 * including Xbox profile and Minecraft credentials.
 */
export async function authenticateWithXbox(msAccessToken: string): Promise<XboxAuthResult> {
  try {
    // Step 1: Get Xbox Live token
    const xboxLiveToken = await getXboxLiveToken(msAccessToken);
    
    // Step 2: Get XSTS token
    const xstsToken = await getXSTSToken(xboxLiveToken);
    
    // Step 3: Get Minecraft token
    const minecraftToken = await getMinecraftToken(xstsToken);
    
    // Step 4: Check ownership
    const ownsMinecraft = await checkMinecraftOwnership(minecraftToken);
    
    // Step 5: Get profile (only if owns Minecraft)
    let profile: MinecraftProfile | undefined;
    if (ownsMinecraft) {
      profile = await getMinecraftProfile(minecraftToken);
    }
    
    logger.info("XboxAuth", `Authentication successful for ${xstsToken.gamertag}`);
    
    return {
      success: true,
      xboxLiveToken,
      xstsToken,
      minecraftToken,
      profile,
      ownsMinecraft
    };
  } catch (error: any) {
    logger.error("XboxAuth", `Authentication flow failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Format UUID with dashes
 * Minecraft API returns UUID without dashes, this adds them
 */
export function formatUuid(uuid: string): string {
  if (uuid.includes("-")) return uuid;
  return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
}

/**
 * Refresh Minecraft token using stored credentials
 * Note: Microsoft tokens need to be refreshed via Better-Auth
 */
export async function refreshMinecraftAuth(msAccessToken: string): Promise<XboxAuthResult> {
  // The refresh is the same as initial auth for Xbox/Minecraft
  // Microsoft token refresh is handled by Better-Auth
  return authenticateWithXbox(msAccessToken);
}
