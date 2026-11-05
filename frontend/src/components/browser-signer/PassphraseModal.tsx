import { useEffect, useState, type FormEvent } from 'react'
import { PASSPHRASE_MAX_LENGTH, PASSPHRASE_MIN_LENGTH } from '../../lib/browser-signer'
import { Button, Modal, Notice, TextField } from '../ui'

interface PassphraseModalProps {
  open: boolean
  /** `create` asks twice and enforces the minimum length; `unlock` asks once. */
  mode: 'create' | 'unlock'
  busy?: boolean
  error?: string | null
  onClose: () => void
  onSubmit: (passphrase: string) => void
}

/**
 * Collects the local vault passphrase. It never leaves the browser: it only
 * derives the AES key that protects the recovery words in IndexedDB.
 */
export function PassphraseModal({ open, mode, busy = false, error, onClose, onSubmit }: PassphraseModalProps) {
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPassphrase('')
    setConfirmation('')
    setLocalError(null)
  }, [open])

  const close = () => {
    if (busy) return
    onClose()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'create') {
      if (passphrase.length < PASSPHRASE_MIN_LENGTH) {
        setLocalError(`Use at least ${PASSPHRASE_MIN_LENGTH} characters for the vault passphrase.`)
        return
      }
      if (passphrase.length > PASSPHRASE_MAX_LENGTH) {
        setLocalError(`The vault passphrase must be at most ${PASSPHRASE_MAX_LENGTH} characters.`)
        return
      }
      if (passphrase !== confirmation) {
        setLocalError('The two passphrases do not match.')
        return
      }
    } else if (passphrase.length === 0) {
      setLocalError('Enter the vault passphrase to unlock the signer.')
      return
    }
    setLocalError(null)
    onSubmit(passphrase)
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={mode === 'create' ? 'Protect the browser signer' : 'Unlock the browser signer'}
    >
      <form className="mt-5 flex flex-col gap-5" onSubmit={submit} noValidate>
        <Notice tone="lock" title={mode === 'create' ? 'Choose a passphrase you will remember' : 'Your key stays in this browser'}>
          {mode === 'create'
            ? 'The passphrase encrypts the recovery words on this device. It is never sent anywhere and cannot be reset: losing it means restoring from your written words.'
            : 'The passphrase decrypts the key for this one signing action. It is never sent to the coordinator.'}
        </Notice>

        {(localError ?? error) && <Notice tone="bad">{localError ?? error}</Notice>}

        <TextField
          label="Vault passphrase"
          type="password"
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          autoFocus
          spellCheck={false}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          hint={mode === 'create' ? `At least ${PASSPHRASE_MIN_LENGTH} characters. A short sentence works well.` : undefined}
        />
        {mode === 'create' && (
          <TextField
            label="Confirm passphrase"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" icon={mode === 'create' ? 'lock' : 'unlock'} busy={busy}>
            {mode === 'create' ? 'Save browser signer' : 'Unlock and sign'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
