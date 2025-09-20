// app/yoga_5min/[slug]/demo_video/page.tsx
"use client"

import { useRouter, useParams, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { findBySlug } from "../../lessons"

export default function DemoVideoPage() {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const search = useSearchParams()
  const forceAuto =
    search.get("auto") === "1" ||
    search.get("from") === "practice" ||
    search.get("qualified") === "1"

  const isFirstLesson = slug === "lesson-1"

  const lesson = findBySlug(slug)

  // 進場彈窗
  const [showIntro, setShowIntro] = useState<boolean>(isFirstLesson && !forceAuto)
  const [isZoomed, setIsZoomed] = useState(false)

  // 播放完畢彈窗
  const [showModal, setShowModal] = useState(false)

  const [endCountdown, setEndCountdown] = useState(3)

  const [introCountdown, setIntroCountdown] = useState<number | null>(null)
  const introTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearIntroTimer = () => {
    if (introTimerRef.current) {
      clearInterval(introTimerRef.current)
      introTimerRef.current = null
    }
  }

  const clearEndTimer = () => {
    if (endTimerRef.current) {
      clearInterval(endTimerRef.current)
      endTimerRef.current = null
    }
  }

  // YouTube Player 相關
  const endedOnceRef = useRef(false)
  const playerRef = useRef<any>(null)
  const playerReadyRef = useRef(false)
  const pendingPlayRef = useRef(false)

  // 讓縮放動畫可被重新觸發
  const rezoom = () => {
    setIsZoomed(false);
    // 兩層 rAF 確保瀏覽器先套用回 scale-100，再切到 scale-125
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsZoomed(true));
    });
  };

  useEffect(() => {
    setShowIntro(isFirstLesson && !forceAuto)
  }, [isFirstLesson, forceAuto])

  useEffect(() => {
    if (!lesson) return
    if (typeof window === "undefined") return

    const onYouTubeIframeAPIReady = () => {
      if (playerRef.current) return
      playerRef.current = new (window as any).YT.Player("player", {
        playerVars: { playsinline: 1 },   
        events: {
          onReady: () => {
            playerReadyRef.current = true
            if (pendingPlayRef.current) {
              try { 
                playerRef.current?.mute?.()
                playerRef.current?.playVideo?.() 
              } catch {}
              pendingPlayRef.current = false
            }
          },
          onStateChange: (event: any) => {
            const YT = (window as any).YT
            if (!endedOnceRef.current && event?.data === YT?.PlayerState?.ENDED) {
              endedOnceRef.current = true
              setShowModal(true)

              // 啟動 5 秒倒數
              setEndCountdown(3)
              clearEndTimer()
              endTimerRef.current = setInterval(() => {
                setEndCountdown((n) => {
                  if (n <= 1) {
                    clearEndTimer()
                    goPractice()
                    return 0
                  }
                  return n - 1
                })
              }, 1000)
            }
          }
        },
      })
    }

    if ((window as any).YT?.Player) onYouTubeIframeAPIReady()
    else {
      const tag = document.createElement("script")
      tag.src = "https://www.youtube.com/iframe_api"
      document.body.appendChild(tag)
      ;(window as any).onYouTubeIframeAPIReady = onYouTubeIframeAPIReady
    }

    return () => { try { playerRef.current?.destroy?.() } catch {} 
        clearEndTimer()
        clearIntroTimer()
    }
  }, [lesson])

  useEffect(() => {
  if (!lesson) return
  if (!isFirstLesson || forceAuto) {
    setShowIntro(false)
    // 等一個 tick，避免和初始 render 打架
    requestAnimationFrame(() => startAndPlay(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, isFirstLesson, forceAuto])

  useEffect(() => {
  if (!showIntro) return

  setIntroCountdown(3)
  clearIntroTimer()
  introTimerRef.current = setInterval(() => {
    setIntroCountdown((n) => {
      if (n === null) return n
      if (n <= 1) {
        clearIntroTimer()
        setIntroCountdown(null)
        // 倒數結束 → 關彈窗並直接開始播放
        setShowIntro(false)
        startAndPlay()
        return 0
      }
      return n - 1
    })
  }, 1000)

  return () => clearIntroTimer()
}, [showIntro])

  const startAndPlay = (userInitiated = false) => {
    endedOnceRef.current = false
    setShowIntro(false)
    rezoom();

    if (playerReadyRef.current) {
      try {
        if (!userInitiated) playerRef.current?.mute?.()  // 👈 自動啟動先靜音
        playerRef.current?.playVideo?.()
      } catch {}
    } else {
      // 還沒 ready：記下待播旗標；onReady 時會 mute+play
      pendingPlayRef.current = true
    }
  }

  const goPractice = () => {
    setShowModal(false)
    router.push(`/yoga_5min/${slug}/practice`)
  }

  if (!lesson) return <main className="p-8">找不到課程</main>

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbeebd]">
      <div
        className={`w-full max-w-3xl aspect-video
                    transition-transform duration-700 ease-out
                    ${isZoomed ? "scale-160" : "scale-100"}`}
      >
        <iframe
          id="player"
          className="w-full h-full rounded-lg shadow-lg"
          src={`https://www.youtube.com/embed/${lesson.videoId}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1`}
          title={lesson.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
        />
      </div>

      {/* 兩步驟進場介紹彈窗 */}
      {showIntro && isFirstLesson && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="intro-title"
        >
          <div className="relative w-full max-w-xl rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="px-8 py-10 text-center relative">
              <h3 id="intro-title" className="text-4xl font-bold text-gray-900">
                接下來，會播放一段示範影片
              </h3>

              {/* 倒數置中、放大（和練習頁一致） */}
              <div className="mt-10 flex flex-col items-center justify-center" aria-live="polite">
                <span className="text-xl text-gray-500">將在</span>
                <span className="mt-10 text-8xl font-black text-gray-900 leading-none animate-pulse">
                  {introCountdown ?? 3}
                </span>
                <span className="mt-10 text-xl text-gray-500">秒後開始播放影片</span>
              </div>

              {/* 置中按鈕（和練習頁一致） */}
              <div className="mt-10 flex justify-center gap-4">
                <button
                  onClick={() => {
                    setShowIntro(false)
                    clearIntroTimer()
                    setIntroCountdown(null)
                  }}
                  className="rounded-full px-6 py-4 bg-gray-200 text-gray-800 hover:bg-gray-300 font-bold"
                >
                  先不要
                </button>
                <button
                  onClick={() => {
                    clearIntroTimer()
                    setIntroCountdown(null)
                    setShowIntro(false)
                    startAndPlay(true)
                  }}
                  className="rounded-full px-6 py-4 bg-gray-900 text-white hover:bg-gray-800 font-bold"
                >
                  開始播放
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 播放完畢彈窗 */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl text-center">
            <div className="px-10 py-8 text-center">
              <h2 id="modal-title" className="text-4xl font-bold text-gray-900">
                影片播放完畢
              </h2>

              {/* 倒數置中、放大 */}
              <div className="mt-10 flex flex-col items-center justify-center">
                <span className="text-xl text-gray-500">將在</span>
                <span className="mt-10 text-8xl font-black text-gray-900 leading-none animate-pulse">
                  {endCountdown}
                </span>
                <span className="mt-10 text-xl text-gray-500">秒後自動進入練習</span>
              </div>

              {/* 置中按鈕 */}
              <div className="mt-10 flex justify-center gap-4">
                <button
                  autoFocus
                  onClick={() => {
                    clearEndTimer();           // 取消倒數
                    setShowModal(false);
                    endedOnceRef.current = false;
                    try {
                      rezoom();      
                      playerRef.current?.seekTo(0);
                      playerRef.current?.playVideo();
                    } catch {}
                  }}
                  className="rounded-full px-6 py-4 bg-gray-200 text-gray-800 hover:bg-gray-300 font-bold"
                >
                  重新播放
                </button>

                <button
                  onClick={() => {
                    clearEndTimer();           // 取消倒數
                    goPractice();
                  }}
                  className="rounded-full px-6 py-4 bg-gray-900 text-white hover:bg-gray-800 font-bold"
                >
                  換我試試看！
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
