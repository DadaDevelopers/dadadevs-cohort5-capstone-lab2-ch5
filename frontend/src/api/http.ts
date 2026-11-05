import { ApiError, type ApiErrorCode } from './errors'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const SESSION_KEY = 'communitysafe.auth.v1'

interface StoredSession {
  accessToken: string
  refreshToken: string
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  auth?: boolean
  body?: unknown
  headers?: HeadersInit
}

let memorySession: StoredSession | null | undefined
let refreshRequest: Promise<string | null> | null = null
let sessionExpiredHandler: (() => void) | null = null

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

function readSession(): StoredSession | null {
  if (memorySession !== undefined) return memorySession
  const raw = browserStorage()?.getItem(SESSION_KEY)
  if (!raw) return (memorySession = null)
  try {
    const value = JSON.parse(raw) as Partial<StoredSession>
    memorySession = typeof value.accessToken === 'string' && typeof value.refreshToken === 'string'
      ? { accessToken: value.accessToken, refreshToken: value.refreshToken }
      : null
  } catch {
    memorySession = null
  }
  if (!memorySession) browserStorage()?.removeItem(SESSION_KEY)
  return memorySession
}

export function storeSession(accessToken: string, refreshToken: string): void {
  memorySession = { accessToken, refreshToken }
  browserStorage()?.setItem(SESSION_KEY, JSON.stringify(memorySession))
}

export function clearSession(): void {
  memorySession = null
  browserStorage()?.removeItem(SESSION_KEY)
}

export function hasStoredSession(): boolean {
  return readSession() !== null
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler
}

function expireSession(): void {
  clearSession()
  sessionExpiredHandler?.()
}

function errorCode(status: number): ApiErrorCode {
  if (status === 401) return 'UNAUTHENTICATED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 429) return 'RATE_LIMITED'
  if (status === 503) return 'NODE_UNAVAILABLE'
  return 'VALIDATION'
}

async function errorFrom(response: Response): Promise<ApiError> {
  let message = `Request failed (${response.status})`
  let fields: Record<string, string> = {}
  try {
    const payload = await response.json() as { error?: unknown; fields?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) message = payload.error
    if (payload.fields && typeof payload.fields === 'object' && !Array.isArray(payload.fields)) {
      fields = Object.fromEntries(
        Object.entries(payload.fields).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
      )
    }
  } catch {
    // The HTTP status remains authoritative when an upstream response is not JSON.
  }
  const retryAfter = response.headers.get('Retry-After')
  const parsedRetryAfter = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : null
  if (response.status === 429) {
    message = parsedRetryAfter && parsedRetryAfter > 0
      ? `Too many requests. Try again in ${parsedRetryAfter} second${parsedRetryAfter === 1 ? '' : 's'}.`
      : 'Too many requests. Please wait before trying again.'
  }
  return new ApiError(errorCode(response.status), message, fields, response.status, parsedRetryAfter)
}

function url(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshRequest) return refreshRequest
  const session = readSession()
  if (!session) return null
  refreshRequest = (async () => {
    try {
      const response = await fetch(url('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      })
      if (!response.ok) return null
      const payload = await response.json() as { token?: unknown }
      if (typeof payload.token !== 'string' || !payload.token) return null
      storeSession(payload.token, session.refreshToken)
      return payload.token
    } catch {
      return null
    } finally {
      refreshRequest = null
    }
  })()
  return refreshRequest
}

async function send<T>(path: string, options: ApiRequestOptions, allowRefresh: boolean): Promise<T> {
  const { auth = true, body, headers: suppliedHeaders, ...requestOptions } = options
  const headers = new Headers(suppliedHeaders)
  headers.set('Accept', 'application/json')
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  const token = auth ? readSession()?.accessToken : null
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(url(path), {
      ...requestOptions,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('NETWORK', 'Could not reach the CommunitySafe server. Check your connection and try again.')
  }

  if (response.status === 401 && auth && allowRefresh) {
    const tokenAfterRefresh = await refreshAccessToken()
    if (tokenAfterRefresh) return send<T>(path, options, false)
    expireSession()
  }
  if (!response.ok) throw await errorFrom(response)
  if (response.status === 204) return undefined as T
  try {
    return await response.json() as T
  } catch {
    throw new ApiError('NETWORK', 'The CommunitySafe server returned an unreadable response.', {}, response.status)
  }
}

export function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  return send<T>(path, options, true)
}

export function resetHttpStateForTests(): void {
  memorySession = undefined
  refreshRequest = null
  sessionExpiredHandler = null
}
