import { config } from "dotenv";
import { PolarOrderDB } from "../../types/polar";
import { Beneficts } from "../../types/user";
import { getReachAuthDB } from "../services/database.service";

config();

const REACH_SDK_DB = getReachAuthDB();

export async function getUsageDocument(
  ownerId: string
): Promise<{ auth: string; _udoc: Beneficts } | null> {
  if (!ownerId || typeof ownerId !== "string" || ownerId.trim().length === 0) {
    return null;
  }

  try {
    const information = await REACH_SDK_DB.findDocuments("usage", {
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
      console.warn(`[Usage] Corrupted document: ${ownerId}`);
      return null;
    }

    return document as { auth: string; _udoc: Beneficts };
  } catch (error) {
    // Manejo de errores más específico y logging
    console.error(
      `[Usage] Error obtaining usage document for ownerId: ${ownerId}`,
      error
    );

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
    throw new Error("authID debe ser una cadena no vacía");
  }

  if (!type || !["private", "public", "testing"].includes(type)) {
    throw new Error("type debe ser 'private', 'public' o 'testing'");
  }

  try {
    // Obtener el documento de uso
    const usageDocument = await getUsageDocument(authID.trim());
    if (!usageDocument) {
      console.warn(`[Usage] No se encontró documento de uso para: ${authID}`);
      return false;
    }

    const { _udoc: document } = usageDocument;
    
    // Validar que el documento tenga la estructura correcta
    if (!document || !document.instances) {
      console.warn(`[Usage] Documento corrupto o sin instancias para: ${authID}`);
      return false;
    }

    // Verificar y consumir el token según el tipo
    const wasConsumed = consumeInstanceToken(document.instances, type, authID);
    
    if (!wasConsumed) {
      return false;
    }

    // Actualizar el documento en la base de datos
    await REACH_SDK_DB.updateDocument("usage", {
      auth: authID.trim()
    }, usageDocument);

    console.log(`[Usage] Token ${type} consumido exitosamente para: ${authID}`);
    return true;

  } catch (error) {
    console.error(`[Usage] Error al consumir token ${type} para ${authID}:`, error);

    // Re-lanzar con información más específica
    if (error instanceof Error) {
      throw new Error(`Error al consumir token de uso: ${error.message}`);
    } else {
      throw new Error("Error desconocido al consumir token de uso");
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
  
  // Verificar que el contador existe y es válido
  if (currentCount === undefined || currentCount === null || typeof currentCount !== "number") {
    console.warn(`[Usage] Contador de instancia '${type}' no disponible o inválido para: ${authID}`);
    return false;
  }

  // Verificar que hay tokens disponibles
  if (currentCount <= 0) {
    console.warn(`[Usage] No hay tokens disponibles para instancia '${type}' para: ${authID} (disponibles: ${currentCount})`);
    return false;
  }

  // Consumir el token
  instances[type] = currentCount - 1;
  console.log(`[Usage] Token ${type} consumido. Restantes: ${instances[type]} para: ${authID}`);
  
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
