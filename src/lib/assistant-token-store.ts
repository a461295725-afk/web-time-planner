import { randomUUID } from "node:crypto";
import { sqlite } from "@/db";
import {
  generateHermesToken,
  hashHermesToken,
  hermesTokenLast4,
} from "@/lib/hermes-token";

export const ASSISTANT_SCOPES = [
  "context:read",
  "tasks:write",
  "plans:write",
  "reviews:write",
  "templates:write",
] as const;

export type AssistantScope = (typeof ASSISTANT_SCOPES)[number];

export interface AssistantTokenMetadata {
  id: string;
  name: string;
  last4: string;
  scopes: AssistantScope[];
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export interface IssuedAssistantToken extends AssistantTokenMetadata {
  token: string;
}

export interface AssistantIdentity {
  userId: string;
  username: string;
  tokenId: string;
  name: string;
  scopes: AssistantScope[];
}

type TokenRow = {
  id: string;
  name: string;
  token_last4: string;
  scopes_json: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
};

function invalid(message: string): never {
  throw new Error(message);
}

function parseScopes(value: string): AssistantScope[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (scope): scope is AssistantScope =>
        typeof scope === "string" && ASSISTANT_SCOPES.includes(scope as AssistantScope)
    );
  } catch {
    return [];
  }
}

function normaliseScopes(input: unknown): AssistantScope[] {
  if (!Array.isArray(input) || input.length === 0) invalid("至少选择一个助手权限");
  const scopes = Array.from(new Set(input));
  if (
    scopes.some(
      (scope) => typeof scope !== "string" || !ASSISTANT_SCOPES.includes(scope as AssistantScope)
    )
  ) {
    invalid("助手权限无效");
  }
  return scopes as AssistantScope[];
}

function mapToken(row: TokenRow): AssistantTokenMetadata {
  return {
    id: row.id,
    name: row.name,
    last4: row.token_last4,
    scopes: parseScopes(row.scopes_json),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export function listAssistantTokens(userId: string): AssistantTokenMetadata[] {
  const rows = sqlite
    .prepare(
      `SELECT id, name, token_last4, scopes_json, created_at, last_used_at, revoked_at
       FROM assistant_api_tokens WHERE user_id = ?
       ORDER BY revoked_at IS NOT NULL ASC, created_at DESC`
    )
    .all(userId) as TokenRow[];
  return rows.map(mapToken);
}

export function issueAssistantToken(
  userId: string,
  input: { name: string; scopes: unknown }
): IssuedAssistantToken {
  const name = input.name.trim();
  if (!name || name.length > 80) invalid("助手名称无效");
  const scopes = normaliseScopes(input.scopes);
  const token = generateHermesToken();
  const timestamp = Date.now();
  const id = randomUUID();
  sqlite
    .prepare(
      `INSERT INTO assistant_api_tokens
       (id, user_id, name, token_hash, token_last4, scopes_json, created_at, last_used_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
       ON CONFLICT(user_id, name) DO UPDATE SET
         id = excluded.id,
         token_hash = excluded.token_hash,
         token_last4 = excluded.token_last4,
         scopes_json = excluded.scopes_json,
         created_at = excluded.created_at,
         last_used_at = NULL,
         revoked_at = NULL`
    )
    .run(
      id,
      userId,
      name,
      hashHermesToken(token),
      hermesTokenLast4(token),
      JSON.stringify(scopes),
      timestamp
    );
  return {
    id,
    name,
    token,
    last4: hermesTokenLast4(token),
    scopes,
    createdAt: timestamp,
    lastUsedAt: null,
    revokedAt: null,
  };
}

export function revokeAssistantToken(userId: string, id: string): boolean {
  const result = sqlite
    .prepare(
      "UPDATE assistant_api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
    )
    .run(Date.now(), id, userId);
  return result.changes > 0;
}

export function authenticateAssistantToken(token: string): AssistantIdentity | null {
  if (!token || token.length < 20) return null;
  const row = sqlite
    .prepare(
      `SELECT t.id, t.name, t.scopes_json, u.id AS user_id, u.username
       FROM assistant_api_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND t.revoked_at IS NULL`
    )
    .get(hashHermesToken(token)) as
    | { id: string; name: string; scopes_json: string; user_id: string; username: string }
    | undefined;
  if (!row) return null;
  sqlite
    .prepare("UPDATE assistant_api_tokens SET last_used_at = ? WHERE id = ?")
    .run(Date.now(), row.id);
  return {
        userId: row.user_id,
        username: row.username,
        tokenId: row.id,
        name: row.name,
        scopes: parseScopes(row.scopes_json),
      };
}
