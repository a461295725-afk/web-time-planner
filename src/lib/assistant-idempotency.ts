import { createHash, randomUUID } from "node:crypto";
import { sqlite } from "@/db";
import type { AssistantIdentity } from "@/lib/assistant-token-store";

export class AssistantIdempotencyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type StoredResult<T> = {
  status: number;
  body: T;
  replayed: boolean;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    );
  }
  return value;
}

function fingerprint(request: Request, payload: unknown): string {
  const url = new URL(request.url);
  return createHash("sha256")
    .update(
      JSON.stringify({
        method: request.method,
        path: url.pathname,
        payload: canonical(payload),
      })
    )
    .digest("hex");
}

function recordAudit(
  request: Request,
  auth: AssistantIdentity,
  idempotencyKey: string,
  requestFingerprint: string,
  responseStatus: number
): void {
  const url = new URL(request.url);
  sqlite
    .prepare(
      `INSERT INTO assistant_audit_events
       (id, user_id, token_id, assistant_name, method, path, idempotency_key,
        request_fingerprint, response_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      randomUUID(),
      auth.userId,
      auth.tokenId,
      auth.name,
      request.method,
      url.pathname,
      idempotencyKey,
      requestFingerprint,
      responseStatus,
      Date.now()
    );
}

export function runAssistantMutation<TResult extends { status: number; body: unknown }>(
  request: Request,
  auth: AssistantIdentity,
  payload: unknown,
  work: () => TResult
): StoredResult<TResult["body"]> {
  const key = request.headers.get("Idempotency-Key")?.trim();
  if (!key || key.length < 8 || key.length > 200) {
    throw new AssistantIdempotencyError("缺少有效的 Idempotency-Key", 400);
  }
  const requestFingerprint = fingerprint(request, payload);
  const existing = sqlite
    .prepare(
      `SELECT request_fingerprint, response_status, response_json
       FROM assistant_idempotency
       WHERE token_id = ? AND idempotency_key = ?`
    )
    .get(auth.tokenId, key) as
    | { request_fingerprint: string; response_status: number; response_json: string }
    | undefined;
  if (existing) {
    if (existing.request_fingerprint !== requestFingerprint) {
      throw new AssistantIdempotencyError("同一个 Idempotency-Key 不能用于不同请求", 409);
    }
    return {
      status: existing.response_status,
      body: JSON.parse(existing.response_json) as TResult["body"],
      replayed: true,
    };
  }

  const result = work();
  sqlite
    .prepare(
      `INSERT INTO assistant_idempotency
       (id, user_id, token_id, idempotency_key, request_fingerprint,
        response_status, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      randomUUID(),
      auth.userId,
      auth.tokenId,
      key,
      requestFingerprint,
      result.status,
      JSON.stringify(result.body),
      Date.now()
    );
  recordAudit(request, auth, key, requestFingerprint, result.status);
  return { ...result, replayed: false };
}

export async function runAssistantMutationAsync<
  TResult extends { status: number; body: unknown },
>(
  request: Request,
  auth: AssistantIdentity,
  payload: unknown,
  work: () => Promise<TResult>
): Promise<StoredResult<TResult["body"]>> {
  const key = request.headers.get("Idempotency-Key")?.trim();
  if (!key || key.length < 8 || key.length > 200) {
    throw new AssistantIdempotencyError("缺少有效的 Idempotency-Key", 400);
  }
  const requestFingerprint = fingerprint(request, payload);
  const existing = sqlite
    .prepare(
      `SELECT request_fingerprint, response_status, response_json
       FROM assistant_idempotency
       WHERE token_id = ? AND idempotency_key = ?`
    )
    .get(auth.tokenId, key) as
    | { request_fingerprint: string; response_status: number; response_json: string }
    | undefined;
  if (existing) {
    if (existing.request_fingerprint !== requestFingerprint) {
      throw new AssistantIdempotencyError("同一个 Idempotency-Key 不能用于不同请求", 409);
    }
    return {
      status: existing.response_status,
      body: JSON.parse(existing.response_json) as TResult["body"],
      replayed: true,
    };
  }

  const result = await work();
  sqlite
    .prepare(
      `INSERT INTO assistant_idempotency
       (id, user_id, token_id, idempotency_key, request_fingerprint,
        response_status, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      randomUUID(),
      auth.userId,
      auth.tokenId,
      key,
      requestFingerprint,
      result.status,
      JSON.stringify(result.body),
      Date.now()
    );
  recordAudit(request, auth, key, requestFingerprint, result.status);
  return { ...result, replayed: false };
}

export function idempotentResponse<T>(result: StoredResult<T>): Response {
  return Response.json(result.body, {
    status: result.status,
    headers: result.replayed ? { "Idempotency-Replayed": "true" } : undefined,
  });
}
