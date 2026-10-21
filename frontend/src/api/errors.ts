export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NODE_UNAVAILABLE'
  | 'NETWORK'

/** Error shape every API function rejects with. The backend should return the same fields as JSON. */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  /** Field level messages for forms, keyed by input name. */
  readonly fields: Record<string, string>

  constructor(code: ApiErrorCode, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.fields = fields
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}
