import assert from 'node:assert';
import {
  formatDeadlinePreview,
  getDueLabel,
  getEndOfMonthDeadlineDays,
  parseDeadlineDaysInput
} from '../src/shared/deadline.mjs';

const baseDate = new Date(2026, 5, 17, 9, 30);

assert.strictEqual(parseDeadlineDaysInput('', baseDate).iso, '2026-06-17', 'Blank deadline should mean today.');
assert.strictEqual(parseDeadlineDaysInput('0', baseDate).iso, '2026-06-17', '0 deadline days should mean today.');
assert.strictEqual(parseDeadlineDaysInput('1', baseDate).iso, '2026-06-18', '1 deadline day should mean tomorrow.');
assert.strictEqual(parseDeadlineDaysInput('13', baseDate).iso, '2026-06-30', 'Deadline days should add across the current month.');
assert.strictEqual(parseDeadlineDaysInput('1.5', baseDate).ok, false, 'Decimal day counts must be rejected.');
assert.strictEqual(parseDeadlineDaysInput('-1', baseDate).ok, false, 'Negative day counts must be rejected.');
assert.strictEqual(parseDeadlineDaysInput('soon', baseDate).ok, false, 'Non-numeric day counts must be rejected.');

const yearBoundary = new Date(2026, 11, 31, 9, 30);
assert.strictEqual(parseDeadlineDaysInput('1', yearBoundary).iso, '2027-01-01', 'Deadline days should cross year boundaries.');
assert.strictEqual(getEndOfMonthDeadlineDays(baseDate), 13, 'End-of-month quick chip should use remaining days in the current month.');
assert.strictEqual(formatDeadlinePreview('13', baseDate).preview, 'Due in 13 days · Jun 30, 2026', 'Deadline preview should be friendly.');

assert.strictEqual(getDueLabel('2026-06-16', baseDate), 'Overdue by 1 day', 'Yesterday should be overdue by one day.');
assert.strictEqual(getDueLabel('2026-06-17', baseDate), 'Due today', 'Today should use a friendly due label.');
assert.strictEqual(getDueLabel('2026-06-18', baseDate), 'Due tomorrow', 'Tomorrow should use a friendly due label.');
assert.strictEqual(getDueLabel('2026-06-30', baseDate), 'Due in 13 days', 'Future deadlines should show remaining days.');

console.log('Deadline input tests passed.');
