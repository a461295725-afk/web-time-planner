import { randomUUID } from "node:crypto";
import { sqlite } from "@/db";
import { broadcastChange } from "@/lib/sse-manager";
import {
  AgentMemory,
  MemoryCategory,
  MemoryInput,
  MemoryObservationCandidate,
  MemoryObservationResult,
  MemorySource,
} from "@/lib/review-types";

type MemoryRow = {
  id: string;
  category: MemoryCategory;
  key: string;
  value_json: string;
  source: MemorySource;
  evidence_count: number;
  confidence: number;
  confirmed: number;
  last_evidence_at: number;
  expires_at: number | null;
  created_at: number;
  updated_at: number;
};

type ObservationRow = {
  duration_seconds: number | null;
  estimated_minutes: number | null;
  started_at: number;
};

const CHINA_TIME_ZONE = "Asia/Shanghai";
const FOCUS_HOUR_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: CHINA_TIME_ZONE,
  hour: "2-digit",
  hourCycle: "h23",
});
const SENSITIVE_KEY_RE = /(password|passwd|token|secret|api[_-]?key|private[_-]?key|credential)/i;
const KEY_RE = /^[\w\u4e00-\u9fff.:-]+$/u;
const MAX_VALUE_BYTES = 16 * 1024;

const now = () => Date.now();

function invalid(message: string): never {
  throw new Error(message);
}

function requiredCategory(value: unknown): MemoryCategory {
  if (value !== "explicit" && value !== "preference" && value !== "behavior" && value !== "context") {
    invalid("记忆分类无效");
  }
  return value;
}

function requiredSource(value: unknown): MemorySource {
  if (value !== "user" && value !== "inferred" && value !== "system") invalid("记忆来源无效");
  return value;
}

function requiredKey(value: unknown): string {
  if (typeof value !== "string") invalid("记忆键必须是文本");
  const key = value.trim();
  if (!key || key.length > 120 || !KEY_RE.test(key) || SENSITIVE_KEY_RE.test(key)) {
    invalid("记忆键无效或包含敏感字段");
  }
  return key;
}

function serialiseValue(value: unknown): string {
  assertSafeValue(value);
  let serialised: string | undefined;
  try {
    serialised = JSON.stringify(value);
  } catch {
    invalid("记忆内容必须是可序列化的 JSON");
  }
  if (serialised === undefined || Buffer.byteLength(serialised, "utf8") > MAX_VALUE_BYTES) {
    invalid("记忆内容过大或不是有效 JSON");
  }
  return serialised;
}

function assertSafeValue(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertSafeValue);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(key)) invalid("记忆内容不能包含敏感字段");
      assertSafeValue(entry);
    }
    return;
  }
  if (
    typeof value === "string" &&
    /(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|eyJ[A-Za-z0-9_-]{24,}\.|-----BEGIN [A-Z ]*PRIVATE KEY-----)/.test(value)
  ) {
    invalid("记忆内容不能包含 Token 或私钥");
  }
}

function parseValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function confidence(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    invalid("置信度必须在 0 到 1 之间");
  }
  return value;
}

function evidenceCount(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1_000_000) {
    invalid("证据次数无效");
  }
  return value;
}

function expiresAt(value: unknown, fallback: number | null): number | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) invalid("过期时间无效");
  return value;
}

function mapMemory(row: MemoryRow): AgentMemory {
  return {
    id: row.id,
    category: row.category,
    key: row.key,
    value: parseValue(row.value_json),
    source: row.source,
    evidenceCount: row.evidence_count,
    confidence: row.confidence,
    confirmed: Boolean(row.confirmed),
    lastEvidenceAt: row.last_evidence_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function memoryRow(userId: string, id: string): MemoryRow | undefined {
  return sqlite
    .prepare(
      `SELECT id, category, key, value_json, source, evidence_count, confidence,
        confirmed, last_evidence_at, expires_at, created_at, updated_at
       FROM agent_memories
       WHERE id = ? AND user_id = ?`
    )
    .get(id, userId) as MemoryRow | undefined;
}

function memoryKeyRow(userId: string, category: MemoryCategory, key: string): MemoryRow | undefined {
  return sqlite
    .prepare(
      `SELECT id, category, key, value_json, source, evidence_count, confidence,
        confirmed, last_evidence_at, expires_at, created_at, updated_at
       FROM agent_memories
       WHERE user_id = ? AND category = ? AND key = ?`
    )
    .get(userId, category, key) as MemoryRow | undefined;
}

export function getMemories(userId: string, includeExpired = false): AgentMemory[] {
  const rows = sqlite
    .prepare(
      `SELECT id, category, key, value_json, source, evidence_count, confidence,
        confirmed, last_evidence_at, expires_at, created_at, updated_at
       FROM agent_memories
       WHERE user_id = ?
         AND (? = 1 OR expires_at IS NULL OR expires_at > ?)
       ORDER BY CASE category
          WHEN 'explicit' THEN 0
          WHEN 'preference' THEN 1
          WHEN 'behavior' THEN 2
          ELSE 3 END,
         confirmed DESC, updated_at DESC`
    )
    .all(userId, includeExpired ? 1 : 0, now()) as MemoryRow[];
  return rows.map(mapMemory);
}

export function getMemory(userId: string, id: string, includeExpired = false): AgentMemory | undefined {
  const row = memoryRow(userId, id);
  if (!row) return undefined;
  if (!includeExpired && row.expires_at !== null && row.expires_at <= now()) return undefined;
  return mapMemory(row);
}

function normaliseInput(input: MemoryInput, allowInferred: boolean): {
  category: MemoryCategory;
  key: string;
  valueJson: string;
  source: MemorySource;
  evidenceCount: number;
  confidence: number;
  confirmed: boolean;
  expiresAt: number | null;
} {
  const category = requiredCategory(input.category);
  const key = requiredKey(input.key);
  const source = requiredSource(input.source ?? "user");
  if (!allowInferred && source !== "user") invalid("用户创建的记忆来源必须是 user");
  const valueJson = serialiseValue(input.value);
  const count = evidenceCount(input.evidenceCount, 1);
  const score = confidence(input.confidence, source === "user" ? 1 : 0.5);
  const confirmed = Boolean(input.confirmed ?? (source === "user" && category === "explicit"));
  const expiry = expiresAt(input.expiresAt, null);
  return {
    category,
    key,
    valueJson,
    source,
    evidenceCount: count,
    confidence: score,
    confirmed,
    expiresAt: expiry,
  };
}

export function upsertMemory(userId: string, input: MemoryInput, allowInferred = false): AgentMemory {
  const normalised = normaliseInput(input, allowInferred);
  const timestamp = now();
  const result = sqlite.transaction(() => {
    const existing = memoryKeyRow(userId, normalised.category, normalised.key);
    if (existing) {
      const confirmed = existing.confirmed === 1 ? true : normalised.confirmed;
      sqlite
        .prepare(
          `UPDATE agent_memories
           SET value_json = ?, source = ?, evidence_count = ?, confidence = ?, confirmed = ?,
             last_evidence_at = ?, expires_at = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`
        )
        .run(
          normalised.valueJson,
          normalised.source,
          normalised.evidenceCount,
          normalised.confidence,
          confirmed ? 1 : 0,
          timestamp,
          normalised.expiresAt,
          timestamp,
          existing.id,
          userId
        );
      return memoryRow(userId, existing.id)!;
    }
    const id = randomUUID();
    sqlite
      .prepare(
        `INSERT INTO agent_memories
         (id, user_id, category, key, value_json, source, evidence_count, confidence,
          confirmed, last_evidence_at, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        userId,
        normalised.category,
        normalised.key,
        normalised.valueJson,
        normalised.source,
        normalised.evidenceCount,
        normalised.confidence,
        normalised.confirmed ? 1 : 0,
        timestamp,
        normalised.expiresAt,
        timestamp,
        timestamp
      );
    return memoryRow(userId, id)!;
  })();
  broadcastChange(userId);
  return mapMemory(result);
}

export function updateMemory(
  userId: string,
  id: string,
  input: Partial<Omit<MemoryInput, "source">> & { source?: MemorySource }
): AgentMemory | undefined {
  const existing = memoryRow(userId, id);
  if (!existing) return undefined;
  const category = input.category === undefined ? existing.category : requiredCategory(input.category);
  const key = input.key === undefined ? existing.key : requiredKey(input.key);
  const valueJson = input.value === undefined ? existing.value_json : serialiseValue(input.value);
  const source = input.source === undefined ? existing.source : requiredSource(input.source);
  const count = evidenceCount(input.evidenceCount, existing.evidence_count);
  const score = confidence(input.confidence, existing.confidence);
  const confirmed = input.confirmed === undefined ? Boolean(existing.confirmed) : Boolean(input.confirmed);
  const expiry = expiresAt(input.expiresAt, existing.expires_at);
  const timestamp = now();
  sqlite
    .prepare(
      `UPDATE agent_memories
       SET category = ?, key = ?, value_json = ?, source = ?, evidence_count = ?, confidence = ?,
         confirmed = ?, last_evidence_at = ?, expires_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .run(
      category,
      key,
      valueJson,
      source,
      count,
      score,
      confirmed ? 1 : 0,
      timestamp,
      expiry,
      timestamp,
      id,
      userId
    );
  broadcastChange(userId);
  return mapMemory(memoryRow(userId, id)!);
}

export function confirmMemory(userId: string, id: string, confirmed = true): AgentMemory | undefined {
  const existing = memoryRow(userId, id);
  if (!existing) return undefined;
  sqlite
    .prepare("UPDATE agent_memories SET confirmed = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .run(confirmed ? 1 : 0, now(), id, userId);
  broadcastChange(userId);
  return mapMemory(memoryRow(userId, id)!);
}

export function deleteMemory(userId: string, id: string): boolean {
  const result = sqlite.prepare("DELETE FROM agent_memories WHERE id = ? AND user_id = ?").run(id, userId);
  if (result.changes > 0) broadcastChange(userId);
  return result.changes > 0;
}

function focusPeriod(startedAt: number): "morning" | "afternoon" | "evening" {
  const hour = Number(FOCUS_HOUR_FORMATTER.format(new Date(startedAt)));
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function observedCandidate(
  userId: string,
  category: "behavior" | "preference",
  key: string,
  value: Record<string, unknown>,
  evidence: number,
  score: number
): MemoryObservationCandidate {
  const existing = memoryKeyRow(userId, category, key);
  return {
    category,
    key,
    value,
    evidenceCount: Math.max(existing?.evidence_count ?? 0, evidence),
    confidence: Math.max(existing?.confidence ?? 0, Math.min(0.95, score)),
    confirmed: Boolean(existing?.confirmed),
  };
}

function persistCandidate(userId: string, candidate: MemoryObservationCandidate): void {
  const existing = memoryKeyRow(userId, candidate.category, candidate.key);
  if (existing?.confirmed) {
    // A confirmed value is user-owned. Keep it stable while retaining the latest
    // amount of evidence for the user's inspection.
    sqlite
      .prepare(
        `UPDATE agent_memories
         SET evidence_count = MAX(evidence_count, ?), last_evidence_at = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(candidate.evidenceCount, now(), now(), existing.id, userId);
    return;
  }
  upsertMemory(
    userId,
    {
      category: candidate.category,
      key: candidate.key,
      value: candidate.value,
      source: "inferred",
      evidenceCount: candidate.evidenceCount,
      confidence: candidate.confidence,
      confirmed: candidate.confirmed,
      expiresAt: null,
    },
    true
  );
}

export function observeMemories(userId: string): MemoryObservationResult {
  const rows = sqlite
    .prepare(
      `SELECT f.duration_seconds, t.estimated_minutes, f.started_at
       FROM focus_sessions f
       JOIN tasks t ON t.id = f.task_id AND t.user_id = f.user_id
       WHERE f.user_id = ? AND f.status = 'completed'
         AND f.duration_seconds IS NOT NULL AND f.duration_seconds > 0
         AND t.estimated_minutes IS NOT NULL AND t.estimated_minutes > 0`
    )
    .all(userId) as ObservationRow[];
  const ratios = rows
    .filter((row) => row.estimated_minutes !== null)
    .map((row) => (row.duration_seconds ?? 0) / 60 / (row.estimated_minutes ?? 1))
    .filter((ratio) => Number.isFinite(ratio) && ratio >= 0.1 && ratio <= 10);
  const skipped: MemoryObservationResult["skipped"] = [];
  const candidates: MemoryObservationCandidate[] = [];
  if (ratios.length < 3) {
    skipped.push({ key: "estimate_multiplier", evidenceCount: ratios.length, requiredEvidence: 3 });
  } else {
    const multiplier = Number(median(ratios).toFixed(2));
    candidates.push(
      observedCandidate(
        userId,
        "behavior",
        "estimate_multiplier",
        {
          multiplier,
          samples: ratios.length,
          basis: "completed_focus_sessions_vs_estimated_minutes",
        },
        ratios.length,
        Math.min(0.95, 0.5 + ratios.length / 20)
      )
    );
  }

  const periodRows = sqlite
    .prepare(
      `SELECT started_at
       FROM focus_sessions
       WHERE user_id = ? AND status = 'completed'
         AND duration_seconds IS NOT NULL AND duration_seconds > 0`
    )
    .all(userId) as { started_at: number }[];
  const periods = periodRows.map((row) => focusPeriod(row.started_at));
  if (periods.length < 5) {
    skipped.push({ key: "preferred_focus_period", evidenceCount: periods.length, requiredEvidence: 5 });
  } else {
    const distribution = periods.reduce<Record<string, number>>((result, period) => {
      result[period] = (result[period] ?? 0) + 1;
      return result;
    }, {});
    const order: ("morning" | "afternoon" | "evening")[] = ["morning", "afternoon", "evening"];
    const preferred = order.reduce((best, period) =>
      (distribution[period] ?? 0) > (distribution[best] ?? 0) ? period : best
    );
    candidates.push(
      observedCandidate(
        userId,
        "preference",
        "preferred_focus_period",
        {
          period: preferred,
          distribution,
          samples: periods.length,
          basis: "completed_focus_session_start_time",
        },
        periods.length,
        (distribution[preferred] ?? 0) / periods.length
      )
    );
  }

  if (candidates.length > 0) {
    for (const candidate of candidates) persistCandidate(userId, candidate);
  }
  return { candidates, skipped };
}
