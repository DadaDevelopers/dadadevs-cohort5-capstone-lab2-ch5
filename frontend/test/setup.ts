import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { webcrypto } from 'node:crypto'
import { afterEach } from 'vitest'

// Vitest runs without globals, so Testing Library cannot register its own
// cleanup hook. Without this, rendered trees leak between tests.
afterEach(cleanup)

// jsdom exposes a minimal `crypto` without WebCrypto. The browser signer relies
// on PBKDF2, AES-256-GCM, and a CSPRNG, so tests borrow Node's implementation.
if (!globalThis.crypto?.subtle) {
  try {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  } catch {
    globalThis.crypto = webcrypto
  }
}

// jsdom implements HTMLDialogElement without showModal/close, which the app's
// Modal component calls. Keep the shim minimal: the component already controls
// rendering through its `open` prop.
if (typeof HTMLDialogElement !== 'undefined') {
  const prototype = HTMLDialogElement.prototype as HTMLDialogElement & {
    showModal?: () => void
    close?: () => void
  }
  if (typeof prototype.showModal !== 'function') {
    prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true
    }
  }
  if (typeof prototype.close !== 'function') {
    prototype.close = function close(this: HTMLDialogElement) {
      this.open = false
    }
  }
}

