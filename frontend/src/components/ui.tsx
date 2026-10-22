import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { btc, initials, sats } from '../lib/format'
import { Icon, type IconName } from './Icon'

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
export { cx }

// ---------------------------------------------------------------------------
// Buttons. Square corners and flat fills, as in the Figma frames.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse'
type Size = 'sm' | 'md' | 'lg'

const variantClass: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover disabled:bg-line disabled:text-faint',
  secondary: 'bg-surface text-ink border border-ink hover:bg-sunken disabled:border-line disabled:text-faint',
  ghost: 'text-ink hover:bg-sunken disabled:text-faint',
  danger: 'bg-surface text-bad-ink border border-bad-line hover:bg-bad disabled:text-faint',
  inverse: 'bg-transparent text-white border border-white/60 hover:bg-white/10',
}
const sizeClass: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-5 text-[15px] gap-2',
  lg: 'h-14 px-7 text-base gap-2.5',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: IconName
  iconRight?: IconName
  busy?: boolean
}

export function Button({ variant = 'primary', size = 'md', icon, iconRight, busy, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={cx('inline-flex items-center justify-center font-semibold transition-colors select-none', variantClass[variant], sizeClass[size], className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Spinner /> : icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
      {iconRight && !busy && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} />}
    </button>
  )
}

interface ButtonLinkProps extends LinkProps {
  variant?: Variant
  size?: Size
  icon?: IconName
  iconRight?: IconName
}

export function ButtonLink({ variant = 'primary', size = 'md', icon, iconRight, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={cx('inline-flex items-center justify-center font-semibold transition-colors', variantClass[variant], sizeClass[size], className)} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 16 : 18} />}
    </Link>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" className={cx('animate-spin', className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Form fields

interface FieldShellProps {
  label: string
  hint?: ReactNode
  error?: string | null
  id: string
  children: ReactNode
  optional?: boolean
}

function FieldShell({ label, hint, error, id, children, optional }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold text-ink">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted">(optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-bad-ink" role="alert">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : (
        hint && <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>
      )}
    </div>
  )
}

const inputBase =
  'w-full bg-surface border px-3.5 text-[15px] text-ink placeholder:text-faint outline-none transition-colors focus:border-ink focus:ring-1 focus:ring-ink disabled:bg-sunken disabled:text-muted'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  trailing?: ReactNode
  mono?: boolean
}

export function TextField({ label, hint, error, optional, trailing, mono, className, id, ...rest }: TextFieldProps) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} optional={optional}>
      <div className="relative">
        <input
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
          className={cx(inputBase, 'h-12', error ? 'border-bad-ink' : 'border-line-strong', trailing ? 'pr-12' : '', mono && 'font-mono text-sm', className)}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-2">{trailing}</div>}
      </div>
    </FieldShell>
  )
}

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  mono?: boolean
}

export function TextArea({ label, hint, error, optional, className, id, mono, ...rest }: TextAreaProps) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} optional={optional}>
      <textarea
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        className={cx(inputBase, 'min-h-28 py-3 leading-relaxed', error ? 'border-bad-ink' : 'border-line-strong', mono && 'font-mono text-sm break-all', className)}
        {...rest}
      />
    </FieldShell>
  )
}

// ---------------------------------------------------------------------------
// Status chips

export type Tone = 'wait' | 'ok' | 'bad' | 'neutral' | 'teal' | 'accent'

const toneClass: Record<Tone, string> = {
  wait: 'bg-wait text-wait-ink border-wait-line',
  ok: 'bg-ok text-ok-ink border-ok-line',
  bad: 'bg-bad text-bad-ink border-bad-line',
  neutral: 'bg-sunken text-ink-soft border-line',
  teal: 'bg-teal text-teal-ink border-teal-line',
  accent: 'bg-accent text-white border-accent',
}

export function Badge({ tone = 'neutral', children, icon, className }: { tone?: Tone; children: ReactNode; icon?: IconName; className?: string }) {
  return (
    <span className={cx('inline-flex h-7 items-center gap-1 whitespace-nowrap border px-2.5 text-[13px] font-semibold', toneClass[tone], className)}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Notices: inline explanations that sit next to the thing they describe.

const noticeTone: Record<'info' | 'lock' | 'warn' | 'ok' | 'bad', { box: string; icon: IconName }> = {
  info: { box: 'bg-teal-soft border-teal-line text-ink', icon: 'info' },
  lock: { box: 'bg-sunken border-line-strong text-ink', icon: 'lock' },
  warn: { box: 'bg-wait border-wait-line text-ink', icon: 'alert' },
  ok: { box: 'bg-ok border-ok-line text-ink', icon: 'check' },
  bad: { box: 'bg-bad border-bad-line text-ink', icon: 'alert' },
}

export function Notice({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof noticeTone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const t = noticeTone[tone]
  return (
    <div className={cx('flex flex-col gap-3 border-l-4 border px-4 py-3.5 sm:flex-row sm:items-start', t.box, className)} role={tone === 'bad' ? 'alert' : undefined}>
      <Icon name={t.icon} size={20} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 text-[15px] leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title ? 'mt-0.5' : '', 'text-ink-soft')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout pieces

export function PageHeader({
  title,
  description,
  back,
  actions,
  eyebrow,
}: {
  title: ReactNode
  description?: ReactNode
  back?: string
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {back && (
          <Link to={back} className="-ml-2 mt-0.5 p-2 text-ink hover:bg-sunken" aria-label="Back">
            <Icon name="arrowLeft" size={22} />
          </Link>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted">{eyebrow}</p>}
          <h1 className="text-2xl font-extrabold leading-tight sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function Panel({ title, action, children, className, bodyClassName }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx('border border-line bg-surface', className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-[17px] font-bold">{title}</h2>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Loading, empty and error states. No screen renders blank while waiting.

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden="true" />
}

export function LoadingBlock({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cx('h-16', i === 0 && 'h-24')} />
      ))}
    </div>
  )
}

export function EmptyState({ icon = 'request', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 border border-dashed border-line-strong bg-surface px-6 py-10 sm:px-10">
      <span className="flex h-11 w-11 items-center justify-center bg-sunken text-ink-soft">
        <Icon name={icon} size={22} />
      </span>
      <h3 className="text-lg font-bold">{title}</h3>
      {children && <div className="max-w-xl text-[15px] leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry, title = 'This could not be loaded' }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 border border-bad-line bg-bad/50 px-6 py-8 sm:px-10">
      <span className="flex h-11 w-11 items-center justify-center bg-bad text-bad-ink">
        <Icon name="alert" size={22} />
      </span>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="max-w-xl text-[15px] leading-relaxed text-ink-soft">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data display

export function Avatar({ name, size = 40, tone = 'forest' }: { name: string; size?: number; tone?: 'forest' | 'light' }) {
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center font-bold', tone === 'forest' ? 'bg-forest text-white' : 'bg-sunken text-ink border border-line')}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}

export function Amount({ sats: value, sign, className, showSats = false }: { sats: number; sign?: '+' | '-'; className?: string; showSats?: boolean }) {
  return (
    <span className={cx('tabular whitespace-nowrap', className)}>
      {sign}
      {btc(value)} BTC
      {showSats && <span className="ml-2 text-sm font-normal text-muted">{sats(value)}</span>}
    </span>
  )
}

export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<number>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), 2000)
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={cx('inline-flex h-9 shrink-0 items-center gap-1.5 border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-sunken', className)}
    >
      <Icon name={state === 'copied' ? 'check' : 'copy'} size={16} />
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy' : label}</span>
    </button>
  )
}

/** A long hash or address with a copy control. Never truncates silently on wide screens. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  return (
    <div>
      {label && <p className="mb-1.5 text-sm font-semibold text-muted">{label}</p>}
      <div className="flex items-center gap-2 border border-line bg-paper py-1.5 pl-3 pr-1.5">
        <code className="min-w-0 flex-1 break-all font-mono text-[13px] leading-relaxed text-ink">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  )
}

export function KeyValue({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="text-[15px] text-ink">{children}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal

export function Modal({ open, onClose, title, children, labelledBy }: { open: boolean; onClose: () => void; title: string; children: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  const headingId = useId()
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      aria-labelledby={labelledBy ?? headingId}
      className="m-auto w-[min(100%-2rem,960px)] max-h-[calc(100dvh-2rem)] overflow-y-auto border border-ink bg-surface p-0 text-ink backdrop:bg-night/60"
    >
      {open && (
        <div className="relative p-5 sm:p-8">
          <button type="button" onClick={onClose} className="absolute right-3 top-3 p-2 hover:bg-sunken" aria-label="Close">
            <Icon name="x" size={22} />
          </button>
          <h2 id={headingId} className="pr-10 text-xl font-extrabold sm:text-2xl">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  )
}
