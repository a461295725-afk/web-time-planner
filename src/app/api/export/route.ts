import { getUserFromRequest } from "@/lib/auth";
import { createUserExport } from "@/lib/export-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const payload = createUserExport(auth.userId, auth.username);
  const body = JSON.stringify(payload, null, 2);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="time-planner-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
