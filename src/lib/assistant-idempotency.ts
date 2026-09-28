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

type StoredRow = {
  request_fingerprint: string;
  response_status: number;
  response_json: string;
};

type MutationClaim<T> =
  | {
      state: "claimed";
      key: string;
      requestFingerprint: string;
    }
  | {
      state: "replayed";
      result: StoredResult<T>;
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

function claimMutation<T>(
  request: Request,
  auth: AssistantIdentity,
  payload: unknown
): MutationClaim<T> {
  const key = request.headers.get("Idempotency-Key")?.trim();
  if (!key || key.length < 8 || key.length > 200) {
    throw new AssistantIdempotencyError("缺少有效的 Idempotency-Key", 400);
  }
  const requestFingerprint = fingerprint(request, payload);
  const inserted = sqlite
    .prepare(
      `INSERT OR IGNORE INTO assistant_idempotency
       (id, user_id, token_id, idempotency_key, request_fingerprint,
        response_status, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 'null', ?)`
    )
    .run(randomUUID(), auth.userId, auth.tokenId, key, requestFingerprint, Date.now());

  if (inserted.changes === 1) {
    return { state: "claimed", key, requestFingerprint };
  }

  const existing = sqlite
    .prepare(
      `SELECT request_fingerprint, response_status, response_json
       FROM assistant_idempotency
       WHERE user_id = ? AND token_id = ? AND idempotency_key = ?`
    )
    .get(auth.userId, auth.tokenId, key) as StoredRow | undefined;
  if (!existing) {
    throw new AssistantIdempotencyError("请求状态暂不可用，请稍后重试", 409);
  }
  if (existing.request_fingerprint !== requestFingerprint) {
    throw new AssistantIdempotencyError("同一个 Idempotency-Key 不能用于不同请求", 409);
  }
  if (existing.response_status === 0) {
    throw new AssistantIdempotencyError(
      "同一请求正在处理中，请稍后使用相同 Idempotency-Key 重试",
      409
    );
  }
  return {
    state: "replayed",
    result: {
      status: existing.response_status,
      body: JSON.parse(existing.response_json) as T,
      replayed: true,
    },
  };
}

function releaseClaim(
  auth: AssistantIdentity,
  key: string,
  requestFingerprint: string
): void {
  sqlite
    .prepare(
      `DELETE FROM assistant_idempotency
       WHERE user_id = ? AND token_id = ? AND idempotency_key = ?
         AND request_fingerprint = ? AND response_status = 0`
    )
    .run(auth.userId, auth.tokenId, key, requestFingerprint);
}

function finalizeClaim<TResult extends { status: number; body: unknown }>(
  request: Request,
  auth: AssistantIdentity,
  key: string,
  requestFingerprint: string,
  result: TResult
): StoredResult<TResult["body"]> {
  sqlite.transaction(() => {
    const updated = sqlite
      .prepare(
        `UPDATE assistant_idempotency
         SET response_status = ?, response_json = ?
         WHERE user_id = ? AND token_id = ? AND idempotency_key = ?
           AND request_fingerprint = ? AND response_status = 0`
      )
      .run(
        result.status,
        JSON.stringify(result.body),
        auth.userId,
        auth.tokenId,
        key,
        requestFingerprint
      );
    if (updated.changes !== 1) {
      throw new Error("assistant idempotency claim was lost before completion");
    }
    recordAudit(request, auth, key, requestFingerprint, result.status);
  })();
  return { ...result, replayed: false };
}

export function runAssistantMutation<TResult extends { status: number; body: unknown }>(
  request: Request,
  auth: AssistantIdentity,
  payload: unknown,
  work: () => TResult
): StoredResult<TResult["body"]> {
  const claim = claimMutation<TResult["body"]>(request, auth, payload);
  if (claim.state === "replayed") return claim.result;

  let result: TResult;
  try {
    result = work();
  } catch (error) {
    releaseClaim(auth, claim.key, claim.requestFingerprint);
    throw error;
  }
  return finalizeClaim(request, auth, claim.key, claim.requestFingerprint, result);
}

export async function runAssistantMutationAsync<
  TResult extends { status: number; body: unknown },
>(
  request: Request,
  auth: AssistantIdentity,
  payload: unknown,
  work: () => Promise<TResult>
): Promise<StoredResult<TResult["body"]>> {
  const claim = claimMutation<TResult["body"]>(request, auth, payload);
  if (claim.state === "replayed") return claim.result;

  let result: TResult;
  try {
    result = await work();
  } catch (error) {
    releaseClaim(auth, claim.key, claim.requestFingerprint);
    throw error;
  }
  return finalizeClaim(request, auth, claim.key, claim.requestFingerprint, result);
}

export function idempotentResponse<T>(result: StoredResult<T>): Response {
  return Response.json(result.body, {
    status: result.status,
    headers: result.replayed ? { "Idempotency-Replayed": "true" } : undefined,
  });
}
