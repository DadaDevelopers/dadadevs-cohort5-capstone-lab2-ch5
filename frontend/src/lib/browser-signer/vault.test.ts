import { describe, expect, it } from 'vitest'
import { TEST_MNEMONICS, testSignerKeys } from './testing'
import {
  browserVaultSupported,
  createVault,
  deleteVault,
  loadVaultSummary,
  PASSPHRASE_MAX_LENGTH,
  PASSPHRASE_MIN_LENGTH,
  unlockVault,
  type VaultLock,
} from './vault'

const DB_NAME = 'communitysafe-browser-signer'
const STORE_NAME = 'vaults'
const PASSPHRASE = 'correct horse battery staple'
const keys = testSignerKeys()

let sequence = 0
function nextLock(): VaultLock {
  sequence += 1
  return { communityId: `community-${sequence}`, userId: 'user-1' }
}

function request<T>(store: IDBObjectStore, action: 'get' | 'put', value: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const result = action === 'get' ? store.get(value as IDBValidKey) : store.put(value)
    result.onsuccess = () => resolve(result.result as T)
    result.onerror = () => reject(result.error)
  })
}

async function rawStore(mode: IDBTransactionMode): Promise<{ store: IDBObjectStore; done: Promise<void> }> {
  const open = indexedDB.open(DB_NAME)
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
  })
  const transaction = db.transaction(STORE_NAME, mode)
  return {
    store: transaction.objectStore(STORE_NAME),
    done: new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    }),
  }
}

async function readRawRecord(lock: VaultLock): Promise<Record<string, unknown> | undefined> {
  const { store } = await rawStore('readonly')
  return request<Record<string, unknown> | undefined>(store, 'get', `${lock.communityId}:${lock.userId}`)
}

async function writeRawRecord(record: unknown): Promise<void> {
  const { store, done } = await rawStore('readwrite')
  await request(store, 'put', record)
  await done
}

describe('encrypted browser signer vault', () => {
  it('supports IndexedDB and WebCrypto in the test environment', () => {
    expect(browserVaultSupported()).toBe(true)
  })

  it('stores only ciphertext and the public key', async () => {
    const lock = nextLock()
    const summary = await createVault({ ...lock, mnemonic: TEST_MNEMONICS[0], passphrase: PASSPHRASE })
    const raw = await readRawRecord(lock)

    expect(summary.publicKey).toBe(keys[0].publicKey)
    expect(summary.derivationPath).toBe(keys[0].derivationPath)
    expect(raw).toMatchObject({
      id: `${lock.communityId}:${lock.userId}`,
      version: 1,
      publicKey: keys[0].publicKey,
      kdf: { name: 'PBKDF2-SHA256', iterations: 600_000 },
      cipher: { name: 'AES-256-GCM' },
    })
    const serialized = JSON.stringify(raw)
    expect(serialized).not.toContain('abandon')
    expect(serialized).not.toContain(TEST_MNEMONICS[0])
    expect((raw?.cipher as { ciphertext: string }).ciphertext.length).toBeGreaterThan(0)
  })

  it('unlocks with the right passphrase and re-derives the same key', async () => {
    const lock = nextLock()
    await createVault({ ...lock, mnemonic: TEST_MNEMONICS[1], passphrase: PASSPHRASE })

    const unlocked = await unlockVault({ ...lock, passphrase: PASSPHRASE })
    expect(unlocked.mnemonic).toBe(TEST_MNEMONICS[1])
    expect(unlocked.publicKey).toBe(keys[1].publicKey)
    expect(unlocked.privateKey).toEqual(keys[1].privateKey)
    expect(unlocked.derivationPath).toBe(keys[1].derivationPath)
  })

  it('rejects a wrong passphrase without leaking the record', async () => {
    const lock = nextLock()
    await createVault({ ...lock, mnemonic: TEST_MNEMONICS[0], passphrase: PASSPHRASE })

    await expect(unlockVault({ ...lock, passphrase: 'wrong horse battery staple' })).rejects.toMatchObject({ code: 'WRONG_PASSPHRASE' })
    await expect(unlockVault({ ...lock, passphrase: '' })).rejects.toMatchObject({ code: 'WRONG_PASSPHRASE' })
    await expect(unlockVault({ ...nextLock(), passphrase: PASSPHRASE })).rejects.toMatchObject({ code: 'VAULT_MISSING' })
  })

  it('refuses to overwrite an existing vault unless asked', async () => {
    const lock = nextLock()
    await createVault({ ...lock, mnemonic: TEST_MNEMONICS[0], passphrase: PASSPHRASE })

    await expect(createVault({ ...lock, mnemonic: TEST_MNEMONICS[1], passphrase: PASSPHRASE })).rejects.toMatchObject({ code: 'VAULT_EXISTS' })
    const replaced = await createVault({ ...lock, mnemonic: TEST_MNEMONICS[1], passphrase: PASSPHRASE, replace: true })
    expect(replaced.publicKey).toBe(keys[1].publicKey)
    await expect(unlockVault({ ...lock, passphrase: PASSPHRASE })).resolves.toMatchObject({ publicKey: keys[1].publicKey })
  })

  it('validates the passphrase before touching storage', async () => {
    const lock = nextLock()
    await expect(createVault({ ...lock, mnemonic: TEST_MNEMONICS[0], passphrase: 'short' })).rejects.toMatchObject({ code: 'WEAK_PASSPHRASE' })
    await expect(createVault({
      ...lock,
      mnemonic: TEST_MNEMONICS[0],
      passphrase: 'a'.repeat(PASSPHRASE_MAX_LENGTH + 1),
    })).rejects.toMatchObject({ code: 'WEAK_PASSPHRASE' })
    await expect(createVault({ ...lock, mnemonic: 'not a real phrase', passphrase: PASSPHRASE })).rejects.toMatchObject({ code: 'INVALID_MNEMONIC' })
    await expect(loadVaultSummary(lock)).resolves.toBeNull()
    expect(PASSPHRASE_MIN_LENGTH).toBeGreaterThanOrEqual(12)
  })

  it('detects a tampered record instead of trusting its public key', async () => {
    const lock = nextLock()
    await createVault({ ...lock, mnemonic: TEST_MNEMONICS[0], passphrase: PASSPHRASE })
    const raw = await readRawRecord(lock)
    await writeRawRecord({ ...raw, publicKey: keys[1].publicKey })

    // The additional authenticated data no longer matches, so AES-GCM fails closed.
    await expect(unlockVault({ ...lock, passphrase: PASSPHRASE })).rejects.toMatchObject({ code: 'WRONG_PASSPHRASE' })
    // The summary is unauthenticated metadata; the passphrase is what proves the key.
    await expect(loadVaultSummary(lock)).resolves.toMatchObject({ publicKey: keys[1].publicKey })
  })

  it('rejects malformed records and deletes only its own vault', async () => {
    const lock = nextLock()
    await createVault({ ...lock, mnemonic: TEST_MNEMONICS[0], passphrase: PASSPHRASE })
    const raw = await readRawRecord(lock)
    await writeRawRecord({ ...raw, kdf: { ...(raw?.kdf as object), iterations: 1 } })

    await expect(loadVaultSummary(lock)).rejects.toMatchObject({ code: 'VAULT_CORRUPT' })

    const other = nextLock()
    await createVault({ ...other, mnemonic: TEST_MNEMONICS[2], passphrase: PASSPHRASE })
    await expect(deleteVault(lock)).resolves.toBe(true)
    await expect(loadVaultSummary(lock)).resolves.toBeNull()
    await expect(loadVaultSummary(other)).resolves.toMatchObject({ publicKey: keys[2].publicKey })
    await expect(deleteVault(lock)).resolves.toBe(false)
  })
})
