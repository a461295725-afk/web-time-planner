import {
  createProjectGroup,
  getProjectGroups,
  renameProjectGroup,
} from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  return Response.json(getProjectGroups(auth.userId));
}

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (typeof input.name !== "string" || !input.name.trim()) {
    return Response.json({ error: "分组名称不能为空" }, { status: 400 });
  }
  return Response.json(createProjectGroup(auth.userId, input.name), { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = await request.json();
  if (
    typeof input.oldName !== "string" ||
    typeof input.newName !== "string" ||
    !input.oldName.trim() ||
    !input.newName.trim()
  ) {
    return Response.json({ error: "分组名称不能为空" }, { status: 400 });
  }
  return Response.json(renameProjectGroup(auth.userId, input.oldName, input.newName));
}
