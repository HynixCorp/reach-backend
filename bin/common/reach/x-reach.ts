import crypto from "crypto";

export function generateToken(input: string): string {
  const hash = crypto.createHash("sha256").update(input).digest("hex");
  return hash;
}