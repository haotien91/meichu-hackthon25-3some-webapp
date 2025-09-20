import { safeGet, safeSet, safeRemove } from './storage';

const AI_FEEDBACK_PREFIX = 'ai_feedback_';

export function getAIFeedbackCacheKey(runId: string): string {
  return `${AI_FEEDBACK_PREFIX}${runId}`;
}

export function getCachedAIFeedback(runId: string): string | null {
  return safeGet<string>(getAIFeedbackCacheKey(runId));
}

export function setCachedAIFeedback(runId: string, feedback: string): void {
  safeSet(getAIFeedbackCacheKey(runId), feedback);
}

export function removeCachedAIFeedback(runId: string): void {
  safeRemove(getAIFeedbackCacheKey(runId));
}

/**
 * 清理不在有效 runId 列表中的 AI 回饋快取
 * 這個函數應該在 programRunAggregator 清理舊記錄時調用
 */
export function cleanupAIFeedbackCache(validRunIds: string[]): void {
  if (typeof window === 'undefined' || !localStorage) return;

  const keysToRemove: string[] = [];

  // 遍歷所有 localStorage 鍵
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(AI_FEEDBACK_PREFIX)) {
      // 提取 runId
      const runId = key.slice(AI_FEEDBACK_PREFIX.length);

      // 如果這個 runId 不在有效列表中，標記為刪除
      if (!validRunIds.includes(runId)) {
        keysToRemove.push(key);
      }
    }
  }

  // 刪除無效的快取
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
  });
}