import { sqlite } from "@/db";

export const runtime = "nodejs";

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    sqlite.prepare("SELECT 1").get();
    const taskCount = sqlite.prepare("SELECT COUNT(*) as count FROM tasks").get() as {
      count: number;
    };
    const userCount = sqlite.prepare("SELECT COUNT(*) as count FROM users").get() as {
      count: number;
    };

    return Response.json({
      ok: true,
      app: "web-time-planner",
      checkedAt,
      database: {
        ok: true,
        taskCount: taskCount.count,
        userCount: userCount.count,
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        app: "web-time-planner",
        checkedAt,
        error: error instanceof Error ? error.message : "Unknown health check error",
      },
      { status: 500 }
    );
  }
}
