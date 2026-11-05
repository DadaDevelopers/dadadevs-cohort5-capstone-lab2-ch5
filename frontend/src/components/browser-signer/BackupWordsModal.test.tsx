import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BackupWordsModal } from './BackupWordsModal'

// Public BIP39 test vector: valid, deterministic, and never used on a real network.
const WORDS = [...Array<string>(23).fill('abandon'), 'art']

function renderModal(overrides: Partial<Parameters<typeof BackupWordsModal>[0]> = {}) {
  const onClose = vi.fn()
  const onConfirmed = vi.fn()
  render(<BackupWordsModal open words={WORDS} onClose={onClose} onConfirmed={onConfirmed} {...overrides} />)
  return { onClose, onConfirmed }
}

describe('BackupWordsModal', () => {
  it('shows all 24 words and requires explicit confirmation', () => {
    const { onConfirmed } = renderModal()

    const list = screen.getByRole('list', { name: 'Recovery words' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(24)

    const continueButton = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement
    expect(continueButton.disabled).toBe(true)
    fireEvent.click(continueButton)
    expect(onConfirmed).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('checkbox'))
    expect(continueButton.disabled).toBe(false)
    fireEvent.click(continueButton)
    expect(onConfirmed).toHaveBeenCalledOnce()
  })

  it('never offers to copy the words and lets the signer back out', () => {
    const { onClose, onConfirmed } = renderModal()

    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it('renders nothing while closed', () => {
    render(<BackupWordsModal open={false} words={WORDS} onClose={vi.fn()} onConfirmed={vi.fn()} />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('list', { name: 'Recovery words' })).toBeNull()
  })
})
