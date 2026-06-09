type SSEController = ReadableStreamDefaultController;

const channels = new Map<string, Set<SSEController>>();

export function sseSubscribe(userId: string, controller: SSEController): void {
  if (!channels.has(userId)) {
    channels.set(userId, new Set());
  }
  channels.get(userId)!.add(controller);
}

export function sseUnsubscribe(userId: string, controller: SSEController): void {
  channels.get(userId)?.delete(controller);
  if (channels.get(userId)?.size === 0) {
    channels.delete(userId);
  }
}

export function broadcastChange(userId: string): void {
  const subs = channels.get(userId);
  if (!subs) return;
  const data = `data: ${JSON.stringify({ type: "change", ts: Date.now() })}\n\n`;
  const encoder = new TextEncoder();
  for (const ctrl of subs) {
    try {
      ctrl.enqueue(encoder.encode(data));
    } catch {
      subs.delete(ctrl);
    }
  }
}
