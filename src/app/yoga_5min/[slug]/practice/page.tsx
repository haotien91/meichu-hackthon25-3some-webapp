"use client"

import { useParams, useRouter } from "next/navigation"
import { findBySlug } from "../../lessons"
import { lessons } from "../../lessons"
import { useEffect, useState, useRef } from "react"
import Cookies from "js-cookie"
import HeartRateWidget from "../../../components/HeartRateWidget"
import aggregator from "../../../../lib/programRunAggregator"
import FireworksLayer from "../../../components/firework"
import { useImx93Video } from "../../../../hooks/useImx93Video"

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
  const [showConsent, setShowConsent] = useState<boolean | null>(null); // null = 尚未判斷
  const [camOn, setCamOn]             = useState(false);
  const [showHrModal, setShowHrModal] = useState(false)
  const [camUrl, setCamUrl] = useState<string | null>(null)

  const [showCongrats, setShowCongrats] = useState(false);
  const [nextCountdown, setNextCountdown] = useState(5);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ⚡ imx93 WebSocket 視訊串流
  const { canvasRef, status: videoStatus, connect: connectVideo, disconnect: disconnectVideo } = useImx93Video()

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

  const getNextSlug = (currentSlug?: string | null) => {
  if (!currentSlug) return null;
  const idx = lessons.findIndex(l => l.slug === currentSlug);
  return idx >= 0 && idx + 1 < lessons.length ? lessons[idx + 1].slug : null;
};

  // 前往下一步
  const goNext = () => {
  const next = getNextSlug(lesson?.slug ?? slug);
  if (next) {
    router.push(`/yoga_5min/${next}/practice`);
  } else {
    const program = "yoga_5min";
    const active = aggregator.getActiveRun(program);
    const runId = active?.runId;
    aggregator.finishProgram();
    if (runId) router.push(`/yoga_5min/summary?run=${encodeURIComponent(runId)}`);
    else router.push(`/yoga_5min/summary`);
  }
};


  // 清除倒數計時器
  const clearCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  };

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

  useEffect(() => {
  const consent =
    Cookies.get("cam_consent") === "1" ||
    typeof window !== "undefined" && localStorage.getItem("cam_consent") === "1";

  setShowConsent(!consent);   // true → 顯示彈窗
  setCamOn(consent);          // 同意過就直接開相機

  // 已同意的話自動連線
  if (consent) {
    (async () => {
      const ok = await connectVideo();
      if (!ok){
        console.error("❌ auto-connect failed");
      }
      else {
        setShowHrModal(true);
      }
    })();
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (!camOn || !videoStatus.connected || !lesson) return

    let stop = false
    const target = lesson.apiTarget ?? slug

    const tick = async () => {
      try {
        // 調用 Next.js 的相似度計算 API (會內部調用 imx93)
        const res = await fetch(`/api/snapshot_and_score?target_pose=${encodeURIComponent(target)}`, {
          cache: "no-store"
        })

        if (!res.ok) throw new Error(String(res.status))

        // 這裡需要根據 imx93 的實際 API 響應格式調整
        // 目前假設返回 { similarity: number, body_found: boolean }
        const data = await res.json()
        const { similarity, body_found } = data

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
  }, [camOn, videoStatus.connected, slug, lesson])

  // ★ 連續 5 秒達標 -> 跳下一課或顯示總結頁
  useEffect(() => {
  if (!lesson) return;
  if (streak >= 5 && !showCongrats) {
    // 結束這堂課的彙總
    try { aggregator.finishLesson() } catch {}
    // 開慶祝視窗 + 啟動倒數
    setShowCongrats(true);
    setNextCountdown(5);
    clearCountdown();
    countdownTimerRef.current = setInterval(() => {
      setNextCountdown((s) => {
        if (s <= 1) {
          clearCountdown();
          goNext();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }
}, [streak, lesson, showCongrats]);  // 這個 effect 不要放 router 以免重跑

  useEffect(() => {
    return () => {
      try { disconnectVideo?.() } catch {}
      clearCountdown();
    };
  }, [disconnectVideo]);


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
    {/* 頂部置中的提示/倒數浮層 */}
    {camOn && !showCongrats && (
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20">
        {/* 倒數：streak 1..5 依序顯示 5..1 */}
        {streak > 0 && streak <= 5 ? (
          <div className="px-6 py-2 rounded-full bg-black/55 text-white text-3xl font-extrabold shadow-lg backdrop-blur">
            {6 - streak}
          </div>
        ) : (
          // 平常顯示「相似度未達 70%」
          simNum !== null && simNum < 70 && (
            <div className="px-3 py-1 rounded-full bg-white/85 text-gray-800 text-sm font-semibold shadow">
              相似度未達 70%
            </div>
          )
        )}
      </div>
    )}
    {/* 主畫面：改成 inset-0 + 圓角裁切，完全貼齊、不留邊 */}
    <div className="absolute inset-0 rounded-3xl overflow-hidden">
      {camOn ? (
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="h-full w-full object-cover"   // 無邊框鋪滿
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600 font-bold text-lg">相機未開啟</p>
            {videoStatus.error && (
              <p className="text-red-500 text-sm mt-2">
                錯誤: {videoStatus.error}
              </p>
            )}
          </div>
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
                {/* 不同意 */}
                <button
                  autoFocus
                  onClick={() => {
                    setShowConsent(false);
                    setCamOn(false);
                    // 不要設 cookie、不要連線
                  }}
                  className="flex-1 rounded-lg bg-gray-200 px-5 py-5 text-gray-800 hover:bg-gray-300 active:scale-[0.98] transition text-2xl font-semibold"
                >
                  不同意
                </button>
                {/* 同意 */}
                <button
                  onClick={async () => {
                    Cookies.set("cam_consent", "1", { expires: 365, path: "/" });
                    localStorage.setItem("cam_consent", "1");
                    setShowConsent(false);
                    setCamOn(true);

                    const ok = await connectVideo();
                    if (!ok){
                      console.error("❌ Failed to connect to imx93 video stream");
                    }
                    else {
                      setShowHrModal(true);
                    }
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

      {showHrModal && (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hr-modal-title"
      >
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
          <div className="px-10 py-8">
            <h3 id="hr-modal-title" className="text-2xl font-bold text-gray-900 mb-2">
              連接藍牙心率裝置
            </h3>
            <p className="text-gray-600 mb-6 mt-6">
              請戴上手並點擊下方按鈕開始配對。配對成功後即可在下方面板看到心率。
            </p>

            {/* 直接放既有的 HeartRateWidget，不改你原本的更新邏輯 */}
            <div className="rounded-xl border-gray-200 p-4 mb-6 max-w-min mx-auto">
              <HeartRateWidget onHeartRateUpdate={updateCalories} />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowHrModal(false)}
                className="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300"
              >
                稍後再說
              </button>
              <button
                onClick={() => setShowHrModal(false)}
                className="rounded-lg bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ✅ 達標慶祝視窗 */}
    {showCongrats && (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-6">
        {/* 煙火層 */}
        <FireworksLayer />

        <div className="relative w-full max-w-xl rounded-3xl bg-white shadow-2xl overflow-hidden">
          <div className="px-8 py-10 text-center relative">
            <h3 className="text-4xl font-bold text-gray-900">太棒了！達標 🎉</h3>

            {/* 倒數置中、放大（跟影片頁一致） */}
            <div className="mt-6 flex flex-col items-center justify-center" aria-live="polite">
              <span className="text-sm text-gray-500">將在</span>
              <span className="mt-2 text-7xl font-black text-gray-900 leading-none animate-pulse">
                {nextCountdown}
              </span>
              <span className="mt-2 text-sm text-gray-500">秒後自動前往下一個動作</span>
            </div>

            {/* 置中按鈕 */}
            <div className="mt-10 flex justify-center gap-4">
              <button
                onClick={() => { setShowCongrats(false); clearCountdown(); }}
                className="rounded-full px-6 py-3 bg-gray-200 text-gray-800 hover:bg-gray-300"
              >
                先不要
              </button>
              <button
                onClick={() => { clearCountdown(); goNext(); }}
                className="rounded-full px-6 py-3 bg-gray-900 text-white hover:bg-gray-800"
              >
                前往下個動作
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </main>
  )
}
