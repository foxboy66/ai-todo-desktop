export type View = 'capture' | 'review' | 'execute';
export type Priority = '高' | '中' | '低';

export type Task = {
  id: string;
  title: string;
  duration: number;
  priority: Priority;
  doneDefinition: string;
};

export type AvailabilityBlock = {
  id: string;
  start: string;
  end: string;
};

export const defaultAvailability: AvailabilityBlock[] = [
  { id: 'slot-1', start: '09:00', end: '12:00' },
  { id: 'slot-2', start: '14:00', end: '18:00' },
];

export const initialTasks: Task[] = [
  { id: 'task-1', title: '完成 MVP Demo 交互', duration: 90, priority: '高', doneDefinition: '核心流程可以从录入走到重排确认' },
  { id: 'task-2', title: '准备下午产品评审', duration: 60, priority: '高', doneDefinition: '评审材料结构清楚，可直接演示' },
  { id: 'task-3', title: '回复客户邮件', duration: 35, priority: '中', doneDefinition: '3 封待回复邮件全部处理' },
  { id: 'task-4', title: '整理用户访谈记录', duration: 75, priority: '中', doneDefinition: '提取 5 条主要发现' },
  { id: 'task-5', title: '阅读技术方案', duration: 70, priority: '低', doneDefinition: '记录风险点和待确认问题' },
];

export const blockerReasons = [
  '耗时比预期更长',
  '临时事项打断',
  '任务内容不清楚',
  '缺少资料或条件',
  '精力不足',
  '优先级发生变化',
];
