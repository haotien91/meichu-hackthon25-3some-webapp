"use client"

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { lessons } from "../lessons";
import { useProgramRun } from "../../../lib/useProgramRun";
import Navbar from "../../components/Navbar";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
export default function SummaryPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#fbeebd]"><div className="text-gray-700">Loading...</div></main>}>
      <SummaryContent />
    </Suspense>
  );
}


function formatTime(totalSeconds: number) {
  const m = Math.floor((totalSeconds || 0) / 60);
  const s = Math.floor((totalSeconds || 0) % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function Pill({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 bg-white/90 rounded-[2rem] px-8 py-4 shadow-md min-w-[150px]">
      <span className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 shadow-inner" />
      <div className="leading-tight">
        <div className="text-2xl font-extrabold text-gray-800 whitespace-nowrap break-keep">{value}</div>
        <div className="text-sm text-gray-500 whitespace-nowrap break-keep leading-none">{label}</div>
      </div>
    </div>
  );
}

function SummaryContent() {
  const params = useSearchParams();
  const router = useRouter();
  const runId = params.get("run") || undefined;
  const program = "yoga_5min";
  const { run, totals, perLesson, charts } = useProgramRun(program, runId);

  const seriesWithTitles = perLesson.map(pl => {
    const meta = lessons.find(l => l.slug === pl.slug);
    return { ...pl, title: meta?.title || pl.slug, image: meta?.image };
  });

  if (!run || !totals) {
    return (
      <main className="flex min-h-screen flex-col items-center bg-[#fbeebd] p-6">
        <Navbar />
        <div className="mt-28 text-center">
          <h1 className="text-3xl font-extrabold text-gray-800 mb-6">找不到完成的訓練紀錄</h1>
          <button onClick={() => router.push("/plan_select")} className="px-6 py-3 bg-gray-800 text-white rounded-full">返回方案選擇</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-[#fbeebd] p-6">
      <Navbar />

      {/* Program totals */}
      <section className="w-full max-w-7xl bg-white/40 backdrop-blur-2xl rounded-3xl border border-white/30 drop-shadow px-8 py-8 mt-28 mb-8">
        <h2 className="text-3xl font-extrabold text-gray-800 mb-6">計劃總結</h2>
        <div className="flex flex-wrap gap-4">
          <Pill value={formatTime(totals.totalTimeSec)} label="總用時" />
          <Pill value={`${Math.round(totals.totalCalories)}`} label="總消耗(卡)" />
          <Pill value={totals.avgSim != null ? `${totals.avgSim}%` : "N/A"} label="平均相似度" />
          <Pill value={totals.minSim != null ? `${Math.round(totals.minSim)}%` : "N/A"} label="最低相似度" />
          <Pill value={totals.maxSim != null ? `${Math.round(totals.maxSim)}%` : "N/A"} label="最高相似度" />
          <Pill value={totals.avgHR != null ? `${totals.avgHR} bpm` : "N/A"} label="平均心率" />
        </div>
      </section>

      {/* Per-lesson cards */}
      <section className="w-full max-w-7xl bg-white/40 backdrop-blur-2xl rounded-3xl border border-white/30 drop-shadow px-8 py-8 mb-8">
        <h2 className="text-3xl font-extrabold text-gray-800 mb-6">每課表現</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {seriesWithTitles.map(l => (
            <div key={l.slug} className="rounded-2xl border-2 border-purple-300/60 bg-white shadow relative overflow-hidden">
              {l.image ? (
                <div className="h-40 w-full relative overflow-hidden">
                  {l.image ? (
                  <div className="h-40 w-full relative bg-white">
                    {/* 讓圖片在固定高的框內置中、按比例縮放 */}
                    <div className="absolute inset-0 flex items-center justify-center p-2">
                      <img
                        src={l.image}
                        alt={l.title}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <span className="absolute top-2 left-2 px-3 py-1 rounded-full bg-white shadow text-gray-700 font-semibold text-sm">
                      目標
                    </span>
                  </div>
                ) : null}
                  <span className="absolute top-2 left-2 px-3 py-1 rounded-full bg-white shadow text-gray-700 font-semibold text-sm">目標</span>
                </div>
              ) : null}
              <div className="p-4">
                <h3 className="text-xl font-bold text-gray-800 mb-3">{l.title}</h3>
                <div className="grid grid-cols-2 gap-3 text-gray-700 font-semibold">
                  <div>用時：{formatTime(l.elapsedSec)}</div>
                  <div>消耗：{Math.round(l.calories)} 卡</div>
                  <div>相似度(均)：{l.avgSim != null ? `${l.avgSim}%` : "N/A"}</div>
                  <div>心率(均)：{l.avgHR != null ? `${l.avgHR} bpm` : "N/A"}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Charts */}
      <section className="w-full max-w-7xl bg-white/40 backdrop-blur-2xl rounded-3xl border border-white/30 drop-shadow px-8 py-8 mb-8">
        <h2 className="text-3xl font-extrabold text-gray-800 mb-6">表現趨勢</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="h-80 bg-white rounded-2xl p-4 border">
            <h3 className="font-bold mb-2">各課平均相似度</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={seriesWithTitles.map(s => ({ name: s.title, avgSim: s.avgSim ?? 0 }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="avgSim" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="h-80 bg-white rounded-2xl p-4 border">
            <h3 className="font-bold mb-2">各課平均心率</h3>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={seriesWithTitles.map(s => ({ name: s.title, avgHR: s.avgHR ?? 0 }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="avgHR" stroke="#82ca9d" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <div className="w-full max-w-7xl flex gap-4 justify-end mb-12">
        <button onClick={() => router.push("/plan_select")} className="px-6 py-3 bg-gray-800 text-white rounded-full">返回方案</button>
        <button onClick={() => router.push("/yoga_5min/lesson-1/practice")} className="px-6 py-3 bg-amber-200 text-gray-800 rounded-full">重新開始</button>
      </div>
    </main>
  );
}

