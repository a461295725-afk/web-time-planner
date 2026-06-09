import { getUserFromRequest } from "@/lib/auth";
import { sseSubscribe, sseUnsubscribe } from "@/lib/sse-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  const stream = new ReadableStream({
    start(controller) {
      sseSubscribe(auth.userId, controller);
      // Send initial ping
      const ping = `data: ${JSON.stringify({ type: "connected" })}\n\n`;
      controller.enqueue(new TextEncoder().encode(ping));
    },
    cancel(controller) {
      sseUnsubscribe(auth.userId, controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
