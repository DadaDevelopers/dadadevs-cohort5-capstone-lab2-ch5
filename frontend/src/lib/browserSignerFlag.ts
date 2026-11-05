export const BROWSER_SIGNER_FLAG = 'VITE_ENABLE_BROWSER_SIGNER'

/**
 * The browser signer is an opt-in Regtest experiment. Anything other than the
 * literal `true` keeps the original manual/keyboard-signer flow.
 */
export function browserSignerEnabled(value?: string): boolean {
  // Distinguish an omitted argument (read the build-time flag) from an explicit
  // `undefined` (the flag is missing), which keeps the manual flow by default.
  const raw = arguments.length === 0 ? import.meta.env.VITE_ENABLE_BROWSER_SIGNER : value
  return raw?.trim().toLowerCase() === 'true'
}
