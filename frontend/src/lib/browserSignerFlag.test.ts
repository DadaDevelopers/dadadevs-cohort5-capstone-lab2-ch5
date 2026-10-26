import { describe, expect, it } from 'vitest'
import { BROWSER_SIGNER_FLAG, browserSignerEnabled } from './browserSignerFlag'

describe('browserSignerEnabled', () => {
  it('exposes the exact environment variable name', () => {
    expect(BROWSER_SIGNER_FLAG).toBe('VITE_ENABLE_BROWSER_SIGNER')
  })

  it('enables the experiment only for the literal true value', () => {
    for (const value of ['true', ' TRUE ', 'True']) {
      expect(browserSignerEnabled(value)).toBe(true)
    }
  })

  it('keeps the manual flow for missing, empty, or ambiguous values', () => {
    for (const value of [undefined, '', 'false', '1', 'yes', 'on', 'enabled']) {
      expect(browserSignerEnabled(value)).toBe(false)
    }
  })
})
