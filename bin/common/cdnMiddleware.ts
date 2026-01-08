import "colorts/lib/string";
import { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { createErrorResponse } from "./utils";

/* =========================
   🔐 CDN SIGNED URL CONFIG
   ========================= */

const CDN_SECRET_KEY = process.env.CDN_SECRET_KEY || "reach-cdn-secret-2025";

/* =========================
   🔏 GENERATE SIGNED URL
   ========================= */

export function generateSignedUrl(
  filePath: string,
  expiresInSeconds: number = 600
): string {
  const expiration = Math.floor(Date.now() / 1000) + expiresInSeconds;
  
  let normalizedPath = filePath;
  
  if (normalizedPath.startsWith("/cdn")) {
    normalizedPath = normalizedPath.substring(4);
  }
  
  if (!normalizedPath.startsWith("/instances")) {
    normalizedPath = "/instances/packages" + normalizedPath;
  }
  
  const dataToSign = `${normalizedPath}:${expiration}`;
  const signature = crypto
    .createHmac("sha256", CDN_SECRET_KEY)
    .update(dataToSign)
    .digest("hex");
  
  return `/cdn${normalizedPath}?expires=${expiration}&signature=${signature}`;
}

export function reachCDNProtection(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const DATE_REQ = new Date().toLocaleString();
  
  const fullPath = req.baseUrl + req.path;
  
  const { expires, signature } = req.query as {
    expires?: string;
    signature?: string;
  };

  if (!expires || !signature) {
    res
      .status(403)
      .json(
        createErrorResponse(
          "[REACHX - CDN]: Access denied. Signed URL required."
        )
      );
    return;
  }
  
  const expirationTime = parseInt(expires);
  const currentTime = Math.floor(Date.now() / 1000);
  
  if (currentTime > expirationTime) {
    console.log(
      `%s`,
      `[${DATE_REQ}] - Expired URL attempt: ${fullPath}`.yellow
    );
    res
      .status(403)
      .json(
        createErrorResponse("[REACHX - CDN]: URL has expired.")
      );
    return;
  }
  
  const pathForSignature = fullPath.startsWith("/cdn")
    ? fullPath.substring(4)
    : fullPath;
  
  const dataToSign = `${pathForSignature}:${expires}`;
  const expectedSignature = crypto
    .createHmac("sha256", CDN_SECRET_KEY)
    .update(dataToSign)
    .digest("hex");
  
  if (signature !== expectedSignature) {
    res
      .status(403)
      .json(
        createErrorResponse("[REACHX - CDN]: Invalid signature.")
      );
    return;
  }
  
  next();
}
