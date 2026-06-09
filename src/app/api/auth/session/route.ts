import { getUserFromRequest } from "@/lib/auth";
import { sqlite } from "@/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userCount = (
    sqlite.prepare("SELECT COUNT(*) as count FROM users").get() as {
      count: number;
    }
  ).count;
  const auth = getUserFromRequest(request);
  if (!auth) {
    return Response.json(
      { authenticated: false, needsSetup: userCount === 0 },
      { status: 200 }
    );
  }
  return Response.json({
    authenticated: true,
    ...auth,
    needsSetup: userCount === 0,
  });
}
