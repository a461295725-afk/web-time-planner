export class RequestJsonError extends Error {
  readonly status = 400;

  constructor() {
    super("请求体必须是合法 JSON");
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

  try {
    return (await request.json()) as T;
  } catch {
    throw new RequestJsonError();
  }
}

export function requestJsonErrorResponse(error: unknown): Response | null {
  return error instanceof RequestJsonError
    ? Response.json({ error: error.message }, { status: error.status })
    : null;
}
