import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';
import { createHash } from 'node:crypto';

const app = new Hono();
const taskRequest = z.object({ rawText: z.string().min(1).max(5000) });

function estimate(title: string) {
  if (/邮件|消息|回复/.test(title)) return 30;
  if (/会议|评审|沟通/.test(title)) return 60;
  if (/阅读|研究/.test(title)) return 45;
  if (/整理|汇总|分析/.test(title)) return 60;
  return 45;
}

app.get('/health', (context) => context.json({ ok: true, service: 'ai-gateway' }));
app.post('/parse_tasks', async (context) => {
  const parsed = taskRequest.safeParse(await context.req.json().catch(() => ({})));
  if (!parsed.success) return context.json({ error: 'invalid_request' }, 400);
  const tasks = parsed.data.rawText.split(/[;；\n。]/).map((title) => title.trim()).filter(Boolean).slice(0, 20).map((title, index) => ({
    id: `gateway-${createHash('sha1').update(`${title}-${index}`).digest('hex').slice(0, 10)}`,
    title, duration: estimate(title), aiDuration: estimate(title), priority: index < 2 ? '中' : '低', doneDefinition: `完成“${title}”的可交付结果`, status: '待安排',
  }));
  return context.json({ tasks });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) });
