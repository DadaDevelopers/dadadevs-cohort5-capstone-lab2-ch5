import { base64, hex } from '@scure/base'
import { Transaction } from '@scure/btc-signer'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../api'
import { createVault, deleteVault, policyFromDescriptor } from '../../lib/browser-signer'
import {
  buildTestPsbt,
  TEST_MNEMONICS,
  testRecipientAddress,
  testSignerKeys,
  testWalletPolicy,
} from '../../lib/browser-signer/testing'
import type { SpendingRequest } from '../../types'
import { BrowserSignRequestPanel } from './BrowserSignRequestPanel'

const COMMUNITY = 'community-1'
const USER = 'user-7'
const PASSPHRASE = 'correct horse battery staple'
const policy = testWalletPolicy()
const keys = testSignerKeys()

const walletPolicy = {
  descriptor: policy.descriptor,
  address: policy.address,
  threshold: policy.threshold,
  network: 'regtest' as const,
}

const request: SpendingRequest = {
  id: '11',
  number: 4,
  communityId: COMMUNITY,
  title: 'School fees',
  purpose: 'Term two',
  recipientAddress: testRecipientAddress(),
  amountSats: 90_000,
  estimatedFeeSats: 1_000,
  feeRateSatVb: 1,
  changeAddress: policy.address,
  createdBy: USER,
  createdByName: 'Amina Wanjiku',
  createdAt: '2026-10-22T08:00:00.000Z',
  updatedAt: '2026-10-22T08:00:00.000Z',
  status: 'pending',
  threshold: 2,
  signerCount: 3,
  txid: null,
  broadcastAttempts: 0,
  lastBroadcastError: null,
}

function renderPanel(onSigned = vi.fn()) {
  render(<BrowserSignRequestPanel communityId={COMMUNITY} userId={USER} request={request} onSigned={onSigned} />)
  return { onSigned }
}

async function openReview() {
  fireEvent.click(await screen.findByRole('button', { name: 'Load PSBT and review' }))
  return screen.findByText('90,000 sats')
}

describe('BrowserSignRequestPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(api, 'getWalletPolicy').mockResolvedValue({ ...walletPolicy, network: 'regtest' })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await deleteVault({ communityId: COMMUNITY, userId: USER })
  })

  it('explains how to enable signing when this browser has no vault', async () => {
    renderPanel()
    expect(await screen.findByText('No browser signer in this browser')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Load PSBT and review' })).toBeNull()
  })

  it('reviews the coordinator PSBT, then signs and submits it with the browser key', async () => {
    await createVault({ communityId: COMMUNITY, userId: USER, mnemonic: TEST_MNEMONICS[0], passphrase: PASSPHRASE })
    vi.spyOn(api, 'getSpendingRequestPsbt').mockResolvedValue(buildTestPsbt(policy))
    const submit = vi.spyOn(api, 'submitSignedPsbt').mockResolvedValue({ status: 'SIGNING', signatures: 1, requiredSignatures: 2 })
    const { onSigned } = renderPanel()

    await openReview()
    expect(screen.getByText('91,000 sats')).not.toBeNull()
    expect(screen.getByText('1,000 sats')).not.toBeNull()
    expect(screen.getByText('No other signature has been collected yet.')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Sign and submit' }))
    fireEvent.change(await screen.findByLabelText('Vault passphrase'), { target: { value: PASSPHRASE } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock and sign' }))

    await waitFor(() => expect(submit).toHaveBeenCalledOnce(), { timeout: 8000 })
    const submitted = Transaction.fromPSBT(base64.decode(submit.mock.calls[0][2]))
    const partialSignatures = submitted.getInput(0).partialSig ?? []
    expect(partialSignatures).toHaveLength(1)
    expect(hex.encode(partialSignatures[0][0])).toBe(keys[0].publicKey)
    expect(onSigned).toHaveBeenCalledWith(expect.stringContaining('1 of 2 signatures'))
  })

  it('keeps the modal open and submits nothing when the passphrase is wrong', async () => {
    await createVault({ communityId: COMMUNITY, userId: USER, mnemonic: TEST_MNEMONICS[0], passphrase: PASSPHRASE })
    vi.spyOn(api, 'getSpendingRequestPsbt').mockResolvedValue(buildTestPsbt(policy))
    const submit = vi.spyOn(api, 'submitSignedPsbt')

    renderPanel()
    await openReview()
    fireEvent.click(screen.getByRole('button', { name: 'Sign and submit' }))
    fireEvent.change(await screen.findByLabelText('Vault passphrase'), { target: { value: 'not the right passphrase' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock and sign' }))

    expect(await screen.findByText('That passphrase could not unlock the browser signer.', undefined, { timeout: 8000 })).not.toBeNull()
    expect(submit).not.toHaveBeenCalled()
  })

  it('refuses to sign when the browser key is not one of the wallet keys', async () => {
    const descriptor = `wsh(sortedmulti(2,${keys[1].publicKey},${keys[2].publicKey}))`
    const derived = policyFromDescriptor(descriptor)
    vi.mocked(api.getWalletPolicy).mockResolvedValue({
      descriptor,
      address: derived.address,
      threshold: 2,
      network: 'regtest',
    })
    await createVault({ communityId: COMMUNITY, userId: USER, mnemonic: TEST_MNEMONICS[0], passphrase: PASSPHRASE })

    renderPanel()
    expect(await screen.findByText('This key cannot sign this wallet')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Load PSBT and review' })).toBeNull()
  })
})
