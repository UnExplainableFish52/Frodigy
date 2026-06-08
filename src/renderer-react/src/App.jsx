import { forwardRef as ReactForwardRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlarmClock,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Command,
  Compass,
  Database,
  Download,
  FileText,
  FolderOpen,
  Gauge,
  GripVertical,
  Home,
  Info,
  ListChecks,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Timer,
  Trash2,
  Upload,
  Volume2,
  X
} from 'lucide-react';
import {
  Button,
  CommandEmptyIcon,
  CommandSearchButton,
  EmptyState,
  Field,
  IconButton,
  Modal,
  PageHeader,
  Panel,
  PrimaryButton,
  SecondaryButton,
  Select,
  ShortcutBadge,
  ShortcutHint,
  StatCard,
  StatusChip,
  TextArea,
  TextInput
} from './components/ui.jsx';
import { frodigyApi } from './lib/frodigyApi.js';
import { cn } from './lib/utils.js';
import { formatDateISO, formatDuration, formatLongDate, formatMinutes, formatTime, isTypingTarget, timerText } from './lib/utils.js';
import appLogo from '../../../build/icons/512x512.png';
import alarmSound from '../../renderer/custom-alarm.mp3';

const pages = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, shortcut: 'Ctrl+1' },
  { id: 'calendar', label: 'Calendar & Notes', icon: CalendarDays, shortcut: 'Ctrl+2' },
  { id: 'schedule', label: 'Schedule', icon: Clock3, shortcut: 'Ctrl+3' },
  { id: 'timers', label: 'Timers', icon: Timer, shortcut: 'Ctrl+4' },
  { id: 'completed', label: 'Completed', icon: CheckCircle2, shortcut: 'Ctrl+5' },
  { id: 'summary', label: 'Summary', icon: BarChart3, shortcut: 'Ctrl+6' },
  { id: 'settings', label: 'Settings', icon: Settings, shortcut: 'Ctrl+7' },
  { id: 'about', label: 'About', icon: Info, shortcut: 'Ctrl+8' }
];

const pageIds = pages.map((page) => page.id);

function getHashPage() {
  const hash = window.location.hash.replace('#', '');
  return pageIds.includes(hash) ? hash : 'dashboard';
}

function useAsync(loader, deps, fallback) {
  const [value, setValue] = useState(fallback);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loader()
      .then((result) => {
        if (alive) setValue(result);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, deps);

  return [value, loading];
}

function App() {
  const [page, setPage] = useState(getHashPage);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] = useState(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusIntent, setFocusIntent] = useState(null);
  const [timerAlert, setTimerAlert] = useState(null);
  const [pendingProjects, setPendingProjects] = useState({});
  const [pendingTick, setPendingTick] = useState(0);
  const alarmAudioRef = useRef(null);
  const alarmFallbackRef = useRef(null);
  const pendingProjectTimersRef = useRef(new Map());

  const navigate = (nextPage) => {
    window.location.hash = `#${nextPage}`;
    setPage(nextPage);
  };

  const refresh = () => setRefreshKey((key) => key + 1);
  const beginProjectCompletion = (task) => {
    if (!task || pendingProjectTimersRef.current.has(task.id)) return;
    const deadline = Date.now() + 10000;
    setPendingProjects((current) => ({ ...current, [task.id]: { task, deadline } }));
    const timerId = window.setTimeout(async () => {
      pendingProjectTimersRef.current.delete(task.id);
      const result = await frodigyApi.projects.complete(task.id);
      setPendingProjects((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      if (result?.success) refresh();
    }, 10000);
    pendingProjectTimersRef.current.set(task.id, timerId);
  };
  const undoProjectCompletion = (taskId) => {
    const timerId = pendingProjectTimersRef.current.get(taskId);
    if (timerId) window.clearTimeout(timerId);
    pendingProjectTimersRef.current.delete(taskId);
    setPendingProjects((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  };
  const focusJournal = () => {
    navigate('calendar');
    setFocusIntent({ target: 'journal', id: Date.now() });
  };

  const actions = useMemo(() => ({
    navigate,
    refresh,
    openCommand: () => setCommandOpen(true),
    openShortcuts: () => setShortcutsOpen(true),
    openTask: (initialTaskType = 'one_time') => setModal({ type: 'task', initialTaskType }),
    openTimer: () => setModal({ type: 'timer' }),
    openSchedule: () => setModal({ type: 'schedule' }),
    focusJournal,
    closeModal: () => setModal(null)
  }), []);

  useEffect(() => {
    const onHashChange = () => setPage(getHashPage());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!Object.keys(pendingProjects).length) return undefined;
    const interval = window.setInterval(() => setPendingTick((tick) => tick + 1), 250);
    return () => window.clearInterval(interval);
  }, [pendingProjects]);

  useEffect(() => () => {
    for (const timerId of pendingProjectTimersRef.current.values()) {
      window.clearTimeout(timerId);
    }
    pendingProjectTimersRef.current.clear();
  }, []);

  useEffect(() => {
    const unsubscribe = frodigyApi.on('timer:completed', (payload) => {
      setTimerAlert(payload);
      setRefreshKey((key) => key + 1);
      playTimerAlarm(alarmAudioRef, alarmFallbackRef);
    });

    return () => {
      unsubscribe?.();
      stopTimerAlarm(alarmAudioRef, alarmFallbackRef);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const typing = isTypingTarget(event.target);

      if (event.ctrlKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }

      if (event.key === 'Escape') {
        setCommandOpen(false);
        setShortcutsOpen(false);
        setModal(null);
        return;
      }

      if (typing || commandOpen || shortcutsOpen || modal) return;

      if (event.key === '?') {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (event.ctrlKey && event.key >= '1' && event.key <= '8') {
        event.preventDefault();
        navigate(pageIds[Number(event.key) - 1]);
        return;
      }

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        if (event.shiftKey) {
          focusJournal();
        } else {
          setModal({ type: 'task', initialTaskType: 'one_time' });
        }
        return;
      }

      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        setModal({ type: 'timer' });
        return;
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        setModal({ type: 'schedule' });
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [commandOpen, shortcutsOpen, modal]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-primary">
      <Sidebar page={page} navigate={navigate} />
      <main className="app-scroll min-w-0 flex-1 overflow-y-auto px-8 py-8">
        <PageFrame
          page={page}
          refreshKey={refreshKey}
          actions={actions}
          focusIntent={focusIntent}
          pendingProjects={pendingProjects}
          pendingTick={pendingTick}
          beginProjectCompletion={beginProjectCompletion}
          undoProjectCompletion={undoProjectCompletion}
        />
      </main>
      <CommandMenu open={commandOpen} setOpen={setCommandOpen} actions={actions} />
      <ShortcutHelp open={shortcutsOpen} setOpen={setShortcutsOpen} />
      <TimerFinishedAlert alert={timerAlert} onDismiss={() => {
        stopTimerAlarm(alarmAudioRef, alarmFallbackRef);
        setTimerAlert(null);
      }} />
      <TaskModal modal={modal} setModal={setModal} refresh={refresh} />
      <TimerModal modal={modal} setModal={setModal} refresh={refresh} />
      <ScheduleModal modal={modal} setModal={setModal} refresh={refresh} />
    </div>
  );
}

function playTimerAlarm(audioRef, fallbackRef) {
  stopTimerAlarm(audioRef, fallbackRef);

  const audio = new Audio(alarmSound);
  audio.loop = true;
  audio.volume = 0.82;
  audioRef.current = audio;

  audio.play().catch(() => {
    startFallbackAlarm(fallbackRef);
  });
}

function startFallbackAlarm(fallbackRef) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || fallbackRef.current) return;

  const context = new AudioContextClass();
  const beep = () => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(440, context.currentTime + 0.28);
    gain.gain.setValueAtTime(0.45, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.28);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
  };

  beep();
  fallbackRef.current = {
    context,
    interval: window.setInterval(beep, 950)
  };
}

function stopTimerAlarm(audioRef, fallbackRef) {
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current = null;
  }

  if (fallbackRef.current) {
    window.clearInterval(fallbackRef.current.interval);
    fallbackRef.current.context.close?.();
    fallbackRef.current = null;
  }
}

function TimerFinishedAlert({ alert, onDismiss }) {
  if (!alert) return null;

  return (
    <Modal open={Boolean(alert)} onOpenChange={(open) => !open && onDismiss()} title="Timer Complete">
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-card border border-accent/30 bg-accent/10 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-accent text-background">
            <Volume2 className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold text-primary">{alert.name || 'Timer'}</div>
            <p className="mt-1 text-sm text-secondary">The focus session has finished.</p>
          </div>
        </div>
        <PrimaryButton className="w-full" onClick={onDismiss}>Dismiss</PrimaryButton>
      </div>
    </Modal>
  );
}

function Sidebar({ page, navigate }) {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-border bg-sidebar p-5">
      <div className="rounded-[28px] border border-border-strong bg-raised p-4 shadow-soft">
        <div
          className="flex min-h-[136px] flex-col items-center justify-center rounded-[24px] border border-accent/20 bg-editor px-4 py-4 text-center"
          aria-label="Frodigy logo"
        >
          <img src={appLogo} alt="" className="h-20 w-20 object-contain" draggable="false" />
          <div className="brand-gradient-name mt-2 max-w-full truncate text-2xl font-extrabold tracking-normal">Frodigy</div>
        </div>
        <p className="mt-3 text-center text-sm font-semibold leading-5 text-secondary">Prodigy level of Productivity</p>
      </div>
      <nav className="mt-5 flex flex-1 flex-col gap-1">
        {pages.map((item) => <SidebarItem key={item.id} item={item} active={page === item.id} onClick={() => navigate(item.id)} />)}
      </nav>
      <div className="rounded-card border border-border bg-panel p-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-muted">Keyboard</div>
        <div className="flex items-center justify-between text-sm text-secondary">
          <span>Command menu</span>
          <ShortcutBadge>Ctrl+K</ShortcutBadge>
        </div>
      </div>
    </aside>
  );
}

function SidebarItem({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-11 items-center gap-3 rounded-control px-3 text-left text-sm font-semibold text-secondary transition focus:outline-none focus-visible:shadow-focus',
        active ? 'bg-raised text-primary shadow-[inset_0_0_0_1px_#2B3340]' : 'hover:bg-raised/70 hover:text-primary'
      )}
    >
      <Icon className={cn('h-4 w-4', active ? 'text-accent' : 'text-muted')} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <span className="font-mono text-[10px] text-muted">{item.shortcut.replace('Ctrl+', '')}</span>
    </button>
  );
}

function PageFrame({ page, refreshKey, actions, focusIntent, pendingProjects, pendingTick, beginProjectCompletion, undoProjectCompletion }) {
  const props = { refreshKey, actions, focusIntent, pendingProjects, pendingTick, beginProjectCompletion, undoProjectCompletion };
  const views = {
    dashboard: <DashboardPage {...props} />,
    calendar: <CalendarPage {...props} />,
    schedule: <SchedulePage {...props} />,
    timers: <TimersPage {...props} />,
    completed: <CompletedPage {...props} />,
    summary: <SummaryPage {...props} />,
    settings: <SettingsPage {...props} />,
    about: <AboutPage {...props} />
  };

  return views[page] || views.dashboard;
}

function QuickActionButton({ icon: Icon, label, shortcut, onClick }) {
  return (
    <button
      type="button"
      className="inline-flex h-11 items-center gap-2 rounded-control border border-border bg-raised px-3 text-sm font-bold text-primary transition hover:border-border-strong hover:bg-[#202A36] focus:outline-none focus-visible:shadow-focus"
      onClick={onClick}
    >
      {Icon ? <Icon className="h-4 w-4 text-accent" /> : null}
      <span>{label}</span>
      {shortcut ? <ShortcutBadge>{shortcut}</ShortcutBadge> : null}
    </button>
  );
}

function DashboardOverviewCard({ label, value, icon: Icon, tone = 'neutral', onOpen, onAdd }) {
  const tones = {
    neutral: 'text-secondary bg-editor',
    accent: 'text-accent bg-accent/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning bg-warning/10'
  };

  return (
    <div className="relative overflow-hidden rounded-card border border-border bg-raised p-4 transition hover:border-border-strong hover:bg-[#202A36] focus-within:shadow-focus">
      <button type="button" className="absolute inset-0 z-10 cursor-pointer" aria-label={`Open ${label}`} onClick={onOpen} />
      <div className="pointer-events-none relative z-20 flex items-start justify-between gap-3">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-control', tones[tone])}>
          {Icon ? <Icon className="h-4 w-4" /> : null}
        </div>
        {onAdd ? (
          <button
            type="button"
            className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-editor text-muted transition hover:border-border-strong hover:text-primary focus:outline-none focus-visible:shadow-focus"
            aria-label={`Add ${label}`}
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="pointer-events-none relative z-20 mt-4 truncate text-xl font-extrabold text-primary">{value}</div>
      <div className="pointer-events-none relative z-20 mt-1 text-xs font-bold uppercase tracking-[0.14em] text-muted">{label}</div>
    </div>
  );
}

function DashboardPage({ refreshKey, actions, pendingProjects, pendingTick, beginProjectCompletion, undoProjectCompletion }) {
  const [data] = useAsync(() => frodigyApi.journey.dashboard(), [refreshKey], {
    date: formatDateISO(new Date()),
    profile: { preferredName: '', lifeDayNumber: null },
    recurring: [],
    projects: [],
    summary: {}
  });
  const recurring = data.recurring || [];
  const projects = data.projects || [];
  const completedDaily = data.summary?.completedRecurring || 0;
  const expectedDaily = data.summary?.expectedRecurring || 0;

  return (
    <div>
      <section className="journey-hero mb-6 overflow-hidden rounded-panel border border-border-strong bg-panel p-7 shadow-soft">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
          <div className="flex min-h-[150px] flex-col justify-center">
            <h1 className="text-3xl font-extrabold tracking-normal text-primary">
              Greetings, <span className="text-accent">{data.profile?.preferredName || 'Friend'}</span>
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="rounded-control border border-accent/30 bg-accent/10 px-4 py-2 font-mono text-5xl font-extrabold tracking-tight text-accent shadow-[0_0_36px_rgba(255,210,31,0.08)]">
                {data.profile?.lifeDayNumber ? `Day ${data.profile.lifeDayNumber}` : 'Set your birthday'}
              </div>
              <p className="text-lg font-bold leading-tight text-secondary">{formatLongDate(new Date(`${data.date}T00:00:00`))}</p>
            </div>
            {!data.profile?.dateOfBirth ? (
              <button className="mt-4 text-sm font-bold text-accent hover:underline" onClick={() => actions.navigate('settings')}>
                Add your preferred name and date of birth in Settings
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <QuickActionButton icon={Plus} label="Project" shortcut="N" onClick={() => actions.openTask('one_time')} />
            <QuickActionButton icon={RefreshCcw} label="Routine" shortcut="" onClick={() => actions.openTask('recurring')} />
            <CommandSearchButton onClick={actions.openCommand} />
          </div>
        </div>
      </section>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Daily tasks completed" value={`${completedDaily}/${expectedDaily}`} icon={RefreshCcw} tone={expectedDaily > 0 && completedDaily === expectedDaily ? 'success' : 'accent'} />
        <StatCard label="Milestones today" value={data.summary?.projectsCompletedToday || 0} icon={CheckCircle2} tone="success" />
        <StatCard label="Opened this month" value={`${data.summary?.openedThisMonthDays || 0} days`} icon={CalendarDays} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel className="border-border-strong bg-[#121922]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-extrabold text-primary">Daily Tasks</h2>
              <p className="mt-1 text-sm text-secondary">Routines due on today&apos;s path. Each completion belongs only to today.</p>
            </div>
            <IconButton label="Add recurring task" onClick={() => actions.openTask('recurring')}><Plus className="h-4 w-4" /></IconButton>
          </div>
          {recurring.length ? (
            <div className="space-y-3">
              {recurring.map((task) => (
                <JourneyRecurringRow
                  key={task.id}
                  task={task}
                  onToggle={async () => {
                    await frodigyApi.journey.toggleRecurring({ taskId: task.id, date: data.date, completed: !task.completed_today });
                    actions.refresh();
                  }}
                  onDelete={async () => {
                    await frodigyApi.tasks.delete(task.id);
                    actions.refresh();
                  }}
                />
              ))}
            </div>
          ) : <EmptyState icon={RefreshCcw} title="No routines due today" description="The path is clear, or your next interval routine is due on another day." action={<PrimaryButton onClick={() => actions.openTask('recurring')}>Add Routine</PrimaryButton>} />}
        </Panel>

        <Panel className="border-border-strong bg-[#121922]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-extrabold text-primary">Current Projects</h2>
              <p className="mt-1 text-sm text-secondary">One-time milestones stay here until their 10-second completion grace period ends.</p>
            </div>
            <IconButton label="Add project" onClick={() => actions.openTask('one_time')}><Plus className="h-4 w-4" /></IconButton>
          </div>
          {projects.length ? (
            <div className="space-y-3">
              {projects.map((task) => (
                <JourneyProjectRow
                  key={task.id}
                  task={task}
                  pending={pendingProjects?.[task.id]}
                  pendingTick={pendingTick}
                  onComplete={() => beginProjectCompletion(task)}
                  onUndo={() => undoProjectCompletion(task.id)}
                  onDelete={async () => {
                    undoProjectCompletion(task.id);
                    await frodigyApi.tasks.delete(task.id);
                    actions.refresh();
                  }}
                />
              ))}
            </div>
          ) : <EmptyState icon={ListChecks} title="No current projects" description="Capture a meaningful one-time milestone for your journey." action={<PrimaryButton onClick={() => actions.openTask('one_time')}>Add Project</PrimaryButton>} />}
        </Panel>
      </div>
    </div>
  );
}

function JourneyRecurringRow({ task, onToggle, onDelete }) {
  return (
    <div className={cn('flex items-center gap-4 rounded-card border p-4 transition', task.completed_today ? 'border-success/25 bg-success/5' : 'border-border bg-raised hover:border-border-strong')}>
      <button type="button" role="checkbox" aria-checked={task.completed_today} aria-label={task.completed_today ? 'Mark routine incomplete today' : 'Complete routine today'} className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition', task.completed_today ? 'border-success/40 bg-success/10 text-success' : 'border-border bg-editor text-muted hover:border-success/50 hover:text-success')} onClick={onToggle}>
        {task.completed_today ? <Check className="h-4 w-4" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn('truncate font-extrabold text-primary', task.completed_today ? 'text-secondary line-through' : '')}>{task.title}</div>
        <div className="mt-1 text-xs text-muted">{Number(task.recurrence_rule || 1) === 1 ? 'Daily routine' : `Every ${task.recurrence_rule} days`}</div>
      </div>
      <IconButton label="Archive routine" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></IconButton>
    </div>
  );
}

function JourneyProjectRow({ task, pending, pendingTick, onComplete, onUndo, onDelete }) {
  const secondsLeft = pending ? Math.max(0, Math.ceil((pending.deadline - Date.now()) / 1000)) : null;
  return (
    <div className={cn('flex items-center gap-4 rounded-card border p-4 transition', pending ? 'border-warning/40 bg-warning/10' : 'border-border bg-raised hover:border-border-strong')}>
      <button type="button" role="checkbox" aria-checked={Boolean(pending)} aria-label={pending ? 'Undo pending project completion' : 'Complete project'} className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition', pending ? 'border-warning/50 bg-warning/15 text-warning' : 'border-border bg-editor text-muted hover:border-success/50 hover:text-success')} onClick={pending ? onUndo : onComplete}>
        {pending ? <Check className="h-4 w-4" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn('truncate font-extrabold text-primary', pending ? 'text-secondary line-through' : '')}>{task.title}</div>
        <div className="mt-1 text-xs text-muted">{pending ? `Completion saves in ${secondsLeft}s` : `Created ${task.created_date || task.created_at?.slice(0, 10)}${task.due_date ? ` · Due ${task.due_date}` : ''}`}</div>
      </div>
      {pending ? <SecondaryButton onClick={onUndo}><RotateCcw className="h-4 w-4" /> Undo</SecondaryButton> : <IconButton label="Archive project" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></IconButton>}
    </div>
  );
}

async function toggleTask(task) {
  if (!task) return;
  if (task.rowType === 'recurring') {
    await frodigyApi.tasks.toggleRecurring({ taskId: task.id, completed: !isRecurringDoneForInterval(task) });
  } else {
    await frodigyApi.tasks.completeOneTime(task.id);
  }
}

function isRecurringDoneForInterval(task) {
  if (!task || task.rowType !== 'recurring' || !task.last_completed) return false;
  const interval = Math.max(1, Number.parseInt(task.recurrence_rule, 10) || 1);
  const today = new Date(`${formatDateISO(new Date())}T00:00:00`);
  const lastCompleted = new Date(`${task.last_completed}T00:00:00`);
  const daysSince = Math.floor((today - lastCompleted) / 86400000);
  return daysSince >= 0 && daysSince < interval;
}

function TaskRow({ task, selected, onToggle, onDelete }) {
  const isRecurring = task.rowType === 'recurring';
  const isDone = isRecurringDoneForInterval(task);
  const dueTone = getDueTone(task);
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-card border bg-[#1A222D] p-5 transition',
        selected ? 'border-accent/45 shadow-focus' : 'border-border hover:border-border-strong hover:bg-[#202A36]',
        isDone ? 'bg-[#151D27]' : ''
      )}
    >
      <button
        type="button"
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-muted transition hover:border-success/60 hover:text-success focus:outline-none focus-visible:shadow-focus',
          isDone ? 'border-success/40 bg-success/10 text-success' : 'border-border bg-editor'
        )}
        aria-label={isDone ? 'Mark recurring task incomplete for today' : 'Mark task complete'}
        aria-checked={isDone}
        role="checkbox"
        onClick={onToggle}
      >
        {isDone ? <Check className="h-4 w-4" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn('truncate text-lg font-extrabold text-primary', isDone ? 'text-secondary line-through decoration-muted decoration-2' : '')}>{task.title}</h3>
          <span className="inline-flex items-center rounded-full border border-border bg-editor/80 px-2.5 py-1 text-[11px] font-bold uppercase text-muted">
            {isRecurring ? 'Recurring' : 'Task'}
          </span>
          {task.due_date ? <StatusChip tone={dueTone}>Due {task.due_date}</StatusChip> : null}
        </div>
        <p className="mt-1 truncate text-xs text-muted">
          {isDone ? 'Done for this recurrence' : task.reminder_at ? `Reminder ${formatTime(task.reminder_at)}` : task.created_at ? `Started ${task.created_at.slice(0, 10)}` : 'Ready'}
        </p>
      </div>
      <IconButton label="Delete task" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></IconButton>
    </div>
  );
}

function getDueTone(task) {
  if (!task.due_date) return 'neutral';
  const today = formatDateISO(new Date());
  if (task.due_date < today) return 'danger';
  if (task.due_date === today) return 'warning';
  return 'accent';
}

function CalendarPage({ refreshKey, focusIntent }) {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(formatDateISO(today));
  const [mode, setMode] = useState('edit');
  const [content, setContent] = useState('');
  const [notesWithContent] = useAsync(() => frodigyApi.notes.getMonth(month.getFullYear(), month.getMonth() + 1), [month, refreshKey], []);
  const saveTimer = useRef(null);
  const journalRef = useRef(null);
  const todayIso = formatDateISO(today);
  const [weekendMode] = useAsync(() => frodigyApi.settings.get('weekend_mode'), [refreshKey], 'saturday');

  useEffect(() => {
    frodigyApi.notes.get(selectedDate).then((note) => {
      setContent(note.content || defaultNote(selectedDate));
    });
  }, [selectedDate, refreshKey]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        frodigyApi.notes.save(selectedDate, content);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedDate, content]);

  useEffect(() => {
    if (focusIntent?.target !== 'journal') return;
    setMode('edit');
    window.requestAnimationFrame(() => {
      journalRef.current?.focus();
      const length = journalRef.current?.value.length || 0;
      journalRef.current?.setSelectionRange(length, length);
    });
  }, [focusIntent]);

  const updateContent = (value) => {
    setContent(value);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => frodigyApi.notes.save(selectedDate, value), 600);
  };

  const onJournalKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const days = buildCalendarDays(month);
  const notedDays = new Set(notesWithContent);

  return (
    <div>
      <PageHeader title="Calendar & Notes" subtitle="Now the days won't disappear like sand in a clenched fist." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
        <Panel className="bg-[#151B23]">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-primary">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
            <div className="flex gap-2">
              <IconButton label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></IconButton>
              <IconButton label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></IconButton>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold uppercase tracking-[0.16em] text-muted">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day}>{day}</div>)}
          </div>
          <div className="mt-3 grid grid-cols-7 gap-2">
            {days.map((day) => {
              const hasJournal = day.date && notedDays.has(day.date);
              const isToday = day.date === todayIso;
              const isSelected = day.date === selectedDate;
              const isHoliday = day.date && isHolidayStyleDay(day.date, weekendMode || 'saturday');
              return (
                <button
                  key={day.key}
                  disabled={!day.date}
                  onClick={() => day.date && setSelectedDate(day.date)}
                  className={cn(
                    'relative h-12 rounded-2xl border text-sm font-bold transition disabled:opacity-20',
                    !day.date ? 'border-transparent bg-transparent' : 'border-border bg-[#1B232D] text-secondary hover:border-border-strong hover:bg-[#202A36] hover:text-primary',
                    isHoliday && !isSelected && !isToday ? 'border-danger/25 bg-danger/10 text-[#FF9C9C] hover:border-danger/45 hover:bg-danger/15' : '',
                    isToday && !isSelected ? 'border-[#5B8CFF]/45 bg-[#24324A] text-primary shadow-[inset_0_0_0_1px_rgba(91,140,255,0.18)]' : '',
                    isSelected ? 'border-accent/80 bg-[#1A222D] text-primary shadow-[0_0_0_3px_rgba(255,210,31,0.10),0_0_26px_rgba(255,210,31,0.12)]' : ''
                  )}
                >
                  <span>{day.label}</span>
                  {hasJournal ? <span className="absolute bottom-2 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-success shadow-[0_0_12px_rgba(98,242,143,0.35)]" /> : null}
                </button>
              );
            })}
          </div>
        </Panel>
        <Panel className="min-h-[620px]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-primary">Daily Journal</h2>
              <p className="mt-1 text-sm text-secondary">{formatReadableDate(selectedDate)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant={mode === 'edit' ? 'primary' : 'secondary'} onClick={() => setMode('edit')}>Edit</Button>
              <Button variant={mode === 'preview' ? 'primary' : 'secondary'} onClick={() => setMode('preview')}>Preview</Button>
            </div>
          </div>
          {mode === 'edit' ? (
            <textarea ref={journalRef} className="h-[500px] w-full resize-none rounded-card border border-border bg-editor p-5 font-mono text-sm leading-7 text-primary outline-none focus:shadow-focus" value={content} onChange={(event) => updateContent(event.target.value)} onKeyDown={onJournalKeyDown} />
          ) : (
            <div className="prose prose-invert max-w-none rounded-card border border-border bg-editor p-5 text-secondary" dangerouslySetInnerHTML={{ __html: frodigyApi.markdown.parse(content || '*No content*') }} />
          )}
        </Panel>
      </div>
    </div>
  );
}

function buildCalendarDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days = [];
  for (let index = 0; index < first; index++) days.push({ key: `blank-${index}`, label: '', date: null });
  for (let day = 1; day <= total; day++) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    days.push({ key: formatDateISO(date), label: day, date: formatDateISO(date) });
  }
  return days;
}

function isHolidayStyleDay(dateString, weekendMode = 'saturday') {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();
  if (weekendMode === 'saturday_sunday') {
    return dayOfWeek === 0 || dayOfWeek === 6;
  }
  return dayOfWeek === 6;
}

function defaultNote(date) {
  return `# ${formatReadableDate(date)}\n\n## Focus\n\n- \n\n## Progress\n\n- \n`;
}

function formatReadableDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function SchedulePage({ refreshKey, actions }) {
  const [schedule] = useAsync(() => frodigyApi.schedule.list(), [refreshKey], []);
  const [drag, setDrag] = useState(null);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const timelineRef = useRef(null);
  const dragRef = useRef(null);
  const scheduleForDisplay = useMemo(() => (
    schedule
      .map((block) => drag?.id === block.id ? { ...block, start_time: drag.start_time, end_time: drag.end_time } : block)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
  ), [schedule, drag]);
  const scheduleLayout = useMemo(() => layoutScheduleBlocks(scheduleForDisplay), [scheduleForDisplay]);

  dragRef.current = drag;

  useEffect(() => {
    if (!schedule.length) {
      setSelectedBlockId(null);
      return;
    }
    if (!schedule.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(schedule[0].id);
    }
  }, [schedule, selectedBlockId]);

  const selectScheduleBlock = (blockId, scrollToBlock = false) => {
    setSelectedBlockId(blockId);
    if (!scrollToBlock) return;
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-schedule-block-id="${blockId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const startBlockDrag = (event, block) => {
    if (event.button !== 0 || event.target.closest('button')) return;

    const timeline = timelineRef.current;
    if (!timeline) return;

    const pointerMinutes = pointerMinutesOnSchedule(event, timeline);
    const startMinutes = parseScheduleTime(block.start_time);
    const endMinutes = parseScheduleTime(block.end_time);
    const durationMinutes = Math.max(15, endMinutes - startMinutes || 60);

    event.preventDefault();
    setSelectedBlockId(block.id);
    const nextDrag = {
      id: block.id,
      title: block.title,
      durationMinutes,
      offsetMinutes: Math.max(0, Math.min(durationMinutes, pointerMinutes - startMinutes)),
      start_time: block.start_time,
      end_time: block.end_time
    };
    dragRef.current = nextDrag;
    setDrag(nextDrag);
  };

  useEffect(() => {
    if (!drag) return undefined;

    const moveBlock = (event) => {
      const current = dragRef.current;
      const timeline = timelineRef.current;
      if (!current || !timeline) return;

      const pointerMinutes = pointerMinutesOnSchedule(event, timeline);
      const nextStart = snapScheduleMinutes(Math.max(
        SCHEDULE_START_MINUTES,
        Math.min(SCHEDULE_END_MINUTES - current.durationMinutes, pointerMinutes - current.offsetMinutes)
      ));
      const nextEnd = nextStart + current.durationMinutes;

      const nextDrag = {
        ...current,
        start_time: formatScheduleTime(nextStart),
        end_time: formatScheduleTime(nextEnd)
      };
      dragRef.current = nextDrag;
      setDrag(nextDrag);
    };

    const finishDrag = async () => {
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!current) return;

      await frodigyApi.schedule.update({
        id: current.id,
        title: current.title,
        start_time: current.start_time,
        end_time: current.end_time
      });
      actions.refresh();
    };

    window.addEventListener('pointermove', moveBlock);
    window.addEventListener('pointerup', finishDrag, { once: true });
    return () => {
      window.removeEventListener('pointermove', moveBlock);
      window.removeEventListener('pointerup', finishDrag);
    };
  }, [drag?.id, actions]);

  return (
    <div>
      <PageHeader title="Schedule" subtitle="A daily timeline with visible free space." actions={<PrimaryButton onClick={actions.openSchedule}><Plus className="h-4 w-4" /> Add Time Block <ShortcutBadge>S</ShortcutBadge></PrimaryButton>} />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel className="overflow-hidden p-0">
          <div className="border-b border-border bg-editor/60 px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-primary">General Day Routine</div>
                <div className="mt-1 text-xs text-muted">05:00 to 22:00 · 15-minute intervals</div>
              </div>
              <StatusChip tone="accent">Quarter-hour scale</StatusChip>
            </div>
          </div>
          <div className="app-scroll max-h-[720px] overflow-y-auto overflow-x-hidden">
            <div className="min-w-[680px] py-5">
              <div className="grid grid-cols-[88px_minmax(0,1fr)]">
                <div className="relative border-r border-border" style={{ height: `${SCHEDULE_CANVAS_HEIGHT}px` }}>
                  {SCHEDULE_TICKS.map((minutes) => (
                    <span
                      key={minutes}
                      className={cn(
                        'absolute right-4 -translate-y-1/2 font-mono text-[13px] font-semibold',
                        minutes % 60 === 0 ? 'text-secondary' : 'text-muted'
                      )}
                      style={{ top: `${scheduleMinuteOffsetPixels(minutes)}px` }}
                    >
                      {formatScheduleTime(minutes)}
                    </span>
                  ))}
                </div>
                <div ref={timelineRef} className="relative touch-none" style={{ height: `${SCHEDULE_CANVAS_HEIGHT}px` }}>
                  {SCHEDULE_TICKS.map((minutes) => (
                    <div
                      key={minutes}
                      className={cn(
                        'pointer-events-none absolute left-0 right-0',
                        minutes % 60 === 0 ? 'h-px bg-border-strong' : minutes % 30 === 0 ? 'h-px bg-border' : 'h-px bg-border/45'
                      )}
                      style={{ top: `${scheduleMinuteOffsetPixels(minutes)}px` }}
                    />
                  ))}
                  {schedule.length === 0 ? (
                    <div className="absolute inset-x-5 top-24">
                      <EmptyState icon={Clock3} title="Your timeline is open" description="Add routines in precise 15-minute steps to shape a general day." action={<SecondaryButton onClick={actions.openSchedule}>Add first block</SecondaryButton>} />
                    </div>
                  ) : null}
                  {scheduleLayout.map((layout) => (
                    <ScheduleBlock
                      key={layout.block.id}
                      layout={layout}
                      selected={selectedBlockId === layout.block.id}
                      dragging={drag?.id === layout.block.id}
                      onSelect={() => selectScheduleBlock(layout.block.id)}
                      onPointerDown={(event) => startBlockDrag(event, layout.block)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Panel>
        <Panel className="self-start xl:sticky xl:top-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-primary">Today&apos;s Agenda</h2>
              <p className="mt-2 text-sm leading-6 text-secondary">Drag timeline blocks to reschedule them in 15-minute steps.</p>
            </div>
            <StatusChip tone={scheduleForDisplay.length ? 'accent' : 'neutral'}>{scheduleForDisplay.length}</StatusChip>
          </div>
          <div className="mt-5 max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {scheduleForDisplay.length ? scheduleForDisplay.map((block) => (
              <ScheduleAgendaItem
                key={block.id}
                block={block}
                selected={selectedBlockId === block.id}
                onSelect={() => selectScheduleBlock(block.id, true)}
                onDelete={() => frodigyApi.schedule.delete(block.id).then(actions.refresh)}
              />
            )) : <EmptyState icon={Clock3} title="No time blocks" description="Add a block to shape today's schedule." />}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ScheduleBlock({ layout, selected, dragging, onSelect, onPointerDown }) {
  const { block, laneIndex, laneCount } = layout;
  const durationMinutes = scheduleDurationMinutes(block);
  const compact = durationMinutes === 15;
  const label = `${block.title}, ${block.start_time} to ${block.end_time}`;
  const laneWidth = 100 / laneCount;
  return (
    <div
      className={cn(
        'absolute cursor-grab overflow-hidden border border-accent/25 bg-accent/10 text-accent shadow-soft transition active:cursor-grabbing',
        compact ? 'rounded-lg' : 'rounded-xl',
        selected ? 'border-accent/70 bg-accent/20 shadow-focus' : 'hover:border-accent/45 hover:bg-accent/15',
        dragging ? 'z-20' : 'z-10'
      )}
      style={{
        top: `${scheduleTimeOffsetPixels(block.start_time) + 2}px`,
        height: `${Math.max(SCHEDULE_SLOT_HEIGHT - 4, scheduleDurationPixels(block) - 4)}px`,
        left: `calc(${laneIndex * laneWidth}% + 5px)`,
        width: `calc(${laneWidth}% - 10px)`
      }}
      title={label}
      role="button"
      tabIndex="0"
      aria-label={label}
      data-schedule-block-id={block.id}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      onPointerDown={onPointerDown}
    >
      <div className="flex h-full min-h-8 items-center gap-2 px-3">
        <GripVertical className="h-4 w-4 shrink-0 text-accent/70" />
        <div className="min-w-0 flex-1 truncate text-sm font-extrabold">{block.title}</div>
        {!compact && laneCount === 1 ? <div className="shrink-0 font-mono text-[12px] font-bold text-accent/75">{block.start_time} - {block.end_time}</div> : null}
      </div>
    </div>
  );
}

function ScheduleAgendaItem({ block, selected, onSelect, onDelete }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-control border p-3 transition', selected ? 'border-accent/50 bg-accent/10 shadow-focus' : 'border-border bg-raised hover:border-border-strong')}>
      <button type="button" className="min-w-0 flex-1 text-left focus:outline-none" onClick={onSelect}>
        <div className="truncate text-sm font-extrabold text-primary">{block.title}</div>
        <div className="mt-1 flex items-center gap-2 font-mono text-[11px] font-semibold text-muted">
          <span>{block.start_time} - {block.end_time}</span>
          <span>·</span>
          <span>{formatScheduleDuration(scheduleDurationMinutes(block))}</span>
        </div>
      </button>
      <IconButton className="h-8 w-8 shrink-0 rounded-lg" label="Delete schedule block" variant="ghost" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></IconButton>
    </div>
  );
}

const SCHEDULE_START_MINUTES = 5 * 60;
const SCHEDULE_END_MINUTES = 22 * 60;
const SCHEDULE_SLOT_MINUTES = 15;
const SCHEDULE_SLOT_HEIGHT = 38;
const SCHEDULE_TOTAL_MINUTES = SCHEDULE_END_MINUTES - SCHEDULE_START_MINUTES;
const SCHEDULE_CANVAS_HEIGHT = (SCHEDULE_TOTAL_MINUTES / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_HEIGHT;
const SCHEDULE_TICKS = Array.from(
  { length: (SCHEDULE_TOTAL_MINUTES / SCHEDULE_SLOT_MINUTES) + 1 },
  (_, index) => SCHEDULE_START_MINUTES + (index * SCHEDULE_SLOT_MINUTES)
);

function parseScheduleTime(time) {
  const [hour, minute] = String(time || '00:00').split(':').map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function formatScheduleTime(minutes) {
  const safeMinutes = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function pointerMinutesOnSchedule(event, element) {
  const rect = element.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  return SCHEDULE_START_MINUTES + ratio * SCHEDULE_TOTAL_MINUTES;
}

function snapScheduleMinutes(minutes) {
  return Math.round(minutes / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES;
}

function scheduleDurationMinutes(block) {
  return Math.max(0, parseScheduleTime(block.end_time) - parseScheduleTime(block.start_time));
}

function scheduleMinuteOffsetPixels(minutes) {
  return ((minutes - SCHEDULE_START_MINUTES) / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_HEIGHT;
}

function scheduleTimeOffsetPixels(time) {
  return scheduleMinuteOffsetPixels(parseScheduleTime(time));
}

function scheduleDurationPixels(block) {
  return (scheduleDurationMinutes(block) / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_HEIGHT;
}

function layoutScheduleBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => parseScheduleTime(a.start_time) - parseScheduleTime(b.start_time));
  const groups = [];
  let group = [];
  let groupEnd = -1;

  for (const block of sorted) {
    const start = parseScheduleTime(block.start_time);
    const end = parseScheduleTime(block.end_time);
    if (group.length && start >= groupEnd) {
      groups.push(group);
      group = [];
      groupEnd = -1;
    }
    group.push(block);
    groupEnd = Math.max(groupEnd, end);
  }
  if (group.length) groups.push(group);

  return groups.flatMap((overlapGroup) => {
    const laneEnds = [];
    const positioned = overlapGroup.map((block) => {
      const start = parseScheduleTime(block.start_time);
      const end = parseScheduleTime(block.end_time);
      let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (laneIndex === -1) laneIndex = laneEnds.length;
      laneEnds[laneIndex] = end;
      return { block, laneIndex };
    });
    const laneCount = Math.max(1, laneEnds.length);
    return positioned.map((item) => ({ ...item, laneCount }));
  });
}

function formatScheduleDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  if (!remainder) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function TimersPage({ refreshKey, actions }) {
  const [timers, setTimers] = useState([]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    frodigyApi.timers.list().then((rows) => setTimers(rows.map(normalizeTimer)));
  }, [refreshKey]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimers((current) => current.map((timer) => timer.state === 'running' ? { ...timer, remainingMs: Math.max(0, new Date(timer.ends_at).getTime() - Date.now()) } : timer));
    }, 300);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onKeyDown = async (event) => {
      if (isTypingTarget(event.target)) return;
      if (!['j', 'k', 'ArrowDown', 'ArrowUp', ' ', 'r', 'R', 'Delete'].includes(event.key)) return;
      if (!timers.length) return;

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        setSelected((index) => Math.min(timers.length - 1, index + 1));
      }
      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected((index) => Math.max(0, index - 1));
      }
      if (event.key === ' ') {
        event.preventDefault();
        await toggleTimer(timers[selected]);
        actions.refresh();
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        await resetTimer(timers[selected]);
        actions.refresh();
      }
      if (event.key === 'Delete') {
        event.preventDefault();
        await frodigyApi.timers.delete(timers[selected].id);
        actions.refresh();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [timers, selected, actions]);

  return (
    <div>
      <PageHeader title="Timers" subtitle="Focused work sessions with visible state and keyboard controls." actions={<PrimaryButton onClick={actions.openTimer}><Plus className="h-4 w-4" /> New Timer <ShortcutBadge>T</ShortcutBadge></PrimaryButton>} />
      {timers.length ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {timers.map((timer, index) => (
            <TimerCard
              key={timer.id}
              timer={timer}
              selected={index === selected}
              onSelect={() => setSelected(index)}
              onToggle={() => toggleTimer(timer).then(actions.refresh)}
              onReset={() => resetTimer(timer).then(actions.refresh)}
              onDelete={() => frodigyApi.timers.delete(timer.id).then(actions.refresh)}
            />
          ))}
        </div>
      ) : (
        <EmptyState icon={Timer} title="No timers yet" description="Create a timer for deep work, breaks, study blocks, or reminders." action={<PrimaryButton onClick={actions.openTimer}>Create Timer</PrimaryButton>} />
      )}
    </div>
  );
}

function normalizeTimer(timer) {
  return {
    ...timer,
    remainingMs: timer.state === 'running' && timer.ends_at
      ? Math.max(0, new Date(timer.ends_at).getTime() - Date.now())
      : (timer.remaining_seconds || timer.duration_seconds) * 1000
  };
}

function TimerCard({ timer, selected, onSelect, onToggle, onReset, onDelete }) {
  const progress = timer.duration_seconds ? Math.max(0, Math.min(1, 1 - timer.remainingMs / (timer.duration_seconds * 1000))) : 0;
  const tone = timer.state === 'running' ? 'success' : timer.state === 'paused' ? 'warning' : timer.state === 'completed' ? 'accent' : 'neutral';
  return (
    <Panel className={cn('cursor-pointer transition', selected ? 'border-accent/60 shadow-focus' : 'hover:border-border-strong')} onClick={onSelect}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-primary">{timer.name}</h3>
          <p className="mt-1 text-sm text-muted">{formatDuration(timer.duration_seconds)}</p>
        </div>
        <StatusChip tone={tone}>{timer.state}</StatusChip>
      </div>
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-editor">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="mb-5 font-mono text-5xl font-bold tracking-[-0.05em] text-primary">{timerText(timer.remainingMs)}</div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={(event) => { event.stopPropagation(); onToggle(); }}>{timer.state === 'running' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
        <IconButton label="Reset timer" onClick={(event) => { event.stopPropagation(); onReset(); }}><RefreshCcw className="h-4 w-4" /></IconButton>
        <IconButton label="Delete timer" variant="danger" onClick={(event) => { event.stopPropagation(); onDelete(); }}><Trash2 className="h-4 w-4" /></IconButton>
      </div>
    </Panel>
  );
}

async function toggleTimer(timer) {
  if (!timer) return;
  if (timer.state === 'running') {
    const remainingSeconds = Math.ceil(timer.remainingMs / 1000);
    await frodigyApi.timers.updateState({ timerId: timer.id, state: 'paused', startedAt: null, endsAt: null, remainingSeconds });
  } else {
    const remainingMs = timer.remainingMs || timer.duration_seconds * 1000;
    const endsAt = new Date(Date.now() + remainingMs).toISOString();
    await frodigyApi.timers.updateState({ timerId: timer.id, state: 'running', startedAt: new Date().toISOString(), endsAt, remainingSeconds: Math.ceil(remainingMs / 1000) });
  }
}

async function resetTimer(timer) {
  if (!timer) return;
  await frodigyApi.timers.updateState({ timerId: timer.id, state: 'idle', startedAt: null, endsAt: null, remainingSeconds: timer.duration_seconds });
}

function CompletedPage({ refreshKey, actions }) {
  const [tasks] = useAsync(() => frodigyApi.completed.list(), [refreshKey], []);
  return (
    <div>
      <PageHeader title="Completed" subtitle="Finished milestones remain local and can be reopened at any time." />
      <Panel>
        {tasks.length ? (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between rounded-card border border-border bg-raised p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <div>
                    <div className="font-bold text-primary">{task.title}</div>
                    <div className="text-sm text-muted">Created {task.created_date || task.created_at?.slice(0, 10) || 'unknown'} · {task.completion_days ?? 0} days</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip tone="success">{task.completed_date || task.completed_at?.slice(0, 10) || 'done'}</StatusChip>
                  <SecondaryButton onClick={async () => { await frodigyApi.projects.reopen(task.id); actions.refresh(); }}><RotateCcw className="h-4 w-4" /> Reopen</SecondaryButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title="No completed tasks" description="Completed one-time tasks will appear here." />
        )}
      </Panel>
    </div>
  );
}

function SummaryPage({ refreshKey, actions }) {
  const [stats] = useAsync(() => frodigyApi.stats.summary(), [refreshKey], { today: {}, allTime: {}, recentActivities: [], recentSessions: [], timeline: [] });
  const [consistency] = useAsync(() => frodigyApi.journey.consistency(), [refreshKey], { totalOpens: 0, openedThisMonthDays: 0, openedToday: false });
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [history] = useAsync(() => frodigyApi.journey.history({ query: historyQuery, page: historyPage, pageSize: 8 }), [refreshKey, historyQuery, historyPage], { items: [], total: 0, page: 1, totalPages: 1 });
  const [projects] = useAsync(() => frodigyApi.projects.completed({ limit: 30 }), [refreshKey], { items: [], total: 0 });
  const [form, setForm] = useState({ activityDate: formatDateISO(new Date()), title: '', category: 'Study', durationMinutes: 30, progressNote: '' });

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    await frodigyApi.activities.create(form);
    setForm({ activityDate: formatDateISO(new Date()), title: '', category: 'Study', durationMinutes: 30, progressNote: '' });
    actions.refresh();
  };

  return (
    <div>
      <PageHeader title="Journey Summary" subtitle="Searchable local history of daily routines, completed milestones, focus, and consistency." />
      <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total app opens" value={consistency.totalOpens || 0} icon={Compass} tone="accent" />
        <StatCard label="Opened this month" value={`${consistency.openedThisMonthDays || 0} days`} icon={CalendarDays} />
        <StatCard label="Opened today" value={consistency.openedToday ? 'Yes' : 'No'} icon={CheckCircle2} tone={consistency.openedToday ? 'success' : 'neutral'} />
        <StatCard label="Completed milestones" value={projects.total || 0} icon={ShieldCheck} tone="success" />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Panel>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold text-primary">Daily Activity History</h2>
              <p className="mt-1 text-sm text-secondary">Search tracked days by full ISO date or life-day number.</p>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
              <TextInput className="pl-9" value={historyQuery} onChange={(event) => { setHistoryQuery(event.target.value); setHistoryPage(1); }} placeholder="2026-06-07 or 7537" />
            </div>
          </div>
          {history.items?.length ? (
            <div className="space-y-3">
              {history.items.map((day) => (
                <div key={day.activity_date} className="rounded-card border border-border bg-raised p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm font-extrabold text-accent">{day.life_day_number ? `Day ${day.life_day_number}` : 'Life day not set'}</div>
                      <div className="mt-1 font-bold text-primary">{day.activity_date}</div>
                    </div>
                    <StatusChip tone={day.full_completion ? 'success' : 'neutral'}>{day.completed_count}/{day.expected_count} · All complete: {day.full_completion ? 'Yes' : 'No'}</StatusChip>
                  </div>
                  <div className="mt-3">
                    <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">Completed recurring tasks</div>
                    <div className="flex flex-wrap gap-2">
                      {day.tasks?.some((task) => task.completed)
                        ? day.tasks.filter((task) => task.completed).map((task) => <StatusChip key={task.task_id} tone="success">{task.task_title}</StatusChip>)
                        : <span className="text-sm text-muted">No recurring tasks were completed on this tracked day.</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2">
                <SecondaryButton disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}><ChevronLeft className="h-4 w-4" /> Previous</SecondaryButton>
                <span className="text-sm font-semibold text-muted">Page {history.page || 1} of {history.totalPages || 1}</span>
                <SecondaryButton disabled={historyPage >= (history.totalPages || 1)} onClick={() => setHistoryPage((page) => page + 1)}>Next <ChevronRight className="h-4 w-4" /></SecondaryButton>
              </div>
            </div>
          ) : <EmptyState icon={CalendarDays} title="No matching tracked days" description="Frodigy creates history for days when the app is opened or used." />}
        </Panel>

        <Panel>
          <h2 className="mb-1 text-lg font-extrabold text-primary">Completed Milestones</h2>
          <p className="mb-5 text-sm text-secondary">Permanent until you intentionally reopen them.</p>
          {projects.items?.length ? (
            <div className="space-y-3">
              {projects.items.map((task) => (
                <div key={task.id} className="rounded-card border border-border bg-raised p-4">
                  <div className="font-bold text-primary">{task.title}</div>
                  <div className="mt-2 space-y-1 text-xs text-muted">
                    <div>Created: {task.created_date || task.created_at?.slice(0, 10)}</div>
                    <div>Completed: {task.completed_date || task.completed_at?.slice(0, 10)}</div>
                    <div>Time taken: {task.completion_days ?? 0} days</div>
                  </div>
                  <SecondaryButton className="mt-3 w-full" onClick={async () => { await frodigyApi.projects.reopen(task.id); actions.refresh(); }}><RotateCcw className="h-4 w-4" /> Reopen Project</SecondaryButton>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={CheckCircle2} title="No completed milestones" description="Committed one-time projects will appear here after their grace period." />}
        </Panel>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tasks Today" value={stats.today.tasksCompleted || 0} icon={CheckCircle2} tone="success" />
        <StatCard label="Focus Today" value={formatDuration(stats.today.timerSeconds || 0)} icon={Timer} tone="accent" />
        <StatCard label="Activities" value={stats.today.activitiesLogged || 0} icon={Activity} />
        <StatCard label="Activity Time" value={formatMinutes(stats.today.activityMinutes || 0)} icon={Gauge} />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-extrabold text-primary">Log Activity</h2>
          <form className="space-y-4" onSubmit={submit}>
            <Field label="Date"><TextInput type="date" value={form.activityDate} onChange={(event) => setForm({ ...form, activityDate: event.target.value })} /></Field>
            <Field label="Title"><TextInput value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="What did you work on?" /></Field>
            <Field label="Category"><Select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{['Study', 'Work', 'Health', 'Creative', 'General'].map((item) => <option key={item}>{item}</option>)}</Select></Field>
            <Field label="Minutes"><TextInput type="number" min="0" max="1440" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} /></Field>
            <Field label="Progress Note"><TextArea value={form.progressNote} onChange={(event) => setForm({ ...form, progressNote: event.target.value })} /></Field>
            <PrimaryButton type="submit" className="w-full">Add Activity</PrimaryButton>
          </form>
        </Panel>
        <Panel>
          <h2 className="mb-4 text-lg font-extrabold text-primary">Progress Timeline</h2>
          {stats.timeline?.length ? (
            <div className="space-y-3">
              {stats.timeline.map((item, index) => (
                <div key={`${item.type}-${index}`} className="rounded-card border border-border bg-raised p-4">
                  <div className="mb-2 flex items-center gap-2"><StatusChip tone={item.type === 'activity' ? 'accent' : 'neutral'}>{item.type}</StatusChip><span className="text-sm text-muted">{formatTime(item.occurredAt)}</span></div>
                  <div className="font-bold text-primary">{item.title}</div>
                  <div className="mt-1 text-sm text-secondary">{item.meta}</div>
                  {item.note ? <div className="mt-2 text-sm leading-6 text-muted">{item.note}</div> : null}
                </div>
              ))}
            </div>
          ) : <EmptyState icon={BarChart3} title="No progress yet" description="Log activities, complete tasks, or finish timers to build a timeline." />}
        </Panel>
      </div>
    </div>
  );
}

function SettingsPage({ refreshKey, actions }) {
  const [settings, setSettings] = useAsync(() => frodigyApi.settings.getAll(), [refreshKey], {});
  const [profile] = useAsync(() => frodigyApi.journey.profile(), [refreshKey], { preferredName: '', dateOfBirth: '', lifeDayNumber: null });
  const [locations] = useAsync(() => frodigyApi.data.locations(), [refreshKey], { databasePath: '', backupPath: '', userDataPath: '' });
  const [dataHealth] = useAsync(() => frodigyApi.data.health(), [refreshKey], { status: 'ok', message: 'Local data is healthy.' });
  const [profileForm, setProfileForm] = useState({ preferredName: '', dateOfBirth: '' });
  const [profileStatus, setProfileStatus] = useState('');
  const [dataStatus, setDataStatus] = useState('');
  const [status, setStatus] = useState('Check for the latest version');

  useEffect(() => {
    setProfileForm({
      preferredName: profile.preferredName || '',
      dateOfBirth: profile.dateOfBirth || ''
    });
  }, [profile.preferredName, profile.dateOfBirth]);

  const setValue = async (key, value) => {
    await frodigyApi.settings.set(key, String(value));
    setSettings({ ...settings, [key]: String(value) });
  };
  const saveProfile = async () => {
    const result = await frodigyApi.journey.updateProfile(profileForm);
    if (!result?.ok) {
      setProfileStatus(result?.error || 'Unable to save profile.');
      return;
    }
    setProfileStatus(`Saved. Today is Day ${result.profile.lifeDayNumber || 'not set'}.`);
    actions.refresh();
  };
  const runDataAction = async (label, action) => {
    setDataStatus(`${label}...`);
    const result = await action();
    if (result?.canceled) {
      setDataStatus('Action canceled. No local data changed.');
    } else if (result?.success) {
      setDataStatus(result.filePath ? `Saved: ${result.filePath}` : `${label} completed.`);
      actions.refresh();
      if (label === 'Import backup') window.location.reload();
    } else {
      setDataStatus(result?.error || `${label} failed.`);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Personal profile, local data protection, desktop preferences, and release information." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel className="xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-card border border-accent/20 bg-editor">
                <img src={appLogo} alt="Frodigy" className="h-14 w-14 object-contain" draggable="false" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-primary">Frodigy</h2>
                <p className="mt-1 text-sm text-secondary">Desktop icon, tray icon, window icon, and in-app identity use the same packaged logo.</p>
              </div>
            </div>
            <StatusChip tone="accent">v{frodigyApi.version()}</StatusChip>
          </div>
        </Panel>
        <Panel>
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold text-primary">Personal Profile</h2>
              <p className="mt-1 text-sm text-secondary">Used only for your local journey greeting and life-day calculation.</p>
            </div>
            <StatusChip tone="accent">{profile.lifeDayNumber ? `Day ${profile.lifeDayNumber}` : 'Not configured'}</StatusChip>
          </div>
          <div className="space-y-4">
            <Field label="Preferred name">
              <TextInput maxLength="80" value={profileForm.preferredName} onChange={(event) => setProfileForm({ ...profileForm, preferredName: event.target.value })} placeholder="Preferred name" />
            </Field>
            <Field label="Date of birth">
              <TextInput type="date" value={profileForm.dateOfBirth} max={formatDateISO(new Date())} onChange={(event) => setProfileForm({ ...profileForm, dateOfBirth: event.target.value })} />
            </Field>
            {profileStatus ? <div className="rounded-control border border-border bg-editor px-3 py-2 text-sm text-secondary">{profileStatus}</div> : null}
            <PrimaryButton className="w-full" onClick={saveProfile}>Save Profile</PrimaryButton>
          </div>
        </Panel>

        <Panel>
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold text-primary">Data & Backup</h2>
              <p className="mt-1 text-sm text-secondary">Human-readable JSON backups stay entirely on this device.</p>
            </div>
            <Database className="h-5 w-5 text-accent" />
          </div>
          {dataHealth.status !== 'ok' ? (
            <div className="mb-4 rounded-card border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-warning">{dataHealth.message}</div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SecondaryButton onClick={() => runDataAction('Export backup', frodigyApi.data.exportBackup)}><Download className="h-4 w-4" /> Export Backup</SecondaryButton>
            <SecondaryButton onClick={() => runDataAction('Create local backup', frodigyApi.data.createBackup)}><ShieldCheck className="h-4 w-4" /> Create Backup</SecondaryButton>
            <SecondaryButton onClick={() => runDataAction('Import backup', frodigyApi.data.importBackup)}><Upload className="h-4 w-4" /> Import / Restore</SecondaryButton>
            <SecondaryButton onClick={() => frodigyApi.data.openFolder('data')}><FolderOpen className="h-4 w-4" /> Open Data Folder</SecondaryButton>
            <SecondaryButton className="sm:col-span-2" onClick={() => frodigyApi.data.openFolder('backups')}><FolderOpen className="h-4 w-4" /> Open Backup Folder</SecondaryButton>
          </div>
          <div className="mt-4 space-y-2 rounded-card border border-border bg-editor p-4 text-xs leading-5 text-muted">
            <div><span className="font-bold text-secondary">Database:</span> {locations.databasePath || 'Loading...'}</div>
            <div><span className="font-bold text-secondary">Backups:</span> {locations.backupPath || 'Loading...'}</div>
          </div>
          {dataStatus ? <div className="mt-4 rounded-control border border-border bg-raised px-3 py-2 text-sm text-secondary">{dataStatus}</div> : null}
          <p className="mt-4 text-sm leading-6 text-secondary">Your productivity data is stored locally on this device. Backups are created only when you export them manually. No task, project, summary, or usage data is sent outside your device.</p>
        </Panel>
        <Panel>
          <h2 className="mb-5 text-lg font-extrabold text-primary">Appearance</h2>
          <div className="space-y-3">
            {[
              ['neon_abyss', 'Amber Abyss'],
              ['warm_light', 'Warm Light'],
              ['high_contrast', 'High Contrast']
            ].map(([id, label]) => (
              <button key={id} className={cn('flex w-full items-center justify-between rounded-card border p-4 text-left', (settings.theme || 'neon_abyss') === id ? 'border-accent/50 bg-accent/10' : 'border-border bg-raised')} onClick={() => setValue('theme', id)}>
                <span className="font-bold text-primary">{label}</span>
                {(settings.theme || 'neon_abyss') === id ? <StatusChip tone="accent">Active</StatusChip> : null}
              </button>
            ))}
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-5 text-lg font-extrabold text-primary">General</h2>
          <div className="space-y-5">
            <Field label="Weekend Mode">
              <Select value={settings.weekend_mode || 'saturday'} onChange={(event) => setValue('weekend_mode', event.target.value)}>
                <option value="saturday">Saturday Only</option>
                <option value="saturday_sunday">Saturday & Sunday</option>
              </Select>
            </Field>
            <button
              type="button"
              role="switch"
              aria-checked={settings.start_with_windows === 'true'}
              className="flex w-full items-center justify-between gap-4 rounded-card border border-border bg-raised p-4 text-left transition hover:border-border-strong focus:outline-none focus-visible:shadow-focus"
              onClick={() => setValue('start_with_windows', settings.start_with_windows === 'true' ? 'false' : 'true')}
            >
              <span>
                <span className="block font-bold text-primary">Start with Windows</span>
                <span className="mt-1 block text-sm text-muted">Keep this off unless you want Frodigy to launch quietly at sign-in.</span>
              </span>
              <span className={cn(
                'relative h-7 w-12 shrink-0 rounded-full border transition',
                settings.start_with_windows === 'true' ? 'border-success/50 bg-success/25' : 'border-border-strong bg-editor'
              )}>
                <span className={cn(
                  'absolute top-1 h-5 w-5 rounded-full bg-primary transition',
                  settings.start_with_windows === 'true' ? 'left-6 bg-success' : 'left-1 bg-muted'
                )} />
              </span>
            </button>
            <div className="rounded-card border border-border bg-raised p-4">
              <div className="mb-3 flex items-center justify-between"><span className="font-bold text-primary">Version</span><StatusChip>v{frodigyApi.version()}</StatusChip></div>
              <p className="mb-4 text-sm text-secondary">{status}</p>
              <div className="flex gap-2">
                <SecondaryButton onClick={async () => { setStatus('Checking...'); const result = await frodigyApi.app.checkForUpdates(); setStatus(result.success ? (result.hasUpdate ? `Update available: v${result.latestVersion}` : 'You are running the latest version') : `Unable to check: ${result.error}`); }}>Check Updates</SecondaryButton>
                <SecondaryButton onClick={() => frodigyApi.app.openExternal('https://github.com/UnExplainableFish52/Frodigy/releases')}>Releases</SecondaryButton>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function AboutPage() {
  return (
    <div>
      <PageHeader title="About Frodigy" subtitle="Offline-first productivity for daily growth." />
      <Panel className="overflow-hidden">
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-card border border-accent/20 bg-editor">
              <img src={appLogo} alt="Frodigy" className="h-14 w-14 object-contain" draggable="false" />
            </div>
            <h2 className="text-3xl font-extrabold text-primary">Frodigy</h2>
            <p className="mt-3 text-base leading-7 text-secondary">A calm desktop command center for planning the day, logging activities, managing reminders, and tracking progress over time.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Feature title="Private by design" text="SQLite storage stays local on your machine." icon={FileText} />
            <Feature title="Keyboard-first" text="Command menu, shortcuts, and selected row actions keep flow fast." icon={Command} />
            <Feature title="Progress oriented" text="Tasks, activities, timers, notes, and completions form a timeline." icon={BarChart3} />
            <Feature title="Desktop native" text="Electron shell, tray behavior, and system notifications remain intact." icon={AlarmClock} />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function Feature({ title, text, icon: Icon }) {
  return (
    <div className="rounded-card border border-border bg-raised p-5">
      <Icon className="mb-4 h-5 w-5 text-accent" />
      <h3 className="font-bold text-primary">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-secondary">{text}</p>
    </div>
  );
}

function CommandMenu({ open, setOpen, actions }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const commands = useMemo(() => ([
    {
      id: 'create-task',
      label: 'Create new task',
      keywords: ['task', 'todo', 'capture', 'new'],
      shortcut: 'N',
      icon: Plus,
      action: () => actions.openTask('one_time')
    },
    {
      id: 'create-timer',
      label: 'Create new timer',
      keywords: ['timer', 'focus', 'session', 'clock'],
      shortcut: 'T',
      icon: Timer,
      action: actions.openTimer
    },
    {
      id: 'create-journal-log',
      label: 'Create new journal log',
      keywords: ['journal', 'note', 'log', 'daily', 'write'],
      shortcut: 'Shift+N',
      icon: BookOpen,
      action: actions.focusJournal
    },
    {
      id: 'search-journal',
      label: 'Search journal',
      keywords: ['journal', 'notes', 'search', 'calendar'],
      icon: Search,
      action: actions.focusJournal
    },
    {
      id: 'go-dashboard',
      label: 'Go to dashboard',
      keywords: ['home', 'dashboard', 'today'],
      shortcut: 'Ctrl+1',
      icon: Home,
      action: () => actions.navigate('dashboard')
    },
    {
      id: 'go-tasks',
      label: 'Go to tasks',
      keywords: ['tasks', 'todo', 'focus', 'dashboard'],
      icon: ListChecks,
      action: () => actions.navigate('dashboard')
    },
    {
      id: 'go-timer',
      label: 'Go to timer',
      keywords: ['timers', 'focus', 'clock'],
      shortcut: 'Ctrl+4',
      icon: Timer,
      action: () => actions.navigate('timers')
    },
    {
      id: 'go-schedule',
      label: 'Go to schedule',
      keywords: ['schedule', 'block', 'timeline'],
      shortcut: 'Ctrl+3',
      icon: Clock3,
      action: () => actions.navigate('schedule')
    },
    {
      id: 'go-settings',
      label: 'Go to settings',
      keywords: ['settings', 'preferences', 'options'],
      shortcut: 'Ctrl+7',
      icon: Settings,
      action: () => actions.navigate('settings')
    }
  ]), [actions]);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = commands.filter((command) => {
    const haystack = [command.label, ...(command.keywords || [])].join(' ').toLowerCase();
    return !normalizedQuery || haystack.includes(normalizedQuery);
  });
  const selectedCommand = filtered[selected];

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    setSelected((index) => (filtered.length ? Math.min(index, filtered.length - 1) : 0));
  }, [filtered.length]);

  const executeCommand = (command = selectedCommand) => {
    if (!command) return;
    setOpen(false);
    setQuery('');
    window.requestAnimationFrame(() => command.action());
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((index) => Math.min(filtered.length - 1, index + 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((index) => Math.max(0, index - 1));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      executeCommand();
    }
  };

  return (
    <Modal open={open} onOpenChange={setOpen} title="Command Menu">
      <div className="mb-4 flex items-center gap-3 rounded-control border border-border bg-editor px-3">
        <Search className="h-4 w-4 text-muted" />
        <input
          ref={inputRef}
          className="h-11 flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command..."
          autoFocus
        />
        <ShortcutBadge>Enter</ShortcutBadge>
      </div>
      <div className="max-h-[380px] space-y-2 overflow-y-auto">
        {filtered.length ? filtered.map((command, index) => {
          const Icon = command.icon;
          return (
          <button
            key={command.id}
            type="button"
            className={cn(
              'flex w-full items-center gap-3 rounded-control border px-3 py-3 text-left text-sm font-semibold transition focus:outline-none',
              index === selected ? 'border-accent/40 bg-raised text-primary shadow-focus' : 'border-transparent text-secondary hover:bg-raised hover:text-primary'
            )}
            onMouseEnter={() => setSelected(index)}
            onClick={() => executeCommand(command)}
          >
            <Icon className={cn('h-4 w-4', index === selected ? 'text-accent' : 'text-muted')} />
            <span className="min-w-0 flex-1 truncate">{command.label}</span>
            {command.shortcut ? <ShortcutBadge>{command.shortcut}</ShortcutBadge> : null}
          </button>
          );
        }) : <EmptyState icon={CommandEmptyIcon} title="No commands found" description="Try task, timer, journal, dashboard, or settings." />}
      </div>
    </Modal>
  );
}

function ShortcutHelp({ open, setOpen }) {
  return (
    <Modal open={open} onOpenChange={setOpen} title="Keyboard Shortcuts">
      <div className="grid gap-2">
        <ShortcutHint keys={['Ctrl', 'K']} label="Open command menu" />
        <ShortcutHint keys={['?']} label="Open shortcut help" />
        <ShortcutHint keys={['N']} label="Create task" />
        <ShortcutHint keys={['Shift', 'N']} label="Open notes" />
        <ShortcutHint keys={['T']} label="Create timer" />
        <ShortcutHint keys={['S']} label="Create schedule block" />
        <ShortcutHint keys={['J/K']} label="Move selection" />
        <ShortcutHint keys={['Space']} label="Toggle selected item" />
        <ShortcutHint keys={['Delete']} label="Delete selected item" />
        <ShortcutHint keys={['Esc']} label="Close modal or menu" />
      </div>
    </Modal>
  );
}

function TaskModal({ modal, setModal, refresh }) {
  const open = modal?.type === 'task';
  const typeOneTimeRef = useRef(null);
  const typeRecurringRef = useRef(null);
  const nameRef = useRef(null);
  const dueDateRef = useRef(null);
  const intervalRef = useRef(null);
  const recurringDateRef = useRef(null);
  const [flow, setFlow] = useState(() => createDefaultTaskFlow());

  useEffect(() => {
    if (!open) return;
    setFlow(createDefaultTaskFlow(modal?.initialTaskType));
  }, [open, modal?.initialTaskType]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      if (flow.step === 'type') {
        (flow.taskType === 'recurring' ? typeRecurringRef.current : typeOneTimeRef.current)?.focus();
      }
      if (flow.step === 'name') nameRef.current?.focus();
      if (flow.step === 'due-date') dueDateRef.current?.focus();
      if (flow.step === 'interval') intervalRef.current?.focus();
      if (flow.step === 'recurring-date') recurringDateRef.current?.focus();
    });
  }, [open, flow.step, flow.taskType]);

  const close = () => setModal(null);
  const updateFlow = (patch) => setFlow((current) => ({ ...current, error: '', ...patch }));
  const confirmType = () => updateFlow({ step: 'name' });
  const confirmName = () => {
    if (!flow.title.trim()) {
      updateFlow({ error: 'Task name is required.' });
      return;
    }
    updateFlow({ step: flow.taskType === 'recurring' ? 'interval' : 'due-date' });
  };
  const confirmInterval = () => {
    const interval = Number.parseInt(flow.interval, 10);
    if (!Number.isFinite(interval) || interval < 1) {
      updateFlow({ error: 'Repeat interval must be at least 1 day.' });
      return;
    }
    updateFlow({ interval: String(interval), step: 'recurring-date' });
  };
  const save = async () => {
    if (!flow.title.trim()) {
      updateFlow({ step: 'name', error: 'Task name is required.' });
      return;
    }
    const dateResult = parseTaskDateInput(flow.taskType === 'recurring' ? flow.recurringDate : flow.dueDate);
    if (!dateResult.ok) {
      updateFlow({
        step: flow.taskType === 'recurring' ? 'recurring-date' : 'due-date',
        error: dateResult.error
      });
      return;
    }
    const interval = Math.max(1, Number.parseInt(flow.interval, 10) || 1);
    await frodigyApi.tasks.create({
      title: flow.title.trim(),
      type: flow.taskType,
      recurrenceRule: flow.taskType === 'recurring' ? String(interval) : null,
      dueDate: dateResult.iso,
      reminderAt: null
    });
    setModal(null);
    refresh();
  };
  const handleShellKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }

    if (flow.step !== 'type') return;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      updateFlow({ taskType: flow.taskType === 'one_time' ? 'recurring' : 'one_time' });
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      confirmType();
    }
  };
  const onNameKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmName();
    }
    if (event.key === 'Backspace' && !flow.title) {
      event.preventDefault();
      updateFlow({ step: 'type' });
    }
  };
  const onIntervalKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmInterval();
    }
    if (event.key === 'Backspace' && !flow.interval) {
      event.preventDefault();
      updateFlow({ step: 'name' });
    }
  };
  const onDateKeyDown = (event, previousStep) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
    if (event.key === 'Backspace' && !event.currentTarget.value) {
      event.preventDefault();
      updateFlow({ step: previousStep });
    }
  };

  return (
    <Modal open={open} onOpenChange={(next) => !next && close()} title="Create Task">
      <div className="space-y-5" onKeyDown={handleShellKeyDown}>
        <div className="rounded-card border border-border bg-editor/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Step {getTaskFlowStepNumber(flow)} of {flow.taskType === 'recurring' ? 4 : 3}</span>
            <ShortcutBadge>Esc</ShortcutBadge>
          </div>
          <div className="space-y-2 text-sm">
            <TaskSummaryRow label="Type" value={flow.taskType === 'recurring' ? 'Recurring task' : 'One-time task'} active={flow.step === 'type'} />
            <TaskSummaryRow label="Name" value={flow.title || 'Not set'} active={flow.step === 'name'} muted={!flow.title} />
            {flow.taskType === 'recurring' ? (
              <>
                <TaskSummaryRow label="Repeat" value={`Every ${flow.interval || 1} day(s)`} active={flow.step === 'interval'} />
                <TaskSummaryRow label="Starts" value={flow.recurringDate} active={flow.step === 'recurring-date'} />
              </>
            ) : (
              <TaskSummaryRow label="Due" value={flow.dueDate} active={flow.step === 'due-date'} />
            )}
          </div>
        </div>

        {flow.step === 'type' ? (
          <div>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted">Choose task type</div>
            <div className="grid grid-cols-2 gap-3">
              <TaskTypeOption ref={typeOneTimeRef} selected={flow.taskType === 'one_time'} title="One-time task" description="Do it once, then it moves to completed." onClick={() => updateFlow({ taskType: 'one_time' })} onDoubleClick={confirmType} />
              <TaskTypeOption ref={typeRecurringRef} selected={flow.taskType === 'recurring'} title="Recurring task" description="A routine you can check off again." onClick={() => updateFlow({ taskType: 'recurring' })} onDoubleClick={confirmType} />
            </div>
            <p className="mt-3 text-xs text-muted">Use Left/Right to switch. Press Enter to continue.</p>
          </div>
        ) : null}

        {flow.step === 'name' ? (
          <Field label="Task name">
            <TextInput ref={nameRef} value={flow.title} onChange={(event) => updateFlow({ title: event.target.value })} onKeyDown={onNameKeyDown} placeholder="What needs to happen?" />
          </Field>
        ) : null}

        {flow.step === 'due-date' ? (
          <Field label="Due date">
            <TextInput ref={dueDateRef} value={flow.dueDate} onChange={(event) => updateFlow({ dueDate: event.target.value })} onKeyDown={(event) => onDateKeyDown(event, 'name')} placeholder="DD/MM/YYYY, today, tomorrow" />
          </Field>
        ) : null}

        {flow.step === 'interval' ? (
          <Field label="Repeat every ___ day(s)">
            <TextInput ref={intervalRef} inputMode="numeric" value={flow.interval} onChange={(event) => updateFlow({ interval: event.target.value.replace(/[^\d]/g, '') })} onKeyDown={onIntervalKeyDown} placeholder="1" />
          </Field>
        ) : null}

        {flow.step === 'recurring-date' ? (
          <Field label="Start / first due date">
            <TextInput ref={recurringDateRef} value={flow.recurringDate} onChange={(event) => updateFlow({ recurringDate: event.target.value })} onKeyDown={(event) => onDateKeyDown(event, 'interval')} placeholder="DD/MM/YYYY, today, tomorrow" />
          </Field>
        ) : null}

        {flow.error ? <div className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{flow.error}</div> : null}

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted">Enter moves forward. Backspace on an empty field goes back.</div>
          <div className="flex gap-2">
            <SecondaryButton onClick={flow.step === 'type' ? close : () => updateFlow({ step: getPreviousTaskStep(flow) })}>Back</SecondaryButton>
            <PrimaryButton onClick={flow.step === 'type' ? confirmType : flow.step === 'name' ? confirmName : flow.step === 'interval' ? confirmInterval : save}>
              {flow.step === 'due-date' || flow.step === 'recurring-date' ? 'Create' : 'Next'}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const TaskTypeOption = ReactForwardRef(function TaskTypeOption({ selected, title, description, onClick, onDoubleClick }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'rounded-card border p-4 text-left transition focus:outline-none focus-visible:shadow-focus',
        selected ? 'border-accent/50 bg-accent/10 text-primary' : 'border-border bg-raised text-secondary hover:border-border-strong hover:text-primary'
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <div className="font-extrabold">{title}</div>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
    </button>
  );
});

function TaskSummaryRow({ label, value, active, muted }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 rounded-xl px-3 py-2', active ? 'bg-raised text-primary' : 'text-secondary')}>
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className={cn('min-w-0 truncate text-right font-semibold', muted ? 'text-muted' : '')}>{value}</span>
    </div>
  );
}

function createDefaultTaskFlow(initialTaskType = 'one_time') {
  const taskType = initialTaskType === 'recurring' ? 'recurring' : 'one_time';
  const today = formatTaskDateInput(new Date());
  return {
    step: 'type',
    taskType,
    title: '',
    dueDate: today,
    interval: '1',
    recurringDate: today,
    error: ''
  };
}

function getTaskFlowStepNumber(flow) {
  const steps = flow.taskType === 'recurring'
    ? ['type', 'name', 'interval', 'recurring-date']
    : ['type', 'name', 'due-date'];
  return Math.max(1, steps.indexOf(flow.step) + 1);
}

function getPreviousTaskStep(flow) {
  if (flow.step === 'name') return 'type';
  if (flow.step === 'interval' || flow.step === 'due-date') return 'name';
  if (flow.step === 'recurring-date') return 'interval';
  return 'type';
}

function formatTaskDateInput(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function parseTaskDateInput(value, baseDate = new Date()) {
  const input = String(value || '').trim().toLowerCase();
  if (!input) return { ok: false, error: 'Enter a date, or use today/tomorrow.' };

  if (input === 'today') return { ok: true, iso: formatDateISO(baseDate) };
  if (input === 'tomorrow') {
    const tomorrow = new Date(baseDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { ok: true, iso: formatDateISO(tomorrow) };
  }

  const parts = input.split(/[\/.-]/).filter(Boolean);
  let day;
  let month;
  let year;

  if (parts.length === 1) {
    day = Number(parts[0]);
    month = baseDate.getMonth() + 1;
    year = baseDate.getFullYear();
  } else if (parts.length === 2) {
    day = Number(parts[0]);
    month = Number(parts[1]);
    year = baseDate.getFullYear();
  } else if (parts.length === 3) {
    day = Number(parts[0]);
    month = Number(parts[1]);
    year = Number(parts[2].length === 2 ? `20${parts[2]}` : parts[2]);
  } else {
    return { ok: false, error: 'Use DD/MM/YYYY, DD/MM, today, tomorrow, or a day number.' };
  }

  const parsed = new Date(year, month - 1, day);
  const valid = Number.isInteger(day) && Number.isInteger(month) && Number.isInteger(year)
    && parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day;
  if (!valid) return { ok: false, error: 'Enter a valid date.' };

  return { ok: true, iso: formatDateISO(parsed) };
}

function TimerModal({ modal, setModal, refresh }) {
  const open = modal?.type === 'timer';
  const [form, setForm] = useState({ name: '', minutes: 25 });
  const save = async () => {
    if (!form.name.trim()) return;
    await frodigyApi.timers.create({ name: form.name.trim(), durationSeconds: Math.max(1, Number(form.minutes) || 1) * 60 });
    setForm({ name: '', minutes: 25 });
    setModal(null);
    refresh();
  };
  return (
    <Modal open={open} onOpenChange={(next) => !next && setModal(null)} title="New Timer" footer={<><SecondaryButton onClick={() => setModal(null)}>Cancel</SecondaryButton><PrimaryButton onClick={save}>Create</PrimaryButton></>}>
      <div className="space-y-4">
        <Field label="Name"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Deep Work" autoFocus /></Field>
        <Field label="Minutes"><TextInput type="number" min="1" max="999" value={form.minutes} onChange={(event) => setForm({ ...form, minutes: Number(event.target.value) })} /></Field>
      </div>
    </Modal>
  );
}

function ScheduleModal({ modal, setModal, refresh }) {
  const open = modal?.type === 'schedule';
  const [form, setForm] = useState({ title: '', start_time: '09:00', duration_minutes: 60 });
  const [error, setError] = useState('');
  const startOptions = useMemo(() => SCHEDULE_TICKS.slice(0, -1), []);
  const startMinutes = parseScheduleTime(form.start_time);
  const maximumDuration = Math.max(SCHEDULE_SLOT_MINUTES, SCHEDULE_END_MINUTES - startMinutes);
  const durationOptions = useMemo(
    () => Array.from({ length: maximumDuration / SCHEDULE_SLOT_MINUTES }, (_, index) => (index + 1) * SCHEDULE_SLOT_MINUTES),
    [maximumDuration]
  );
  const endTime = formatScheduleTime(startMinutes + Number(form.duration_minutes || SCHEDULE_SLOT_MINUTES));

  useEffect(() => {
    if (open) setError('');
  }, [open]);

  useEffect(() => {
    if (Number(form.duration_minutes) > maximumDuration) {
      setForm((current) => ({ ...current, duration_minutes: maximumDuration }));
    }
  }, [form.duration_minutes, maximumDuration]);

  const save = async () => {
    if (!form.title.trim()) {
      setError('Activity name is required.');
      return;
    }
    const durationMinutes = Number(form.duration_minutes);
    const endMinutes = startMinutes + durationMinutes;
    if (startMinutes < SCHEDULE_START_MINUTES || endMinutes > SCHEDULE_END_MINUTES) {
      setError('Routine blocks must stay within the visible schedule from 05:00 to 22:00.');
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < SCHEDULE_SLOT_MINUTES || durationMinutes % SCHEDULE_SLOT_MINUTES !== 0) {
      setError('Duration must be a multiple of 15 minutes.');
      return;
    }
    await frodigyApi.schedule.create({
      title: form.title.trim(),
      start_time: form.start_time,
      end_time: formatScheduleTime(endMinutes)
    });
    setForm({ title: '', start_time: '09:00', duration_minutes: 60 });
    setError('');
    setModal(null);
    refresh();
  };
  return (
    <Modal open={open} onOpenChange={(next) => !next && setModal(null)} title="Add Time Block" footer={<><SecondaryButton onClick={() => setModal(null)}>Cancel</SecondaryButton><PrimaryButton onClick={save}>Create</PrimaryButton></>}>
      <div className="space-y-4">
        <Field label="Activity"><TextInput value={form.title} onChange={(event) => { setForm({ ...form, title: event.target.value }); setError(''); }} placeholder="Study session" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time">
            <Select value={form.start_time} onChange={(event) => { setForm({ ...form, start_time: event.target.value }); setError(''); }}>
              {startOptions.map((minutes) => <option key={minutes} value={formatScheduleTime(minutes)}>{formatScheduleTime(minutes)}</option>)}
            </Select>
          </Field>
          <Field label="Duration">
            <Select value={form.duration_minutes} onChange={(event) => { setForm({ ...form, duration_minutes: Number(event.target.value) }); setError(''); }}>
              {durationOptions.map((minutes) => <option key={minutes} value={minutes}>{formatScheduleDuration(minutes)}</option>)}
            </Select>
          </Field>
        </div>
        <div className="rounded-control border border-border bg-editor px-3 py-3">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-muted">Routine block</div>
          <div className="mt-1 font-mono text-sm font-bold text-primary">{form.start_time} - {endTime} · {formatScheduleDuration(Number(form.duration_minutes))}</div>
        </div>
        <p className="text-xs leading-5 text-muted">Routine blocks fit between 05:00 and 22:00. Start times, durations, and dragging use 15-minute steps.</p>
        {error ? <div className="rounded-control border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</div> : null}
      </div>
    </Modal>
  );
}

export default App;
