// In-memory stand-in for the Node.js backend and the Bitcoin integration layer.
//
// It enforces the same business rules the real backend must enforce (role
// checks, threshold validation, duplicate signature prevention, no premature
// broadcast) so the UI behaves honestly. State resets when the page reloads.

import { ApiError } from '../api/errors'
import {
  checkExtendedPublicKey,
  DUST_LIMIT_SATS,
  encodeSegwitAddress,
  estimateVsize,
  validateDerivationPath,
  validateFingerprint,
  validateRecipientAddress,
} from '../lib/bitcoin'
import { btc, shortHash } from '../lib/format'
import type {
  AuditAction,
  AuditEvent,
  AuthorisedSigner,
  BitcoinTransaction,
  Community,
  CommunityMember,
  CommunityType,
  Contribution,
  DashboardSummary,
  DemoRole,
  HistoryEntry,
  Membership,
  Signature,
  SpendingRequest,
  SpendingRequestDetail,
  SpendingRequestStatus,
  SpendingRequestSummary,
  User,
  Wallet,
} from '../types'
import * as seed from './data'

const db = {
  users: structuredClone(seed.users),
  communities: structuredClone(seed.communities),
  members: structuredClone(seed.members),
  signers: structuredClone(seed.signers),
  wallets: structuredClone(seed.wallets),
  contributions: structuredClone(seed.contributions),
  requests: structuredClone(seed.spendingRequests),
  signatures: structuredClone(seed.signatures),
  transactions: structuredClone(seed.transactions),
  audit: structuredClone(seed.auditEvents),
}

/** Switches the demo controls can flip to show failure states. */
export const demoFlags = {
  apiOutage: false,
  nodeDown: false,
}

// ---------------------------------------------------------------------------
// Simulated regtest chain. A new block is "mined" every BLOCK_INTERVAL_MS so
// confirmations visibly increase while the prototype is open.

const BLOCK_INTERVAL_MS = 60_000
const loadedAt = Date.now()
let tip = seed.SEED_TIP_HEIGHT

function advanceChain() {
  const target = seed.SEED_TIP_HEIGHT + Math.floor((Date.now() - loadedAt) / BLOCK_INTERVAL_MS)
  while (tip < target) {
    tip++
    for (const c of db.contributions) if (c.blockHeight === null) c.blockHeight = tip
    for (const t of db.transactions) if (t.blockHeight === null) t.blockHeight = tip
  }
}

const confs = (height: number | null) => (height === null ? 0 : tip - height + 1)

export function chainTip(): number {
  advanceChain()
  return tip
}

// ---------------------------------------------------------------------------
// Helpers

let idCounter = 1000
const newId = (prefix: string) => `${prefix}-${++idCounter}`
const now = () => new Date().toISOString()

function randomBytes(n: number): number[] {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
}
const randomHex = (n: number) => randomBytes(n).map((b) => b.toString(16).padStart(2, '0')).join('')
const newWalletAddress = () => encodeSegwitAddress('bcrt', 0, randomBytes(32))

function user(userId: string): User {
  const u = db.users.find((x) => x.id === userId)
  if (!u) throw new ApiError('UNAUTHENTICATED', 'Your session has ended. Please log in again.')
  return u
}

function community(communityId: string): Community {
  const c = db.communities.find((x) => x.id === communityId)
  if (!c) throw new ApiError('NOT_FOUND', 'This community does not exist or was removed.')
  return c
}

function walletRecord(communityId: string): Wallet {
  const w = db.wallets.find((x) => x.communityId === communityId)
  if (!w) throw new ApiError('NOT_FOUND', 'This community has no wallet record yet.')
  return w
}

function membershipOf(communityId: string, userId: string): Membership {
  community(communityId)
  const member = db.members.find((m) => m.communityId === communityId && m.userId === userId)
  if (!member) throw new ApiError('FORBIDDEN', 'You are not a member of this community.')
  const signer = db.signers.find((s) => s.memberId === member.id) ?? null
  return { member, signer, isAdmin: member.isAdmin, isSigner: signer !== null }
}

function requireAdmin(communityId: string, userId: string): Membership {
  const m = membershipOf(communityId, userId)
  if (!m.isAdmin) throw new ApiError('FORBIDDEN', 'Only the community administrator can do this.')
  return m
}

function requireSigner(communityId: string, userId: string): Membership & { signer: AuthorisedSigner } {
  const m = membershipOf(communityId, userId)
  if (!m.signer) {
    throw new ApiError(
      'FORBIDDEN',
      m.isAdmin
        ? 'Administrators can only sign if they were included in the signer set. Being admin does not grant signing authority.'
        : 'Only authorised signers can do this.',
    )
  }
  return { ...m, signer: m.signer }
}

function audit(
  communityId: string,
  actor: { id: string | null; name: string },
  action: AuditAction,
  summary: string,
  targetType: AuditEvent['targetType'],
  targetId: string,
) {
  db.audit.push({ id: newId('aud'), communityId, action, actorId: actor.id, actorName: actor.name, summary, targetType, targetId, createdAt: now() })
}

const ACTIVE_STATUSES: SpendingRequestStatus[] = ['pending', 'awaiting_signatures', 'ready_to_broadcast', 'failed']

function computeWallet(communityId: string): Wallet {
  advanceChain()
  const w = walletRecord(communityId)
  const incoming = db.contributions.filter((c) => c.communityId === communityId)
  const confirmedIn = incoming.filter((c) => c.blockHeight !== null).reduce((s, c) => s + c.amountSats, 0)
  const unconfirmedIn = incoming.filter((c) => c.blockHeight === null).reduce((s, c) => s + c.amountSats, 0)
  const spent = db.transactions.filter((t) => t.communityId === communityId).reduce((s, t) => s + t.amountSats + t.feeSats, 0)
  const reserved = db.requests
    .filter((r) => r.communityId === communityId && ACTIVE_STATUSES.includes(r.status))
    .reduce((s, r) => s + r.amountSats + r.estimatedFeeSats, 0)
  const signerCount = db.signers.filter((s) => s.communityId === communityId).length
  return { ...w, signerCount, confirmedBalanceSats: confirmedIn - spent, unconfirmedIncomingSats: unconfirmedIn, reservedSats: reserved }
}

function withConfs<T extends { blockHeight: number | null; confirmations: number }>(x: T): T {
  return { ...x, confirmations: confs(x.blockHeight) }
}

function txView(t: BitcoinTransaction): BitcoinTransaction {
  const c = confs(t.blockHeight)
  return { ...t, confirmations: c, status: c > 0 ? 'confirmed' : 'mempool' }
}

function signaturesFor(requestId: string): Signature[] {
  return db.signatures.filter((s) => s.requestId === requestId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function summary(r: SpendingRequest): SpendingRequestSummary {
  return { ...r, signatures: signaturesFor(r.id) }
}

function request(requestId: string): SpendingRequest {
  const r = db.requests.find((x) => x.id === requestId)
  if (!r) throw new ApiError('NOT_FOUND', 'This spending request does not exist.')
  return r
}

function estimateFee(m: number, n: number, feeRate: number) {
  return estimateVsize(1, 2, m, n) * feeRate
}

// ---------------------------------------------------------------------------
// Authentication

export function login(email: string): User {
  const existing = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
  // Any credentials work in the prototype. Unknown emails sign in as the demo administrator.
  return existing ?? user('usr-martha')
}

export function register(name: string, email: string): User {
  const clean = email.trim().toLowerCase()
  if (db.users.some((u) => u.email.toLowerCase() === clean)) {
    throw new ApiError('CONFLICT', 'An account with this email already exists. Log in instead.', { email: 'This email is already registered.' })
  }
  const u: User = { id: newId('usr'), name: name.trim(), email: clean, createdAt: now() }
  db.users.push(u)
  return u
}

/** Mock only: returns the seeded person who holds the requested role in a community. */
export function personaFor(communityId: string, role: DemoRole): User {
  const ms = db.members.filter((m) => m.communityId === communityId)
  const signerMemberIds = new Set(db.signers.filter((s) => s.communityId === communityId).map((s) => s.memberId))
  let pick: CommunityMember | undefined
  if (role === 'admin') pick = ms.find((m) => m.isAdmin)
  if (role === 'signer') pick = ms.find((m) => !m.isAdmin && signerMemberIds.has(m.id))
  if (role === 'member') pick = ms.find((m) => !m.isAdmin && !signerMemberIds.has(m.id))
  if (!pick) {
    const label = role === 'signer' ? 'an authorised signer who is not the admin' : role === 'member' ? 'a member who is not a signer' : 'an administrator'
    throw new ApiError('NOT_FOUND', `This community has no ${label} yet.`)
  }
  return user(pick.userId)
}

// ---------------------------------------------------------------------------
// Communities and membership

export function listCommunities(userId: string): Community[] {
  const ids = new Set(db.members.filter((m) => m.userId === userId).map((m) => m.communityId))
  return db.communities.filter((c) => ids.has(c.id))
}

export function getCommunity(communityId: string, userId: string): Community {
  membershipOf(communityId, userId)
  return community(communityId)
}

export function getMembership(communityId: string, userId: string): Membership {
  return membershipOf(communityId, userId)
}

export function createCommunity(userId: string, input: { name: string; description: string; type: CommunityType }): Community {
  const u = user(userId)
  const name = input.name.trim()
  if (name.length < 3) throw new ApiError('VALIDATION', 'Check the highlighted fields.', { name: 'Give the community a name of at least 3 characters.' })
  if (input.description.length > 1000) throw new ApiError('VALIDATION', 'Check the highlighted fields.', { description: 'Keep the description under 1000 characters.' })
  const c: Community = { id: newId('com'), name, description: input.description.trim(), type: input.type, createdBy: u.id, createdAt: now(), setupStage: 'members' }
  db.communities.push(c)
  db.members.push({ id: newId('mem'), communityId: c.id, userId: u.id, name: u.name, email: u.email, isAdmin: true, joinedAt: c.createdAt })
  db.wallets.push({
    id: newId('wal'), communityId: c.id, network: 'regtest', scriptType: 'P2WSH', status: 'draft', threshold: null, signerCount: 0,
    receiveAddress: null, createdAt: null, confirmedBalanceSats: 0, unconfirmedIncomingSats: 0, reservedSats: 0,
  })
  audit(c.id, u, 'community_created', `Created the community “${c.name}”`, 'community', c.id)
  return c
}

export function updateCommunity(communityId: string, userId: string, input: { name: string; description: string }): Community {
  requireAdmin(communityId, userId)
  const c = community(communityId)
  const name = input.name.trim()
  if (name.length < 3) throw new ApiError('VALIDATION', 'Check the highlighted fields.', { name: 'Give the community a name of at least 3 characters.' })
  c.name = name
  c.description = input.description.trim()
  audit(communityId, user(userId), 'community_updated', 'Updated the community name and description', 'community', c.id)
  return c
}

export function listMembers(communityId: string, userId: string): CommunityMember[] {
  membershipOf(communityId, userId)
  return db.members.filter((m) => m.communityId === communityId)
}

export function addMember(communityId: string, userId: string, input: { name: string; email: string }): CommunityMember {
  requireAdmin(communityId, userId)
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  const fields: Record<string, string> = {}
  if (name.length < 2) fields.name = 'Enter the member’s full name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = 'Enter a valid email address, like name@example.org.'
  if (Object.keys(fields).length) throw new ApiError('VALIDATION', 'Check the highlighted fields.', fields)
  if (db.members.some((m) => m.communityId === communityId && m.email === email)) {
    throw new ApiError('CONFLICT', 'This person is already a member.', { email: 'Someone with this email is already in the community.' })
  }
  let u = db.users.find((x) => x.email === email)
  if (!u) {
    u = { id: newId('usr'), name, email, createdAt: now() }
    db.users.push(u)
  }
  const m: CommunityMember = { id: newId('mem'), communityId, userId: u.id, name: u.name, email, isAdmin: false, joinedAt: now() }
  db.members.push(m)
  audit(communityId, user(userId), 'member_added', `Added ${m.name} as a member`, 'member', m.id)
  return m
}

// ---------------------------------------------------------------------------
// Signers and wallet setup

export function listSigners(communityId: string, userId: string): AuthorisedSigner[] {
  membershipOf(communityId, userId)
  return db.signers.filter((s) => s.communityId === communityId)
}

function requireDraftWallet(communityId: string) {
  if (walletRecord(communityId).status !== 'draft') {
    throw new ApiError('CONFLICT', 'The wallet has already been created, so the signer set and approval rule are fixed.')
  }
}

export function setAuthorisedSigners(communityId: string, userId: string, memberIds: string[]): AuthorisedSigner[] {
  requireAdmin(communityId, userId)
  requireDraftWallet(communityId)
  const ms = db.members.filter((m) => m.communityId === communityId)
  for (const id of memberIds) {
    if (!ms.some((m) => m.id === id)) throw new ApiError('VALIDATION', 'Signers must be members of the community.')
  }
  if (memberIds.length < 2) {
    throw new ApiError('VALIDATION', 'Choose at least 2 signers. A single signer would put the funds back in one person’s hands.')
  }
  if (memberIds.length > 15) throw new ApiError('VALIDATION', 'A multisig wallet supports at most 15 signers.')
  const keep = db.signers.filter((s) => s.communityId !== communityId || memberIds.includes(s.memberId))
  const existing = new Set(keep.filter((s) => s.communityId === communityId).map((s) => s.memberId))
  for (const id of memberIds) {
    if (existing.has(id)) continue
    const m = ms.find((x) => x.id === id)!
    keep.push({ id: newId('sig'), communityId, memberId: id, name: m.name, status: 'awaiting_key', xpub: null, fingerprint: null, derivationPath: null, selectedAt: now(), registeredAt: null })
  }
  db.signers = keep
  const w = walletRecord(communityId)
  w.signerCount = memberIds.length
  if (w.threshold !== null && w.threshold > memberIds.length) w.threshold = null
  const c = community(communityId)
  if (c.setupStage === 'members') c.setupStage = 'rule'
  const names = memberIds.map((id) => ms.find((m) => m.id === id)!.name).join(', ')
  audit(communityId, user(userId), 'signers_selected', `Selected ${memberIds.length} authorised signers: ${names}`, 'signer', communityId)
  return db.signers.filter((s) => s.communityId === communityId)
}

export function setThreshold(communityId: string, userId: string, threshold: number): Wallet {
  requireAdmin(communityId, userId)
  requireDraftWallet(communityId)
  const n = db.signers.filter((s) => s.communityId === communityId).length
  if (!Number.isInteger(threshold) || threshold < 2) {
    throw new ApiError('VALIDATION', 'At least 2 signatures must be required. One signature would let one person spend alone.')
  }
  if (threshold > n) throw new ApiError('VALIDATION', `You have ${n} signers, so no more than ${n} signatures can be required.`)
  const w = walletRecord(communityId)
  w.threshold = threshold
  const c = community(communityId)
  if (c.setupStage === 'members' || c.setupStage === 'rule') c.setupStage = 'signers'
  audit(communityId, user(userId), 'threshold_set', `Set the approval rule to ${threshold} of ${n} signers`, 'wallet', w.id)
  return computeWallet(communityId)
}

export function registerSignerKey(
  communityId: string,
  userId: string,
  signerId: string,
  input: { xpub: string; fingerprint: string; derivationPath: string },
): AuthorisedSigner {
  const m = membershipOf(communityId, userId)
  requireDraftWallet(communityId)
  const s = db.signers.find((x) => x.id === signerId && x.communityId === communityId)
  if (!s) throw new ApiError('NOT_FOUND', 'This signer is not part of the community.')
  if (m.member.id !== s.memberId) throw new ApiError('FORBIDDEN', 'Each signer registers their own public key.')
  const check = checkExtendedPublicKey(input.xpub)
  if (check.kind === 'private-key' || check.kind === 'seed-phrase') {
    // A real backend must never log or persist the rejected value.
    throw new ApiError('VALIDATION', 'That was secret key material. It was not saved. Only paste your extended public key.', { xpub: 'Never share private keys or recovery words.' })
  }
  if (check.kind !== 'ok') {
    const msg = check.kind === 'invalid' ? check.message : check.kind === 'mainnet' ? 'This is a mainnet key. Use the test-network key (tpub or Vpub).' : 'Paste your extended public key.'
    throw new ApiError('VALIDATION', 'Check the highlighted fields.', { xpub: msg })
  }
  const fpError = validateFingerprint(input.fingerprint)
  const pathError = validateDerivationPath(input.derivationPath)
  if (fpError || pathError) {
    const fields: Record<string, string> = {}
    if (fpError) fields.fingerprint = fpError
    if (pathError) fields.derivationPath = pathError
    throw new ApiError('VALIDATION', 'Check the highlighted fields.', fields)
  }
  if (db.signers.some((x) => x.communityId === communityId && x.id !== s.id && x.xpub === input.xpub.trim())) {
    throw new ApiError('CONFLICT', 'Another signer already registered this exact key. Each signer needs their own key.', { xpub: 'This key is already used by another signer.' })
  }
  applyKey(s, input.xpub.trim(), input.fingerprint.trim().toLowerCase() || null, input.derivationPath.trim())
  audit(communityId, user(userId), 'signer_key_registered', `Registered public key${s.fingerprint ? ` (fingerprint ${s.fingerprint})` : ''}`, 'signer', s.id)
  return s
}

function applyKey(s: AuthorisedSigner, xpub: string, fingerprint: string | null, path: string) {
  s.xpub = xpub
  s.fingerprint = fingerprint
  s.derivationPath = path
  s.status = 'ready'
  s.registeredAt = now()
  const allReady = db.signers.filter((x) => x.communityId === s.communityId).every((x) => x.status === 'ready')
  const c = community(s.communityId)
  if (allReady && c.setupStage === 'signers') c.setupStage = 'review'
}

/** Mock only: lets a demo complete key registration on behalf of people who are not logged in. */
export function simulateSignerRegistration(communityId: string, userId: string, signerId: string): AuthorisedSigner {
  requireAdmin(communityId, userId)
  requireDraftWallet(communityId)
  const s = db.signers.find((x) => x.id === signerId && x.communityId === communityId)
  if (!s) throw new ApiError('NOT_FOUND', 'This signer is not part of the community.')
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const body = randomBytes(107).map((b) => B58[b % 58]).join('')
  applyKey(s, `tpub${body}`, randomHex(4), "m/48'/1'/0'/2'")
  audit(communityId, { id: null, name: s.name }, 'signer_key_registered', `Registered public key (fingerprint ${s.fingerprint}) [simulated in demo]`, 'signer', s.id)
  return s
}

export function createWallet(communityId: string, userId: string): Wallet {
  requireAdmin(communityId, userId)
  requireDraftWallet(communityId)
  const w = walletRecord(communityId)
  const ss = db.signers.filter((s) => s.communityId === communityId)
  if (ss.length < 2) throw new ApiError('VALIDATION', 'Select at least 2 authorised signers first.')
  if (w.threshold === null || w.threshold < 2 || w.threshold > ss.length) throw new ApiError('VALIDATION', 'Set a valid approval rule first.')
  const waiting = ss.filter((s) => s.status !== 'ready')
  if (waiting.length) throw new ApiError('VALIDATION', `Still waiting for ${waiting.map((s) => s.name).join(', ')} to register a public key.`)
  w.status = 'active'
  w.receiveAddress = newWalletAddress()
  w.createdAt = now()
  w.signerCount = ss.length
  community(communityId).setupStage = 'active'
  audit(communityId, user(userId), 'wallet_created', `Created the ${w.threshold}-of-${ss.length} regtest wallet. The signer set is now fixed.`, 'wallet', w.id)
  return computeWallet(communityId)
}

export function getWallet(communityId: string, userId: string): Wallet {
  membershipOf(communityId, userId)
  return computeWallet(communityId)
}

export function listContributions(communityId: string, userId: string): Contribution[] {
  membershipOf(communityId, userId)
  advanceChain()
  return db.contributions
    .filter((c) => c.communityId === communityId)
    .map(withConfs)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
}

// ---------------------------------------------------------------------------
// Spending requests and signing

export interface SpendingRequestInput {
  title: string
  purpose: string
  recipientAddress: string
  amountSats: number
}

function validateRequestInput(communityId: string, input: SpendingRequestInput, ignoreRequestId?: string) {
  const w = computeWallet(communityId)
  const fields: Record<string, string> = {}
  if (input.title.trim().length < 3) fields.title = 'Give the request a short title, like “Iron sheets for the hall”.'
  if (input.title.trim().length > 80) fields.title = 'Keep the title under 80 characters.'
  if (input.purpose.trim().length < 10) fields.purpose = 'Explain what the money is for so signers can judge it.'
  const addrErr = validateRecipientAddress(input.recipientAddress, w.receiveAddress)
  if (addrErr) fields.recipientAddress = addrErr
  if (!Number.isInteger(input.amountSats) || input.amountSats <= 0) fields.amountSats = 'Enter an amount greater than zero.'
  else if (input.amountSats < DUST_LIMIT_SATS) fields.amountSats = `The network will not relay payments smaller than ${DUST_LIMIT_SATS} sats.`
  else {
    const fee = estimateFee(w.threshold ?? 2, w.signerCount, 4)
    const releasing = ignoreRequestId ? db.requests.filter((r) => r.id === ignoreRequestId).reduce((s, r) => s + r.amountSats + r.estimatedFeeSats, 0) : 0
    const available = w.confirmedBalanceSats - w.reservedSats + releasing
    if (input.amountSats + fee > available) {
      fields.amountSats = `Not enough available funds. ${btc(available)} BTC is free after other open requests, and this payment plus its ${fee} sat fee needs ${btc(input.amountSats + fee)} BTC.`
    }
  }
  if (Object.keys(fields).length) throw new ApiError('VALIDATION', 'Check the highlighted fields.', fields)
  return w
}

export function listRequests(communityId: string, userId: string): SpendingRequestSummary[] {
  membershipOf(communityId, userId)
  return db.requests
    .filter((r) => r.communityId === communityId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(summary)
}

export function getRequestDetail(requestId: string, userId: string): SpendingRequestDetail {
  const r = request(requestId)
  membershipOf(r.communityId, userId)
  const t = r.txid ? db.transactions.find((x) => x.txid === r.txid) ?? null : null
  advanceChain()
  return {
    request: { ...r },
    signatures: signaturesFor(r.id),
    signers: db.signers.filter((s) => s.communityId === r.communityId),
    transaction: t ? txView(t) : null,
  }
}

export function createRequest(communityId: string, userId: string, input: SpendingRequestInput): SpendingRequest {
  const m = requireSigner(communityId, userId)
  const w = walletRecord(communityId)
  if (w.status !== 'active' || w.threshold === null) throw new ApiError('CONFLICT', 'The community wallet has not been created yet.')
  validateRequestInput(communityId, input)
  const number = db.requests.filter((r) => r.communityId === communityId).length + 1
  const n = db.signers.filter((s) => s.communityId === communityId).length
  const r: SpendingRequest = {
    id: newId('req'), number, communityId, title: input.title.trim(), purpose: input.purpose.trim(),
    recipientAddress: input.recipientAddress.trim(), amountSats: input.amountSats,
    estimatedFeeSats: estimateFee(w.threshold, n, 4), feeRateSatVb: 4, changeAddress: newWalletAddress(),
    createdBy: m.member.id, createdByName: m.member.name, createdAt: now(), updatedAt: now(),
    status: 'pending', threshold: w.threshold, signerCount: n, txid: null, broadcastAttempts: 0, lastBroadcastError: null,
  }
  db.requests.push(r)
  audit(communityId, user(userId), 'request_created', `Created request #${r.number} for ${btc(r.amountSats)} BTC: ${r.title}`, 'request', r.id)
  return r
}

export function updateRequest(requestId: string, userId: string, input: SpendingRequestInput): SpendingRequest {
  const r = request(requestId)
  const m = requireSigner(r.communityId, userId)
  if (r.createdBy !== m.member.id) throw new ApiError('FORBIDDEN', 'Only the person who created this request can edit it.')
  if (r.status !== 'pending' || signaturesFor(r.id).length > 0) {
    throw new ApiError('CONFLICT', 'Signing has started, so the payment details are locked. Create a new request if the payment needs to change.')
  }
  validateRequestInput(r.communityId, input, r.id)
  r.title = input.title.trim()
  r.purpose = input.purpose.trim()
  r.recipientAddress = input.recipientAddress.trim()
  r.amountSats = input.amountSats
  r.updatedAt = now()
  audit(r.communityId, user(userId), 'request_edited', `Edited request #${r.number} before anyone signed`, 'request', r.id)
  return r
}

function recomputeStatus(r: SpendingRequest) {
  const sigs = signaturesFor(r.id)
  const signed = sigs.filter((s) => s.decision === 'signed' && s.verified).length
  const declined = sigs.filter((s) => s.decision === 'declined').length
  if (signed >= r.threshold) r.status = 'ready_to_broadcast'
  else if (r.signerCount - declined < r.threshold) r.status = 'rejected'
  else if (sigs.length > 0) r.status = 'awaiting_signatures'
  else r.status = 'pending'
}

function requireOpenForSigning(r: SpendingRequest, signer: AuthorisedSigner) {
  if (r.status !== 'pending' && r.status !== 'awaiting_signatures') {
    throw new ApiError('CONFLICT', 'This request is no longer collecting signatures.')
  }
  const prior = db.signatures.find((s) => s.requestId === r.id && s.signerId === signer.id)
  if (prior) {
    throw new ApiError('CONFLICT', prior.decision === 'signed' ? 'You already signed this request. Each signer counts once.' : 'You already declined this request.')
  }
}

export function signRequest(requestId: string, userId: string): SpendingRequestDetail {
  const r = request(requestId)
  const m = requireSigner(r.communityId, userId)
  requireOpenForSigning(r, m.signer)
  db.signatures.push({ id: newId('sg'), requestId: r.id, signerId: m.signer.id, signerName: m.signer.name, decision: 'signed', reason: null, createdAt: now(), verified: true })
  recomputeStatus(r)
  r.updatedAt = now()
  const signed = signaturesFor(r.id).filter((s) => s.decision === 'signed').length
  const u = user(userId)
  audit(r.communityId, u, 'request_signed', `Signed request #${r.number} (${signed} of ${r.threshold})`, 'request', r.id)
  if (r.status === 'ready_to_broadcast') {
    audit(r.communityId, { id: null, name: 'CommunitySafe' }, 'threshold_reached', `Request #${r.number} reached ${signed} of ${r.threshold} signatures and can be sent`, 'request', r.id)
  }
  return getRequestDetail(r.id, userId)
}

export function declineRequest(requestId: string, userId: string, reason: string): SpendingRequestDetail {
  const r = request(requestId)
  const m = requireSigner(r.communityId, userId)
  requireOpenForSigning(r, m.signer)
  const clean = reason.trim() || null
  db.signatures.push({ id: newId('sg'), requestId: r.id, signerId: m.signer.id, signerName: m.signer.name, decision: 'declined', reason: clean, createdAt: now(), verified: true })
  recomputeStatus(r)
  r.updatedAt = now()
  const declined = signaturesFor(r.id).filter((s) => s.decision === 'declined').length
  const stillPossible = r.signerCount - declined
  const u = user(userId)
  if (r.status === 'rejected') {
    audit(r.communityId, u, 'request_declined', `Declined request #${r.number}${clean ? `: “${clean}”` : ''}`, 'request', r.id)
    audit(r.communityId, { id: null, name: 'CommunitySafe' }, 'request_rejected', `Request #${r.number} can no longer reach ${r.threshold} signatures and was closed. Nothing was sent.`, 'request', r.id)
  } else {
    audit(r.communityId, u, 'request_declined', `Declined request #${r.number}${clean ? `: “${clean}”` : ''}. The request stays open because ${stillPossible} signers can still sign.`, 'request', r.id)
  }
  return getRequestDetail(r.id, userId)
}

export function broadcastRequest(requestId: string, userId: string): SpendingRequestDetail {
  const r = request(requestId)
  requireSigner(r.communityId, userId)
  const signed = signaturesFor(r.id).filter((s) => s.decision === 'signed' && s.verified).length
  if (signed < r.threshold) {
    throw new ApiError('CONFLICT', `Only ${signed} of ${r.threshold} required signatures are collected. The transaction stays off the network until the threshold is reached.`)
  }
  if (r.status !== 'ready_to_broadcast' && r.status !== 'failed') throw new ApiError('CONFLICT', 'This request has already been sent.')
  const u = user(userId)
  r.broadcastAttempts += 1
  r.updatedAt = now()
  if (demoFlags.nodeDown) {
    r.status = 'failed'
    r.lastBroadcastError = {
      code: 'NODE_UNREACHABLE',
      message: 'connect ECONNREFUSED 10.0.4.12:18443 — the Bitcoin node did not answer, so the transaction was not sent.',
      at: now(),
    }
    audit(r.communityId, u, 'broadcast_failed', `Sending request #${r.number} failed: the Bitcoin node did not answer. The request and its ${signed} signatures are kept.`, 'request', r.id)
    return getRequestDetail(r.id, userId)
  }
  const txid = randomHex(32)
  db.transactions.push({
    txid, communityId: r.communityId, requestId: r.id, amountSats: r.amountSats, feeSats: r.estimatedFeeSats,
    recipientAddress: r.recipientAddress, broadcastAt: now(), blockHeight: null, confirmations: 0, status: 'mempool',
  })
  r.txid = txid
  r.status = 'broadcast'
  audit(r.communityId, u, 'broadcast_succeeded', `Sent request #${r.number} to the Bitcoin network (txid ${shortHash(txid, 8, 6)})`, 'transaction', txid)
  return getRequestDetail(r.id, userId)
}

// ---------------------------------------------------------------------------
// History, dashboard and audit

export function listHistory(communityId: string, userId: string): HistoryEntry[] {
  membershipOf(communityId, userId)
  advanceChain()
  const incoming: HistoryEntry[] = db.contributions
    .filter((c) => c.communityId === communityId)
    .map((c) => ({
      direction: 'incoming', txid: c.txid, amountSats: c.amountSats, feeSats: null, at: c.receivedAt,
      confirmations: confs(c.blockHeight), status: c.blockHeight === null ? 'mempool' : 'confirmed',
      label: c.label ?? 'Contribution', requestId: null, blockHeight: c.blockHeight, counterpartyAddress: null,
    }))
  const outgoing: HistoryEntry[] = db.transactions
    .filter((t) => t.communityId === communityId)
    .map((t) => {
      const r = db.requests.find((x) => x.id === t.requestId)
      return {
        direction: 'outgoing', txid: t.txid, amountSats: t.amountSats, feeSats: t.feeSats, at: t.broadcastAt,
        confirmations: confs(t.blockHeight), status: t.blockHeight === null ? 'mempool' : 'confirmed',
        label: r ? r.title : 'Payment', requestId: t.requestId, blockHeight: t.blockHeight, counterpartyAddress: t.recipientAddress,
      }
    })
  return [...incoming, ...outgoing].sort((a, b) => b.at.localeCompare(a.at))
}

export function getHistoryEntry(communityId: string, txid: string, userId: string): HistoryEntry {
  const entry = listHistory(communityId, userId).find((e) => e.txid === txid)
  if (!entry) throw new ApiError('NOT_FOUND', 'No transaction with this ID belongs to the community wallet.')
  return entry
}

export function getDashboard(communityId: string, userId: string): DashboardSummary {
  membershipOf(communityId, userId)
  return {
    community: community(communityId),
    wallet: computeWallet(communityId),
    memberCount: db.members.filter((m) => m.communityId === communityId).length,
    requests: listRequests(communityId, userId),
    recentHistory: listHistory(communityId, userId).slice(0, 5),
    recentContributions: listContributions(communityId, userId).slice(0, 4),
  }
}

export function listAudit(communityId: string, userId: string): AuditEvent[] {
  membershipOf(communityId, userId)
  return db.audit.filter((e) => e.communityId === communityId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
