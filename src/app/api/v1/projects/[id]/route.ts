import { requireHermesToken } from "@/lib/hermes-auth";
import {
  projectDetails,
  updateProject,
  deleteProject,
} from "@/lib/server-store";
import { isDateKey } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  const details = projectDetails(auth.userId, id);
  if (!details) {
    return Response.json({ error: "项目不存在" }, { status: 404 });
  }

  return Response.json({
    project: details.project,
    tasks: details.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      done: t.done,
      dueDate: t.dueDate,
      scheduledDate: t.scheduledDate,
      showInWeekPlan: t.showInWeekPlan,
    })),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  const input = await request.json();
  if (input.dueDate !== undefined && input.dueDate !== null && input.dueDate !== "" && !isDateKey(input.dueDate)) {
    return Response.json({ error: "项目日期无效" }, { status: 400 });
  }
  const updated = updateProject(auth.userId, id, input);
  return updated
    ? Response.json(updated)
    : Response.json({ error: "项目不存在" }, { status: 404 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const { id } = await params;
  return deleteProject(auth.userId, id)
    ? Response.json({ ok: true })
    : Response.json({ error: "项目不存在" }, { status: 404 });
}
