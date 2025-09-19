"use client"

import { useMemo } from "react";
import aggregator, { ProgramRun, LessonStats } from "./programRunAggregator";
import { lessons } from "../app/yoga_5min/lessons";

export type Totals = {
  totalTimeSec: number;
  totalCalories: number;
  avgSim: number | null;
  minSim: number | null;
  maxSim: number | null;
  avgHR: number | null;
};

export function computeDerived(run: ProgramRun) {
  // Order lessons by lessons.ts ordering
  const order = lessons.map(l => l.slug);
  const bySlug = new Map(run.lessons.map(l => [l.slug, l] as const));
  const ordered: LessonStats[] = order.map(slug => bySlug.get(slug)).filter(Boolean) as LessonStats[];

  const totals = ordered.reduce(
    (acc, l) => {
      acc.totalTimeSec += l.elapsedSec || 0;
      acc.totalCalories += l.calories || 0;

      if (l.similarity.count > 0) {
        acc.simSum += l.similarity.sum;
        acc.simCount += l.similarity.count;
        acc.minSim = acc.minSim === null ? l.similarity.min : Math.min(acc.minSim!, l.similarity.min!);
        acc.maxSim = acc.maxSim === null ? l.similarity.max : Math.max(acc.maxSim!, l.similarity.max!);
      }
      if (l.heartRate.count > 0) {
        acc.hrSum += l.heartRate.sum;
        acc.hrCount += l.heartRate.count;
      }
      return acc;
    },
    { totalTimeSec: 0, totalCalories: 0, simSum: 0, simCount: 0, hrSum: 0, hrCount: 0, minSim: null as number | null, maxSim: null as number | null }
  );

  const result: Totals = {
    totalTimeSec: totals.totalTimeSec,
    totalCalories: totals.totalCalories,
    avgSim: totals.simCount > 0 ? Math.round((totals.simSum / totals.simCount) * 10) / 10 : null,
    minSim: totals.minSim,
    maxSim: totals.maxSim,
    avgHR: totals.hrCount > 0 ? Math.round((totals.hrSum / totals.hrCount) * 10) / 10 : null,
  };

  const perLesson = ordered.map(l => ({
    slug: l.slug,
    elapsedSec: l.elapsedSec,
    calories: l.calories,
    avgSim: l.similarity.count > 0 ? Math.round((l.similarity.sum / l.similarity.count) * 10) / 10 : null,
    minSim: l.similarity.min,
    maxSim: l.similarity.max,
    avgHR: l.heartRate.count > 0 ? Math.round((l.heartRate.sum / l.heartRate.count) * 10) / 10 : null,
  }));

  const similaritySeries = perLesson.map(pl => ({ slug: pl.slug, avgSim: pl.avgSim ?? 0 }));
  const heartRateSeries = perLesson.map(pl => ({ slug: pl.slug, avgHR: pl.avgHR ?? 0 }));

  return { orderedLessons: ordered, perLesson, totals: result, charts: { similaritySeries, heartRateSeries } };
}

export function useProgramRun(program: string, runId?: string) {
  return useMemo(() => {
    const run: ProgramRun | null = runId ? aggregator.getRun(program, runId) : aggregator.getMostRecentCompletedRun(program);
    if (!run) return { run: null, perLesson: [], totals: null, charts: { similaritySeries: [], heartRateSeries: [] } };
    return { run, ...computeDerived(run) };
  }, [program, runId]);
}

