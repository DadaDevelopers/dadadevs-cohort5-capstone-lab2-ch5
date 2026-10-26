import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PassphraseModal } from './PassphraseModal'

const PASSPHRASE = 'correct horse battery staple'

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /save browser signer|unlock and sign/i }))
}

describe('PassphraseModal', () => {
  it('rejects a short passphrase before creating a vault', () => {
    const onSubmit = vi.fn()
    render(<PassphraseModal open mode="create" onClose={vi.fn()} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('Vault passphrase'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: 'short' } })
    submit()

    expect(screen.getByRole('alert').textContent).toContain('Use at least 12 characters')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a mismatched confirmation', () => {
    const onSubmit = vi.fn()
    render(<PassphraseModal open mode="create" onClose={vi.fn()} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('Vault passphrase'), { target: { value: PASSPHRASE } })
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: `${PASSPHRASE}2` } })
    submit()

    expect(screen.getByRole('alert').textContent).toContain('do not match')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits a confirmed passphrase exactly once', () => {
    const onSubmit = vi.fn()
    render(<PassphraseModal open mode="create" onClose={vi.fn()} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByLabelText('Vault passphrase'), { target: { value: PASSPHRASE } })
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: PASSPHRASE } })
    submit()

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledWith(PASSPHRASE)
  })

  it('asks for the passphrase only once when unlocking', () => {
    const onSubmit = vi.fn()
    render(<PassphraseModal open mode="unlock" onClose={vi.fn()} onSubmit={onSubmit} />)

    expect(screen.queryByLabelText('Confirm passphrase')).toBeNull()
    submit()
    expect(screen.getByRole('alert').textContent).toContain('Enter the vault passphrase')

    fireEvent.change(screen.getByLabelText('Vault passphrase'), { target: { value: PASSPHRASE } })
    submit()
    expect(onSubmit).toHaveBeenCalledWith(PASSPHRASE)
  })

  it('shows a vault error and blocks closing while busy', () => {
    const onClose = vi.fn()
    render(<PassphraseModal open mode="unlock" busy error="That passphrase could not unlock the browser signer." onClose={onClose} onSubmit={vi.fn()} />)

    expect(screen.getByRole('alert').textContent).toContain('could not unlock')
    const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement
    expect(cancel.disabled).toBe(true)
    fireEvent.click(cancel)
    expect(onClose).not.toHaveBeenCalled()
  })
})
