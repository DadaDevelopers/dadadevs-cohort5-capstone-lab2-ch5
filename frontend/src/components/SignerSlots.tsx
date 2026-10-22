import type { AuthorisedSigner, Signature } from '../types'
import { initials, relative } from '../lib/format'
import { Icon } from './Icon'
import { cx } from './ui'

type SlotState = 'signed' | 'waiting' | 'declined'

interface Slot {
  key: string
  name: string
  state: SlotState
  at: string | null
  isYou: boolean
}

function buildSlots(signers: Pick<AuthorisedSigner, 'id' | 'name'>[], signatures: Signature[], youSignerId?: string | null): Slot[] {
  const bySigner = new Map(signatures.map((s) => [s.signerId, s]))
  const slots = signers.map<Slot>((s) => {
    const sig = bySigner.get(s.id)
    return {
      key: s.id,
      name: s.name,
      state: sig ? (sig.decision === 'signed' ? 'signed' : 'declined') : 'waiting',
      at: sig?.createdAt ?? null,
      isYou: s.id === youSignerId,
    }
  })
  // Signed first in the order they arrived, then the people still to sign, then declines.
  const rank: Record<SlotState, number> = { signed: 0, waiting: 1, declined: 2 }
  return slots.sort((a, b) => rank[a.state] - rank[b.state] || (a.at ?? '').localeCompare(b.at ?? ''))
}

interface SignerSlotsProps {
  signers: Pick<AuthorisedSigner, 'id' | 'name'>[]
  signatures: Signature[]
  threshold: number
  youSignerId?: string | null
}

/**
 * The signature progress display. One slot per authorised signer; slots fill
 * as signatures arrive. The rail underneath spans the number of signatures the
 * approval rule needs, so people can see how far the request has to go.
 */
export function SignerSlots({ signers, signatures, threshold, youSignerId }: SignerSlotsProps) {
  const slots = buildSlots(signers, signatures, youSignerId)
  const signed = slots.filter((s) => s.state === 'signed').length
  const declined = slots.filter((s) => s.state === 'declined').length
  const n = slots.length
  const reached = signed >= threshold
  const remaining = Math.max(0, threshold - signed)
  const stillAble = n - declined

  return (
    <figure className="w-full" aria-label={`${signed} of ${threshold} required signatures collected from ${n} authorised signers`}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-4xl font-extrabold tabular leading-none">
          {signed}
          <span className="text-faint"> / {threshold}</span>
        </p>
        <p className="text-[15px] font-semibold text-ink-soft">
          {reached ? 'Approval rule met' : `${remaining} more signature${remaining === 1 ? '' : 's'} needed`}
        </p>
      </div>

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {slots.map((s) => (
          <div key={s.key} className="flex min-w-0 flex-col items-stretch gap-1.5">
            <div
              className={cx(
                'relative flex aspect-square max-h-24 items-center justify-center text-lg font-extrabold sm:text-2xl',
                s.state === 'signed' && 'slot-pop bg-forest text-white',
                s.state === 'waiting' && 'border-2 border-dashed border-line-strong bg-surface text-faint',
                s.state === 'declined' && 'hatch border-2 border-line-strong bg-sunken text-muted line-through',
                s.isYou && s.state === 'waiting' && 'border-accent text-accent-ink',
              )}
            >
              {initials(s.name)}
              {s.state === 'signed' && (
                <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center bg-accent text-white">
                  <Icon name="check" size={16} strokeWidth={3} />
                </span>
              )}
              {s.state === 'declined' && (
                <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center bg-ink text-white">
                  <Icon name="x" size={14} strokeWidth={3} />
                </span>
              )}
              {s.isYou && <span className="absolute -bottom-px left-0 right-0 bg-accent py-0.5 text-center text-[10px] font-bold uppercase tracking-wider text-white no-underline">You</span>}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-tight">{s.name.split(' ')[0]}</p>
              <p className={cx('truncate text-xs', s.state === 'signed' ? 'text-ok-ink' : s.state === 'declined' ? 'text-bad-ink' : 'text-muted')}>
                {s.state === 'signed' ? `Signed ${s.at ? relative(s.at) : ''}` : s.state === 'declined' ? 'Declined' : 'Waiting'}
              </p>
            </div>
          </div>
        ))}

        {/* Threshold rail: spans the first M slots. */}
        <div className="mt-1" style={{ gridColumn: `1 / span ${Math.min(threshold, n)}` }}>
          <div className="relative h-2 bg-sunken">
            <div className={cx('absolute inset-y-0 left-0 transition-all duration-500', reached ? 'bg-accent' : 'bg-forest')} style={{ width: `${Math.min(100, (signed / threshold) * 100)}%` }} />
            {Array.from({ length: threshold - 1 }, (_, i) => (
              <span key={i} className="absolute inset-y-0 w-0.5 bg-surface" style={{ left: `${((i + 1) / threshold) * 100}%` }} />
            ))}
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
            <Icon name={reached ? 'unlock' : 'lock'} size={14} />
            {threshold} needed to send
          </p>
        </div>
      </div>

      {declined > 0 && !reached && (
        <figcaption className="mt-4 text-sm text-ink-soft">
          {stillAble >= threshold
            ? `${declined} signer${declined === 1 ? '' : 's'} declined. The request stays open because ${stillAble} signers can still sign and only ${threshold} are needed.`
            : `${declined} signers declined, so ${threshold} signatures can no longer be reached. The request is closed and nothing was sent.`}
        </figcaption>
      )}
    </figure>
  )
}

/** Compact version for lists: a row of small squares with a notch at the threshold. */
export function SignerSlotsMini({ total, signed, declined, threshold, showCount = true }: { total: number; signed: number; declined: number; threshold: number; showCount?: boolean }) {
  const cells: SlotState[] = [
    ...Array<SlotState>(signed).fill('signed'),
    ...Array<SlotState>(Math.max(0, total - signed - declined)).fill('waiting'),
    ...Array<SlotState>(declined).fill('declined'),
  ]
  return (
    <span className="inline-flex items-center gap-2" aria-label={`${signed} of ${threshold} signatures`}>
      <span className="inline-flex items-center gap-[3px]">
        {cells.map((c, i) => (
          <span key={i} className="flex items-center gap-[3px]">
            <span
              className={cx(
                'h-3 w-3',
                c === 'signed' && 'bg-forest',
                c === 'waiting' && 'border border-dashed border-line-strong',
                c === 'declined' && 'hatch border border-line-strong',
              )}
            />
            {i === threshold - 1 && i < cells.length - 1 && <span className="h-4 w-px bg-ink" />}
          </span>
        ))}
      </span>
      {showCount && (
        <span className="text-sm font-semibold tabular text-ink-soft">
          {signed}/{threshold}
        </span>
      )}
    </span>
  )
}
