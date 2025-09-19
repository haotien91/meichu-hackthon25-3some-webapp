"use client"

import { useParams, useRouter } from "next/navigation"
import { findBySlug } from "../../lessons"
import { lessons } from "../../lessons"
import { useEffect, useState } from "react"
import Cookies from "js-cookie"
import HeartRateWidget from "../../../components/HeartRateWidget"
import aggregator from "../../../../lib/programRunAggregator"

type Profile = { height: string; weight: string; age: string; gender: string }

// 小圓 pill：左邊小圓點 + 右邊數值/標籤
function MetricPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 bg-white/90 rounded-[2rem] px-8 py-4 shadow-md min-w-[150px]">
      <span className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 shadow-inner flex-none" />
      <div className="leading-tight">
        <div className="text-2xl font-extrabold text-gray-800 whitespace-nowrap break-keep">
          {value}
        </div>
        <div className="text-sm text-gray-500 whitespace-nowrap break-keep leading-none">
          {label}
        </div>
      </div>
    </div>
  )
}

export default function PracticePage() {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const lesson = findBySlug(slug)

  const [profile, setProfile] = useState<Profile | null>(null)
  const [showConsent, setShowConsent] = useState(true)  // 進場先顯示同意彈窗
  const [camOn, setCamOn] = useState(false)             // 是否顯示相機（UI 示意）
  const [camUrl, setCamUrl] = useState<string | null>(null)

// 顯示用：整數百分比字串
  const [similarity, setSimilarity] = useState<string>("N/A")

  // ★ 進度檢查用：實際數值 + 連續秒數
  const [simNum, setSimNum] = useState<number | null>(null)

  // ★ 計時與卡路里狀態
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [elapsedTime, setElapsedTime] = useState<number>(0) // 毫秒
  const [totalCalories, setTotalCalories] = useState<number>(0)
  const [lastHeartRateTime, setLastHeartRateTime] = useState<Date | null>(null)
  const [streak, setStreak] = useState<number>(0)    // 連續 >= 70% 的秒數

  // ★ 卡路里計算函數 (Keytel et al. 2005)
  const calculateCaloriesPerMinute = (
    heartRate: number,
    weight: number,
    age: number,
    gender: 'male' | 'female'
  ): number => {
    // 超出準確範圍 (90-150 BPM) 的估算
    if (heartRate < 90 || heartRate > 150) {
      const baseRate = gender === 'male' ? 1.2 : 1.0
      const intensityFactor = heartRate < 90 ? 0.5 : Math.min(heartRate / 150, 2.0)
      return weight * 0.1 * intensityFactor * baseRate
    }

    // Keytel 公式
    if (gender === 'male') {
      return (-55.0969 + (0.6309 * heartRate) + (0.1988 * weight) + (0.2017 * age)) / 4.184
    } else {
      return (-20.4022 + (0.4472 * heartRate) - (0.1263 * weight) + (0.074 * age)) / 4.184
    }
  }

  // ★ 心率更新時計算卡路里增量 + 記錄心率樣本
  const updateCalories = (newHeartRate: number) => {
    // 記錄心率樣本供彙總
    aggregator.recordHeartRate(newHeartRate)

    if (!profile || !lastHeartRateTime) {
      setLastHeartRateTime(new Date())
      return
    }

    const now = new Date()
    const timeDiffMinutes = (now.getTime() - lastHeartRateTime.getTime()) / (1000 * 60)

    // 避免異常時間間隔
    if (timeDiffMinutes > 0.5 || timeDiffMinutes < 0) {
      setLastHeartRateTime(now)
      return
    }

    const weight = parseInt(profile.weight) || 70 // 預設70kg
    const age = parseInt(profile.age) || 30       // 預設30歲
    const gender = profile.gender === 'female' ? 'female' : 'male'

    const caloriesPerMin = calculateCaloriesPerMinute(newHeartRate, weight, age, gender)
    const caloriesThisInterval = Math.max(0, caloriesPerMin * timeDiffMinutes)

    setTotalCalories(prev => {
      const next = prev + caloriesThisInterval
      aggregator.setCurrentLessonCalories(next)
      return next
    })
    setLastHeartRateTime(now)
  }

  useEffect(() => {
    const raw = Cookies.get("personal_info")
    if (raw) {
      try { setProfile(JSON.parse(raw)) } catch {}
    }
  }, [])

  // ★ 首次進來，如果之前已同意，就不顯示彈窗、直接開相機
  useEffect(() => {
    const ok = Cookies.get("cam_consent") === "1"
    if (ok) {
      setShowConsent(false)
      const qs = new URLSearchParams({ width: "1400", height: "680", fps: "20", format: "YUY2" }).toString()
      setCamUrl(`/camera/video?${qs}`)
      setCamOn(true)
    }
  }, [])

  // ★ 啟動/接續本次課程的彙總收集（使用 localStorage）
  useEffect(() => {
    if (!slug) return
    const program = "yoga_5min"
    const active = aggregator.getActiveRun(program)
    // 以 cookie 為快照（不阻塞 UI）
    let snapshot: any = undefined
    try { const raw = Cookies.get("personal_info"); snapshot = raw ? JSON.parse(raw) : undefined } catch {}
    if (!active) {
      aggregator.beginRun(program, snapshot)
    }
    aggregator.beginLesson(slug)
  }, [slug])


  // ★ 自動開始計時 (相機開啟時)
  useEffect(() => {
    if (camOn && !startTime) {
      const now = new Date()
      setStartTime(now)
      setLastHeartRateTime(now)
      console.log('🕐 練習計時開始:', now.toLocaleTimeString())
    }
  }, [camOn, startTime])

  // ★ 每秒更新計時
  useEffect(() => {
    if (!startTime) return

    const interval = setInterval(() => {
      const now = new Date()
      const elapsed = now.getTime() - startTime.getTime()
      setElapsedTime(elapsed)
      // update aggregator elapsed in seconds
      aggregator.setCurrentLessonElapsed(Math.floor(elapsed / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime])

  // ★ 每秒打分一次；顯示整數，並累積「連續 >=70% 的秒數」
  useEffect(() => {
    if (!camOn || !camUrl || !lesson) return

    let stop = false
    const target = lesson.apiTarget ?? slug

    const tick = async () => {
      try {
        const res = await fetch(`/api/snapshot_and_score?target_pose=${encodeURIComponent(target)}`, { cache: "no-store" })
        if (!res.ok) throw new Error(String(res.status))
        const { similarity, body_found } = await res.json()
        if (stop) return
        if (body_found === false || !Number.isFinite(similarity)) {
          setSimNum(null)
          setSimilarity("N/A")
          setStreak(0)
          return
        }
        const n = Math.round(similarity)
        setSimNum(n)
        setSimilarity(`${n}%`)
        // record similarity sample for aggregator
        aggregator.recordSimilarity(n, true)
        setStreak(prev => (n >= 70 ? prev + 1 : 0))
      } catch {
        if (!stop) {
          setSimNum(null)
          setSimilarity("N/A")
          setStreak(0)
        }
      }
    }

    // 先跑一次，之後每 1 秒（要判斷「連續 5 秒」就不能 10 秒一次）
    tick()
    const id = setInterval(tick, 1000)
    return () => { stop = true; clearInterval(id) }
  }, [camOn, camUrl, slug, lesson])

  // ★ 連續 5 秒達標 -> 跳下一課或顯示總結頁
  useEffect(() => {
    if (!lesson) return
    if (streak >= 5) {
      try { aggregator.finishLesson() } catch {}
      const idx = lessons.findIndex(l => l.slug === lesson.slug)
      const next = idx >= 0 && idx + 1 < lessons.length ? lessons[idx + 1].slug : null
      if (next) {
        router.push(`/yoga_5min/${next}/practice`)
      } else {
        const program = "yoga_5min"
        const active = aggregator.getActiveRun(program)
        const runId = active?.runId
        aggregator.finishProgram()
        if (runId) router.push(`/yoga_5min/summary?run=${encodeURIComponent(runId)}`)
        else router.push(`/yoga_5min/summary`)
      }
    }
  }, [streak, lesson, router])


  // ★ 格式化時間顯示
  const formatElapsedTime = (milliseconds: number): string => {
    const totalSeconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  if (!lesson) return <main className="p-8">找不到課程</main>

  return (
<main className="flex min-h-screen flex-col items-center bg-[#fbeebd] p-3 sm:p-4 space-y-4">
  {/* 大面板 */}
  {/* 大面板：去掉內距 p-4 變成 p-0 */}
  <div
    className="
      relative w-full max-w-7xl
      h-[36rem] lg:h-[40rem] xl:h-[44rem]
      rounded-3xl border-2 border-purple-300/60
      bg-gradient-to-b from-slate-100/70 to-indigo-100/40 backdrop-blur
      shadow-[0_20px_50px_rgba(0,0,0,0.08)] p-0"
  >
    {/* 主畫面：改成 inset-0 + 圓角裁切，完全貼齊、不留邊 */}
    <div className="absolute inset-0 rounded-3xl overflow-hidden">
      {camOn && camUrl ? (
        <img
          src={camUrl}
          alt="Board camera"
          className="h-full w-full object-cover"   // 無邊框鋪滿
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center">
          <p className="text-gray-600 font-bold text-lg">相機未開啟</p>
        </div>
      )}
    </div>

    {/* 左上角標籤 */}
    <span className="absolute top-3 left-6 px-3 py-1 rounded-full bg-white shadow text-gray-700 font-semibold text-sm z-10">
      你的姿勢
    </span>

    {/* 右上角：目標小窗 + 指標（保持不動） */}
    <div className="absolute top-4 right-4 z-10 w-[20rem] flex flex-col items-stretch gap-3">
      <div className="h-[12rem] w-full rounded-2xl border-2 border-purple-400/70 bg-white shadow-xl relative overflow-hidden">
        {lesson?.image ? (
          <img
            src={lesson.image}
            alt={`${lesson.title} 目標`}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0" />
        )}
        <span className="absolute top-3 left-4 px-3 py-1 rounded-full bg-white shadow text-gray-700 font-semibold text-sm">
          目標
        </span>
      </div>
      <div className="flex gap-3 w-full">
        <div className="flex-1"><MetricPill value={ similarity } label="相似度" /></div>
        <div className="flex-1"><MetricPill value={startTime ? formatElapsedTime(elapsedTime) : "0:00"} label="用時" /></div>
      </div>
    </div>

    {/* 底部指標 */}
    <div className="absolute bottom-4 left-4 flex flex-wrap gap-4 z-10">
      <HeartRateWidget onHeartRateUpdate={updateCalories} />
      <MetricPill value={totalCalories > 0 ? `${Math.round(totalCalories)}` : "0"} label="消耗(卡)" />
    </div>
  </div>


        {/* 底部個資卡片 */}
        {profile && (
          <div className="bg-white/60 backdrop-blur-md rounded-2xl shadow-md p-4 text-gray-800 text-lg font-semibold max-w-7xl w-full">
            <div className="grid grid-cols-4 gap-6">
              <p>身高：{profile.height} cm</p>
              <p>體重：{profile.weight} kg</p>
              <p>年齡：{profile.age}</p>
              <p>性別：{profile.gender}</p>
            </div>
          </div>
        )}

        {/* 進場詢問（只調整同意按鈕，寫 cookie，以後不再問） */}
      {showConsent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl text-center">
            <div className="px-10 py-8">
              <h2 id="modal-title" className="text-4xl font-bold text-gray-900 py-6">將開啟相機功能</h2>
              <p className="text-gray-600 text-lg">我們會在主畫面顯示即時相機畫面。是否同意開啟？</p>
              <div className="mt-8 flex gap-6">
                <button
                  autoFocus
                  onClick={() => { setShowConsent(false); setCamOn(false); setCamUrl(null) }}
                  className="flex-1 rounded-lg bg-gray-200 px-5 py-5 text-gray-800 hover:bg-gray-300 active:scale-[0.98] transition text-2xl font-semibold"
                >
                  不同意
                </button>
                <button
                  onClick={() => {
                    // ★ 記住同意，之後不再問
                    Cookies.set("cam_consent", "1", { expires: 365 })
                    setShowConsent(false)
                    const qs = new URLSearchParams({ width: "1400", height: "680", fps: "20", format: "YUY2" }).toString()
                    setCamUrl(`/camera/video?${qs}`)
                    setCamOn(true)
                  }}
                  className="flex-1 rounded-lg bg-gray-900 px-5 py-5 text-white hover:bg-gray-800 active:scale-[0.98] transition text-2xl font-semibold"
                >
                  同意
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
