import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const BASE = process.env.NEXT_PUBLIC_LCD_API_URL || "http://localhost:8002/lcd"

type LcdAction = "init" | "lesson-start" | "lesson-next"

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const action = (url.searchParams.get("action") || "").trim() as LcdAction

    if (!action || !["init", "lesson-start", "lesson-next"].includes(action)) {
      return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 })
    }

    let body: any = undefined
    if (action === "lesson-start") {
      // Expect JSON like: { total: number }
      try {
        body = await req.json()
        if (!body || typeof body.total !== "number") {
          return NextResponse.json({ ok: false, error: "missing_total" }, { status: 400 })
        }
      } catch {
        return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 })
      }
    }

    const upstream = await fetch(`${BASE}/${action}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    })

    const contentType = upstream.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      const text = await upstream.text().catch(() => "")
      return NextResponse.json({ ok: upstream.ok, status: upstream.status, text }, { status: upstream.status })
    }

    const json = await upstream.json().catch(() => ({}))
    return NextResponse.json(json, { status: upstream.status })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 })
  }
}

