import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  beep: vi.fn(),
  isSupported: vi.fn(),
  notification: vi.fn(),
  send: vi.fn(),
  show: vi.fn(),
}));

vi.mock('electron', () => ({
  Notification: Object.assign(mocks.notification, { isSupported: mocks.isSupported }),
  shell: { beep: mocks.beep },
}));

import { ReminderScheduler } from '../src/main/scheduler';

describe('提醒调度器', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSupported.mockReturnValue(true);
    mocks.notification.mockImplementation(() => ({ show: mocks.show }));
  });

  it.each([
    {
      kind: 'checkpoint' as const,
      title: 'AI ToDo · 进度同步',
      body: '花半分钟同步一下当前进度。',
    },
    {
      kind: 'end' as const,
      title: 'AI ToDo · 任务结束',
      body: '任务预计到达结束时间了，实际进展如何？',
    },
  ])('为 $kind 提醒发送弹窗并播放声音', ({ kind, title, body }) => {
    const reminder = {
      id: 'reminder-task-' + kind,
      taskId: 'task-1',
      kind,
      dueAt: '2026-01-01T01:00:00.000Z',
      status: 'pending' as const,
    };
    const store = {
      getDueReminders: vi.fn(() => [reminder]),
      markReminderSent: vi.fn(),
    };
    const appWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: { isDestroyed: vi.fn(() => false), send: mocks.send },
    };

    const scheduler = new ReminderScheduler(store as never, appWindow as never);
    (scheduler as unknown as { tick: () => void }).tick();

    expect(store.markReminderSent).toHaveBeenCalledWith(reminder.id);
    expect(mocks.notification).toHaveBeenCalledWith({ title, body, silent: false });
    expect(mocks.show).toHaveBeenCalledOnce();
    expect(mocks.beep).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledWith('reminder:due', reminder);
  });
  it('窗口被销毁后跳过渲染器消息，不再抛出异常', () => {
    const reminder = {
      id: 'reminder-destroyed-window',
      taskId: 'task-1',
      kind: 'checkpoint' as const,
      dueAt: '2026-01-01T01:00:00.000Z',
      status: 'pending' as const,
    };
    const store = {
      getDueReminders: vi.fn(() => [reminder]),
      markReminderSent: vi.fn(),
    };
    const appWindow = {
      isDestroyed: vi.fn(() => true),
      webContents: { isDestroyed: vi.fn(() => true), send: mocks.send },
    };

    const scheduler = new ReminderScheduler(store as never, appWindow as never);

    expect(() => (scheduler as unknown as { tick: () => void }).tick()).not.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('系统通知对象销毁时忽略退出竞态，不影响调度循环', () => {
    mocks.notification.mockImplementation(() => {
      throw new Error('Object has been destroyed');
    });
    const reminder = {
      id: 'reminder-destroyed-notification',
      taskId: 'task-1',
      kind: 'end' as const,
      dueAt: '2026-01-01T01:00:00.000Z',
      status: 'pending' as const,
    };
    const store = {
      getDueReminders: vi.fn(() => [reminder]),
      markReminderSent: vi.fn(),
    };
    const appWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: { isDestroyed: vi.fn(() => false), send: mocks.send },
    };

    const scheduler = new ReminderScheduler(store as never, appWindow as never);

    expect(() => (scheduler as unknown as { tick: () => void }).tick()).not.toThrow();
    expect(mocks.beep).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledWith('reminder:due', reminder);
  });

});
