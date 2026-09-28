import { sqlite } from "@/db";

export interface AssistantAuditEvent {
  id: string;
  assistantName: string;
  method: string;
  path: string;
  responseStatus: number;
  createdAt: number;
}

export function listAssistantAuditEvents(
  userId: string,
  limit = 20
): AssistantAuditEvent[] {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(100, limit)) : 20;
  const rows = sqlite
    .prepare(
      `SELECT id, assistant_name, method, path, response_status, created_at
       FROM assistant_audit_events
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(userId, safeLimit) as {
    id: string;
    assistant_name: string;
    method: string;
    path: string;
    response_status: number;
    created_at: number;
  }[];
  return rows.map((row) => ({
    id: row.id,
    assistantName: row.assistant_name,
    method: row.method,
    path: row.path,
    responseStatus: row.response_status,
    createdAt: row.created_at,
  }));
}

