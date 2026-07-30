const MS_PER_DAY = 86400000;

export function formatDateISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function startOfLocalDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(baseDate, days) {
  const date = startOfLocalDay(baseDate);
  date.setDate(date.getDate() + days);
  return date;
}

export function localDayDifference(fromDate, toDate) {
  const from = startOfLocalDay(fromDate);
  const to = startOfLocalDay(toDate);
  return Math.round((to - from) / MS_PER_DAY);
}

export function parseDeadlineDaysInput(value, baseDate = new Date()) {
  const input = String(value ?? '').trim();
  if (!input) {
    const date = addLocalDays(baseDate, 0);
    return { ok: true, days: 0, date, iso: formatDateISO(date) };
  }

  if (!/^\d+$/.test(input)) {
    return { ok: false, error: 'Enter whole days from today. Use 0 for today.' };
  }

  const days = Number.parseInt(input, 10);
  const date = addLocalDays(baseDate, days);
  return { ok: true, days, date, iso: formatDateISO(date) };
}

export function getEndOfMonthDeadlineDays(baseDate = new Date()) {
  const endOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  return Math.max(0, localDayDifference(baseDate, endOfMonth));
}

export function formatFriendlyDate(date) {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function getDueLabel(dueDateISO, baseDate = new Date()) {
  if (!dueDateISO) return '';
  const [year, month, day] = String(dueDateISO).split('-').map(Number);
  const dueDate = new Date(year, month - 1, day);
  if (!Number.isFinite(dueDate.getTime())) return `Due ${dueDateISO}`;

  const difference = localDayDifference(baseDate, dueDate);
  if (difference < 0) {
    const overdueDays = Math.abs(difference);
    return `Overdue by ${overdueDays} ${overdueDays === 1 ? 'day' : 'days'}`;
  }
  if (difference === 0) return 'Due today';
  if (difference === 1) return 'Due tomorrow';
  return `Due in ${difference} days`;
}

export function formatDeadlinePreview(value, baseDate = new Date()) {
  const parsed = parseDeadlineDaysInput(value, baseDate);
  if (!parsed.ok) return parsed;
  return {
    ...parsed,
    preview: `${getDueLabel(parsed.iso, baseDate)} · ${formatFriendlyDate(parsed.date)}`
  };
}
