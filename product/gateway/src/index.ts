import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';
import { createHash } from 'node:crypto';

const app = new Hono();
const taskRequest = z.object({ rawText: z.string().min(1).max(5000) });
const taskResponse = z.object({
  tasks: z.array(z.object({
    title: z.string().min(1).max(240),
    duration: z.number().int().min(15).max(480),
    priority: z.enum(['高', '中', '低']),
    doneDefinition: z.string().min(1).max(500),
  })).min(1).max(20),
});

const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const deepseekBaseUrl = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '');
const deepseekModel = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash';

function fallbackTasks(rawText: string) {
  return rawText.split(/[;；\n。]/).map((title) => title.trim()).filter(Boolean).slice(0, 20).map((title, index) => ({
    id: `gateway-${createHash('sha1').update(`${title}-${index}`).digest('hex').slice(0, 10)}`,
    title, duration: 30, priority: index < 2 ? '中' : '低', doneDefinition: `完成“${title}”的可交付结果`, status: '待安排',
  }));
}

async function askDeepSeek(rawText: string) {
  if (!deepseekApiKey) return null;
  const response = await fetch(`${deepseekBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${deepseekApiKey}` },
    body: JSON.stringify({
      model: deepseekModel,
      stream: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: '你是个人效率助手。把用户输入拆成可执行任务，返回严格 JSON：{"tasks":[{"title":string,"duration":number,"priority":"高"|"中"|"低","doneDefinition":string}]}。duration 是 15 到 480 之间的整数分钟。不要添加用户没有提到的任务。' },
        { role: 'user', content: rawText },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`DeepSeek returned ${response.status}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek returned empty content');
  const parsed = taskResponse.parse(JSON.parse(content));
  return parsed.tasks.map((task, index) => ({
    ...task,
    id: `gateway-${createHash('sha1').update(`${task.title}-${index}`).digest('hex').slice(0, 10)}`,
    aiDuration: task.duration,
    status: '待安排' as const,
  }));
}

app.get('/health', (context) => context.json({ ok: true, service: 'ai-gateway', provider: deepseekApiKey ? 'deepseek' : 'local-fallback', model: deepseekModel }));
app.post('/parse_tasks', async (context) => {
  const parsed = taskRequest.safeParse(await context.req.json().catch(() => ({})));
  if (!parsed.success) return context.json({ error: 'invalid_request' }, 400);
  try {
    const tasks = await askDeepSeek(parsed.data.rawText) ?? fallbackTasks(parsed.data.rawText);
    return context.json({ tasks, source: deepseekApiKey ? 'deepseek' : 'local-fallback' });
  } catch {
    return context.json({ tasks: fallbackTasks(parsed.data.rawText), source: 'local-fallback' });
  }
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) });