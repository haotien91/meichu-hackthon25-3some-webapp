"use client"

import { useRouter } from "next/navigation"
import Image from "next/image"
import { useState, useEffect } from "react"

export default function Navbar() {
    const router = useRouter()
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        setLoaded(true)
    }, [])

    return (
        <nav
        className={`absolute top-0 flex items-center justify-between w-full bg-amber-100 py-4 shadow
            transform transition-all duration-700 ease-out
            ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}`}
        >
        {/* 左邊 Logo + 名稱 */}
        <div
            className="flex items-center pl-10 space-x-3 cursor-pointer"
            onClick={() => router.push("/")}
        >
            <Image src="/logo.png" alt="ThreelA AI Logo" width={60} height={60} />
            <span className="text-2xl font-bold text-gray-800">THREElA</span>
        </div>

        {/* 中間選單 */}
        <div className="absolute left-1/2 transform -translate-x-1/2">
            <ul className="flex items-center space-x-8 text-2xl font-semibold text-gray-700">
            <li className="cursor-pointer hover:text-black">關於我們</li>
            <span className="text-gray-400">|</span>
            <li className="cursor-pointer hover:text-black">用戶分享</li>
            <span className="text-gray-400">|</span>
            <li className="cursor-pointer hover:text-black">訓練計劃</li>
            <span className="text-gray-400">|</span>
            <li className="cursor-pointer hover:text-black">方案介紹</li>
            </ul>
        </div>

        {/* 右邊佔位 */}
        <div className="pr-10 w-[60px]" />
        </nav>
    )
}
