import type { DailyState, DaySummary } from './shared/daily';
import type { AiSettings, AiSettingsInput } from './shared/ai-settings';
import { contextBridge, ipcRenderer } from 'electron';
import type { AvailabilityBlock, PlanSnapshot, ScheduledTask, Task } from './shared/domain';

const api = {
  rendererReady: () => ipcRenderer.send('app:renderer-ready'),
  getAiSettings: () => ipcRenderer.invoke('ai:settings') as Promise<AiSettings>,
  saveAiSettings: (input: AiSettingsInput) => ipcRenderer.invoke('ai:save-settings', input) as Promise<AiSettings>,
  load: (day?: string) => ipcRenderer.invoke('app:load', day) as Promise<PlanSnapshot & { history: Array<{ version: number; createdAt: string; reason?: string }> }>,
  listDays: () => ipcRenderer.invoke('days:list') as Promise<DaySummary[]>,
  updateTask: (input: { day: string; taskId: string; patch: Partial<Task> | null; targetDay?: string }) => ipcRenderer.invoke('task:update', input) as Promise<DailyState>,
  generatePlan: (input: { day?: string; rawText: string; availability: AvailabilityBlock[] }) => ipcRenderer.invoke('plan:generate', input) as Promise<{ tasks: Task[]; schedule: ScheduledTask[]; source: 'local' | 'ai' | 'fallback' }>,
  saveDraft: (input: { day?: string; tasks: Task[]; availability: AvailabilityBlock[]; schedule: ScheduledTask[] }) => ipcRenderer.invoke('plan:save-draft', input),
  confirmPlan: (input: { day?: string; tasks: Task[]; availability: AvailabilityBlock[]; schedule: ScheduledTask[]; reason?: string }) => ipcRenderer.invoke('plan:confirm', input),
  recordProgress: (input: { day?: string; taskId: string; eventType: string; payload?: Record<string, unknown> }) => ipcRenderer.invoke('progress:record', input),
  suggestReplan: (input: { day?: string; tasks: Task[]; availability: AvailabilityBlock[]; currentTaskId: string; reason: string }) => ipcRenderer.invoke('replan:suggest', input) as Promise<{ tasks: Task[]; schedule: ScheduledTask[]; reason: string }>,
  snoozeReminder: (input: { id: string; minutes: number }) => ipcRenderer.invoke('reminder:snooze', input),
  clearData: () => ipcRenderer.invoke('data:clear'),
  onReminder: (callback: (reminder: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, reminder: unknown) => callback(reminder);
    ipcRenderer.on('reminder:due', listener);
    return () => ipcRenderer.removeListener('reminder:due', listener);
  },
};

contextBridge.exposeInMainWorld('aiTodo', api);
