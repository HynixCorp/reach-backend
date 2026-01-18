import { config } from "dotenv";
import { PolarOrderDB } from "../../types/polar";
import { Beneficts } from "../../types/user";
import { getDevelopersDB } from "../services/database.service";
import { logger } from "../services/logger.service";

config();

// reach_developers - Usage belongs to developer accounts
const DEVELOPERS_DB = getDevelopersDB();

export async function getUsageDocument(
  ownerId: string
): Promise<{ auth: string; _udoc: Beneficts } | null> {
  if (!ownerId || typeof ownerId !== "string" || ownerId.trim().length === 0) {
    return null;
  }

  try {
    const information = await DEVELOPERS_DB.findDocuments("usage", {
      auth: ownerId.trim(),
    });

    if (
      !information ||
      !Array.isArray(information) ||
      information.length === 0
    ) {
      return null;
    }

    const document = information[0];
    if (!document || !document.auth || !document._udoc) {
      logger.warn("Usage", `Corrupted document: ${ownerId}`);
      return null;
    }

    return document as { auth: string; _udoc: Beneficts };
  } catch (error) {
    // Manejo de errores más específico y logging
    logger.error("Usage", `Error obtaining usage document for ownerId: ${ownerId} - ${error}`);

    // Re-lanzar con información más específica
    if (error instanceof Error) {
      throw new Error(`Error obtaining usage document: ${error.message}`);
    } else {
      throw new Error("Unknown error while obtaining usage document.");
    }
  }
}

/**
 * Consume un token de uso para un tipo específico de instancia
 * @param authID - ID de autenticación del usuario
 * @param type - Tipo de instancia: "private", "public" o "testing"
 * @returns Promise<boolean> - true si se consumió exitosamente, false si no hay tokens disponibles
 * @throws Error si hay problemas con la base de datos o el documento
 */
export async function usageToken(
  authID: string,
  type: "private" | "public" | "testing" | null
): Promise<boolean> {
  // Validación de parámetros de entrada
  if (!authID || typeof authID !== "string" || authID.trim().length === 0) {
    throw new Error("authID is required and must be a non-empty string");
  }

  if (!type || !["private", "public", "testing"].includes(type)) {
    throw new Error("type must be 'private', 'public' or 'testing'");
  }

  try {
    // Obtener el documento de uso
    const usageDocument = await getUsageDocument(authID.trim());
    if (!usageDocument) {
      logger.warn("Usage", `No usage document found for: ${authID}`);
      return false;
    }

    const { _udoc: document } = usageDocument;
    
    if (!document || !document.instances) {
      logger.warn("Usage", `Corrupted document or no instances for: ${authID}`);
      return false;
    }

    const wasConsumed = consumeInstanceToken(document.instances, type, authID);
    
    if (!wasConsumed) {
      return false;
    }

    await DEVELOPERS_DB.updateDocument("usage", {
      auth: authID.trim()
    }, usageDocument);

    return true;

  } catch (error) {
    logger.error("Usage", `Error consuming ${type} token for ${authID}: ${error}`);

    if (error instanceof Error) {
      throw new Error(`Error consuming usage token: ${error.message}`);
    } else {
      throw new Error("Unknown error while consuming usage token");
    }
  }
}

/**
 * Consume un token de instancia específico
 * @param instances - Objeto con los contadores de instancias
 * @param type - Tipo de instancia a consumir
 * @param authID - ID para logging
 * @returns boolean - true si se consumió exitosamente
 */
function consumeInstanceToken(
  instances: Beneficts["instances"],
  type: "private" | "public" | "testing",
  authID: string
): boolean {
  const currentCount = instances[type];
  
  if (currentCount === undefined || currentCount === null || typeof currentCount !== "number") {
    logger.warn("Usage", `Instance counter '${type}' not available or invalid for: ${authID}`);
    return false;
  }

  if (currentCount <= 0) {
    logger.warn("Usage", `No tokens available for instance '${type}' for: ${authID} (available: ${currentCount})`);
    return false;
  }

  instances[type] = currentCount - 1;
  return true;
}

export function createNewUsageDocument(polarInfo: PolarOrderDB) {
  let _udoc: Beneficts | null;

  if (!polarInfo) {
    return null;
  }

  switch (polarInfo.plan) {
    case "hobby":
      _udoc = {
        instances: {
          private: 1,
        },
        smPlayers: 10,
        dashboard: {
          roles: false,
          advanced: false,
          analytics: {
            enable: true,
            type: "basic",
          },
          backups: {
            enable: true,
            amount: 3,
          },
        },
        launcher: {
          discord: "none",
          assets: false,
        },
        additionals: {
          marketplace: false,
          iSell: false,
          cloudflare: false,
        },
      };
      break;
    case "standard":
      _udoc = {
        instances: {
          private: 3,
          public: 5,
        },
        smPlayers: 75,
        organizationSpaces: 2,
        dashboard: {
          roles: true,
          advanced: true,
          analytics: {
            enable: true,
            type: "basic",
          },
          backups: {
            enable: true,
            amount: 10,
          },
        },
        launcher: {
          discord: "limited",
          assets: false,
        },
        additionals: {
          marketplace: false,
          iSell: false,
          cloudflare: false,
        },
      };
      break;
    case "pro":
      _udoc = {
        instances: {
          private: 10,
          public: 20,
          testing: 1,
        },
        smPlayers: 150,
        organizationSpaces: 10,
        dashboard: {
          roles: true,
          advanced: true,
          analytics: {
            enable: true,
            type: "advanced",
          },
          backups: {
            enable: true,
            amount: 20,
          },
        },
        launcher: {
          discord: "full",
          assets: true,
        },
        additionals: {
          marketplace: true,
          iSell: true,
          cloudflare: true,
        },
      };
      break;
    default:
      _udoc = null;
      break;
  }

  return _udoc;
}
