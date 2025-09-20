// components/Modal.tsx
"use client";
import { createPortal } from "react-dom";
import { useEffect, useState, ReactNode } from "react";

export default function Modal({
    open,
    children,
    durationMs = 500, // 進/出場動畫時間（毫秒）
    }: {
    open: boolean;
    children: ReactNode;
    durationMs?: number;
    }) {
    const [mounted, setMounted] = useState(false);
    const [render, setRender] = useState(open); // 控制是否仍然掛載（做出場動畫用）
    const [show, setShow] = useState(false);    // 控制動畫狀態

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (open) {
        setRender(true);                 // 先掛載
        requestAnimationFrame(() => {    // 下一個 frame 再切換到顯示狀態，觸發過渡
            setShow(true);
        });
        } else {
        // 觸發出場動畫
        setShow(false);
        const t = setTimeout(() => setRender(false), durationMs);
        return () => clearTimeout(t);
        }
    }, [open, durationMs]);

    if (!mounted || !render) return null;

    return createPortal(
        <div
        role="dialog"
        aria-modal="true"
        className={[
            "fixed inset-0 z-[100000] p-6 flex items-center justify-center",
            // Overlay 淡入淡出
            "motion-safe:transition-opacity",
            `duration-[${durationMs}ms]`,
            show ? "bg-black/50 opacity-100" : "bg-black/0 opacity-0",
        ].join(" ")}
        >
        <div
            // 內容卡片的彈出動畫：淡入 + 輕微上移 + 縮放
            className={[
            "motion-safe:transition",
            `duration-[${durationMs}ms]`,
            show
                ? "opacity-100 translate-y-0 scale-100"
                : "opacity-0 translate-y-2 scale-95",
            ].join(" ")}
        >
            {children}
        </div>
        </div>,
        document.body
    );
}
