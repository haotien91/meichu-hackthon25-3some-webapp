import { NextResponse } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"

// 讓這個 route 每次都跑（不要預先產生）
export const dynamic = "force-dynamic"

// 相機與相似度 API 都在板子本機
const CAM_BASE = "http://127.0.0.1:5000"
const SIM_API  = "http://127.0.0.1:8000/similarity"

// 暫存截圖的資料夾（會自動建立）
const TMP_DIR = "/data/meichu/.snaps"

export async function GET(req: Request) {
    try {
        const url = new URL(req.url)
        const slug = url.searchParams.get("slug") || "lesson-1"
        // 前端把目前相機的 queryString 丟上來（例如 width=1400&height=680&fps=20&format=YUY2）
        const qs   = url.searchParams.get("qs") || "width=1280&height=800&fps=15&format=YUY2"

        // 1) 叫板子相機拍一張
        const snapUrl = `${CAM_BASE}/snap`
        const snapRes = await fetch(snapUrl, { cache: "no-store" })
        if (!snapRes.ok) {
        return NextResponse.json({ error: `snap failed ${snapRes.status}` }, { status: 502 })
        }
        const buf = Buffer.from(await snapRes.arrayBuffer())

        // 2) 存到暫存檔
        await fs.mkdir(TMP_DIR, { recursive: true })
        const filename = `snap_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.jpg`
        const filePath = path.join(TMP_DIR, filename)
        await fs.writeFile(filePath, buf)

        // 3) 呼叫相似度 API
        const body = { image_path: filePath, target_name: slug } // 你說 target 用對應的 lesson-x
        const simRes = await fetch(SIM_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        })

        if (!simRes.ok) {
        // 刪檔後回傳錯誤
        await fs.unlink(filePath).catch(() => {})
        return NextResponse.json({ error: `similarity failed ${simRes.status}` }, { status: 502 })
        }

        const data = await simRes.json() as { percent?: number }
        // 4) 刪掉暫存檔
        await fs.unlink(filePath).catch(() => {})

        return NextResponse.json({ percent: data.percent ?? null })
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "server error" }, { status: 500 })
    }
}
