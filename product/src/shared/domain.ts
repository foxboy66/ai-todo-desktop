export type Priority = '高' | '中' | '低';
export type TaskStatus = '待安排' | '已安排' | '进行中' | '部分完成' | '已完成' | '已延期' | '已取消' | '等待反馈';

export type Task = {
  id: string;
  title: string;
  duration: number;
  aiDuration?: number;
  priority: Priority;
  deadline?: string;
  doneDefinition: string;
  status: TaskStatus;
};

export type AvailabilityBlock = {
  id: string;
  start: string;
  end: string;
  kind?: 'available' | 'busy';
};

export type ScheduledTask = Task & {
  scheduled: boolean;
  startMinutes: number | null;
  endMinutes: number | null;
  startLabel: string;
  endLabel: string;
  checkpoints: string[];
};

export type ReminderNode = {
  id: string;
  taskId: string;
  kind: 'start' | 'checkpoint' | 'end';
  dueAt: string;
  status: 'pending' | 'sent' | 'skipped' | 'cancelled' | 'expired';
};

export type PlanSnapshot = {
  tasks: Task[];
  availability: AvailabilityBlock[];
  schedule: ScheduledTask[];
  version: number;
  confirmed: boolean;
};

export function parseTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function formatTime(minutes: number) {
  const safe = Math.max(0, minutes);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function getReminderInterval(duration: number) {
  if (duration <= 30) return null;
  if (duration <= 90) return 30;
  if (duration <= 180) return 45;
  return 60;
}

export function getCheckpoints(startMinutes: number, duration: number) {
  const interval = getReminderInterval(duration);
  if (!interval) return [];
  const checkpoints: string[] = [];
  for (let elapsed = interval; elapsed < duration; elapsed += interval) {
    checkpoints.push(formatTime(startMinutes + elapsed));
  }
  return checkpoints;
}

export function buildSchedule(tasks: Task[], availability: AvailabilityBlock[]) {
  const blocks = availability
    .filter((block) => block.kind !== 'busy')
    .map((block) => ({ ...block, startMinutes: parseTime(block.start), endMinutes: parseTime(block.end) }))
    .filter((block) => block.endMinutes > block.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const buffer = 15;
  let blockIndex = 0;
  let cursor = blocks[0]?.startMinutes ?? 0;

  return tasks.map((task): ScheduledTask => {
    let scheduled = false;
    let startMinutes: number | null = null;
    let endMinutes: number | null = null;
    while (blockIndex < blocks.length) {
      const block = blocks[blockIndex];
      cursor = Math.max(cursor, block.startMinutes);
      if (cursor + task.duration <= block.endMinutes) {
        scheduled = true;
        startMinutes = cursor;
        endMinutes = cursor + task.duration;
        cursor = endMinutes + buffer;
        break;
      }
      blockIndex += 1;
      cursor = blocks[blockIndex]?.startMinutes ?? 0;
    }
    return {
      ...task,
      scheduled,
      startMinutes,
      endMinutes,
      startLabel: scheduled && startMinutes !== null ? formatTime(startMinutes) : '未安排',
      endLabel: scheduled && endMinutes !== null ? formatTime(endMinutes) : '',
      checkpoints: scheduled && startMinutes !== null ? getCheckpoints(startMinutes, task.duration) : [],
      status: scheduled && task.status === '待安排' ? '已安排' : task.status,
    };
  });
}

function estimateDuration(title: string) {
  if (/邮件|消息|回复/.test(title)) return 30;
  if (/会议|评审|沟通/.test(title)) return 60;
  if (/阅读|看完|研究/.test(title)) return 45;
  if (/整理|汇总|分析/.test(title)) return 60;
  if (/写|准备|制作|完成/.test(title)) return 75;
  return 45;
}

export function parseTaskInput(input: string): Task[] {
  return input
    .split(/[;；\n。]/)
    .map((title) => title.trim().replace(/^[-•\d.、\s]+/, ''))
    .filter(Boolean)
    .slice(0, 20)
    .map((title, index) => ({
      id: `task-${Date.now()}-${index}`,
      title,
      duration: estimateDuration(title),
      aiDuration: estimateDuration(title),
      priority: /紧急|重要|评审|截止/.test(title) ? '高' : index < 2 ? '中' : '低',
      doneDefinition: `完成“${title}”的可交付结果`,
      status: '待安排',
    }));
}

export function buildReminderNodes(schedule: ScheduledTask[], day = new Date()) {
  const date = new Date(day);
  const dayText = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return schedule.flatMap((task) => {
    if (!task.scheduled || task.startMinutes === null || task.endMinutes === null) return [];
    const times = [
      { kind: 'start' as const, label: task.startLabel },
      ...task.checkpoints.map((label) => ({ kind: 'checkpoint' as const, label })),
      { kind: 'end' as const, label: task.endLabel },
    ];
    return times.map((item, index) => ({
      id: `reminder-${task.id}-${index}`,
      taskId: task.id,
      kind: item.kind,
      dueAt: `${dayText}T${item.label}:00`,
      status: 'pending' as const,
    }));
  });
}

export function replanTasks(tasks: Task[], currentTaskId: string, reason: string) {
  const delta = reason.includes('打断') ? 15 : reason.includes('不清楚') || reason.includes('缺少') ? 30 : 30;
  return tasks.map((task) => task.id === currentTaskId ? { ...task, duration: task.duration + delta, status: '进行中' as const } : task);
}

export const defaultAvailability: AvailabilityBlock[] = [
  { id: 'slot-1', start: '09:00', end: '12:00', kind: 'available' },
  { id: 'slot-2', start: '14:00', end: '18:00', kind: 'available' },
];

export const starterTasks: Task[] = [
  { id: 'task-starter-1', title: '完成 MVP Demo 交互', duration: 90, aiDuration: 90, priority: '高', doneDefinition: '核心流程可以从录入走到重排确认', status: '待安排' },
  { id: 'task-starter-2', title: '准备下午产品评审', duration: 60, aiDuration: 60, priority: '高', doneDefinition: '评审材料结构清楚，可直接演示', status: '待安排' },
  { id: 'task-starter-3', title: '回复客户邮件', duration: 35, aiDuration: 35, priority: '中', doneDefinition: '3 封待回复邮件全部处理', status: '待安排' },
];
