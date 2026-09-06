import { contextBridge, ipcRenderer } from 'electron';
import type { AvailabilityBlock, PlanSnapshot, ScheduledTask, Task } from './shared/domain';

const api = {
  load: () => ipcRenderer.invoke('app:load') as Promise<PlanSnapshot & { history: Array<{ version: number; createdAt: string; reason?: string }> }>,
  generatePlan: (input: { rawText: string; availability: AvailabilityBlock[] }) => ipcRenderer.invoke('plan:generate', input) as Promise<{ tasks: Task[]; schedule: ScheduledTask[] }>,
  saveDraft: (input: { tasks: Task[]; availability: AvailabilityBlock[]; schedule: ScheduledTask[] }) => ipcRenderer.invoke('plan:save-draft', input),
  confirmPlan: (input: { tasks: Task[]; availability: AvailabilityBlock[]; schedule: ScheduledTask[]; reason?: string }) => ipcRenderer.invoke('plan:confirm', input),
  recordProgress: (input: { taskId: string; eventType: string; payload?: Record<string, unknown> }) => ipcRenderer.invoke('progress:record', input),
  suggestReplan: (input: { tasks: Task[]; availability: AvailabilityBlock[]; currentTaskId: string; reason: string }) => ipcRenderer.invoke('replan:suggest', input) as Promise<{ tasks: Task[]; schedule: ScheduledTask[]; reason: string }>,
  snoozeReminder: (input: { id: string; minutes: number }) => ipcRenderer.invoke('reminder:snooze', input),
  clearData: () => ipcRenderer.invoke('data:clear'),
  onReminder: (callback: (reminder: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, reminder: unknown) => callback(reminder);
    ipcRenderer.on('reminder:due', listener);
    return () => ipcRenderer.removeListener('reminder:due', listener);
  },
};

contextBridge.exposeInMainWorld('aiTodo', api);
