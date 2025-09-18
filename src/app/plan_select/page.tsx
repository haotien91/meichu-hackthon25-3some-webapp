"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import Navbar from "../components/Navbar"

export default function planSelectPage() {
  const router = useRouter()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(true)
  }, [])

  return (
    <main className="flex flex-col min-h-screen items-center bg-[#fbeebd]">
      <div className="pointer-events-none absolute -left-20 -top-34 h-96 w-96 rounded-full bg-gradient-to-tr from-pink-300 to-amber-200 blur-3xl opacity-50" />
      <div className="pointer-events-none absolute -right-32 top-40 h-[28rem] w-[28rem] rounded-full bg-gradient-to-tl from-indigo-300 to-sky-200 blur-3xl opacity-40" />
      
      <Navbar />
      
      {/* Title */}
      <h1
          className={`relative mt-28 mb-8 inline-block text-3xl font-extrabold text-center tracking-widest 
              font-[Orbitron] 
              bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600 bg-clip-text text-transparent
              transform transition-all duration-700 delay-200 ease-out
              ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}
              after:content-[''] after:block after:h-0.5 after:w-full after:mt-3
              after:bg-gradient-to-r after:from-gray-800 after:via-gray-600 after:to-gray-400 after:rounded-full
          `}
          >
          選擇您的訓練計劃
      </h1>


        {/* Cards */}
        <div className="flex gap-20">
            <Card
                minutes="5 分鐘"
                img="https://images.unsplash.com/photo-1552196563-55cd4e45efb3?q=80&w=1452&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
                desc="短時間沈浸片刻"
                href="/yoga_5min/lesson-1/form"
                />
            <Card
                minutes="15 分鐘"
                img="https://plus.unsplash.com/premium_photo-1664528916805-d76358fe1f82?q=80&w=774&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
                desc="維持生活和工作平衡"
                href="/yoga_15min/lesson-1/form"
                />
            <Card
                minutes="30 分鐘"
                img="https://plus.unsplash.com/premium_photo-1683133269843-09a177048cef?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
                desc="長時間改善體態"
                href="/yoga_30min/lesson-1/form"
                />
            </div>
            {/* 返回首頁按鈕 */}
            <div
                className={`
                    mt-10 mb-8 transform transition-all duration-700 ease-out delay-700
                    ${loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}
                `}
                >
                    <button
                        onClick={() => router.push("/")}
                        className="
                        px-10 py-4 
                        bg-gray-800 text-white text-xl font-semibold
                        rounded-full shadow-lg
                        hover:bg-gray-700 hover:scale-105
                        transition duration-300 ease-out
                        "
                    >
                    返回上一頁
                </button>
            </div>
        </main>
    )
}


function Card({
  minutes,
  img,
  desc,
  href,
}: {
  minutes: string
  img: string
  desc: string
  href: string
}) {
  const router = useRouter()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(true)
  }, [])

  return (
    <div
      onClick={() => router.push(href)}
      className="
        group flex flex-col items-center w-96
        transition-transform duration-300 hover:scale-105 cursor-pointer
      "
    >
      {/* 包住 minutes + 圖片 一起做進場動畫 */}
      <div
        className={`
          w-full transform transition-all duration-700 ease-out delay-500
          ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}
        `}
      >
        {/* 上方 minutes */}
        <div
          className="w-full text-center py-3 font-semibold text-indigo-950
            rounded-t-3xl text-3xl
            bg-blend-color-dodge
            shadow-[0_12px_30px_rgba(80,80,80,0.8)]
          "
        >
          {minutes}
        </div>

        {/* 圖片容器 */}
        <div className="relative w-full h-[22rem] overflow-hidden shadow-lg rounded-b-3xl">
          <img src={img} alt={minutes} className="w-full h-full object-cover" />

          {/* 下方介紹 */}
          <div
            className="
              absolute left-0 right-0 bottom-0
              font-semibold py-0.5
              bg-white/90 
              text-gray-700 text-2xl text-center
              translate-y-full
              group-hover:translate-y-0
              transition-transform duration-300 ease-out
              shadow-[0_-4px_10px_rgba(0,0,0,0.18)]
            "
          >
            <div className="px-4 py-2">{desc}</div>
          </div>
        </div>
      </div>
    </div>
  )
}





