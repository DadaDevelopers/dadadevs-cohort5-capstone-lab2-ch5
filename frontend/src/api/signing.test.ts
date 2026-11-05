import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './index'
import { resetHttpStateForTests, storeSession } from './http'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('external PSBT signature coordination', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetHttpStateForTests()
    vi.restoreAllMocks()
    storeSession('access', 'refresh')
  })

  it('retrieves the PSBT only from the signer-scoped endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ psbt: 'cHNidP8BAA==' }))
    await expect(api.getSpendingRequestPsbt('3', '12')).resolves.toBe('cHNidP8BAA==')
    expect(fetchMock.mock.calls[0][0]).toBe('/communities/3/wallet/spends/12/psbt')
  })

  it('rejects an unreadable PSBT response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ psbt: null }))
    await expect(api.getSpendingRequestPsbt('3', '12')).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('submits only the externally signed PSBT and maps threshold progress', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ status: 'SIGNING', signatures: 1, requiredSignatures: 2 }))
    await expect(api.submitSignedPsbt('3', '12', ' cHNidP8BAA== ')).resolves.toEqual({ status: 'SIGNING', signatures: 1, requiredSignatures: 2 })
    expect(fetchMock.mock.calls[0][0]).toBe('/communities/3/wallet/spends/12/signatures')
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ psbt: 'cHNidP8BAA==' })
  })

  it('preserves backend rejection of duplicate or invalid signatures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ error: 'Signer has already submitted a signature' }, 409))
    await expect(api.submitSignedPsbt('3', '12', 'cHNidP8BAA==')).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
  })
})
