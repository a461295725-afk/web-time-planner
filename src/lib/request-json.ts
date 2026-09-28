export class RequestJsonError extends Error {
  readonly status = 400;

  constructor(message = "请求体必须是合法 JSON") {
    super(message);
    this.name = "RequestJsonError";
  }
}

export async function parseJsonBody<T = Record<string, unknown>>(
  request: Request,
  options: { requireJsonContentType?: boolean } = {}
): Promise<T> {
  if (options.requireJsonContentType) {
    const contentType = request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (contentType !== "application/json" && !contentType?.endsWith("+json")) {
      throw new RequestJsonError();
    }
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new RequestJsonError();
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestJsonError("请求体必须是 JSON 对象");
  }
  return value as T;
}

export function requestJsonErrorResponse(error: unknown): Response | null {
  return error instanceof RequestJsonError
    ? Response.json({ error: error.message }, { status: error.status })
    : null;
}
