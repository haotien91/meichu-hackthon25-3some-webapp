// app/yoga_5min/[slug]/demo_video/page.tsx
"use client"

import { useRouter, useParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { findBySlug } from "../../lessons"

export default function DemoVideoPage() {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const lesson = findBySlug(slug)

  // 進場彈窗
  const [showIntro, setShowIntro] = useState(true)
  const [introStep, setIntroStep] = useState<1 | 2>(1)
  const [isZoomed, setIsZoomed] = useState(false)

  // 播放完畢彈窗
  const [showModal, setShowModal] = useState(false)

  // YouTube Player 相關
  const endedOnceRef = useRef(false)
  const playerRef = useRef<any>(null)
  const playerReadyRef = useRef(false)
  const pendingPlayRef = useRef(false)

  useEffect(() => {
    if (!lesson) return
    if (typeof window === "undefined") return

    const onYouTubeIframeAPIReady = () => {
      if (playerRef.current) return
      playerRef.current = new (window as any).YT.Player("player", {
        events: {
          onReady: () => {
            playerReadyRef.current = true
            if (pendingPlayRef.current) {
              try { playerRef.current?.playVideo?.() } catch {}
              pendingPlayRef.current = false
            }
          },
          onStateChange: (event: any) => {
            const YT = (window as any).YT
            if (!endedOnceRef.current && event?.data === YT?.PlayerState?.ENDED) {
              endedOnceRef.current = true
              exitFullscreen() 
              setShowModal(true)
            }
          },
        },
      })
    }

    const exitFullscreen = () => {
      const doc = document as any
      if (doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement) {
        (doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen)?.call(doc)
      }
    }

    if ((window as any).YT?.Player) onYouTubeIframeAPIReady()
    else {
      const tag = document.createElement("script")
      tag.src = "https://www.youtube.com/iframe_api"
      document.body.appendChild(tag)
      ;(window as any).onYouTubeIframeAPIReady = onYouTubeIframeAPIReady
    }

    return () => { try { playerRef.current?.destroy?.() } catch {} }
  }, [lesson])

  const startAndPlay = () => {
    // 關閉進場彈窗並開始播放
    endedOnceRef.current = false
    setShowIntro(false)
    setIsZoomed(true)            
    if (playerReadyRef.current) {
      try { playerRef.current?.playVideo?.() } catch {}
    } else {
      pendingPlayRef.current = true
    }

    try {
      const iframe: any =
        playerRef.current?.getIframe?.() || document.getElementById("player")
      iframe?.requestFullscreen?.()
    } catch {}
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
                    ${isZoomed ? "scale-125" : "scale-100"}`}
      >
        <iframe
          id="player"
          className="w-full h-full rounded-lg shadow-lg"
          src={`https://www.youtube.com/embed/${lesson.videoId}?enablejsapi=1&rel=0&modestbranding=1`}
          title={lesson.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>

      {/* 兩步驟進場介紹彈窗 */}
      {showIntro && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="intro-title"
        >
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl text-center">
            <div className="px-8 py-10">
              {introStep === 1 && (
                <>
                  <p className="text-gray-800 text-4xl font-bold leading-relaxed py-6">
                    接下來，會播放一段示範影片
                  </p>
                  <button
                    autoFocus
                    onClick={() => setIntroStep(2)}
                    className="mt-6 w-full rounded-lg bg-gray-900 px-5 py-5 text-white hover:bg-gray-800 active:scale-[0.98] transition text-2xl font-semibold"
                  >
                    下一步
                  </button>
                </>
              )}

              {introStep === 2 && (
                <>
                  <p className="text-gray-800 text-4xl font-bold leading-relaxed py-6">
                    播放完畢後，進入練習畫面
                  </p>
                  <button
                    onClick={startAndPlay} // 這顆才真正開始播放
                    className="mt-6 w-full rounded-lg bg-gray-900 px-5 py-5 text-white hover:bg-gray-800 active:scale-[0.98] transition text-2xl font-semibold"
                  >
                    開始播放
                  </button>
                </>
              )}
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
            <div className="px-10 py-8">
              <h2
                id="modal-title"
                className="text-4xl font-bold text-gray-900 py-6"
              >
                影片播放完畢
              </h2>

              <div className="mt-6 flex gap-6">
                {/* 重新播放 */}
                <button
                  autoFocus
                  onClick={() => {
                    setShowModal(false)
                    endedOnceRef.current = false
                    try {
                      playerRef.current?.seekTo(0)
                      playerRef.current?.playVideo()
                    } catch {}
                  }}
                  className="flex-1 rounded-lg bg-gray-900 px-5 py-5 text-white hover:bg-gray-800 active:scale-[0.98] transition text-2xl font-semibold"
                >
                  重新播放
                </button>

                {/* 換我試試看 */}
                <button
                  onClick={goPractice}
                  className="flex-1 rounded-lg bg-gray-900 px-5 py-5 text-white hover:bg-gray-800 active:scale-[0.98] transition text-2xl font-semibold"
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
