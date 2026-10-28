import { useCallback, useEffect, useState, type FormEvent } from 'react'
import * as api from '../../api'
import { errorMessage } from '../../api/errors'
import {
  browserVaultSupported,
  createRecoveryWords,
  createVault,
  deleteVault,
  isValidMnemonic,
  loadVaultSummary,
  normalizeMnemonic,
  type VaultSummary,
} from '../../lib/browser-signer'
import { date, shortHash } from '../../lib/format'
import { Badge, Button, CopyButton, LoadingBlock, Modal, Notice, TextArea } from '../ui'
import { BackupWordsModal } from './BackupWordsModal'
import { PassphraseModal } from './PassphraseModal'

interface BrowserSignerCardProps {
  communityId: string
  userId: string
  /** The key the backend already holds for this signer, `undefined` while it loads. */
  registeredPublicKey: string | null | undefined
  /** Signer keys can only be added while the community wallet is still a draft. */
  canRegister: boolean
  onRegistered: () => Promise<void> | void
}

interface PendingMnemonic {
  mnemonic: string
  replace: boolean
}

/**
 * Creates, restores, and inspects the local secp256k1 signer. The recovery words
 * are encrypted with a passphrase and kept in IndexedDB; only the public key is
 * ever registered with the community.
 */
export function BrowserSignerCard({ communityId, userId, registeredPublicKey, canRegister, onRegistered }: BrowserSignerCardProps) {
  const supported = browserVaultSupported()
  const [summary, setSummary] = useState<VaultSummary | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [words, setWords] = useState<string[] | null>(null)
  const [pending, setPending] = useState<PendingMnemonic | null>(null)
  const [passphraseOpen, setPassphraseOpen] = useState(false)
  const [passphraseError, setPassphraseError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreText, setRestoreText] = useState('')
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const refreshSummary = useCallback(async () => {
    if (!supported) return
    setLoadError(null)
    try {
      setSummary(await loadVaultSummary({ communityId, userId }))
    } catch (err) {
      setSummary(null)
      setLoadError(errorMessage(err))
    }
  }, [communityId, userId, supported])

  useEffect(() => {
    void refreshSummary()
  }, [refreshSummary])

  const hasSummary = summary !== null && summary !== undefined
  const matchesRegistered = hasSummary && registeredPublicKey !== undefined && summary.publicKey === registeredPublicKey
  const needsRegistration = hasSummary && registeredPublicKey !== undefined && !matchesRegistered

  const startCreate = () => {
    setActionError(null)
    setMessage(null)
    if (!canRegister) {
      setActionError('The community wallet is already live, so a new key cannot be added. Restore the recovery words of the key you registered earlier instead.')
      return
    }
    setWords(createRecoveryWords())
  }

  const startRestore = () => {
    setActionError(null)
    setMessage(null)
    setRestoreError(null)
    setRestoreText('')
    setRestoring(true)
  }

  const submitRestore = (event: FormEvent) => {
    event.preventDefault()
    const mnemonic = normalizeMnemonic(restoreText)
    if (!isValidMnemonic(mnemonic)) {
      setRestoreError('Enter the 12–24 recovery words in the correct order, separated by spaces.')
      return
    }
    setRestoring(false)
    setRestoreText('')
    setPending({ mnemonic, replace: summary !== null })
    setPassphraseError(null)
    setPassphraseOpen(true)
  }

  /** Registers a freshly created key while the wallet still accepts new keys. */
  const finishVault = async (created: VaultSummary) => {
    if (registeredPublicKey === created.publicKey) {
      setMessage('Browser signer ready. Its public key is already registered with this community.')
      return
    }
    if (!canRegister) {
      setActionError('The browser signer was created, but the community wallet is already live and cannot accept this key. Restore the recovery words of the key you registered earlier.')
      return
    }
    try {
      await api.registerSignerKey(communityId, created.publicKey)
      await onRegistered()
      setMessage('Browser signer ready and its public key is registered with this community.')
    } catch (err) {
      setActionError(`The browser signer was created in this browser, but registering its public key failed: ${errorMessage(err)}`)
    }
  }

  const createFromWords = async (passphrase: string) => {
    if (!pending) return
    setBusy(true)
    setPassphraseError(null)
    setActionError(null)
    setMessage(null)
    let created: VaultSummary
    try {
      created = await createVault({ communityId, userId, mnemonic: pending.mnemonic, passphrase, replace: pending.replace })
    } catch (err) {
      setPassphraseError(errorMessage(err))
      setBusy(false)
      return
    }
    setSummary(created)
    setPending(null)
    setPassphraseOpen(false)
    try {
      await finishVault(created)
    } finally {
      setBusy(false)
    }
  }


  const registerExisting = async () => {
    if (!summary) return
    setBusy(true)
    setActionError(null)
    setMessage(null)
    try {
      await api.registerSignerKey(communityId, summary.publicKey)
      await onRegistered()
      setMessage('This browser key is now registered as your signer key.')
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('Remove the encrypted browser signer from this browser? You can only restore it with your written recovery words.')) return
    setBusy(true)
    setActionError(null)
    setMessage(null)
    try {
      await deleteVault({ communityId, userId })
      setSummary(null)
      setMessage('Browser signer removed from this browser. Your recovery words are still the backup.')
    } catch (err) {
      setActionError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-2 border-accent bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-accent-ink">Optional · experimental</p>
          <h2 className="mt-1 text-xl font-extrabold">Browser signer</h2>
        </div>
        <Badge tone="neutral" icon="key">
          Regtest only
        </Badge>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        Create a secp256k1 key inside this browser, encrypted with a passphrase and stored only on this device. The key
        material never leaves the browser; only the compressed public key is registered with the community.
      </p>

      {!supported ? (
        <Notice tone="warn" className="mt-4" title="This browser cannot run the signer">
          It does not offer IndexedDB and Web Crypto together. Use the guided local setup and the manual PSBT flow instead.
        </Notice>
      ) : (
        <>
          {message && <Notice tone="ok" className="mt-4">{message}</Notice>}
          {actionError && <Notice tone="bad" className="mt-4">{actionError}</Notice>}
          {loadError && (
            <Notice
              tone="bad"
              className="mt-4"
              action={<Button variant="secondary" size="sm" onClick={() => void refreshSummary()}>Try again</Button>}
            >
              {loadError}
            </Notice>
          )}

          {summary === undefined ? (
            !loadError && (
              <div className="mt-4">
                <LoadingBlock rows={2} label="Checking this browser" />
              </div>
            )
          ) : summary === null ? (
            <div className="mt-5 flex flex-col gap-4">
              <Notice tone="warn" title="Never use test keys on mainnet">
                CommunitySafe only supports this experimental signer on Regtest. Treat the recovery words and passphrase
                as if they controlled real money anyway.
              </Notice>
              <div className="flex flex-wrap gap-2">
                <Button icon="key" disabled={!canRegister || busy} onClick={startCreate}>
                  Create a browser signer
                </Button>
                <Button variant="secondary" icon="refresh" disabled={busy} onClick={startRestore}>
                  Restore from recovery words
                </Button>
              </div>
              {!canRegister && (
                <p className="text-sm text-muted">
                  The wallet is already live, so this browser can only restore an existing key, not create a new one.
                </p>
              )}
            </div>
          ) : (
            <ExistingVault
              summary={summary}
              registeredPublicKey={registeredPublicKey}
              matchesRegistered={matchesRegistered}
              needsRegistration={needsRegistration}
              canRegister={canRegister}
              busy={busy}
              onRegister={() => void registerExisting()}
              onRestore={startRestore}
              onRemove={() => void remove()}
            />
          )}
        </>
      )}

      <BackupWordsModal
        open={words !== null}
        words={words ?? []}
        onClose={() => setWords(null)}
        onConfirmed={() => {
          if (!words) return
          setPending({ mnemonic: words.join(' '), replace: false })
          setWords(null)
          setPassphraseError(null)
          setPassphraseOpen(true)
        }}
      />

      <PassphraseModal
        open={passphraseOpen}
        mode="create"
        busy={busy}
        error={passphraseError}
        onClose={() => {
          setPassphraseOpen(false)
          setPending(null)
          setPassphraseError(null)
        }}
        onSubmit={(passphrase) => void createFromWords(passphrase)}
      />

      <Modal open={restoring} onClose={() => setRestoring(false)} title="Restore a browser signer">
        <form className="mt-5 flex flex-col gap-5" onSubmit={submitRestore} noValidate>
          <Notice tone="warn" title="Recovery words only">
            CommunitySafe never receives these words. They unlock the same key that was registered with this community;
            the passphrase you choose next only protects the copy stored in this browser.
          </Notice>
          <TextArea
            label="Recovery words"
            mono
            rows={4}
            value={restoreText}
            error={restoreError ?? undefined}
            onChange={(event) => {
              setRestoreText(event.target.value)
              setRestoreError(null)
            }}
            hint="Separate all 12–24 words with single spaces."
            placeholder="word one two three…"
            spellCheck={false}
            autoComplete="off"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRestoring(false)}>
              Cancel
            </Button>
            <Button type="submit" icon="arrowRight">
              Continue
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  )
}


interface ExistingVaultProps {
  summary: VaultSummary
  registeredPublicKey: string | null | undefined
  matchesRegistered: boolean
  needsRegistration: boolean
  canRegister: boolean
  busy: boolean
  onRegister: () => void
  onRestore: () => void
  onRemove: () => void
}

function ExistingVault({ summary, registeredPublicKey, matchesRegistered, needsRegistration, canRegister, busy, onRegister, onRestore, onRemove }: ExistingVaultProps) {
  return (
    <div className="mt-5 flex flex-col gap-4">
      <dl className="grid gap-4 border border-line bg-paper p-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-semibold text-muted">Public key</dt>
          <dd className="mt-1 flex items-center gap-2">
            <code className="min-w-0 break-all font-mono text-[13px]" title={summary.publicKey}>
              {shortHash(summary.publicKey, 14, 10)}
            </code>
            <CopyButton value={summary.publicKey} className="h-8" />
          </dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-muted">Derivation path</dt>
          <dd className="mt-1 font-mono text-[13px]">{summary.derivationPath}</dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-muted">Created in this browser</dt>
          <dd className="mt-1 text-[15px]">{date(summary.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-muted">Registered with this community</dt>
          <dd className="mt-1">
            {registeredPublicKey === undefined ? (
              <Badge tone="neutral" icon="clock">Checking</Badge>
            ) : matchesRegistered ? (
              <Badge tone="ok" icon="check">Registered</Badge>
            ) : (
              <Badge tone="wait" icon="clock">Not registered</Badge>
            )}
          </dd>
        </div>
      </dl>

      {matchesRegistered && (
        <Notice tone="ok">This browser key matches the public key registered for your signer account.</Notice>
      )}
      {needsRegistration && canRegister && (
        <Notice tone="warn" title="This key is not registered yet">
          Register it before the wallet is created, otherwise the multisig will not include it.
          <div className="mt-3">
            <Button size="sm" icon="key" busy={busy} onClick={onRegister}>
              Register this public key
            </Button>
          </div>
        </Notice>
      )}
      {needsRegistration && !canRegister && (
        <Notice tone="bad" title="This browser key is not the wallet key">
          The wallet is live and can only be signed by the keys registered at creation. Restore the recovery words of the
          key you registered earlier.
        </Notice>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" icon="refresh" disabled={busy} onClick={onRestore}>
          Restore other words
        </Button>
        <Button variant="ghost" size="sm" icon="ban" disabled={busy} onClick={onRemove}>
          Remove from this browser
        </Button>
      </div>
    </div>
  )
}

