"use client"

import { safeGet, safeSet, safeRemove, throttle, isBrowser } from "./storage";

export type Gender = "male" | "female" | "other";
export type ProfileSnapshot = { height?: string; weight?: string; age?: string; gender?: string };

export type StatAcc = { sum: number; count: number; min: number | null; max: number | null };
export type LessonStats = {
  slug: string;
  startedAt?: string;
  finishedAt?: string;
  elapsedSec: number;
  calories: number;
  similarity: StatAcc; // 0-100 samples (valid body_found only)
  heartRate: StatAcc;  // BPM samples (validated range)
};

export type ProgramRun = {
  schemaVersion: 1;
  runId: string;          // e.g. yoga_5min-2025-09-19T10:00:12.345Z
  program: string;        // "yoga_5min"
  startedAt: string;      // ISO
  finishedAt?: string;    // ISO
  profile?: ProfileSnapshot;
  lessons: LessonStats[]; // one per slug (created on demand)
};

function nowIso() { return new Date().toISOString(); }
function makeRunId(program: string) { return `${program}-${nowIso()}`; }
function emptyAcc(): StatAcc { return { sum: 0, count: 0, min: null, max: null }; }
function findLesson(run: ProgramRun, slug: string): LessonStats | undefined {
  return run.lessons.find(l => l.slug === slug);
}

function ACTIVE_KEY(program: string) { return `pr_active_${program}`; }
function RUNS_KEY(program: string) { return `pr_runs_${program}`; }

class ProgramRunAggregator {
  private active: ProgramRun | null = null;
  private persistActiveThrottled: () => void;

  constructor() {
    this.persistActiveThrottled = throttle(() => this.persistActiveImmediate());
    if (isBrowser()) {
      // try rehydrate any active run lazily on first access
      this.active = null;
    }
  }

  private persistActiveImmediate() {
    if (!this.active) return;
    safeSet(ACTIVE_KEY(this.active.program), this.active);
  }

  private loadActive(program: string): ProgramRun | null {
    if (this.active && this.active.program === program) return this.active;
    const run = safeGet<ProgramRun>(ACTIVE_KEY(program));
    this.active = run || null;
    return this.active;
  }

  getActiveRun(program: string): ProgramRun | null {
    return this.loadActive(program);
  }

  beginRun(program: string, profile?: ProfileSnapshot): ProgramRun {
    const run: ProgramRun = {
      schemaVersion: 1,
      runId: makeRunId(program),
      program,
      startedAt: nowIso(),
      profile,
      lessons: [],
    };
    this.active = run;
    this.persistActiveImmediate();
    return run;
  }

  resetActiveRun(program: string) {
    if (this.active && this.active.program === program) {
      this.active = null;
    }
    safeRemove(ACTIVE_KEY(program));
  }

  private ensureLesson(slug: string): LessonStats {
    if (!this.active) throw new Error("No active run");
    let lesson = findLesson(this.active, slug);
    if (!lesson) {
      lesson = {
        slug,
        startedAt: nowIso(),
        elapsedSec: 0,
        calories: 0,
        similarity: emptyAcc(),
        heartRate: emptyAcc(),
      };
      this.active.lessons.push(lesson);
    } else if (!lesson.startedAt) {
      lesson.startedAt = nowIso();
    }
    return lesson;
  }

  beginLesson(slug: string) {
    this.ensureLesson(slug);
    this.persistActiveThrottled();
  }

  private addSample(acc: StatAcc, value: number) {
    acc.sum += value;
    acc.count += 1;
    acc.min = acc.min === null ? value : Math.min(acc.min, value);
    acc.max = acc.max === null ? value : Math.max(acc.max, value);
  }

  recordSimilarity(value: number, bodyFound: boolean) {
    if (!this.active || !bodyFound || !Number.isFinite(value)) return;
    const v = Math.max(0, Math.min(100, Math.round(value)));
    const l = this.ensureLesson(this.active.lessons[this.active.lessons.length - 1]?.slug || "");
    this.addSample(l.similarity, v);
    this.persistActiveThrottled();
  }

  recordHeartRate(hr: number) {
    if (!this.active || !Number.isFinite(hr)) return;
    const v = Math.round(hr);
    if (v < 40 || v > 200) return; // basic sanity
    const l = this.ensureLesson(this.active.lessons[this.active.lessons.length - 1]?.slug || "");
    this.addSample(l.heartRate, v);
    this.persistActiveThrottled();
  }

  setCurrentLessonElapsed(seconds: number) {
    if (!this.active || this.active.lessons.length === 0) return;
    const l = this.active.lessons[this.active.lessons.length - 1];
    l.elapsedSec = Math.max(0, Math.floor(seconds));
    this.persistActiveThrottled();
  }

  setCurrentLessonCalories(total: number) {
    if (!this.active || this.active.lessons.length === 0) return;
    const l = this.active.lessons[this.active.lessons.length - 1];
    l.calories = Math.max(0, total);
    this.persistActiveThrottled();
  }

  addCaloriesIncrement(delta: number) {
    if (!this.active || this.active.lessons.length === 0) return;
    const l = this.active.lessons[this.active.lessons.length - 1];
    l.calories = Math.max(0, (l.calories || 0) + Math.max(0, delta));
    this.persistActiveThrottled();
  }

  finishLesson() {
    if (!this.active || this.active.lessons.length === 0) return;
    const l = this.active.lessons[this.active.lessons.length - 1];
    if (!l.finishedAt) l.finishedAt = nowIso();
    this.persistActiveImmediate();
  }

  finishProgram() {
    if (!this.active) return;
    if (!this.active.finishedAt) this.active.finishedAt = nowIso();

    // archive run
    const key = RUNS_KEY(this.active.program);
    const arr = safeGet<ProgramRun[]>(key, []) || [];
    arr.push(this.active);
    // keep last 10 runs
    while (arr.length > 10) arr.shift();
    safeSet(key, arr);

    // clear active
    safeRemove(ACTIVE_KEY(this.active.program));
    this.active = null;
  }

  getRun(program: string, runId: string) {
    const arr = safeGet<ProgramRun[]>(RUNS_KEY(program), []) || [];
    return arr.find(r => r.runId === runId) || null;
  }

  getMostRecentCompletedRun(program: string) {
    const arr = safeGet<ProgramRun[]>(RUNS_KEY(program), []) || [];
    return arr[arr.length - 1] || null;
  }
}

const aggregator = new ProgramRunAggregator();
export default aggregator;

