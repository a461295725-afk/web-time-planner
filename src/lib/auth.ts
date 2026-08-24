import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { sqlite } from "@/db";

const SESSION_DAYS = 7;
const COOKIE_NAME = "wtp_session";

export interface AuthUser {
  userId: string;
  username: string;
  isAdmin: boolean;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function createSession(userId: string): { token: string; expiresAt: number } {
  const token = randomUUID();
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  sqlite
    .prepare(
      "INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(randomUUID(), userId, token, expiresAt, Date.now());
  return { token, expiresAt };
}

export function validateSession(token: string): AuthUser | null {
  const row = sqlite
    .prepare(
      `SELECT s.user_id, u.username, u.is_admin
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, Date.now()) as
    | { user_id: string; username: string; is_admin: number }
    | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    username: row.username,
    isAdmin: Boolean(row.is_admin),
  };
}

export function deleteSession(token: string): void {
  sqlite.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function getUserFromRequest(request: Request): AuthUser | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const token = cookieHeader
    .split("; ")
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.split("=")[1];
  if (!token) return null;
  return validateSession(token);
}

export function setSessionCookie(
  response: Response,
  token: string,
  deleteCookie?: boolean
): Response {
  const value = deleteCookie
    ? `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    : `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`;
  response.headers.set("Set-Cookie", value);
  return response;
}

export function sessionCookieString(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}`;
}

export function clearSessionCookie(response: Response): Response {
  return setSessionCookie(response, "", true);
}
