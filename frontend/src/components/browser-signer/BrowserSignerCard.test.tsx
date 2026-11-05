import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../api'
import { deleteVault, deriveSignerKey } from '../../lib/browser-signer'
import { TEST_MNEMONICS } from '../../lib/browser-signer/testing'
import { BrowserSignerCard } from './BrowserSignerCard'

const COMMUNITY = 'community-1'
const USER = 'user-7'
const PASSPHRASE = 'correct horse battery staple'

function renderCard(overrides: Partial<Parameters<typeof BrowserSignerCard>[0]> = {}) {
  const onRegistered = vi.fn()
  render(
    <BrowserSignerCard
      communityId={COMMUNITY}
      userId={USER}
      registeredPublicKey={null}
      canRegister
      onRegistered={onRegistered}
      {...overrides}
    />,
  )
  return { onRegistered }
}

async function enterPassphrase(mode: 'create' | 'unlock' = 'create') {
  fireEvent.change(await screen.findByLabelText('Vault passphrase'), { target: { value: PASSPHRASE } })
  if (mode === 'create') {
    fireEvent.change(screen.getByLabelText('Confirm passphrase'), { target: { value: PASSPHRASE } })
  }
  fireEvent.click(screen.getByRole('button', { name: mode === 'create' ? 'Save browser signer' : 'Unlock and sign' }))
}

describe('BrowserSignerCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await deleteVault({ communityId: COMMUNITY, userId: USER })
  })

  it('creates a signer from fresh words, then registers only its public key', async () => {
    const register = vi.spyOn(api, 'registerSignerKey').mockResolvedValue({ registered: true, publicKey: '' })
    const { onRegistered } = renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Create a browser signer' }))
    const words = within(screen.getByRole('list', { name: 'Recovery words' })).getAllByRole('listitem')
    expect(words).toHaveLength(24)

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await enterPassphrase()

    await waitFor(() => expect(register).toHaveBeenCalledOnce(), { timeout: 8000 })
    const publicKey = register.mock.calls[0][1]
    expect(publicKey).toMatch(/^0[23][0-9a-f]{64}$/)
    expect(onRegistered).toHaveBeenCalledOnce()
    expect(await screen.findByText('Browser signer ready and its public key is registered with this community.')).not.toBeNull()
  })

  it('restores a signer from written words without generating new ones', async () => {
    const register = vi.spyOn(api, 'registerSignerKey').mockResolvedValue({ registered: true, publicKey: '' })
    const { onRegistered } = renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Restore from recovery words' }))
    fireEvent.change(screen.getByLabelText('Recovery words'), { target: { value: TEST_MNEMONICS[1] } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await enterPassphrase()

    await waitFor(() => expect(register).toHaveBeenCalledOnce(), { timeout: 8000 })
    expect(register.mock.calls[0][1]).toBe(deriveSignerKey(TEST_MNEMONICS[1]).publicKey)
    expect(onRegistered).toHaveBeenCalledOnce()
  })

  it('rejects invalid recovery words before asking for a passphrase', async () => {
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Restore from recovery words' }))
    fireEvent.change(screen.getByLabelText('Recovery words'), { target: { value: 'not a valid phrase' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText(/Enter the 12–24 recovery words/)).not.toBeNull()
    expect(screen.queryByLabelText('Vault passphrase')).toBeNull()
  })

  it('will not create a new key once the wallet is live', async () => {
    renderCard({ canRegister: false })
    const create = await screen.findByRole('button', { name: 'Create a browser signer' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    expect(screen.getByText(/only restore an existing key/)).not.toBeNull()
  })
})
