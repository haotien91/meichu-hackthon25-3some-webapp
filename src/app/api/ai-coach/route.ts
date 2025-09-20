import { NextRequest, NextResponse } from 'next/server';
import { PromptTemplateManager } from '../../../lib/promptTemplates';
import { YogaSummaryData } from '../../../lib/clientUtils';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY not found in environment variables');
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const summaryData: YogaSummaryData = await req.json();

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const { systemPrompt, userPrompt } = await PromptTemplateManager.buildPrompts(summaryData);

    // Log the complete prompt for debugging
    console.log('=== COMPLETE PROMPT SENT TO OPENAI ===');
    console.log('SYSTEM PROMPT:');
    console.log(systemPrompt);
    console.log('\nUSER PROMPT:');
    console.log(userPrompt);
    console.log('=== END PROMPT LOG ===');


    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: {
        "type": "text"
      },
      verbosity: "medium",
      reasoning_effort: "minimal"
    });

    const content = response.choices[0]?.message?.content || '';

    // 模擬 streaming 效果
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // 將完整響應按字符分割並逐步發送
          for (let i = 0; i < content.length; i++) {
            controller.enqueue(encoder.encode(content[i]));
            // 短暫延遲以模擬打字效果
            await new Promise(resolve => setTimeout(resolve, 30));
          }
          controller.close();
        } catch (error) {
          console.error('Streaming simulation error:', error);
          controller.error(error);
        }
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}