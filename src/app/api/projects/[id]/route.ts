import {
  deleteProject,
  projectDetails,
  updateProject,
} from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const details = projectDetails(auth.userId, id);
  return details
    ? Response.json(details)
    : Response.json({ error: "项目不存在" }, { status: 404 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const project = updateProject(auth.userId, id, await request.json());
  return project
    ? Response.json(project)
    : Response.json({ error: "项目不存在" }, { status: 404 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  return deleteProject(auth.userId, id)
    ? Response.json({ ok: true })
    : Response.json({ error: "项目不存在" }, { status: 404 });
}
