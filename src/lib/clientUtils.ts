export interface YogaSummaryData {
  duration: string;
  calories: number;
  avg_similarity: number;
  max_similarity: number;
  avg_hr: number;
  poses: Array<{
    name: string;
    duration: string;
    calories: number;
    avg_similarity: number;
    avg_hr: number;
  }>;
}

export function transformSummaryData(totals: any, perLesson: any[]): YogaSummaryData {
  const formatTime = (totalSeconds: number) => {
    const m = Math.floor((totalSeconds || 0) / 60);
    const s = Math.floor((totalSeconds || 0) % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return {
    duration: formatTime(totals.totalTimeSec),
    calories: Math.round(totals.totalCalories),
    avg_similarity: totals.avgSim || 0,
    max_similarity: Math.round(totals.maxSim || 0),
    avg_hr: totals.avgHR || 0,
    poses: perLesson.map(lesson => ({
      name: lesson.displayTitle || lesson.title || lesson.slug,
      duration: formatTime(lesson.elapsedSec),
      calories: Math.round(lesson.calories || 0),
      avg_similarity: lesson.avgSim || 0,
      avg_hr: lesson.avgHR || 0
    }))
  };
}