import * as Dialog from '@radix-ui/react-dialog';
import { cva } from 'class-variance-authority';
import { Command, Search, X } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '../lib/utils.js';

const buttonStyles = cva(
  'inline-flex h-10 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition focus:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-background hover:bg-[#ffe166]',
        secondary: 'border border-border bg-raised text-primary hover:border-border-strong hover:bg-[#1D2530]',
        ghost: 'text-secondary hover:bg-raised hover:text-primary',
        danger: 'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/15'
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        icon: 'h-10 w-10 px-0'
      }
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md'
    }
  }
);

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}

export function PrimaryButton(props) {
  return <Button variant="primary" {...props} />;
}

export function SecondaryButton(props) {
  return <Button variant="secondary" {...props} />;
}

export function IconButton({ label, children, ...props }) {
  return (
    <Button size="icon" aria-label={label} title={label} {...props}>
      {children}
    </Button>
  );
}

export function Panel({ className, children, ...props }) {
  return (
    <section className={cn('rounded-panel border border-border bg-panel p-6 shadow-soft', className)} {...props}>
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="mb-7 flex flex-wrap items-start justify-between gap-6">
      <div>
        {eyebrow ? <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-muted">{eyebrow}</p> : null}
        <h1 className="text-3xl font-extrabold tracking-normal text-primary">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-secondary">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">{actions}</div> : null}
    </header>
  );
}

export function StatCard({ label, value, icon: Icon, tone = 'neutral' }) {
  const tones = {
    neutral: 'text-secondary',
    accent: 'text-accent',
    success: 'text-success',
    danger: 'text-danger',
    warning: 'text-warning'
  };
  return (
    <div className="rounded-card border border-border bg-raised p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">{label}</p>
        {Icon ? <Icon className={cn('h-4 w-4', tones[tone])} /> : null}
      </div>
      <div className="text-2xl font-extrabold text-primary">{value}</div>
    </div>
  );
}

export function ActionCard({ title, description, icon: Icon, shortcut, onClick }) {
  return (
    <button
      className="group rounded-card border border-border bg-panel p-5 text-left transition hover:border-border-strong hover:bg-raised focus:outline-none focus-visible:shadow-focus"
      onClick={onClick}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-control bg-accent/10 text-accent">
          {Icon ? <Icon className="h-5 w-5" /> : null}
        </div>
        {shortcut ? <ShortcutBadge>{shortcut}</ShortcutBadge> : null}
      </div>
      <h3 className="font-bold text-primary">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-secondary">{description}</p>
    </button>
  );
}

export function ShortcutBadge({ children }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-lg border border-border bg-editor px-2 py-1 font-mono text-[11px] font-bold text-muted">
      {children}
    </kbd>
  );
}

export function StatusChip({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'border-border bg-raised text-secondary',
    accent: 'border-accent/25 bg-accent/10 text-accent',
    success: 'border-success/25 bg-success/10 text-success',
    danger: 'border-danger/25 bg-danger/10 text-danger',
    warning: 'border-warning/25 bg-warning/10 text-warning'
  };
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold capitalize', tones[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-card border border-dashed border-border bg-editor/50 p-8 text-center">
      {Icon ? <Icon className="mb-4 h-8 w-8 text-muted" /> : null}
      <h3 className="text-sm font-bold text-primary">{title}</h3>
      {description ? <p className="mt-2 max-w-sm text-sm leading-6 text-secondary">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Modal({ open, onOpenChange, title, children, footer }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-border bg-panel p-6 shadow-soft focus:outline-none">
          <div className="mb-5 flex items-center justify-between gap-4">
            <Dialog.Title className="text-lg font-extrabold text-primary">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close" variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </IconButton>
            </Dialog.Close>
          </div>
          {children}
          {footer ? <div className="mt-6 flex justify-end gap-3">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-muted">{label}</span>
      {children}
    </label>
  );
}

export const TextInput = forwardRef(function TextInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn('h-11 w-full rounded-control border border-border bg-editor px-3 text-sm text-primary outline-none transition placeholder:text-muted focus:border-border-strong focus:shadow-focus', className)}
      {...props}
    />
  );
});

export function TextArea(props) {
  return (
    <textarea
      className="min-h-24 w-full resize-y rounded-control border border-border bg-editor px-3 py-3 text-sm leading-6 text-primary outline-none transition placeholder:text-muted focus:border-border-strong focus:shadow-focus"
      {...props}
    />
  );
}

export function Select(props) {
  return (
    <select
      className="h-11 w-full rounded-control border border-border bg-editor px-3 text-sm text-primary outline-none transition focus:border-border-strong focus:shadow-focus"
      {...props}
    />
  );
}

export function CommandSearchButton({ onClick }) {
  return (
    <button
      className="flex h-11 min-w-[280px] items-center justify-between rounded-control border border-border bg-editor px-3 text-sm text-muted transition hover:border-border-strong hover:text-secondary focus:outline-none focus-visible:shadow-focus"
      onClick={onClick}
    >
      <span className="flex items-center gap-2">
        <Search className="h-4 w-4" />
        Search commands
      </span>
      <span className="flex items-center gap-1">
        <ShortcutBadge>Ctrl</ShortcutBadge>
        <ShortcutBadge>K</ShortcutBadge>
      </span>
    </button>
  );
}

export function ShortcutHint({ keys, label }) {
  return (
    <div className="flex items-center justify-between gap-5 rounded-2xl border border-border bg-raised px-3 py-2">
      <span className="text-sm text-secondary">{label}</span>
      <span className="flex gap-1">{keys.map((key) => <ShortcutBadge key={key}>{key}</ShortcutBadge>)}</span>
    </div>
  );
}

export function CommandEmptyIcon() {
  return <Command className="h-7 w-7 text-muted" />;
}
