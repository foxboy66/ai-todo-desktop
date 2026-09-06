import { describe, expect, it, vi } from 'vitest';
import { createWindowStartup } from '../src/main/window-startup';

describe('启动窗口显示', () => {
  it('Chromium 提前绘制时，仍等待本地计划和首次选择页面准备好', () => {
    const show = vi.fn();
    const startup = createWindowStartup(show);
    startup.paintReady();
    expect(show).not.toHaveBeenCalled();
    startup.rendererReady();
    expect(show).toHaveBeenCalledOnce();
  });
  it('渲染器先就绪时等待可绘制状态，重复通知不会再次弹出窗口', () => {
    const show = vi.fn();
    const startup = createWindowStartup(show);
    startup.rendererReady();
    expect(show).not.toHaveBeenCalled();
    startup.paintReady();
    startup.rendererReady();
    startup.paintReady();
    expect(show).toHaveBeenCalledOnce();
  });
});
