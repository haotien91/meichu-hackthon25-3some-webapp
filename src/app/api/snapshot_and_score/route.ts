import { NextResponse } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"

// 讓這個 route 每次都跑（不要預先產生）
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// 相機與相似度 API 都在板子本機
const CAM_BASE = process.env.NEXT_PUBLIC_IMX93_CAMERA_API_URL
const SIM_API = process.env.NEXT_PUBLIC_SIM || 'http://192.168.0.174:8001/similarity'

// 暫存截圖的資料夾（會自動建立）
const TMP_DIR = process.env.NODE_ENV === 'production' ? "/data/meichu/.snaps" : "/tmp/meichu-snaps"

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

    // 1) 叫板子相機拍一張 (存在 imx93 本地)
    const snapUrl = `${CAM_BASE}/snap?save=1`
    const snapRes = await fetch(snapUrl, { cache: "no-store" })
    if (!snapRes.ok) {
      const errTxt = await snapRes.text().catch(() => "")
      return NextResponse.json(
        { error: "camera_snap_failed", status: snapRes.status, message: errTxt || undefined },
        { status: 502 }
      )
    }

    // 2) 獲取 imx93 上的檔案路徑
    const healthRes = await fetch(`${CAM_BASE}/health`, { cache: "no-store" })
    if (!healthRes.ok) {
      return NextResponse.json(
        { error: "camera_health_failed", status: healthRes.status },
        { status: 502 }
      )
    }

    const healthData = await healthRes.json()
    const lastFrame = healthData.last_frame
    if (!lastFrame) {
      return NextResponse.json(
        { error: "no_frame_available", message: "Camera has no frames" },
        { status: 502 }
      )
    }

    // 3) 使用 imx93 檔案路徑呼叫相似度 API
    const payload: { image_path: string; target_pose: string } = {
      image_path: lastFrame,  // imx93 本地路徑
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
