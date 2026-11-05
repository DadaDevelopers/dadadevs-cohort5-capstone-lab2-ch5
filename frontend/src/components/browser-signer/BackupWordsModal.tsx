import { useEffect, useId, useState } from 'react'
import { RECOVERY_WORD_COUNT } from '../../lib/browser-signer'
import { Button, Modal, Notice } from '../ui'

interface BackupWordsModalProps {
  open: boolean
  words: string[]
  onClose: () => void
  /** Called only after the signer confirms they wrote the words down. */
  onConfirmed: () => void
}

/**
 * Shows freshly generated BIP39 words exactly once. There is deliberately no
 * copy control and no way back to this screen after the vault is created.
 */
export function BackupWordsModal({ open, words, onClose, onConfirmed }: BackupWordsModalProps) {
  const [confirmed, setConfirmed] = useState(false)
  const checkboxId = useId()
  const complete = words.length === RECOVERY_WORD_COUNT

  useEffect(() => {
    if (open) setConfirmed(false)
  }, [open])

  return (
    <Modal open={open} onClose={onClose} title={`Write down your ${words.length || RECOVERY_WORD_COUNT} recovery words`}>
      <div className="mt-5 flex flex-col gap-5">
        <Notice tone="warn" title="These words are the only backup">
          Anyone who reads them can sign for this community. Keep them offline, never type them into another website, and
          never share them with CommunitySafe. The passphrase you choose next cannot restore them.
        </Notice>

        <ol
          aria-label="Recovery words"
          className="grid grid-cols-2 gap-x-4 gap-y-2 border border-line bg-paper p-4 font-mono text-[15px] sm:grid-cols-3"
        >
          {words.map((word, index) => (
            <li key={`${index}-${word}`} className="flex gap-2">
              <span className="w-6 shrink-0 text-right tabular text-muted">{index + 1}.</span>
              <span className="break-all">{word}</span>
            </li>
          ))}
        </ol>

        <label htmlFor={checkboxId} className="flex items-start gap-3 text-[15px] leading-relaxed">
          <input
            id={checkboxId}
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-accent"
          />
          <span>
            I wrote down all {words.length} words in order and stored them offline. I understand CommunitySafe cannot
            recover them for me.
          </span>
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" icon="arrowRight" disabled={!confirmed || !complete} onClick={onConfirmed}>
            Continue
          </Button>
        </div>
      </div>
    </Modal>
  )
}
