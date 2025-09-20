// components/Modal.tsx
"use client";
import { createPortal } from "react-dom";
import { useEffect, useState, ReactNode } from "react";

export default function Modal({
    open,
    children,
    }: { open: boolean; children: ReactNode }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!open || !mounted) return null;

    return createPortal(
        <div
        className="fixed inset-0 z-[100000] bg-black/50 p-6 flex items-center justify-center"
        role="dialog"
        aria-modal="true"
        >
        {children}
        </div>,
        document.body
    );
}
