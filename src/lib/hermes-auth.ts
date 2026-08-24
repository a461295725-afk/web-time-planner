import { getUserByApiToken } from "@/lib/server-store";

export function requireHermesToken(request: Request): {
  userId: string;
  username: string;
} | null {
  const token = request.headers.get("X-API-Token");
  if (!token) return null;
  return getUserByApiToken(token);
}
