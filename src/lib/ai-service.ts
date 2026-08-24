import { getSettings } from "@/lib/server-store";
import { AiProvider } from "@/lib/settings";

export const AI_REQUEST_TIMEOUT_MS = 10_000;
export const AI_MAX_RESPONSE_BYTES = 1_000_000;
const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function isDisallowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "metadata.google.internal" ||
    host === "169.254.169.254"
  ) {
    return true;
  }
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return false;
  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function compatibleAllowlist(): string[] {
  return (process.env.AI_COMPATIBLE_ALLOWLIST ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(canonicalUrl);
}

export function resolveAiEndpoint(provider: AiProvider, configuredUrl: string): string {
  if (provider === "openai") return OPENAI_ENDPOINT;
  if (provider === "anthropic") return ANTHROPIC_ENDPOINT;
  if (provider !== "compatible") throw new Error("AI 服务商无效");
  let target: URL;
  try {
    target = new URL(configuredUrl);
  } catch {
    throw new Error("兼容接口地址无效");
  }
  if (target.protocol !== "https:") throw new Error("兼容接口只允许 HTTPS 地址");
  if (isDisallowedHost(target.hostname)) throw new Error("兼容接口地址被拒绝");
  const normalized = canonicalUrl(target.toString());
  if (!compatibleAllowlist().includes(normalized)) {
    throw new Error("兼容接口地址不在服务端 allowlist 中");
  }
  return normalized;
}

function configuredKey(): string {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error("服务器尚未配置 AI_API_KEY，请先在部署环境中添加密钥");
  return key;
}

async function readResponseTextLimited(response: Response): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > AI_MAX_RESPONSE_BYTES) {
      throw new Error("模型响应超过大小限制");
    }
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        text += decoder.decode();
        break;
      }
      total += chunk.value.byteLength;
      if (total > AI_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("模型响应超过大小限制");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return text;
}

async function fetchAi(endpoint: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, { ...init, signal: controller.signal });
    const body = await readResponseTextLimited(response);
    if (!response.ok) throw new Error(`模型请求失败 (${response.status})`);
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new Error("模型响应不是有效 JSON");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("模型请求超时");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestAi(prompt: string, userId: string): Promise<string> {
  const settings = getSettings(userId);
  // Resolve the endpoint before reading the global key or calling fetch. This is
  // the security boundary for user-controlled compatible URLs.
  const endpoint = resolveAiEndpoint(settings.aiProvider, settings.aiBaseUrl);
  const key = configuredKey();
  let data: any;
  if (settings.aiProvider === "anthropic") {
    data = await fetchAi(endpoint, {
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
    data = await fetchAi(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: settings.aiModel,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } else {
    data = await fetchAi(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: settings.aiModel, input: prompt, max_output_tokens: 600 }),
    });
  }
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
  if (!Array.isArray(tasks)) throw new Error("模型未返回可识别的任务列表，请重试");
  const validTasks = tasks
    .filter((task): task is string => typeof task === "string" && Boolean(task.trim()))
    .map((task) => task.trim())
    .slice(0, 8);
  if (validTasks.length === 0) throw new Error("模型未返回可用的子任务，请重试");
  return validTasks;
}

export async function testAiConnection(userId: string): Promise<void> {
  await requestAi("请只回复：OK", userId);
}
