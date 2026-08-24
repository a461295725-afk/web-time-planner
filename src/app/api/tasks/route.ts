import {
  createTask,
  deleteTask,
  getTasks,
  updateTask,
} from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";
import { isDateKey, isPriority } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  return Response.json(getTasks(auth.userId));
}

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.title !== "string" || !input.title.trim()) {
    return Response.json({ error: "任务标题不能为空" }, { status: 400 });
  }
  if (input.priority !== undefined && !isPriority(input.priority)) {
    return Response.json({ error: "优先级无效" }, { status: 400 });
  }
  for (const field of ["dueDate", "scheduledDate"] as const) {
    if (input[field] !== undefined && input[field] !== null && input[field] !== "" && !isDateKey(input[field])) {
      return Response.json({ error: `${field} 日期无效` }, { status: 400 });
    }
  }
  if (
    input.estimatedMinutes !== undefined &&
    input.estimatedMinutes !== null &&
    (!Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes < 5 || input.estimatedMinutes > 1440)
  ) {
    return Response.json({ error: "预计时长必须是 5 到 1440 分钟的整数" }, { status: 400 });
  }
  if (input.energyLevel !== undefined && input.energyLevel !== null && !["low", "medium", "high"].includes(input.energyLevel)) {
    return Response.json({ error: "精力等级无效" }, { status: 400 });
  }
  if (
    input.preferredPeriod !== undefined &&
    input.preferredPeriod !== null &&
    !["morning", "afternoon", "evening", "anytime"].includes(input.preferredPeriod)
  ) {
    return Response.json({ error: "偏好时段无效" }, { status: 400 });
  }
  return Response.json(createTask(auth.userId, input), { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.id !== "string") {
    return Response.json({ error: "缺少任务 ID" }, { status: 400 });
  }
  if (input.priority !== undefined && !isPriority(input.priority)) {
    return Response.json({ error: "优先级无效" }, { status: 400 });
  }
  for (const field of ["dueDate", "scheduledDate"] as const) {
    if (input[field] !== undefined && input[field] !== null && input[field] !== "" && !isDateKey(input[field])) {
      return Response.json({ error: `${field} 日期无效` }, { status: 400 });
    }
  }
  if (
    input.estimatedMinutes !== undefined &&
    input.estimatedMinutes !== null &&
    (!Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes < 5 || input.estimatedMinutes > 1440)
  ) {
    return Response.json({ error: "预计时长必须是 5 到 1440 分钟的整数" }, { status: 400 });
  }
  if (input.energyLevel !== undefined && input.energyLevel !== null && !["low", "medium", "high"].includes(input.energyLevel)) {
    return Response.json({ error: "精力等级无效" }, { status: 400 });
  }
  if (
    input.preferredPeriod !== undefined &&
    input.preferredPeriod !== null &&
    !["morning", "afternoon", "evening", "anytime"].includes(input.preferredPeriod)
  ) {
    return Response.json({ error: "偏好时段无效" }, { status: 400 });
  }
  const task = updateTask(auth.userId, input.id, input);
  return task
    ? Response.json(task)
    : Response.json({ error: "任务不存在" }, { status: 404 });
}

export async function DELETE(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.id !== "string") {
    return Response.json({ error: "缺少任务 ID" }, { status: 400 });
  }
  return deleteTask(auth.userId, input.id)
    ? Response.json({ ok: true })
    : Response.json({ error: "任务不存在" }, { status: 404 });
}
