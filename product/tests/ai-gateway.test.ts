import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateTasks } from '../src/main/ai-gateway';
import { defaultAiSettings } from '../src/shared/ai-settings';

const settings = { ...defaultAiSettings, enabled: true, apiKey: 'test-key' };
afterEach(() => vi.unstubAllGlobals());
describe('可选大模型估时', () => {
  it.each([{ ...settings, enabled: false }, { ...settings, apiKey: '  ' }])('不启用或没有密钥时完全不请求网络', async (config) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await estimateTasks('写报告；整理资料；开会', config);
    expect(result.source).toBe('local');
    expect(result.tasks.map(t => t.duration)).toEqual([30, 30, 30]);
    expect(result.tasks.every(t => t.aiDuration === undefined)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('仅采纳模型的耗时，不改变本地拆分的任务', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"durations":[80,20]}' } }] }) });
    vi.stubGlobal('fetch', fetch);
    const result = await estimateTasks('写报告；回复邮件', settings);
    expect(result.source).toBe('ai');
    expect(result.tasks.map(t => [t.title, t.duration, t.aiDuration])).toEqual([['写报告', 80, 80], ['回复邮件', 20, 20]]);
    expect(fetch.mock.calls[0][0]).toBe(settings.baseUrl + '/chat/completions');
    const request = fetch.mock.calls[0][1];
    expect(request.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(request.body).model).toBe(settings.model);
    expect(JSON.parse(JSON.parse(request.body).messages[1].content)).toEqual(['写报告', '回复邮件']);
  });
  it.each(['not json', '{"durations":[0]}', '{"durations":[600]}', '{"durations":[20.5]}', '{"durations":[20,30]}', '{}'])('无效返回 %s 自动回退', async (content) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) }));
    const result = await estimateTasks('写报告', settings);
    expect(result.source).toBe('fallback');
    expect(result.tasks[0].duration).toBe(30);
    expect(result.tasks[0].aiDuration).toBeUndefined();
  });
  it.each([401, 429, 500])('HTTP %s 自动回退', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
    expect((await estimateTasks('会议', settings)).source).toBe('fallback');
  });
  it('网络超时不会阻止生成本地任务', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect((await estimateTasks('会议', settings)).tasks[0].duration).toBe(30);
  });
});
