import { createHash, randomBytes } from "crypto";

export const HERMES_TOKEN_BYTES = 32;

export function generateHermesToken(): string {
  return randomBytes(HERMES_TOKEN_BYTES).toString("base64url");
}

export function hashHermesToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hermesTokenLast4(token: string): string {
  return token.slice(-4);
}
