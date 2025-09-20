import fs from 'node:fs/promises';
import path from 'node:path';
import { YogaSummaryData } from './clientUtils';

export class PromptTemplateManager {
  private static systemPromptCache: string | null = null;
  private static userPromptCache: string | null = null;

  static async getSystemPrompt(): Promise<string> {
    if (this.systemPromptCache) return this.systemPromptCache;

    try {
      const filePath = path.join(process.cwd(), 'system-prompt.txt');
      this.systemPromptCache = await fs.readFile(filePath, 'utf-8');
      return this.systemPromptCache;
    } catch (error) {
      console.error('Failed to load system prompt:', error);
      return 'You are a gentle yoga coach who speaks with empathy and poetic warmth.';
    }
  }

  static async getUserPrompt(): Promise<string> {
    if (this.userPromptCache) return this.userPromptCache;

    try {
      const filePath = path.join(process.cwd(), 'user-prompt.txt');
      this.userPromptCache = await fs.readFile(filePath, 'utf-8');
      return this.userPromptCache;
    } catch (error) {
      console.error('Failed to load user prompt:', error);
      return '這是今天練習的 summary 資料：\n\n{summary}\n\n請用 3–4 句詩意又溫柔的語氣，像課程結束時教練給我的鼓勵。';
    }
  }

  static async buildPrompts(summaryData: YogaSummaryData): Promise<{
    systemPrompt: string;
    userPrompt: string;
  }> {
    const [systemPrompt, userPromptTemplate] = await Promise.all([
      this.getSystemPrompt(),
      this.getUserPrompt()
    ]);

    const summaryJson = JSON.stringify(summaryData, null, 2);
    const userPrompt = userPromptTemplate.replace('{summary}', summaryJson);

    return {
      systemPrompt: systemPrompt.trim(),
      userPrompt: userPrompt.trim()
    };
  }

}