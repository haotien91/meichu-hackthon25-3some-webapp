const API = "/api/lcd"

async function safePost(action: string, body?: any): Promise<void> {
  try {
    await fetch(`${API}?action=${encodeURIComponent(action)}` , {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      keepalive: true,
    })
  } catch {
    // ignore; non-blocking fire-and-forget
  }
}

export const lcdClient = {
  init: () => safePost("init"),
  lessonStart: (total: number) => safePost("lesson-start", { total }),
  lessonNext: () => safePost("lesson-next"),
}

export type LcdClient = typeof lcdClient

