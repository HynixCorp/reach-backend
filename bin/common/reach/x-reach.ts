//Crea una funcion que pueda usarse aqui en Express como en Next.js para crear un token sin JWT basado en un string. Debe ser unico, irrepetible y seguro pero, si se genera aqui y en otro lugar con el mismo string, debe generar el mismo token. No usar JWT ni librerias de terceros. Solo usar funciones nativas de Node.js o JavaScript.
import crypto from "crypto";

export function generateToken(input: string): string {
  const hash = crypto.createHash("sha256").update(input).digest("hex");
  return hash;
}