"use client"

import { useParams, useRouter } from "next/navigation"
import { findBySlug, lessons } from "../../lessons"
import { useEffect, useState, useRef } from "react"
import Cookies from "js-cookie"
import HeartRateWidget from "../../../components/HeartRateWidget"
import aggregator from "../../../../lib/programRunAggregator"
import FireworksLayer from "../../../components/Firework"
import Modal from "../../../components/Modal";
import { useImx93Video } from "../../../../hooks/useImx93Video"
import { lcdClient } from "../../../../lib/lcdClient"

type Profile = { height: string; weight: string; age: string; gender: string }

const HR_PROMPT_DONE_KEY = "hr_prompt_done"
const HR_CONNECTED_KEY = "hr_connected_once"
const GUIDE_DONE_KEY = "guide_done_v1";


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
  const [heartRate, setHeartRate] = useState<number | null>(null);

  const [showCongrats, setShowCongrats] = useState(false);
  const [nextCountdown, setNextCountdown] = useState(3);

  const cameraPromptedRef = useRef(false)
  
  
  const [qualifyCountdown, setQualifyCountdown] = useState<number | null>(null); // 5..1
  const qualifyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isFirstLesson = slug === "lesson-1";

  const [showGuide, setShowGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(0); // 0..3 共四張
  const GUIDE_TOTAL = 4;

  const [guideDecided, setGuideDecided] = useState(false);

  const clearQualifyTimer = () => {
  if (qualifyTimerRef.current) {
    clearInterval(qualifyTimerRef.current);
    qualifyTimerRef.current = null;
  }
};

  // ⚡ imx93 WebSocket 視訊串流
  const { canvasRef, status: videoStatus, connect: connectVideo, disconnect: disconnectVideo } = useImx93Video()

  // ★ 進度檢查用：實際數值 + 連續秒數
  const [simNum, setSimNum] = useState<number | null>(null)

  // ★ 計時與卡路里狀態
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [elapsedTime, setElapsedTime] = useState<number>(0) // 毫秒
  const [totalCalories, setTotalCalories] = useState<number>(0)
  const [lastHeartRateTime, setLastHeartRateTime] = useState<Date | null>(null)
  const inFlight = useRef(false);

  const getNextSlug = (currentSlug?: string | null) => {
  if (!currentSlug) return null;
  const idx = lessons.findIndex(l => l.slug === currentSlug);
  return idx >= 0 && idx + 1 < lessons.length ? lessons[idx + 1].slug : null;
};

  // 前往下一步
  const goNext = () => {
    const next = getNextSlug(lesson?.slug ?? slug);
    if (next) {
      router.push(`/yoga_5min/${next}/demo_video`);
    } else {
      const program = "yoga_5min";
      const active = aggregator.getActiveRun(program);
      const runId = active?.runId;
      aggregator.finishProgram();
      if (runId) router.push(`/yoga_5min/summary?run=${encodeURIComponent(runId)}`);
      else router.push(`/yoga_5min/summary`);
    }
  };

  const nextSlug = getNextSlug(lesson?.slug ?? slug)
  const nextLesson = nextSlug ? lessons.find(l => l.slug === nextSlug) : null
  const isLastLesson = !nextLesson


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
    setHeartRate(newHeartRate); 
    try {
    if (newHeartRate > 0) {
      localStorage.setItem(HR_CONNECTED_KEY, "1")
      Cookies.set(HR_CONNECTED_KEY, "1", { expires: 365, path: "/" })
      localStorage.setItem(HR_PROMPT_DONE_KEY, "1")      // 👈 新增
      Cookies.set(HR_PROMPT_DONE_KEY, "1", { expires: 365, path: "/" })
    }
  } catch {}
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
    if (!isFirstLesson) { 
      setGuideDecided(true); // 不是第一課，直接放行後續流程
      return; 
    }
    const seen = (typeof window !== "undefined" && localStorage.getItem(GUIDE_DONE_KEY) === "1");
    setShowGuide(!seen);     // 該顯示就顯示
    setGuideDecided(true);   // ✅ 不論有沒有顯示，都標記「導覽已判定」
  }, [isFirstLesson]);

  useEffect(() => {
    const raw = Cookies.get("personal_info")
    if (raw) {
      try { setProfile(JSON.parse(raw)) } catch {}
    }
  }, [])

  // ✅ 首先只決定「要不要先出藍牙彈窗」
  useEffect(() => {
    if (!guideDecided) return; 
    if (showGuide) return;     


    const hasConnectedOnce =
      (typeof window !== "undefined" && localStorage.getItem(HR_CONNECTED_KEY) === "1") ||
      Cookies.get(HR_CONNECTED_KEY) === "1"

    const hrPromptDone =
      (typeof window !== "undefined" && localStorage.getItem(HR_PROMPT_DONE_KEY) === "1") ||
      Cookies.get(HR_PROMPT_DONE_KEY) === "1"

    // 沒連過 -> 先出 HR 彈窗；連過 -> 直接進入下一步（相機同意流程）
    setShowHrModal(!(hasConnectedOnce || hrPromptDone))
  }, [showGuide, guideDecided])

  // ✅ 等藍牙彈窗關閉，才處理相機同意與串流連線
  useEffect(() => {
    if (!guideDecided) return; // 👈 導覽先完成
    if (showGuide) return;     // 👈 導覽顯示中
    if (showHrModal) return;   // 👈 HR 尚未完成
    if (cameraPromptedRef.current) return;

    cameraPromptedRef.current = true  // 只處理一次

    const consent =
      Cookies.get("cam_consent") === "1" ||
      (typeof window !== "undefined" && localStorage.getItem("cam_consent") === "1")

    setShowConsent(!consent)
    setCamOn(consent)

    if (consent) {
      void connectVideo().catch(err => {
        console.error("❌ auto-connect failed", err)
      })
    }
  }, [guideDecided, showGuide, showHrModal, connectVideo]);

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
      // Start LCD progress with total lessons at the beginning of a new run (fire-and-forget)
      void lcdClient.lessonStart(lessons.length)
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
  if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/snapshot_and_score?target_pose=${encodeURIComponent(target)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));

      const data = await res.json();
      const { similarity, body_found } = data;

      if (stop) return;
      if (body_found === false || !Number.isFinite(similarity)) {
        setSimNum(null);
      } else {
        const n = Math.round(similarity);
        setSimNum(n);
        aggregator.recordSimilarity(n, true);
      }
    } catch {
      if (!stop) setSimNum(null);
    } finally {
      inFlight.current = false;
    }
  };


    // 先跑一次，之後每 1 秒（要判斷「連續 5 秒」就不能 10 秒一次）
    tick()
    const id = setInterval(tick, 1000)
    return () => { stop = true; clearInterval(id) }
  }, [camOn, videoStatus.connected, slug, lesson])

  // ★ 連續 5 秒達標 -> 跳下一課或顯示總結頁
  useEffect(() => {
  if (!camOn || !videoStatus.connected || !lesson || showCongrats) {
    clearQualifyTimer();
    setQualifyCountdown(null);
    return;
  }

  const qualifies = simNum !== null && simNum >= 70;

  if (qualifies) {
    // 沒在倒數中 -> 開始 5..1
    if (qualifyCountdown === null) {
      setQualifyCountdown(5);
      clearQualifyTimer();
      qualifyTimerRef.current = setInterval(() => {
        setQualifyCountdown((c) => {
          if (c === null) return c;
          if (c <= 1) {
            // 倒數結束 -> 顯示煙花 + 啟動「自動前往下一步」倒數
            clearQualifyTimer();
            setQualifyCountdown(null);
            try { aggregator.finishLesson(); } catch {}
            void lcdClient.lessonNext()
            setShowCongrats(true);

            setNextCountdown(3);
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

            return null;
          }
          return c - 1;
        });
      }, 1000);
    }
  } else {
    // 不符合門檻 -> 取消倒數
    clearQualifyTimer();
    setQualifyCountdown(null);
  }

  // 清理
  return () => {
    // 不做事，離開時有別的 cleanup
  };
}, [simNum, camOn, videoStatus.connected, lesson, showCongrats, qualifyCountdown]);

  // ✅ 放在元件頂層（與其他 useEffect 平行）
  // 恭喜視窗開啟時關閉相機與串流
  useEffect(() => {
    if (!showCongrats) return;
    setCamOn(false);
    try { disconnectVideo?.() } catch {}

    // 可選：清空畫布避免殘影
    try {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx && canvasRef.current) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    } catch {}
  }, [showCongrats, disconnectVideo]);


  useEffect(() => {
    return () => {
      try { disconnectVideo?.() } catch {}
      clearCountdown();
      clearQualifyTimer();
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
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">

        {/* 1) 沒偵測到人像 */}
        {simNum === null && (
          <div className="relative mt-0 w-full">
            <div className="relative flex w-full items-center gap-3 rounded-[2rem] bg-white/50 px-6 py-3 shadow-md">
              {/* 驚嘆號 */}
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 font-black text-gray-900">!</span>
              <div className="flex-1 text-center leading-tight">
                <div className="text-2xl font-semibold text-gray-800">請保持在畫面中央</div>
              </div>
            </div>
          </div>
        )}

        {/* 2) 有偵測但 < 70 */}
        {simNum !== null && simNum < 70 && (
          <div className="relative mt-0 w-full">
            <div className="relative flex w-full items-center gap-3 rounded-[2rem] bg-white/90 px-6 py-3 shadow-md">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-400 font-black text-gray-900">!</span>
              <div className="flex-1 text-center leading-tight">
                <div className="text-2xl font-semibold text-gray-800">相似度未達 70%</div>
              </div>
            </div>
          </div>
        )}

        {/* 3) 已達標：顯示倒數（只有在 streak 1..5） */}
        {/* 達 70% 立即 5→1 倒數 */}
        { qualifyCountdown !== null && (
          <div className="px-10 py-2 rounded-full bg-black/55 text-white text-5xl font-extrabold shadow-lg backdrop-blur">
            { qualifyCountdown }
          </div>
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
      <div className="flex gap-2 w-full">
        <div className="flex-1"><MetricPill value={ simNum === null ? 'N/A' : `${simNum}%` } label="相似度" /></div>
        <div className="flex-1"><MetricPill value={startTime ? formatElapsedTime(elapsedTime) : "0:00"} label="用時" /></div>
      </div>
    </div>

    {/* 底部指標 */}
    <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 z-10">
      <HeartRateWidget onHeartRateUpdate={updateCalories} />
      <MetricPill value={totalCalories > 0 ? `${Math.round(totalCalories)}` : "0"} label="消耗(卡)" />
    </div>
  </div>


        {/* 底部個資卡片 */}
        {/* {profile && (
          <div className="bg-white/60 backdrop-blur-md rounded-2xl shadow-md p-4 text-gray-800 text-lg font-semibold max-w-7xl w-full">
            <div className="grid grid-cols-4 gap-6">
              <p>身高：{profile.height} cm</p>
              <p>體重：{profile.weight} kg</p>
              <p>年齡：{profile.age}</p>
              <p>性別：{profile.gender}</p>
            </div>
          </div>
        )} */}

        {showGuide && (
          <Modal open={showGuide}>
            <div className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl text-center p-8 sm:p-10">
              <h3 className="text-4xl font-bold text-gray-900 mb-8">教學</h3>

              <img
                src={`/guide/guide_${guideStep + 1}.jpeg`}
                alt={`教學 ${guideStep + 1}`}
                className="w-full max-h-[75vh] object-contain rounded-2xl"
              />
              <div className="mt-8 text-gray-500 text-lg">{guideStep + 1} / {GUIDE_TOTAL}</div>

              <div className="mt-6 flex justify-center gap-4">
                <button
                  onClick={() => { try { localStorage.setItem(GUIDE_DONE_KEY, "1"); } catch {} ; setShowGuide(false); }}
                  className="rounded-full px-6 py-3 bg-gray-200 text-gray-800 hover:bg-gray-300 text-lg"
                >
                  跳過
                </button>

                {guideStep < GUIDE_TOTAL - 1 ? (
                  <button
                    onClick={() => setGuideStep(s => s + 1)}
                    className="rounded-full px-8 py-4 bg-gray-900 text-white hover:bg-gray-800 text-lg"
                  >
                    下一步
                  </button>
                ) : (
                  <button
                    onClick={() => { try { localStorage.setItem(GUIDE_DONE_KEY, "1"); } catch {} ; setShowGuide(false); }}
                    className="rounded-full px-8 py-4 bg-gray-900 text-white hover:bg-gray-800 text-lg"
                  >
                    完成
                  </button>
                )}
              </div>
            </div>
          </Modal>
        )}

        {/* 進場詢問（只調整同意按鈕，寫 cookie，以後不再問） */}
        {showConsent && !showHrModal && (
          <Modal open={!!showConsent}>
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
                    onClick={() => {
                      Cookies.set("cam_consent", "1", { expires: 365, path: "/" });
                      localStorage.setItem("cam_consent", "1");

                      setShowConsent(false);
                      setCamOn(true);

                      // 相機在背景連線，不阻塞 UI、不影響 HR 視窗顯示
                      void connectVideo().catch((err) => {
                        console.error("❌ Failed to connect to imx93 video stream", err);
                      });
                    }}
                    className="flex-1 rounded-lg bg-gray-900 px-5 py-5 text-white hover:bg-gray-800 active:scale-[0.98] transition text-2xl font-semibold"
                  >
                    同意
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}
      {showHrModal && (
      <Modal open={!!showHrModal}>
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl text-center">
          <div className="px-10 py-8">
            <h3 id="hr-modal-title" className="text-2xl font-bold text-gray-900 mb-2">
              連接藍牙心率裝置
            </h3>
            <p className="text-gray-600 mb-6 mt-6">
              請戴上手並點擊下方按鈕開始配對。配對成功後即可在下方面板看到心率。
            </p>

            {/* 直接放既有的 HeartRateWidget，不改你原本的更新邏輯 */}
            <div className="rounded-xl border-gray-200 p-4 mb-6 max-w-min mx-auto">
              <HeartRateWidget readOnlyBpm={heartRate} />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  try {
                    localStorage.setItem(HR_PROMPT_DONE_KEY, "1")
                    Cookies.set(HR_PROMPT_DONE_KEY, "1", { expires: 365, path: "/" })
                  } catch {}
                  setShowHrModal(false)
                }}
                className="rounded-lg bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300"
              >
                取消
              </button>
              <button
                onClick={() => {
                  try {
                    // 有讀到心率就標記「已連過」
                    if (heartRate && heartRate > 0) {
                      localStorage.setItem(HR_CONNECTED_KEY, "1")
                      Cookies.set(HR_CONNECTED_KEY, "1", { expires: 365, path: "/" })
                    }
                    // 一律標記「已詢問過」
                    localStorage.setItem(HR_PROMPT_DONE_KEY, "1")
                    Cookies.set(HR_PROMPT_DONE_KEY, "1", { expires: 365, path: "/" })
                  } catch {}
                  setShowHrModal(false)
                }}
                className="rounded-lg bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      </Modal>
    )}

    {/* ✅ 達標慶祝視窗 */}
    {showCongrats && (
      <Modal open={!!showCongrats}>
        {/* 煙火層 */}
        <FireworksLayer />
        <div className="relative w-full max-w-6xl rounded-3xl bg-white shadow-2xl overflow-hidden">
          {/* 中線（桌機顯示，80% 高度） */}
          <span className="hidden md:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[80%] w-px bg-gray-200" />

          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* 左側：達標 + 下一個動作 */}
            <div className="px-12 py-12 md:py-16 text-center flex flex-col items-center gap-6">
              <h3 className="text-4xl font-bold text-gray-900 mb-8">太棒了！達標 🎉</h3>

              {isLastLesson ? (
                // ✅ 最後一課：顯示完成提示
                <p className="mt-24 text-3xl text-gray-800 text-center font-semibold">
                  您已完成所有動作
                </p>
              ) : (
                // 不是最後一課：顯示下一個動作
                nextLesson && (
                  <div className="flex flex-col items-center gap-4 mx-auto">
                    <img
                      src={`/lessons_example/${nextLesson.slug}.png`}
                      alt={`下一個動作：${nextLesson.displayTitle}`}
                      className="h-48 w-auto rounded-xl shadow-md object-contain bg-white"
                    />
                    <p className="text-xl text-gray-600 text-center mt-8">
                      下一個動作：
                      <span className="font-semibold text-gray-900">{nextLesson.displayTitle}</span>
                    </p>
                  </div>
                )
              )}
              {/* 行動裝置才顯示的水平分隔線 */}
              <div className="mt-4 w-full border-t border-gray-200 md:hidden" />
            </div>

            {/* 右側：倒數（拿掉滿高邊框，改用上方絕對定位的中線） */}
            <div className="px-10 py-12 md:py-16 flex items-center justify-center">
              <div className="flex flex-col items-center justify-center" aria-live="polite">
                <span className="text-xl text-gray-500">將在</span>
                <span className="mt-14 text-8xl font-black text-gray-900 leading-none animate-pulse">
                  {nextCountdown}
                </span>
                <span className="mt-14 text-xl text-gray-500">
                  {isLastLesson ? "秒後自動前往總結" : "秒後自動前往下一個示範影片"}
                </span>

                <button
                  onClick={() => { clearCountdown(); goNext(); }}
                  className="mt-14 rounded-full px-6 py-4 bg-gray-900 text-white hover:bg-gray-800 font-bold text-xl"
                >
                  {isLastLesson ? "前往總結" : "前往下個動作"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    )}
    </main>
  )
}
