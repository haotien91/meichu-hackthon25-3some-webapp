"use client"

import { useRouter, useParams } from "next/navigation"
import { useEffect, useState } from "react"
import Cookies from "js-cookie"

import Navbar from "../../../components/Navbar"

type Profile = {
    height: string;
    weight: string;
    age: string;
    gender: string;
};

export default function FormPage() {
    const router = useRouter()
    const { slug } = useParams<{ slug: string }>()
    const [loaded, setLoaded] = useState(false)
    
    useEffect(() => {
        // 當 component 掛載後觸發動畫
        setLoaded(true)
    }, []) 
    
      // 可以改成進場動畫的 state

    const [formData, setFormData] = useState<Profile>({
        height: "",
        weight: "",
        age: "",
        gender: "",
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        console.log("表單資料:", formData)

        // 存到 cookie（7天有效）
        Cookies.set("personal_info", JSON.stringify(formData), { expires: 7 })

        router.push(`/yoga_5min/${slug}/demo_video`)
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#fbeebd] p-6">
            <div className="pointer-events-none absolute -left-20 -top-34 h-96 w-96 rounded-full bg-gradient-to-tr from-pink-300 to-amber-200 blur-3xl opacity-50" />
            <div className="pointer-events-none absolute -right-32 top-40 h-[28rem] w-[28rem] rounded-full bg-gradient-to-tl from-indigo-300 to-sky-200 blur-3xl opacity-40" />
            
            <Navbar />

            <form
                onSubmit={handleSubmit}
                className="
                    bg-white/40
                    mt-23
                    backdrop-blur-2xl 
                    rounded-3xl 
                    shadow-2xl 
                    px-10 py-12 
                    w-full 
                    max-w-lg text-center"
            >
                <h1 className={`
                mb-10 text-3xl font-extrabold text-gray-800
                transform transition-all duration-700 delay-100 ease-out
                ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}
                `}
                >
                    請輸入基本資料
                </h1>

                {/* 身高 */}
                <input
                    type="number"
                    name="height"
                    placeholder="身高 (cm)"
                    value={formData.height}
                    onChange={handleChange}
                    required
                    className={`
                        w-3/4 max-w-md mb-6 px-6 py-4 
                        rounded-full border border-gray-800/40
                        text-lg text-gray-800 placeholder-gray-500
                        font-mono bg-white/40 text-center
                        shadow-md focus:outline-none focus:ring-2 focus:ring-white/70
                        appearance-none
                        focus:placeholder-transparent
                        transform transition-all duration-700 delay-200 ease-out
                        ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}
                    `}
                />

                {/* 體重 */}
                <input
                    type="number"
                    name="weight"
                    placeholder="體重 (kg)"
                    value={formData.weight}
                    onChange={handleChange}
                    required
                    className={`
                        w-3/4 max-w-md mb-6 px-6 py-4 
                        rounded-full border border-gray-800/40
                        text-lg text-gray-800 placeholder-gray-500
                        font-mono bg-white/40 text-center
                        shadow-md focus:outline-none focus:ring-2 focus:ring-white/70
                        appearance-none
                        focus:placeholder-transparent
                        transform transition-all duration-700 delay-300 ease-out
                        ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}
                    `}
                />

                {/* 年齡 */}
                    <input
                    type="number"
                    name="age"
                    placeholder="年齡"
                    value={formData.age}
                    onChange={handleChange}
                    required
                    className={`
                        w-3/4 max-w-md mb-6 px-6 py-4 
                        rounded-full border border-gray-800/40
                        text-lg text-gray-800 placeholder-gray-500
                        font-mono bg-white/40 text-center
                        shadow-md focus:outline-none focus:ring-2 focus:ring-white/70
                        appearance-none
                        focus:placeholder-transparent
                        transform transition-all duration-700 delay-400 ease-out
                        ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}
                    `}
                />

                {/* 性別 */}
                <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    required
                    className={`
                        w-3/4 max-w-md mb-6 px-6 py-4 
                        rounded-full border border-gray-800/40
                        text-lg
                        ${formData.gender ? "text-gray-800" : "text-gray-500"}
                        font-mono bg-white/40 text-center
                        shadow-md focus:outline-none focus:ring-2 focus:ring-white/70
                        appearance-none
                        focus:placeholder-transparent
                        transform transition-all duration-700 delay-400 ease-out
                        ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}
                    `}
                >
                <option value="" disabled>請選擇性別</option>
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
                </select>

                {/* 按鈕 */}
                <button
                    type="submit"
                    className={`
                        mt-4 px-12 py-4 
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
                    開始練習
                </button>
            </form>
        </main>
    )
}
