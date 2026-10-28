import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './index'
import { ApiError } from './errors'
import { hasStoredSession, request, resetHttpStateForTests, storeSession } from './http'

const backendUser = {
  id: 7,
  firstName: 'Amina',
  lastName: 'Wanjiku',
  email: 'amina@example.org',
  createdAt: '2026-10-22T08:00:00.000Z',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('real authentication API', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetHttpStateForTests()
    vi.restoreAllMocks()
  })

  it('logs in, maps the backend user, and stores tab-scoped tokens', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ token: 'access', refreshToken: 'refresh', user: backendUser }))

    await expect(api.login({ email: ' AMINA@example.org ', password: 'correct horse' })).resolves.toEqual({
      id: '7',
      name: 'Amina Wanjiku',
      email: 'amina@example.org',
      createdAt: backendUser.createdAt,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('/auth/login')
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ email: 'AMINA@example.org', password: 'correct horse' })
    expect(hasStoredSession()).toBe(true)
  })

  it('registers first and last names, then performs a real login', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ user: backendUser }, 201))
      .mockResolvedValueOnce(json({ token: 'access', refreshToken: 'refresh', user: backendUser }))

    await api.register({ name: 'Amina Njeri Wanjiku', email: 'amina@example.org', password: 'correct horse' })

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      firstName: 'Amina',
      lastName: 'Njeri Wanjiku',
      email: 'amina@example.org',
      password: 'correct horse',
    })
    expect(fetchMock.mock.calls[1][0]).toBe('/auth/login')
  })

  it('normalizes duplicate registration and invalid credential responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ error: 'Email already registered' }, 409))
    await expect(api.register({ name: 'Amina Wanjiku', email: 'amina@example.org', password: 'correct horse' }))
      .rejects.toMatchObject({ code: 'CONFLICT', status: 409, message: 'Email already registered' })

    vi.mocked(fetch).mockResolvedValueOnce(json({ error: 'Invalid credentials' }, 401))
    await expect(api.login({ email: 'amina@example.org', password: 'wrong password' }))
      .rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401, message: 'Invalid credentials' })
  })

  it('restores a session and sends the access token', async () => {
    storeSession('access', 'refresh')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ user: backendUser }))

    await expect(api.restoreSession()).resolves.toMatchObject({ id: '7', name: 'Amina Wanjiku' })
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer access')
  })

  it('coalesces simultaneous session restoration such as React StrictMode or two consumers', async () => {
    storeSession('access', 'refresh')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ user: backendUser }))

    const [first, second] = await Promise.all([api.restoreSession(), api.restoreSession()])
    expect(first).toEqual(second)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('surfaces Retry-After without automatically retrying a 429 response', async () => {
    storeSession('access', 'refresh')
    const response = new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '17' },
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response)

    await expect(request('/communities')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      retryAfterSeconds: 17,
      message: 'Too many requests. Try again in 17 seconds.',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('explains a 503 as the Bitcoin node being unavailable in this environment', async () => {
    storeSession('access', 'refresh')
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ error: 'Bitcoin service unavailable' }, 503))

    await expect(api.createWallet('3')).rejects.toMatchObject({
      code: 'NODE_UNAVAILABLE',
      status: 503,
      message: 'The Bitcoin node isn\'t available in this environment, so wallet features can\'t run here. The rest of CommunitySafe still works.',
    })
  })

  it('refreshes once after a 401 and retries with the new access token', async () => {
    storeSession('expired', 'refresh')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(json({ token: 'renewed' }))
      .mockResolvedValueOnce(json({ communities: [] }))

    await expect(request('/communities')).resolves.toEqual({ communities: [] })
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/communities', '/auth/refresh', '/communities'])
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get('Authorization')).toBe('Bearer renewed')
  })

  it('expires the local session when refresh is rejected', async () => {
    storeSession('expired', 'invalid-refresh')
    const expired = vi.fn()
    api.onSessionExpired(expired)
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(json({ error: 'Unauthorized' }, 401))

    await expect(request('/communities')).rejects.toBeInstanceOf(ApiError)
    expect(expired).toHaveBeenCalledOnce()
    expect(hasStoredSession()).toBe(false)
  })

  it('normalizes network failure and clears tokens on logout', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'))
    await expect(api.login({ email: 'amina@example.org', password: 'correct horse' }))
      .rejects.toMatchObject({ code: 'NETWORK' })

    storeSession('access', 'refresh')
    await api.logout()
    expect(hasStoredSession()).toBe(false)
  })
})
