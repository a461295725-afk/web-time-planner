import { getSettings } from "@/lib/server-store";

function configuredKey(): string {
  const key = process.env.AI_API_KEY;
  if (!key) {
    throw new Error("服务器尚未配置 AI_API_KEY，请先在部署环境中添加密钥");
  }
  return key;
}

async function requestAi(prompt: string, userId: string): Promise<string> {
  const settings = getSettings(userId);
  const key = configuredKey();
  let response: Response;

  if (settings.aiProvider === "anthropic") {
    response = await fetch(settings.aiBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: settings.aiModel,
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } else if (settings.aiProvider === "compatible") {
    response = await fetch(settings.aiBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: settings.aiModel,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } else {
    response = await fetch(settings.aiBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: settings.aiModel,
        input: prompt,
        max_output_tokens: 600,
      }),
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`模型请求失败 (${response.status})：${errorText.slice(0, 120)}`);
  }
  const data = await response.json();
  if (settings.aiProvider === "anthropic") {
    return data.content?.find((part: { type: string }) => part.type === "text")?.text ?? "";
  }
  if (settings.aiProvider === "compatible") {
    return data.choices?.[0]?.message?.content ?? "";
  }
  if (typeof data.output_text === "string") return data.output_text;
  return (
    data.output
      ?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? [])
      .find((part: { type: string }) => part.type === "output_text")?.text ?? ""
  );
}

export async function generateTaskBreakdown(title: string, note: string, userId: string): Promise<string[]> {
  const text = await requestAi(
    `你是个人项目规划助手。请将下面项目拆分为 3 到 6 个清晰、可执行的中文子任务。\n` +
      `项目名称：${title}\n项目笔记：\n${note || "暂无笔记"}\n\n` +
      `只返回 JSON，格式为 {"tasks":["任务1","任务2"]}，不要添加其他文字。`,
    userId
  );
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  let parsed: { tasks?: unknown } | string[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("模型未返回可识别的任务列表，请重试");
  }
  const tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
  if (!Array.isArray(tasks)) {
    throw new Error("模型未返回可识别的任务列表，请重试");
  }
  const validTasks = tasks
    .filter((task): task is string => typeof task === "string" && Boolean(task.trim()))
    .map((task) => task.trim())
    .slice(0, 8);
  if (validTasks.length === 0) {
    throw new Error("模型未返回可用的子任务，请重试");
  }
  return validTasks;
}

export async function testAiConnection(userId: string): Promise<void> {
  await requestAi("请只回复：OK", userId);
}
