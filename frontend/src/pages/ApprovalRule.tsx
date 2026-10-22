import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api'
import { errorMessage } from '../api/errors'
import { SignerSlotsMini } from '../components/SignerSlots'
import { Button, cx, Notice, PageHeader } from '../components/ui'
import { useCommunity } from '../context/CommunityContext'
import { date } from '../lib/format'
import { StepHeader } from './Setup'

interface Preset {
  m: number
  label: string
  hint: string
}

function presetsFor(n: number): Preset[] {
  if (n < 2) return []
  const majority = Math.floor(n / 2) + 1
  const list: Preset[] = []
  const add = (m: number, label: string, hint: string) => {
    if (m >= 2 && m <= n && !list.some((p) => p.m === m)) list.push({ m, label, hint })
  }
  add(majority, majority === n ? 'Everyone' : 'Balanced security', n <= 3 ? 'Recommended for small groups' : 'Recommended: a majority must agree')
  add(Math.min(n, majority + 1), 'High security', 'Harder to spend, but more people must be reachable')
  add(n, 'Everyone must sign', 'Strongest control, but one lost key blocks all spending')
  return list.sort((a, b) => a.m - b.m)
}

/** Plain-language consequences of a threshold choice. */
function consequences(m: number, n: number): { tone: 'info' | 'warn'; text: string } {
  if (m === n) {
    return { tone: 'warn', text: `Every signer must sign. If any one of the ${n} signers loses their phone or leaves, the funds cannot be spent.` }
  }
  if (m <= n / 2) {
    return { tone: 'warn', text: `Only ${m} of ${n} signers are needed, which is not a majority. A small group could spend without the others.` }
  }
  return { tone: 'info', text: `Any ${m} of the ${n} signers can approve a payment. Up to ${n - m} signer${n - m === 1 ? '' : 's'} can be unavailable and the community can still spend.` }
}

export default function ApprovalRule({ mode = 'app' }: { mode?: 'app' | 'setup' }) {
  const navigate = useNavigate()
  const { community, wallet, membership, refresh } = useCommunity()
  const n = wallet?.signerCount ?? 0
  const presets = presetsFor(n)
  const [choice, setChoice] = useState<number | 'custom'>(() => wallet?.threshold ?? presets[0]?.m ?? 2)
  const [custom, setCustom] = useState(String(wallet?.threshold ?? 2))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!community || !wallet || !membership) return null
  const isDraft = wallet.status === 'draft'
  const canEdit = isDraft && membership.isAdmin

  const m = choice === 'custom' ? Number(custom) : choice
  const customError =
    choice !== 'custom'
      ? null
      : !/^\d+$/.test(custom.trim())
        ? 'Enter a whole number.'
        : m < 2
          ? 'At least 2 signatures are needed. One signature would let one person spend alone.'
          : m > n
            ? `You have ${n} signers, so no more than ${n} signatures can be required.`
            : null

  const save = async () => {
    if (customError) return
    setBusy(true)
    setError(null)
    try {
      await api.setThreshold(community.id, m)
      await refresh()
      navigate('/setup/signers')
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  if (!isDraft) {
    const t = wallet.threshold ?? 0
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Approval rule" description="How many authorised signers must sign before money can leave the community wallet." />
        <section className="grid border border-line bg-surface md:grid-cols-2">
          <div className="border-b border-line p-6 md:border-b-0 md:border-r md:p-8">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted">The rule</p>
            <p className="mt-3 text-5xl font-extrabold tabular">
              {t} <span className="text-faint">of</span> {n}
            </p>
            <p className="mt-3 text-xl font-bold">{t} of {n} signers must approve every payment</p>
            <div className="mt-6">
              <SignerSlotsMini total={n} signed={t} declined={0} threshold={t} showCount={false} />
            </div>
          </div>
          <div className="p-6 md:p-8">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted">What this means</p>
            <ul className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-ink-soft">
              <li>A payment stays off the Bitcoin network until {t} different signers have signed it.</li>
              <li>The same signer can never be counted twice.</li>
              <li>Up to {n - t} signer{n - t === 1 ? '' : 's'} can be away or decline and a payment can still go through.</li>
              <li>Nobody can skip the rule, including the administrator.</li>
            </ul>
          </div>
        </section>
        <Notice tone="lock" title="Fixed since the wallet was created">
          The rule was set {wallet.createdAt ? `when the wallet was created on ${date(wallet.createdAt)}` : 'when the wallet was created'} and is part of the wallet’s
          Bitcoin address. It cannot be edited here.
          {membership.isAdmin && ' As administrator you have no override: your payments need the same signatures as everyone else’s.'}
        </Notice>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {mode === 'setup' ? (
        <StepHeader step={3} title="Set the approval rule" description="How many signers must approve before money can be spent?" />
      ) : (
        <PageHeader title="Approval rule" />
      )}

      {n < 2 ? (
        <Notice tone="warn" title="Choose signers first">At least 2 authorised signers are needed before an approval rule can be set.</Notice>
      ) : !canEdit ? (
        <Notice tone="info" title={wallet.threshold ? `Current choice: ${wallet.threshold} of ${n}` : 'Not chosen yet'}>
          Only the administrator sets the approval rule.
        </Notice>
      ) : (
        <>
          <p className="text-[15px] text-ink-soft">You have {n} authorised signers.</p>
          <div role="radiogroup" aria-label="Approval rule" className="flex flex-col gap-3">
            {presets.map((p) => (
              <button
                key={p.m}
                type="button"
                role="radio"
                aria-checked={choice === p.m}
                onClick={() => setChoice(p.m)}
                className={cx(
                  'flex flex-col gap-3 border px-6 py-5 text-left transition-colors sm:flex-row sm:items-center sm:justify-between',
                  choice === p.m ? 'border-teal-ink bg-teal-soft' : 'border-line-strong bg-surface hover:bg-sunken',
                )}
              >
                <span>
                  <span className="block text-2xl font-extrabold tabular">
                    {p.m} of {n}
                  </span>
                  <span className="mt-1 block text-[15px] text-ink-soft">
                    {p.label} · {p.hint}
                  </span>
                </span>
                <SignerSlotsMini total={n} signed={p.m} declined={0} threshold={p.m} showCount={false} />
              </button>
            ))}
            <div className={cx('border px-6 py-5', choice === 'custom' ? 'border-teal-ink bg-teal-soft' : 'border-line-strong bg-surface')}>
              <button type="button" role="radio" aria-checked={choice === 'custom'} onClick={() => setChoice('custom')} className="w-full text-left">
                <span className="block text-2xl font-extrabold">Custom</span>
                <span className="mt-1 block text-[15px] text-ink-soft">Advanced: choose any number from 2 to {n}</span>
              </button>
              {choice === 'custom' && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label htmlFor="custom-m" className="sr-only">Signatures required</label>
                  <input
                    id="custom-m"
                    inputMode="numeric"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    aria-invalid={customError ? true : undefined}
                    className={cx('h-12 w-20 border bg-surface text-center text-xl font-bold tabular outline-none focus:border-ink', customError ? 'border-bad-ink' : 'border-line-strong')}
                  />
                  <span className="text-lg font-bold">of {n} signers</span>
                  {customError && <p className="w-full text-sm text-bad-ink" role="alert">{customError}</p>}
                </div>
              )}
            </div>
          </div>

          {!customError && m >= 2 && m <= n && (
            <Notice tone={consequences(m, n).tone} title={`${m} of ${n} signers must approve`}>
              {consequences(m, n).text}
            </Notice>
          )}
          {error && <Notice tone="bad">{error}</Notice>}
        </>
      )}

      {mode === 'setup' && (
        <div className="flex justify-between border-t border-line pt-6">
          <Button variant="secondary" icon="arrowLeft" onClick={() => navigate('/setup/members')}>
            Back
          </Button>
          {canEdit && n >= 2 && (
            <Button size="lg" iconRight="arrowRight" busy={busy} disabled={!!customError} onClick={save}>
              Next
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
