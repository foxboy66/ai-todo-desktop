import type { DailyState, DaySummary } from '../shared/daily';
import type { AiSettings, AiSettingsInput } from '@/shared/ai-settings';
import type { AvailabilityBlock, PlanSnapshot, ScheduledTask, Task } from '@/shared/domain';

declare global {
  interface Window {
    aiTodo: {
      rendererReady: () => void;
      getAiSettings: () => Promise<AiSettings>;
      saveAiSettings: (input: AiSettingsInput) => Promise<AiSettings>;
      load: (day?: string) => Promise<PlanSnapshot & { history: Array<{ version: number; createdAt: string; reason?: string }> }>;
      listDays: () => Promise<DaySummary[]>;
      updateTask: (input: { day: string; taskId: string; patch: Partial<Task> | null; targetDay?: string }) => Promise<DailyState>;
      generatePlan: (input: { day?: string; rawText: string; availability: AvailabilityBlock[] }) => Promise<{ tasks: Task[]; schedule: ScheduledTask[]; source: 'local' | 'ai' | 'fallback' }>;
      saveDraft: (input: { day?: string; tasks: Task[]; availability: AvailabilityBlock[]; schedule: ScheduledTask[] }) => Promise<PlanSnapshot>;
      confirmPlan: (input: { day?: string; tasks: Task[]; availability: AvailabilityBlock[]; schedule: ScheduledTask[]; reason?: string }) => Promise<PlanSnapshot>;
      recordProgress: (input: { day?: string; taskId: string; eventType: string; payload?: Record<string, unknown> }) => Promise<void>;
      suggestReplan: (input: { day?: string; tasks: Task[]; availability: AvailabilityBlock[]; currentTaskId: string; reason: string }) => Promise<{ tasks: Task[]; schedule: ScheduledTask[]; reason: string }>;
      snoozeReminder: (input: { id: string; minutes: number }) => Promise<void>;
      clearData: () => Promise<void>;
      onReminder: (callback: (reminder: unknown) => void) => () => void;
    };
  }
}

export {};
