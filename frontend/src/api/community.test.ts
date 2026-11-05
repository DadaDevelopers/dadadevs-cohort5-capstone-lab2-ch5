import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './index'
import { resetHttpStateForTests, storeSession } from './http'

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const member = (id: number, role: 'COMMUNITY_ADMIN' | 'COMMUNITY_MEMBER' = 'COMMUNITY_MEMBER') => ({
  id,
  firstName: id === 7 ? 'Amina' : 'Kamau',
  lastName: 'Wanjiku',
  email: `${id}@example.org`,
  role,
})

describe('real community, member, and signer APIs', () => {
  beforeEach(async () => {
    sessionStorage.clear()
    resetHttpStateForTests()
    vi.restoreAllMocks()
    storeSession('access', 'refresh')
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({
      user: { id: 7, firstName: 'Amina', lastName: 'Wanjiku', email: '7@example.org', createdAt: '2026-10-22T08:00:00Z' },
    }))
    await api.restoreSession()
    vi.mocked(fetch).mockReset()
  })

  it('maps community lists and sends only fields supported by create', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ communities: [{ id: 3, name: 'Umoja', description: 'Shared fund', role: 'COMMUNITY_ADMIN', setupStage: 'active' }] }))
      .mockResolvedValueOnce(json({ community: { id: 4, name: 'New fund', description: 'Purpose', role: 'COMMUNITY_ADMIN', joinCode: 'DADA-ABC' } }, 201))

    await expect(api.listMyCommunities()).resolves.toEqual([expect.objectContaining({ id: '3', name: 'Umoja', setupStage: 'active' })])
    await api.createCommunity({ name: ' New fund ', description: ' Purpose ', type: 'organization' })

    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toEqual({ name: 'New fund', description: 'Purpose' })
  })

  it('normalizes and submits a join code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ community: { id: 9, name: 'Joined', role: 'COMMUNITY_MEMBER' } }, 201))
    await expect(api.joinCommunity(' dada-ab12 ')).resolves.toMatchObject({ id: '9', name: 'Joined' })
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ joinCode: 'DADA-AB12' })
  })

  it('adds an existing account by email and reloads the canonical member', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ member: { userId: 8, communityId: 3, role: 'COMMUNITY_MEMBER' } }, 201))
      .mockResolvedValueOnce(json({ members: [member(7, 'COMMUNITY_ADMIN'), member(8)] }))

    await expect(api.addMember('3', { email: '8@example.org' })).resolves.toMatchObject({ id: '8', name: 'Kamau Wanjiku' })
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({ email: '8@example.org' })
  })

  it('diffs signer selection using the backend POST and DELETE routes', async () => {
    const signer7 = { signerId: 2, userId: 7, firstName: 'Amina', lastName: 'Wanjiku', email: '7@example.org', membershipRole: 'COMMUNITY_ADMIN', publicInfoRegistered: false, createdAt: '2026-10-22T08:00:00Z' }
    const signer8 = { ...signer7, signerId: 3, userId: 8, firstName: 'Kamau', email: '8@example.org' }
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ signers: [signer7] }))
      .mockResolvedValueOnce(json({ signer: signer8 }, 201))
      .mockResolvedValueOnce(json(null, 204))
      .mockResolvedValueOnce(json({ signers: [signer8] }))

    await expect(api.setAuthorisedSigners('3', ['8'])).resolves.toEqual([expect.objectContaining({ memberId: '8' })])
    const calls = vi.mocked(fetch).mock.calls
    expect(calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ['/communities/3/signers', undefined],
      ['/communities/3/signers', 'POST'],
      ['/communities/3/signers/7', 'DELETE'],
      ['/communities/3/signers', undefined],
    ])
  })

  it('derives the setup stage and treats a missing wallet as a draft', async () => {
    const signer = { signerId: 2, userId: 7, firstName: 'Amina', lastName: 'Wanjiku', email: '7@example.org', membershipRole: 'COMMUNITY_ADMIN', publicInfoRegistered: false, createdAt: '2026-10-22T08:00:00Z' }
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ community: { id: 3, name: 'Umoja', description: 'Shared', role: 'COMMUNITY_ADMIN', joinCode: 'DADA-ABC' } }))
      .mockResolvedValueOnce(json({ members: [member(7, 'COMMUNITY_ADMIN')] }))
      .mockResolvedValueOnce(json({ signers: [signer] }))
      .mockResolvedValueOnce(json({ requiredSignatures: 1, authorizedSignerCount: 1 }))
      .mockResolvedValueOnce(json({ error: 'Community wallet not found' }, 404))

    await expect(api.loadCommunityContext('3')).resolves.toMatchObject({
      community: { id: '3', joinCode: 'DADA-ABC', setupStage: 'signers' },
      wallet: { status: 'draft', threshold: 1, signerCount: 1 },
      membership: { isAdmin: true, isSigner: true },
    })
  })

  it('preserves authorization failures from member management', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: 'Forbidden' }, 403))
    await expect(api.removeMember('3', '8')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
  })
})
