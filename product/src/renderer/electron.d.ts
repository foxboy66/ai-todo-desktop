import type { AvailabilityBlock, PlanSnapshot, ScheduledTask, Task } from '@/shared/domain';

declare global {
  interface Window {
    aiTodo: {
      load: () => Promise<PlanSnapshot & { history: Array<{ version: number; createdAt: string; reason?: string }> }>;
      generatePlan: (input: { rawText: string; availability: AvailabilityBlock[] }) => Promise<{ tasks: Task[]; schedule: ScheduledTask[] }>;
      saveDraft: (input: { tasks: Task[]; availability: AvailabilityBlock[]; schedule: ScheduledTask[] }) => Promise<PlanSnapshot>;
      confirmPlan: (input: { tasks: Task[]; availability: AvailabilityBlock[]; schedule: ScheduledTask[]; reason?: string }) => Promise<PlanSnapshot>;
      recordProgress: (input: { taskId: string; eventType: string; payload?: Record<string, unknown> }) => Promise<void>;
      suggestReplan: (input: { tasks: Task[]; availability: AvailabilityBlock[]; currentTaskId: string; reason: string }) => Promise<{ tasks: Task[]; schedule: ScheduledTask[]; reason: string }>;
      snoozeReminder: (input: { id: string; minutes: number }) => Promise<void>;
      clearData: () => Promise<void>;
      onReminder: (callback: (reminder: unknown) => void) => () => void;
    };
  }
}

export {};
