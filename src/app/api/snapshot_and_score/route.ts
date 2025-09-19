import { NextResponse } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"

// 讓這個 route 每次都跑（不要預先產生）
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// 相機與相似度 API 都在板子本機
const CAM_BASE = "http://127.0.0.1:5000"
const SIM_API  = "http://127.0.0.1:8001/similarity"

// 暫存截圖的資料夾（會自動建立）
const TMP_DIR = "/data/meichu/.snaps"

// Types based on updated Similarity API
type SimilarityOk = { similarity: number; body_found: boolean }

type ErrorDetail = {
  error_code: string
  message?: string
}

export async function GET(req: Request) {
  let filePath: string | null = null
  try {
    const url = new URL(req.url)
    const sp = url.searchParams

    // early return if target_pose is missing
    const targetPoseRaw = sp.get("target_pose")
    if (!targetPoseRaw || !targetPoseRaw.trim()) {
      return NextResponse.json(
        { detail: { error_code: "INVALID_REQUEST", message: "Query parameter 'target_pose' is required" } },
        { status: 400 }
      )
    }
    const targetPose = targetPoseRaw.trim()

    // 1) 叫板子相機拍一張
    const snapUrl = `${CAM_BASE}/snap`
    const snapRes = await fetch(snapUrl, { cache: "no-store" })
    if (!snapRes.ok) {
      const errTxt = await snapRes.text().catch(() => "")
      return NextResponse.json(
        { error: "camera_snap_failed", status: snapRes.status, message: errTxt || undefined },
        { status: 502 }
      )
    }
    const arrBuf = await snapRes.arrayBuffer()
    const buf = new Uint8Array(arrBuf)

    // 2) 存到暫存檔
    await fs.mkdir(TMP_DIR, { recursive: true })
    const filename = `snap_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.jpg`
    filePath = path.join(TMP_DIR, filename)
    await fs.writeFile(filePath, buf)

    // 3) 呼叫相似度 API
    const payload: { image_path: string; target_pose: string } = {
      image_path: filePath as string,
      target_pose: targetPose,
    }

    const simRes = await fetch(
      SIM_API,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )

    // Handle error responses
    if (!simRes.ok) {
      let json: any = null
      try {
        json = await simRes.json()
      } catch {
        // ignore JSON parse error
      }
      const detail: ErrorDetail | undefined = json?.detail
      const message = detail?.message || json?.message || (await simRes.text().catch(() => "")) || undefined

      const errorBody = {
        from: "similarity_api",
        status: simRes.status,
        error_code: detail?.error_code || "UPSTREAM_ERROR",
        message,
        detail: detail || undefined,
      }
      return NextResponse.json(errorBody, { status: simRes.status })
    }

    // Handle success responses
    const data = (await simRes.json()) as SimilarityOk

    const similarity = typeof data?.similarity === "number" ? data.similarity : null
    const bodyFound = typeof data?.body_found === "boolean" ? data.body_found : null

    // Return response
    return NextResponse.json({
      similarity,
      body_found: bodyFound,
      target_pose: targetPose,
    })
  } catch (e: any) {
    console.error("/api/snapshot_and_score GET error:", e)
    return NextResponse.json({ error: e?.message || "server error" }, { status: 500 })
  } finally {
    if (filePath) {
      // 刪掉暫存檔
      await fs.unlink(filePath).catch(() => {})
    }
  }
}
