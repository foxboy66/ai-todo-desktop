import { useState, type ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, ListTodo, Moon, Play, Settings2, Sun, WifiOff } from 'lucide-react';
import { shiftDay, type DaySummary } from '../shared/daily';

type View = 'list' | 'capture' | 'execute';

type Theme = 'light' | 'dark';

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

function initialTheme(): Theme {
  const saved = window.localStorage.getItem('ai-todo-theme');
  const theme = saved === 'dark' || saved === 'light'
    ? saved
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  return theme;
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const nextTheme = theme === 'light' ? 'dark' : 'light';

  function applyTheme(next: Theme) {
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem('ai-todo-theme', next);
    setTheme(next);
  }

  function toggleTheme(event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const root = document.documentElement;
    root.style.setProperty('--theme-x', `${x}px`);
    root.style.setProperty('--theme-y', `${y}px`);
    root.style.setProperty('--theme-radius', `${radius}px`);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const viewTransitionDocument = document as ViewTransitionDocument;
    if (reducedMotion || !viewTransitionDocument.startViewTransition) {
      applyTheme(nextTheme);
      return;
    }

    const transition = viewTransitionDocument.startViewTransition(() => applyTheme(nextTheme));
    void transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 520, easing: 'cubic-bezier(.2,.75,.25,1)', pseudoElement: '::view-transition-new(root)' } as KeyframeAnimationOptions,
      );
    });
  }

  return <button className="icon-button theme-toggle" aria-label={`切换到${nextTheme === 'dark' ? '深色' : '浅色'}主题`} title={`切换到${nextTheme === 'dark' ? '深色' : '浅色'}主题`} onClick={toggleTheme}>
    {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
  </button>;
}

export function AppShell({ view, day, today, days, busy, confirmed, taskCount, aiEnabled, onNavigate, onDay, onSettings, children }: {
  view: View; day: string; today: string; days: DaySummary[]; busy: boolean; confirmed: boolean; taskCount: number; aiEnabled: boolean;
  onNavigate: (view: View) => void; onDay: (day: string) => void; onSettings: () => void; children: ReactNode;
}) {
  const dates = [...new Set([today, day, ...days.map(item => item.day)])].sort((a, b) => b.localeCompare(a));
  return <>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Check size={20} strokeWidth={3} /></span><strong>AI ToDo</strong></div>
      <nav className="step-nav" aria-label="主要导航">
        {([{ id: 'list', label: '任务清单', icon: ListTodo }, { id: 'execute', label: '执行跟进', icon: Play }] as const).map(item => <button key={item.id} className={'step' + (view === item.id ? ' active' : '')} aria-current={view === item.id ? 'page' : undefined} disabled={busy} onClick={() => onNavigate(item.id)}><item.icon size={18} /><span>{item.label}</span>{item.id === 'list' && <small>{taskCount}</small>}</button>)}
      </nav>
      <div className="sidebar-tools">
        <label className="history-picker"><span>按日期查看</span><select aria-label="按日期查看" disabled={busy} value={day} onChange={event => onDay(event.target.value)}>{dates.map(date => <option key={date} value={date}>{date}</option>)}</select></label>
      </div>
      <div className="sidebar-footer"><WifiOff size={15} /><span>数据保存在本机</span></div>
    </aside>
    <main className="main-content">
      <header className="topbar">
        <div className="day-navigation" aria-label="任务日期导航">
          <button className="icon-button" aria-label="前一天" title="前一天" disabled={busy} onClick={() => onDay(shiftDay(day, -1))}><ChevronLeft size={18} /></button>
          <input type="date" aria-label="查看任务日期" value={day} disabled={busy} onChange={event => { if (event.target.value) onDay(event.target.value); }} />
          <button className="icon-button" aria-label="后一天" title="后一天" disabled={busy} onClick={() => onDay(shiftDay(day, 1))}><ChevronRight size={18} /></button>
          <button className="secondary today-button" aria-label="回到今天" disabled={busy} onClick={() => onDay(today)}>今天</button>
        </div>
        <div className="top-actions"><span className="local-pill" aria-label="当前估时模式">{aiEnabled ? '大模型估时' : '本地模式'}</span><ThemeToggle /><button className="secondary ai-settings-button" disabled={busy} onClick={onSettings}><Settings2 size={16} />大模型设置</button></div>
      </header>
      <div className="workspace-context"><span>{day === today ? '今天' : day < today ? '历史任务' : '未来计划'}</span><span>{confirmed ? '计划已确认' : taskCount ? '计划待确认' : '尚未安排任务'}</span></div>
      {children}
    </main>
  </>;
}
