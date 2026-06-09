import { requireHermesToken } from "@/lib/hermes-auth";
import { getProjects, createProject } from "@/lib/server-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const projects = getProjects(auth.userId);
  const tasks = (await import("@/lib/server-store")).getTasks(auth.userId);

  return Response.json(
    projects.map((p) => {
      const projectTasks = tasks.filter((t) => t.projectId === p.id);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        dueDate: p.dueDate,
        showInWeekPlan: p.showInWeekPlan,
        taskCount: projectTasks.length,
        doneCount: projectTasks.filter((t) => t.done).length,
      };
    })
  );
}

export async function POST(request: Request) {
  const auth = requireHermesToken(request);
  if (!auth) return Response.json({ error: "未授权" }, { status: 401 });

  const input = await request.json();
  const name = (input.name ?? "").trim();
  if (!name) {
    return Response.json({ error: "项目名称不能为空" }, { status: 400 });
  }

  const project = createProject(auth.userId, {
    name,
    description: input.description,
    dueDate: input.dueDate,
  });

  return Response.json(project, { status: 201 });
}
