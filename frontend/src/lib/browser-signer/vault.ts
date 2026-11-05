import { base64 } from '@scure/base'
import { BrowserSignerError } from './errors'
import { deriveSignerKey, normalizeMnemonic } from './keygen'

const DB_NAME = 'communitysafe-browser-signer'
const DB_VERSION = 1
const STORE_NAME = 'vaults'
const RECORD_VERSION = 1
const KDF_ITERATIONS = 600_000
const MIN_KDF_ITERATIONS = 100_000
const MAX_KDF_ITERATIONS = 2_000_000
const SALT_BYTES = 16
const IV_BYTES = 12
const COMPRESSED_PUBLIC_KEY = /^0[23][0-9a-f]{64}$/

export const PASSPHRASE_MIN_LENGTH = 12
export const PASSPHRASE_MAX_LENGTH = 256

export interface VaultLock {
  communityId: string
  userId: string
}

export interface VaultSummary {
  publicKey: string
  derivationPath: string
  createdAt: string
}

export interface UnlockedVault {
  /** Canonical recovery phrase. Keep it in memory only, never in storage. */
  mnemonic: string
  privateKey: Uint8Array
  publicKey: string
  derivationPath: string
}

interface VaultRecord extends VaultLock, VaultSummary {
  id: string
  version: number
  kdf: { name: 'PBKDF2-SHA256'; iterations: number; salt: string }
  cipher: { name: 'AES-256-GCM'; iv: string; ciphertext: string }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
let databasePromise: Promise<IDBDatabase> | null = null

export function browserVaultSupported(): boolean {
  return typeof indexedDB !== 'undefined' && typeof globalThis.crypto?.subtle?.encrypt === 'function'
}

/** IndexedDB is the only persistence: the recovery phrase is never stored in plaintext. */
function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!browserVaultSupported()) {
      reject(new BrowserSignerError('UNAVAILABLE', 'This browser cannot store the signer key securely.'))
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      reject(new BrowserSignerError('UNAVAILABLE', 'The browser vault could not be opened.'))
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new BrowserSignerError('UNAVAILABLE', 'The browser vault could not be opened.'))
    request.onblocked = () => reject(new BrowserSignerError('UNAVAILABLE', 'Close other tabs using the browser signer and try again.'))
  })
  databasePromise.catch(() => {
    databasePromise = null
  })
  return databasePromise
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDatabase()
  return new Promise<T | undefined>((resolve, reject) => {
    let transaction: IDBTransaction
    try {
      transaction = db.transaction(STORE_NAME, mode)
    } catch {
      reject(new BrowserSignerError('UNAVAILABLE', 'The browser vault is unavailable.'))
      return
    }
    const request = run(transaction.objectStore(STORE_NAME))
    let result: T | undefined
    request.onsuccess = () => {
      result = request.result
    }
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(new BrowserSignerError('UNAVAILABLE', 'The browser vault could not be accessed.'))
    transaction.onabort = () => reject(new BrowserSignerError('UNAVAILABLE', 'The browser vault transaction was aborted.'))
  })
}

function vaultId(lock: VaultLock): string {
  return `${lock.communityId}:${lock.userId}`
}

function additionalData(record: VaultRecord): Uint8Array {
  return encoder.encode(`communitysafe-vault-v1|${record.communityId}|${record.userId}|${record.publicKey}|${record.derivationPath}`)
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

/** Copies into an ArrayBuffer-backed view, which WebCrypto's BufferSource type requires. */
function bufferSource(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(value)
}

function validatePassphrase(passphrase: string): void {
  if (typeof passphrase !== 'string' || passphrase.length < PASSPHRASE_MIN_LENGTH) {
    throw new BrowserSignerError('WEAK_PASSPHRASE', `Use at least ${PASSPHRASE_MIN_LENGTH} characters for the vault passphrase.`)
  }
  if (passphrase.length > PASSPHRASE_MAX_LENGTH) {
    throw new BrowserSignerError('WEAK_PASSPHRASE', `The vault passphrase must be at most ${PASSPHRASE_MAX_LENGTH} characters.`)
  }
}

async function deriveVaultKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bufferSource(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}


function corrupt(): BrowserSignerError {
  return new BrowserSignerError('VAULT_CORRUPT', 'The stored browser signer is damaged. Remove it and restore from recovery words.')
}

/** Re-validates everything read from IndexedDB before it is trusted. */
function parseRecord(value: unknown): VaultRecord | undefined {
  if (value === undefined || value === null) return undefined
  const record = value as Partial<VaultRecord>
  const valid =
    record.version === RECORD_VERSION &&
    typeof record.id === 'string' &&
    typeof record.communityId === 'string' &&
    typeof record.userId === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.derivationPath === 'string' &&
    record.derivationPath.startsWith('m/') &&
    typeof record.publicKey === 'string' &&
    COMPRESSED_PUBLIC_KEY.test(record.publicKey) &&
    record.kdf?.name === 'PBKDF2-SHA256' &&
    typeof record.kdf.iterations === 'number' &&
    Number.isInteger(record.kdf.iterations) &&
    record.kdf.iterations >= MIN_KDF_ITERATIONS &&
    record.kdf.iterations <= MAX_KDF_ITERATIONS &&
    typeof record.kdf.salt === 'string' &&
    record.kdf.salt.length > 0 &&
    record.cipher?.name === 'AES-256-GCM' &&
    typeof record.cipher.iv === 'string' &&
    record.cipher.iv.length > 0 &&
    typeof record.cipher.ciphertext === 'string' &&
    record.cipher.ciphertext.length > 0
  if (!valid) throw corrupt()
  return record as VaultRecord
}

async function readRecord(lock: VaultLock): Promise<VaultRecord | undefined> {
  const id = vaultId(lock)
  const record = await withStore<VaultRecord | undefined>('readonly', (store) => store.get(id) as IDBRequest<VaultRecord | undefined>)
  return parseRecord(record)
}

function toSummary(record: VaultRecord): VaultSummary {
  return { publicKey: record.publicKey, derivationPath: record.derivationPath, createdAt: record.createdAt }
}

/** Returns the signer's public details without needing the passphrase, or null when none exists. */
export async function loadVaultSummary(lock: VaultLock): Promise<VaultSummary | null> {
  const record = await readRecord(lock)
  return record ? toSummary(record) : null
}

export interface CreateVaultInput extends VaultLock {
  mnemonic: string
  passphrase: string
  /** Allows replacing an existing vault for the same community and user. */
  replace?: boolean
}

/**
 * Encrypts the recovery phrase with PBKDF2-SHA256 (600k iterations) and
 * AES-256-GCM, binding the ciphertext to this community, user, public key, and
 * derivation path through the additional authenticated data.
 */
export async function createVault(input: CreateVaultInput): Promise<VaultSummary> {
  validatePassphrase(input.passphrase)
  const key = deriveSignerKey(input.mnemonic)
  const existing = await loadVaultSummary(input)
  if (existing && !input.replace) {
    throw new BrowserSignerError('VAULT_EXISTS', 'A browser signer already exists for this community.')
  }

  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const record: VaultRecord = {
    id: vaultId(input),
    version: RECORD_VERSION,
    communityId: input.communityId,
    userId: input.userId,
    publicKey: key.publicKey,
    derivationPath: key.derivationPath,
    createdAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: base64.encode(salt) },
    cipher: { name: 'AES-256-GCM', iv: base64.encode(iv), ciphertext: '' },
  }

  let encrypted: ArrayBuffer
  try {
    const vaultKey = await deriveVaultKey(input.passphrase, salt, KDF_ITERATIONS)
    encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bufferSource(iv), additionalData: bufferSource(additionalData(record)) }, vaultKey, encoder.encode(key.mnemonic))
  } catch {
    throw new BrowserSignerError('UNAVAILABLE', 'The browser could not encrypt the signer key.')
  }
  record.cipher.ciphertext = base64.encode(new Uint8Array(encrypted))
  await withStore('readwrite', (store) => store.put(record))
  return toSummary(record)
}

export interface UnlockVaultInput extends VaultLock {
  passphrase: string
}

/** Decrypts the recovery phrase and re-derives the key it claims to belong to. */
export async function unlockVault(input: UnlockVaultInput): Promise<UnlockedVault> {
  const record = await readRecord(input)
  if (!record) {
    throw new BrowserSignerError('VAULT_MISSING', 'Create the browser signer for this community first.')
  }
  if (typeof input.passphrase !== 'string' || input.passphrase.length === 0) {
    throw new BrowserSignerError('WRONG_PASSPHRASE', 'Enter the vault passphrase to unlock the signer.')
  }

  let plain: ArrayBuffer
  try {
    const salt = base64.decode(record.kdf.salt)
    const vaultKey = await deriveVaultKey(input.passphrase, salt, record.kdf.iterations)
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bufferSource(base64.decode(record.cipher.iv)), additionalData: bufferSource(additionalData(record)) },
      vaultKey,
      bufferSource(base64.decode(record.cipher.ciphertext)),
    )
  } catch {
    // AES-GCM cannot distinguish a wrong passphrase from a tampered record.
    throw new BrowserSignerError('WRONG_PASSPHRASE', 'That passphrase could not unlock the browser signer.')
  }

  let key
  try {
    key = deriveSignerKey(normalizeMnemonic(decoder.decode(plain)))
  } catch {
    throw corrupt()
  }
  if (key.publicKey !== record.publicKey || key.derivationPath !== record.derivationPath) {
    throw corrupt()
  }
  return { mnemonic: key.mnemonic, privateKey: key.privateKey, publicKey: key.publicKey, derivationPath: key.derivationPath }
}

/** Removes the encrypted vault. The recovery words remain the only backup. */
export async function deleteVault(lock: VaultLock): Promise<boolean> {
  const id = vaultId(lock)
  // Read the raw entry: a damaged record must still be removable.
  const existing = await withStore<VaultRecord | undefined>('readonly', (store) => store.get(id) as IDBRequest<VaultRecord | undefined>)
  if (existing === undefined) return false
  await withStore('readwrite', (store) => store.delete(id))
  return true
}
