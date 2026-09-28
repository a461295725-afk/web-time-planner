import { getUserFromRequest } from "@/lib/auth";
import {
  listTaskOutcomes,
  recordTaskOutcome,
  TaskOutcomeKind,
} from "@/lib/task-execution-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  return Response.json({ outcomes: listTaskOutcomes(auth.userId, id) });
}

export async function POST(request: Request, { params }: Params) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  try {
    const { id } = await params;
    const input = (await request.json()) as Record<string, unknown>;
    return Response.json(
      recordTaskOutcome(auth.userId, id, {
        date: input.date as string,
        outcome: input.outcome as TaskOutcomeKind,
        note: input.note as string | undefined,
        nextAction: input.nextAction as string | undefined,
        actualMinutes: input.actualMinutes as number | undefined,
        rescheduleDate: input.rescheduleDate as string | undefined,
        waitingOn: input.waitingOn as string | undefined,
        followUpDate: input.followUpDate as string | undefined,
        blocker: input.blocker as string | undefined,
      }),
      { status: 201 }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "任务结果无效" },
      { status: 400 }
    );
  }
}
