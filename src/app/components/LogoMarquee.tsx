"use client";
import Image from "next/image";
import { useEffect, useState } from "react"

const logos = [
    { src: "/logo/Google_logo.png", alt: "Google logo" },
    { src: "/logo/Microsoft_logo.png", alt: "Microsoft logo" },
    { src: "/logo/Nvidia_logo.png", alt: "Nvidia logo" },
    { src: "/logo/Tesla_logo.png", alt: "Tesla logo" },
    { src: "/logo/IBM_logo.png", alt: "IBM logo" },
    { src: "/logo/Logitech_logo.png", alt: "Logitech logo" },
    { src: "/logo/NXP_Semiconductors_logo.png", alt: "NXP logo" },
    { src: "/logo/Oracle_logo.png", alt: "Oracle logo" },
    { src: "/logo/Tsmc_logo.png", alt: "TSMC logo" },
    // 有更多就往下加；只有一張時我會在程式內重複多次
    ];

export default function LogoMarquee() {
// 至少重複到一行比較長才好看（這裡重複 8 次）
const line = Array.from({ length: 8 }).flatMap(() => logos);

const [loaded, setLoaded] = useState(false)
useEffect(() => {
    // 當 component 掛載後觸發動畫
    setLoaded(true)
}, [])

    return (
        <div
            className={`
                marquee-outer group
                bg-white/40 backdrop-blur-2xl 
                rounded-3xl border border-white/30
                drop-shadow-[0_0_25px_rgba(0,0,0,0.25)]
                px-16 py-16 max-w-7xl w-full mb-8
                justify-center items-center shadow-lg
                transform transition-all duration-700 delay-700 ease-out
                ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}
            `}>
            <p
                className={`mb-20
                    text-5xl font-extrabold tracking-widest
                    font-[Orbitron]
                    bg-gradient-to-r from-gray-800 via-gray-700 to-gray-600 bg-clip-text text-transparent
                    text-center   /* 水平置中 */
                    transform transition-all duration-700 delay-700 ease-out
                    ${loaded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"}
                `}
                >
            （沒有）企業愛用
            </p>

            {/* 可選：左右邊緣淡化 */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white/70 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white/70 to-transparent" />

            {/* 軌道：放兩份一模一樣的內容，才會無縫 */}
            <div className="marquee-track">
                <ul className="flex items-center gap-12 px-2">
                {line.map((item, i) => (
                    <li key={`A-${i}`} className="marquee-item flex items-center justify-center">
                    <Image
                        src={item.src}
                        alt={item.alt}
                        width={140}
                        height={64}
                        className="h-16 w-auto opacity-80 hover:opacity-100 transition"
                        priority={i < logos.length}
                    />
                    </li>
                ))}
                </ul>

                {/* 第二份內容（aria-hidden，不影響可及性） */}
                <ul className="flex items-center gap-12 px-2" aria-hidden="true">
                {line.map((item, i) => (
                    <li key={`B-${i}`} className="marquee-item flex items-center justify-center">
                    <Image
                        src={item.src}
                        alt={item.alt}
                        width={140}
                        height={64}
                        className="h-16 w-auto opacity-80 hover:opacity-100 transition"
                    />
                    </li>
                ))}
                </ul>
            </div>
        </div>
    );
}
