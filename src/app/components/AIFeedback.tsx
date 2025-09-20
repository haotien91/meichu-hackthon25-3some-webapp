"use client";

import { useState, useEffect } from 'react';
import { YogaSummaryData } from '../../lib/clientUtils';
import { getCachedAIFeedback, setCachedAIFeedback } from '../../lib/aiFeedbackCache';

interface AIFeedbackProps {
  summaryData: YogaSummaryData;
  runId: string;
}

export default function AIFeedback({ summaryData, runId }: AIFeedbackProps) {
  const [feedback, setFeedback] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [isFromCache, setIsFromCache] = useState<boolean>(false);

  const checkCache = () => {
    const cachedFeedback = getCachedAIFeedback(runId);
    if (cachedFeedback) {
      setFeedback(cachedFeedback);
      setIsFromCache(true);
      setHasStarted(true);
      return true;
    }
    return false;
  };

  const startStreaming = async () => {
    if (hasStarted) return;

    setIsLoading(true);
    setIsStreaming(false);
    setError(null);
    setFeedback('');
    setHasStarted(true);

    try {
      const response = await fetch('/api/ai-coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(summaryData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Network error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream available');
      }

      const decoder = new TextDecoder();
      let accumulatedText = '';

      setIsLoading(false);
      setIsStreaming(true);

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          setIsStreaming(false);
          // 存儲完整的回饋到快取
          if (accumulatedText) {
            setCachedAIFeedback(runId, accumulatedText);
          }
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;
        setFeedback(accumulatedText);

        await new Promise(resolve => setTimeout(resolve, 50));
      }

    } catch (err) {
      console.error('Streaming error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  useEffect(() => {
    // 首先檢查快取
    if (checkCache()) {
      return; // 如果有快取，直接返回
    }

    // 沒有快取則延遲後開始streaming
    const timer = setTimeout(() => {
      startStreaming();
    }, 1000);

    return () => clearTimeout(timer);
  }, [runId]); // 當 runId 改變時重新檢查

  const retry = () => {
    setHasStarted(false);
    setError(null);
    setIsStreaming(false);
    setIsFromCache(false);
    setFeedback('');
    startStreaming();
  };

  return (
    <section className="w-full max-w-7xl mx-auto bg-white/40 backdrop-blur-2xl rounded-3xl border border-white/30 drop-shadow px-8 py-6 mb-8">
      <h3 className="text-3xl font-extrabold text-gray-800 mb-6">回饋</h3>

      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-6 border border-purple-200 min-h-[120px] relative">
        {isLoading && (
          <div className="flex items-center gap-3 text-gray-600">
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
            <span className="text-sm font-medium">AI 教練正在準備回饋...</span>
          </div>
        )}

        {error && (
          <div className="text-center">
            <div className="text-red-600 mb-3">
              <p className="font-medium">無法獲取 AI 回饋</p>
              <p className="text-sm opacity-80">{error}</p>
            </div>
            <button
              onClick={retry}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm hover:bg-purple-600 transition-colors"
            >
              重試
            </button>
          </div>
        )}

        {feedback && !isLoading && !error && (
          <div className="text-gray-800 leading-relaxed">
            <p className="whitespace-pre-wrap">{feedback}</p>
            {isStreaming && (
              <div className="inline-block w-2 h-5 bg-purple-400 ml-1 animate-pulse"></div>
            )}
            {isFromCache && (
              <div className="mt-3 text-xs text-gray-500 opacity-60">
                ⚡ 來自快取
              </div>
            )}
          </div>
        )}

        {!feedback && !isLoading && !error && (
          <div className="text-gray-500 text-center">
            <p>點擊開始獲取 AI 教練的個人化回饋</p>
            <button
              onClick={startStreaming}
              className="mt-3 px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
            >
              開始
            </button>
          </div>
        )}
      </div>
    </section>
  );
}