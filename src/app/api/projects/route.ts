import { createProject, getProjects } from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";
import { isDateKey } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  return Response.json(getProjects(auth.userId));
}

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.name !== "string" || !input.name.trim()) {
    return Response.json({ error: "项目名称不能为空" }, { status: 400 });
  }
  if (input.dueDate !== undefined && input.dueDate !== null && input.dueDate !== "" && !isDateKey(input.dueDate)) {
    return Response.json({ error: "项目日期无效" }, { status: 400 });
  }
  return Response.json(createProject(auth.userId, input), { status: 201 });
}
