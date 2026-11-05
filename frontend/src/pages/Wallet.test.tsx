import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { useActiveCommunity } from '../context/CommunityContext'
import WalletPage from './Wallet'

vi.mock('../context/CommunityContext', () => ({ useActiveCommunity: vi.fn() }))
vi.mock('qrcode.react', () => ({ QRCodeSVG: ({ value }: { value: string }) => <div data-testid="wallet-qr" data-value={value} /> }))

const community = { id: '42', name: 'Umoja', description: 'Shared fund', type: 'community' as const, createdBy: null, createdAt: null, setupStage: 'active' as const }
const address = 'bcrt1qnrxlcyp9pwftxpgxyujt2nkhddywxfkf2zx5a0'
const wallet = { id: '42', communityId: '42', network: 'regtest' as const, scriptType: 'P2WSH' as const, status: 'active' as const, threshold: 2, signerCount: 3, receiveAddress: address, createdAt: null, confirmedBalanceSats: 2_100_000_012_345_678, unconfirmedIncomingSats: 50_000, reservedSats: 0 }
const member = { id: '7', communityId: '42', userId: '7', name: 'Amina Wanjiku', email: 'amina@example.org', isAdmin: true, joinedAt: null }

describe('wallet presentation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(useActiveCommunity).mockReturnValue({
      communities: [community], community, wallet,
      membership: { member, signer: null, isAdmin: true, isSigner: false },
      loading: false, ready: true, error: null, refresh: vi.fn(), selectCommunity: vi.fn(), clear: vi.fn(),
    })
    vi.spyOn(api, 'getWallet').mockResolvedValue(wallet)
    vi.spyOn(api, 'listContributions').mockResolvedValue([])
    vi.spyOn(api, 'listSpendingRequests').mockResolvedValue([])
  })

  it('derives its Regtest indicator and warning from the wallet network', async () => {
    render(<MemoryRouter><WalletPage /></MemoryRouter>)
    expect(await screen.findByText('Test mode · Regtest coins')).not.toBeNull()
    expect(screen.getByText(/This is a Regtest test address/)).not.toBeNull()
    expect(screen.getByText('Available to spend')).not.toBeNull()
    expect(screen.getByText('Reserved for open requests')).not.toBeNull()
    expect(screen.getByText('Arriving (unconfirmed)')).not.toBeNull()
  })

  it('keeps the full balance and encodes the canonical address in the QR', async () => {
    render(<MemoryRouter><WalletPage /></MemoryRouter>)
    expect((await screen.findAllByTestId('responsive-btc-amount'))[0].textContent).toBe('21000000.12345678BTC')
    expect(screen.getByTestId('wallet-qr').getAttribute('data-value')).toBe(`bitcoin:${address}`)
    expect(screen.getByText(address).className).toContain('break-all')
  })

  it('does not hardcode Regtest messaging for a Signet wallet', async () => {
    const signetWallet = { ...wallet, network: 'signet' as const, receiveAddress: 'tb1qsignetexample' }
    vi.mocked(useActiveCommunity).mockReturnValue({
      communities: [community], community, wallet: signetWallet,
      membership: { member, signer: null, isAdmin: true, isSigner: false },
      loading: false, ready: true, error: null, refresh: vi.fn(), selectCommunity: vi.fn(), clear: vi.fn(),
    })
    vi.mocked(api.getWallet).mockResolvedValue(signetWallet)

    render(<MemoryRouter><WalletPage /></MemoryRouter>)
    expect(await screen.findByText('Test mode · Signet coins')).not.toBeNull()
    expect(screen.getByText(/This is a Signet test address/)).not.toBeNull()
    expect(screen.queryByText('Test mode · Regtest coins')).toBeNull()
  })
})
