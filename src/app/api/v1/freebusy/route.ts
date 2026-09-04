import { getFreebusyRange } from "@/lib/freebusy-store";
import { requireHermesToken } from "@/lib/hermes-auth";
import { SmartDayError } from "@/lib/smart-day-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  try {
    const params = new URL(request.url).searchParams;
    return Response.json(
      getFreebusyRange(auth.userId, params.get("from"), params.get("to"))
    );
  } catch (error) {
    if (error instanceof SmartDayError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("freebusy error", error instanceof Error ? error.message : error);
    return Response.json({ error: "忙闲查询暂时不可用" }, { status: 500 });
  }
}
