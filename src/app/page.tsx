"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import Image from "next/image"
import { lcdClient } from "../lib/lcdClient"

import LogoMarquee from "./components/LogoMarquee";
import Navbar from "./components/Navbar";

export default function Home() {
  const router = useRouter()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // 當 component 掛載後觸發動畫
    setLoaded(true)
  }, [])

  // Initialize LCD on landing page entry (non-blocking)
  useEffect(() => {
    void lcdClient.init()
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center bg-[#fbeebd] p-6 overflow-hidden">
      {/* Menu */}
      <div className="pointer-events-none absolute -left-20 -top-34 h-96 w-96 rounded-full bg-gradient-to-tr from-pink-300 to-amber-200 blur-3xl opacity-50" />
      <div className="pointer-events-none absolute -right-32 top-40 h-[28rem] w-[28rem] rounded-full bg-gradient-to-tl from-indigo-300 to-sky-200 blur-3xl opacity-40" />

      <Navbar />

      {/* Title */}
      <h1
        className={`mt-34 mb-16 text-8xl font-extrabold text-center tracking-widest 
          font-[Orbitron] 
          bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600 bg-clip-text text-transparent
          transform transition-all duration-700 delay-200 ease-out
          ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}
          `}
      >
        今天，我想要...
      </h1>

      {/* Buttons */}
      <div
        className={`flex gap-10 transform transition-all duration-700 delay-500 ease-out
          ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}`}
      >
        <button
          onClick={() => router.push("/plan_select")}
          className="w-48 h-24 rounded-3xl bg-white text-2xl font-semibold text-gray-800 shadow-lg hover:scale-105 transition cursor-pointer"
        >
          瑜伽
        </button>
        <button className="w-48 h-24 rounded-3xl bg-white text-2xl font-semibold text-gray-800 shadow-lg hover:scale-105 transition cursor-pointer">
          健身
        </button>
      </div>
      <p
        className={`mt-16 mb-18 text-4xl font-extrabold text-center tracking-widest 
          font-[Orbitron] 
          bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600 bg-clip-text text-transparent
          transform transition-all duration-700 delay-600 ease-out
          ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}`}
      >
        and more...
      </p>

      {/* <p
        className={`mt-10 mb-14 text-4xl font-extrabold text-center tracking-widest
          font-[Orbitron] 
          bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600 bg-clip-text text-transparent
          transform transition-all duration-700 delay-700 ease-out
          ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}`}
      >
        輸入信箱註冊。今天開始，讓健康成為你的習慣
      </p>
      
      <input
        type="text"
        placeholder="123@example.com"
        className={`
          peer
          w-3/4 max-w-2xl mb-24 px-6 py-4 
          rounded-full border border-gray-600
          text-lg text-gray-700 placeholder-gray-400
          font-mono
          bg-gray-50/40
          text-center
          shadow-md focus:outline-none focus:ring-2 focus:ring-gray-600
          focus:placeholder-transparent
          transform transition-all duration-700 delay-700 ease-out
          ${loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}
        `}
      /> */}

      <div
        className={`
          w-full max-w-7xl 
          bg-white/40 backdrop-blur-2xl 
          rounded-3xl border border-white/30
          drop-shadow-[0_0_25px_rgba(0,0,0,0.25)] 
          px-8 py-10 mb-8
          flex flex-col items-center 
          transform transition-all duration-700 delay-700 ease-out
          ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}
        `}
      >
        <p
          className={`mb-12 text-4xl font-extrabold tracking-widest
            font-[Orbitron]
            bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600 bg-clip-text text-transparent
            transform transition-all duration-700 delay-700 ease-out
            ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}`}
        >
          輸入信箱註冊。今天開始，讓健康成為你的習慣
        </p>

        <input
          type="text"
          placeholder="123@example.com"
          className={`
            w-3/4 max-w-2xl px-6 py-4 
            rounded-full border border-gray-800/40
            text-lg text-gray-800 placeholder-gray-500
            font-mono bg-white/40 text-center
            shadow-md focus:outline-none focus:ring-2 focus:ring-white/70
            focus:placeholder-transparent
            transform transition-all duration-700 delay-700 ease-out
            ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}
          `}
        />

        <button
          className={`mt-10 px-12 py-4 
            rounded-full 
            bg-amber-200
            text-gray-800 text-xl font-bold 
            shadow-lg 
            hover:scale-110 hover:shadow-2xl 
            transform transition-all duration-300 ease-out
            cursor-pointer
            ${loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}
          `}
        >
          立即註冊
        </button>
      </div>




      <LogoMarquee />

      <div className={`
        bg-white/40 backdrop-blur-2xl 
        rounded-3xl border border-white/30
        drop-shadow-[0_0_25px_rgba(0,0,0,0.25)]
        px-16 
        py-20
        max-w-7xl
        w-full
        mb-8
        justify-center
        items-center
        shadow-lg 
        transform transition-all duration-700 delay-700 ease-out
        ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}
        `}
        >
        {/* Section 1: 左圖右文 */}
        <div className="flex items-center gap-12 mb-20">
          <img
            src="https://plus.unsplash.com/premium_photo-1661658050360-3821d88e1f69?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
            alt="Yoga illustration"
            className="w-1/2 rounded-3xl shadow-2xl object-cover"
          />
          <div className="w-1/2 text-left">
            <h2 className="
              text-5xl 
              font-bold 
              text-gray-800 
              mb-6
              "
              >
                您的專屬AI教練
            </h2>
            <p className="
            text-lg text-gray-700 
            leading-relaxed font-semibold
            ">
              訓練優良的AI將成為您的得力助手，協助您在完成每個細微的動作，符合您對「運動」的期待。
            </p>
          </div>
        </div>

        {/* Section 2: 左文右圖 */}
        <div className="flex flex-row-reverse items-center justify-center gap-12 mb-20">
          <img
            src="https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
            alt="Workout illustration"
            className="w-1/2 rounded-3xl shadow-lg object-cover"
          />
          <div className="w-1/2 text-left">
            <h2 className="text-5xl font-bold text-gray-800 mb-6">個人化計劃</h2>
            <p className="text-lg text-gray-700 leading-relaxed font-semibold">
              根據使用者的紀錄，推薦給您最適合的課程及練習步調。在持續努力的路上，總有我們在後方協助您。
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-12 mb-20">
          <img
            src="https://plus.unsplash.com/premium_photo-1679938885972-180ed418f466?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
            alt="Yoga illustration"
            className="w-1/2 rounded-3xl shadow-lg object-cover"
          />
          <div className="w-1/2 text-left">
            <h2 className="text-5xl font-bold text-gray-800 mb-6">持續練習</h2>
            <p className="text-lg text-gray-700 leading-relaxed font-semibold">
              透過提供不同風格的課程，幫助你維持身心平衡，找到最適合自己的節奏。
            </p>
          </div>
        </div>

        <div className="flex flex-row-reverse items-center justify-center gap-12">
          <img
            src="https://www.nxp.com/assets/images/en/blogs/BL-REAL-TIME-AI-INSIGHTS-OG.jpg"
            alt="Workout illustration"
            className="w-1/2 rounded-3xl shadow-lg object-cover"
          />
          <div className="w-1/2 text-left">
            <h2 className="text-5xl font-bold text-gray-800 mb-6">最新AI技術</h2>
            <p className="text-lg text-gray-700 leading-relaxed font-semibold">
              由NXP提供的AI技術，幫助您掌握每次訓練的細節，提升您的訓練成果，最大化利用您的時間。
            </p>
          </div>
        </div>
      </div>
      <footer className="px-8 py-10 
        bg-white/50 backdrop-blur-sm 
        rounded-2xl shadow-lg 
        text-center text-gray-700 font-semibold text-xl
        w-full max-w-7xl
      ">
        © 2025 THREElA | 讓健康成為你的習慣
      </footer>
    </main>
  )
}
