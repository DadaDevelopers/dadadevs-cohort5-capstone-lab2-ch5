import { useEffect, useState } from 'react'
import * as api from '../../api'
import { errorMessage } from '../../api/errors'
import {
  assertWalletPolicy,
  browserVaultSupported,
  inspectSigningPsbt,
  loadVaultSummary,
  signSigningPsbt,
  unlockVault,
  type PsbtSummary,
  type UnlockedVault,
  type VaultSummary,
  type WalletPolicy,
} from '../../lib/browser-signer'
import { shortHash } from '../../lib/format'
import type { SpendingRequest } from '../../types'
import { Badge, Button, KeyValue, Notice, Panel } from '../ui'
import { PassphraseModal } from './PassphraseModal'

interface BrowserSignRequestPanelProps {
  communityId: string
  userId: string
  request: SpendingRequest
  /** Receives the progress text so the page can show it after this panel unmounts. */
  onSigned: (message: string) => void | Promise<void>
}

/** Sats formatted without floating point, so a 21M BTC supply is never rounded. */
function satsText(value: bigint): string {
  return `${value.toLocaleString('en-GB')} sats`
}

function exactSats(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`The ${label} is not a valid Bitcoin amount.`)
  return BigInt(value)
}

/**
 * Signs one prepared request with the key stored in this browser. The PSBT is
 * fetched from the coordinator, inspected against the spending request and the
 * wallet descriptor, and only then signed; the private key is wiped afterwards.
 */
export function BrowserSignRequestPanel({ communityId, userId, request, onSigned }: BrowserSignRequestPanelProps) {
  const supported = browserVaultSupported()
  const [tick, setTick] = useState(0)
  const [summary, setSummary] = useState<VaultSummary | null>(null)
  const [policy, setPolicy] = useState<WalletPolicy | null>(null)
  const [contextLoading, setContextLoading] = useState(true)
  const [contextError, setContextError] = useState<string | null>(null)
  const [psbt, setPsbt] = useState<string | null>(null)
  const [review, setReview] = useState<PsbtSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [passphraseOpen, setPassphraseOpen] = useState(false)
  const [passphraseError, setPassphraseError] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)

  useEffect(() => {
    if (!supported) return
    let cancelled = false
    setContextLoading(true)
    setContextError(null)
    void (async () => {
      try {
        const [vault, walletPolicy] = await Promise.all([
          loadVaultSummary({ communityId, userId }),
          api.getWalletPolicy(communityId).then((value) => assertWalletPolicy(value)),
        ])
        if (cancelled) return
        setSummary(vault)
        setPolicy(walletPolicy)
      } catch (err) {
        if (!cancelled) setContextError(errorMessage(err))
      } finally {
        if (!cancelled) setContextLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [communityId, userId, supported, tick])

  const authorised = summary !== null && policy !== null && policy.publicKeys.includes(summary.publicKey)

  const loadReview = async () => {
    if (!summary || !policy) return
    setBusy(true)
    setActionError(null)
    setPsbt(null)
    setReview(null)
    try {
      const value = await api.getSpendingRequestPsbt(communityId, request.id)
      const inspected = inspectSigningPsbt(value, {
        policy,
        ownPublicKey: summary.publicKey,
        recipientAddress: request.recipientAddress,
        amountSats: exactSats(request.amountSats, 'requested amount'),
        feeSats: exactSats(request.estimatedFeeSats, 'network fee'),
      })
      setPsbt(value)
      setReview(inspected.summary)
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const sign = async (passphrase: string) => {
    if (!summary || !policy || !psbt) return
    setUnlocking(true)
    setPassphraseError(null)
    setActionError(null)
    let unlocked: UnlockedVault
    try {
      unlocked = await unlockVault({ communityId, userId, passphrase })
    } catch (err) {
      setPassphraseError(errorMessage(err))
      setUnlocking(false)
      return
    }
    try {
      if (unlocked.publicKey !== summary.publicKey) throw new Error('The unlocked key is not this browser signer. Restore it again.')
      const signed = signSigningPsbt({
        policy,
        ownPublicKey: unlocked.publicKey,
        recipientAddress: request.recipientAddress,
        amountSats: exactSats(request.amountSats, 'requested amount'),
        feeSats: exactSats(request.estimatedFeeSats, 'network fee'),
        psbtBase64: psbt,
        privateKey: unlocked.privateKey,
      })
      const progress = await api.submitSignedPsbt(communityId, request.id, signed.psbtBase64)
      setPassphraseOpen(false)
      setPsbt(null)
      setReview(null)
      await onSigned(progress.status === 'READY'
        ? 'Your browser signature was verified. The threshold is complete.'
        : `Your browser signature was verified. ${progress.signatures} of ${progress.requiredSignatures} signatures are now collected.`)
    } catch (err) {
      setPassphraseOpen(false)
      setActionError(errorMessage(err))
    } finally {
      unlocked.privateKey.fill(0)
      setUnlocking(false)
    }
  }


  return (
    <Panel
      title="Sign in this browser"
      action={<Badge tone="neutral" icon="lock">Key stays here</Badge>}
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <Notice tone="lock" title="Experimental Regtest signer">
          The browser re-derives the wallet address from the coordinator's descriptor and checks every input, output,
          recipient, amount, and fee before signing. The private key is decrypted for this one action and wiped afterwards.
        </Notice>

        {!supported ? (
          <Notice tone="warn" title="This browser cannot sign">
            It does not offer IndexedDB and Web Crypto together. Use the manual PSBT flow below.
          </Notice>
        ) : contextError ? (
          <Notice
            tone="bad"
            action={<Button variant="secondary" size="sm" onClick={() => setTick((value) => value + 1)}>Try again</Button>}
          >
            {contextError}
          </Notice>
        ) : contextLoading ? (
          <p role="status" className="text-[15px] text-muted">Checking this browser…</p>
        ) : summary === null ? (
          <Notice tone="info" title="No browser signer in this browser">
            Create or restore one on the Authorised signers page. The manual PSBT flow below still works without it.
          </Notice>
        ) : policy && !authorised ? (
          <Notice tone="bad" title="This key cannot sign this wallet">
            Key <code className="font-mono" title={summary.publicKey}>{shortHash(summary.publicKey, 12, 8)}</code> is not one
            of the {policy.threshold}-of-{policy.publicKeys.length} wallet signer keys. Restore the recovery words of the
            key you registered for this community.
          </Notice>
        ) : (
          <>
            {actionError && <Notice tone="bad">{actionError}</Notice>}

            {!psbt || !review ? (
              <div className="flex flex-col gap-3">
                <p className="text-[15px] leading-relaxed text-ink-soft">
                  Fetch the coordinator PSBT and review its inputs, recipient, amount, fee, and change before any key is
                  unlocked. Signing key <code className="font-mono" title={summary.publicKey}>{shortHash(summary.publicKey, 12, 8)}</code>.
                </p>
                <div>
                  <Button icon="eye" busy={busy} disabled={unlocking} onClick={() => void loadReview()}>
                    Load PSBT and review
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <dl className="grid gap-4 border border-line bg-paper p-4 sm:grid-cols-2">
                  <KeyValue label="Inputs">{review.inputCount}</KeyValue>
                  <KeyValue label="Total input">{satsText(review.totalInputSats)}</KeyValue>
                  <KeyValue label="Payment to recipient">
                    <code className="break-all font-mono text-[13px]">{request.recipientAddress}</code>
                  </KeyValue>
                  <KeyValue label="Payment">{satsText(review.recipientSats)}</KeyValue>
                  <KeyValue label="Actual network fee">{satsText(review.feeSats)}</KeyValue>
                  <KeyValue label="Change back to the wallet">{satsText(review.changeSats)}</KeyValue>
                </dl>
                <Notice tone="info">
                  {review.existingSigners.length === 0
                    ? 'No other signature has been collected yet.'
                    : `Already signed by ${review.existingSigners.map((key) => shortHash(key, 10, 6)).join(', ')}.`}
                </Notice>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="secondary"
                    disabled={busy || unlocking}
                    onClick={() => {
                      setPsbt(null)
                      setReview(null)
                      setActionError(null)
                    }}
                  >
                    Discard
                  </Button>
                  <Button
                    icon="key"
                    disabled={busy || unlocking}
                    onClick={() => {
                      setPassphraseError(null)
                      setPassphraseOpen(true)
                    }}
                  >
                    Sign and submit
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <PassphraseModal
        open={passphraseOpen}
        mode="unlock"
        busy={unlocking}
        error={passphraseError}
        onClose={() => {
          if (unlocking) return
          setPassphraseOpen(false)
          setPassphraseError(null)
        }}
        onSubmit={(passphrase) => void sign(passphrase)}
      />
    </Panel>
  )
}

