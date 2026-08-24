import { reorderProjects } from "@/lib/server-store";
import { getUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = getUserFromRequest(request);
  if (!auth) return Response.json({ error: "未登录" }, { status: 401 });
  const input = (await request.json()) as {
    ids?: unknown;
    groupName?: unknown;
  };
  if (
    !Array.isArray(input.ids) ||
    input.ids.some((id: unknown) => typeof id !== "string")
  ) {
    return Response.json({ error: "项目顺序无效" }, { status: 400 });
  }
  if (
    input.groupName !== undefined &&
    input.groupName !== null &&
    typeof input.groupName !== "string"
  ) {
    return Response.json({ error: "项目分组无效" }, { status: 400 });
  }
  try {
    return Response.json(
      reorderProjects(auth.userId, {
      ids: input.ids as string[],
      groupName: input.groupName ?? null,
      })
    );
  } catch {
    return Response.json({ error: "项目顺序不属于当前用户" }, { status: 400 });
  }
}
