export default function FireworksLayer() {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
            <span
            key={i}
            className="absolute block h-1 w-1 bg-white rounded-full animate-firework"
            style={{
                left: `${10 + i * 15}%`,
                top: `${20 + (i % 3) * 25}%`,
                boxShadow: `
                0 0 0 0 #fff,
                10px -10px 0 0 #facc15,
                -12px -6px 0 0 #60a5fa,
                -8px 12px 0 0 #f472b6,
                12px 10px 0 0 #34d399,
                -14px 14px 0 0 #fb7185
                `,
                animationDelay: `${i * 0.25}s`,
            }}
            />
        ))}

        <style jsx>{`
            @keyframes firework-pop {
            0%   { transform: scale(0); opacity: 0.9; }
            70%  { transform: scale(1); opacity: 1; }
            100% { transform: scale(0.4); opacity: 0; }
            }
            .animate-firework {
            animation: firework-pop 1.2s ease-out infinite;
            filter: drop-shadow(0 0 6px rgba(255,255,255,0.9));
            }
        `}</style>
        </div>
    );
}