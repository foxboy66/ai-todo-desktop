import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

const mocks = vi.hoisted(() => ({
  tray: vi.fn(),
  buildMenu: vi.fn((items) => items),
  resize: vi.fn(() => 'tray-icon'),
}));
vi.mock('electron', () => ({
  Tray: mocks.tray,
  Menu: { buildFromTemplate: mocks.buildMenu },
  nativeImage: { createFromPath: () => ({ resize: mocks.resize }) },
}));
import { createAppTray } from '../src/main/tray';

function setup(minimized = false, destroyed = false) {
  const calls: string[] = [];
  const window = {
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    restore: vi.fn(() => { calls.push('restore'); minimized = false; }),
    show: vi.fn(() => calls.push('show')),
    focus: vi.fn(() => calls.push('focus')),
  };
  const quit = vi.fn();
  const tray = createAppTray(window as unknown as BrowserWindow, '/test/icon.png', quit);
  return { window, tray, calls, quit };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tray.mockImplementation(() => Object.assign(new EventEmitter(), {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
  }));
});

describe('托盘窗口恢复', () => {
  it('单击即可显示隐藏窗口并聚焦，无需右键菜单', () => {
    const { tray, calls } = setup();
    tray.emit('click');
    expect(calls).toEqual(['show', 'focus']);
  });
  it('单击先还原最小化窗口，再显示和聚焦', () => {
    const { tray, calls } = setup(true);
    tray.emit('click');
    expect(calls).toEqual(['restore', 'show', 'focus']);
  });
  it('兼容双击及系统连续发出的单击，不会把窗口再次隐藏', () => {
    const { tray, calls, window } = setup(true);
    tray.emit('click');
    tray.emit('double-click');
    tray.emit('click');
    expect(window.restore).toHaveBeenCalledOnce();
    expect(calls).toEqual(['restore', 'show', 'focus', 'show', 'focus', 'show', 'focus']);
  });
  it('右键打开也还原最小化窗口并聚焦', () => {
    const { calls } = setup(true);
    mocks.buildMenu.mock.calls[0][0][0].click();
    expect(calls).toEqual(['restore', 'show', 'focus']);
  });
  it('退出菜单仍只执行退出', () => {
    const { quit, calls } = setup();
    mocks.buildMenu.mock.calls[0][0][1].click();
    expect(quit).toHaveBeenCalledOnce();
    expect(calls).toEqual([]);
  });
  it('窗口已销毁时不访问窗口或抛出异常', () => {
    const { tray, calls } = setup(false, true);
    expect(() => tray.emit('click')).not.toThrow();
    expect(calls).toEqual([]);
  });
});
