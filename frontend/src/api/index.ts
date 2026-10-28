/**
 * CommunitySafe API client.
 *
 * Screens use stable view models from this module. Integrated areas call the
 * Express API; later milestones remove the remaining mock-only implementations.
 *
 * Authentication is token based (SRS FR-03). The backend returns a token from
 * login/register; send it as `Authorization: Bearer <token>` on every other call.
 * Role checks must be enforced on the server; the UI only mirrors them.
 *
 * Function                     Backend endpoint
 * ---------------------------  ------------------------------------------------------------
 * register                     POST   /api/auth/register
 * login                        POST   /api/auth/login
 * logout                       POST   /api/auth/logout
 * listMyCommunities            GET    /api/communities
 * getCommunity                 GET    /api/communities/:communityId
 * createCommunity              POST   /api/communities
 * joinCommunity                POST   /api/communities/join
 * getDashboard                 GET    /api/communities/:communityId/dashboard
 * listMembers                  GET    /api/communities/:communityId/members
 * addMember                    POST   /api/communities/:communityId/members
 * listSigners                  GET    /api/communities/:communityId/signers
 * setAuthorisedSigners         POST/DELETE /api/communities/:communityId/signers
 * registerSignerKey            PUT    /api/communities/:communityId/signers/me/public-info
 * setThreshold                 PUT    /api/communities/:communityId/wallet/threshold
 * createWallet                 POST   /api/communities/:communityId/wallet
 * getWallet                    GET    /api/communities/:communityId/wallet
 * getWalletPolicy              GET    /api/communities/:communityId/wallet
 * listContributions            GET    /api/communities/:communityId/wallet/contributions
 * listSpendingRequests         GET    /api/communities/:communityId/spending-requests
 * getSpendingRequest           GET    /api/spending-requests/:requestId
 * createSpendingRequest        POST   /api/communities/:communityId/spending-requests
 * updateSpendingRequest        PATCH  /api/spending-requests/:requestId
 * signTransaction              POST   /api/spending-requests/:requestId/signatures
 * declineSpendingRequest       POST   /api/spending-requests/:requestId/declines
 * broadcastTransaction         POST   /api/spending-requests/:requestId/broadcast
 * listTransactions             GET    /api/communities/:communityId/transactions
 * getTransaction               GET    /api/communities/:communityId/transactions/:txid
 * listAuditEvents              GET    /api/communities/:communityId/audit-events
 *
 * Mock only (no backend endpoint, remove when the backend lands):
 * switchDemoRole, simulateSignerRegistration, setDemoFlags, getDemoFlags
 */

import type {
  AuthorisedSigner,
  Community,
  CommunityAuditEvent,
  CommunityMember,
  CommunityType,
  Contribution,
  DashboardSummary,
  HistoryEntry,
  Notification,
  DiscussionMessage,
  CursorPage,
  Membership,
  SpendingRequest,
  SpendingRequestDetail,
  SpendingRequestSummary,
  User,
  Wallet,
} from '../types'
import { ApiError } from './errors'
import { clearSession, hasStoredSession, request, setSessionExpiredHandler, storeSession } from './http'

export { ApiError } from './errors'
export interface SpendingRequestInput {
  recipientAddress: string
  amountSats: number
  feeRate: number
}
// Temporary bridge for the still-mocked post-authentication API functions.
// Milestone 2 replaces community operations with real backend requests.
let sessionUserId: string | null = null
let sessionRestoreRequest: Promise<User | null> | null = null

function currentUser(): string {
  if (!sessionUserId) throw new ApiError('UNAUTHENTICATED', 'Please log in to continue.')
  return sessionUserId
}

// --- Authentication --------------------------------------------------------

export async function register(input: { name: string; email: string; password: string }): Promise<User> {
  const words = input.name.trim().split(/\s+/)
  const firstName = words.shift() ?? ''
  const lastName = words.join(' ')
  await request<{ user: BackendUser }>('/auth/register', {
    method: 'POST',
    auth: false,
    body: { firstName, lastName, email: input.email.trim(), password: input.password },
  })
  return login({ email: input.email, password: input.password })
}

export async function login(input: { email: string; password: string }): Promise<User> {
  const result = await request<{ token: string; refreshToken: string; user: BackendUser }>('/auth/login', {
    method: 'POST',
    auth: false,
    body: { email: input.email.trim(), password: input.password },
  })
  storeSession(result.token, result.refreshToken)
  const u = userFromBackend(result.user)
  sessionUserId = u.id
  return u
}

export async function logout(): Promise<void> {
  clearSession()
  sessionUserId = null
  sessionRestoreRequest = null
}

interface BackendUser {
  id: number
  firstName: string
  lastName: string
  email: string
  createdAt: string
}

type BackendRole = 'COMMUNITY_ADMIN' | 'COMMUNITY_MEMBER'

interface BackendCommunity {
  id: number
  name: string
  description?: string
  role: BackendRole
  createdAt?: string
  joinCode?: string
  setupStage?: Community['setupStage']
}

interface BackendMember {
  id: number
  firstName: string
  lastName: string
  email: string
  role: BackendRole
}

interface BackendSigner {
  signerId: number
  userId: number
  firstName: string
  lastName: string
  email: string
  membershipRole: BackendRole
  publicInfoRegistered: boolean
  createdAt: string
}

interface BackendThreshold {
  requiredSignatures: number | null
  authorizedSignerCount: number
}

interface BackendWallet {
  communityId: number
  status: string
  network: string
  address: string
  /** Bitcoin Core watch-only descriptor, e.g. `wsh(sortedmulti(2,02…,03…))#checksum`. */
  descriptor: string
  requiredSignatures: number
  signers: unknown[]
  createdAt: string
}

interface BackendBalance {
  confirmedSats: string
  pendingSats: string
  immatureSats: string
}

interface BackendSpend {
  id: number
  status: 'SIGNING' | 'READY' | 'BROADCASTING' | 'BROADCAST' | 'CONFLICTED' | 'CANCELLED'
  recipient: string
  amountSats: string
  feeSats: string
  txid: string | null
  createdAt: string
  updatedAt: string
  createdBy: { id: number; firstName: string; lastName: string }
  signatures: { signerId: number; createdAt: string }[]
}

interface BackendSpendList {
  requiredSignatures: number
  signerCount: number
  spends: BackendSpend[]
}

interface BackendTransaction {
  txid: string
  category: string
  direction?: 'incoming' | 'outgoing'
  amountSats: string
  feeSats?: string | null
  changeSats?: string | null
  totalDebitSats?: string | null
  confirmations: number
  blockhash?: string | null
  blockHeight?: number | null
  recipientAddress?: string | null
  recipientCount?: number
  recipients?: { address: string; amountSats: string }[]
  requestId?: string | number | null
  time: number
}

function userFromBackend(user: BackendUser): User {
  return {
    id: String(user.id),
    name: `${user.firstName} ${user.lastName}`.trim(),
    email: user.email,
    createdAt: user.createdAt,
  }
}

export async function restoreSession(_signal?: AbortSignal): Promise<User | null> {
  if (!hasStoredSession()) return null
  if (sessionRestoreRequest) return sessionRestoreRequest
  sessionRestoreRequest = request<{ user: BackendUser }>('/auth/me').then((result) => {
    const user = userFromBackend(result.user)
    sessionUserId = user.id
    return user
  }).finally(() => {
    sessionRestoreRequest = null
  })
  return sessionRestoreRequest
}

export function onSessionExpired(handler: () => void): () => void {
  setSessionExpiredHandler(() => {
    sessionUserId = null
    handler()
  })
  return () => setSessionExpiredHandler(null)
}

// --- Communities -----------------------------------------------------------

function communityFromBackend(value: BackendCommunity, setupStage: Community['setupStage'] = value.setupStage ?? 'members'): Community {
  return {
    id: String(value.id),
    name: value.name,
    description: value.description ?? '',
    type: 'community',
    createdBy: null,
    createdAt: value.createdAt ?? null,
    joinCode: value.joinCode,
    setupStage,
  }
}

function memberFromBackend(value: BackendMember, communityId: string): CommunityMember {
  return {
    id: String(value.id),
    communityId,
    userId: String(value.id),
    name: `${value.firstName} ${value.lastName}`.trim(),
    email: value.email,
    isAdmin: value.role === 'COMMUNITY_ADMIN',
    joinedAt: null,
  }
}

function signerFromBackend(value: BackendSigner, communityId: string): AuthorisedSigner {
  return {
    id: String(value.signerId),
    communityId,
    memberId: String(value.userId),
    name: `${value.firstName} ${value.lastName}`.trim(),
    status: value.publicInfoRegistered ? 'ready' : 'awaiting_key',
    xpub: null,
    fingerprint: null,
    derivationPath: null,
    selectedAt: value.createdAt,
    registeredAt: value.publicInfoRegistered ? value.createdAt : null,
  }
}

function draftWallet(communityId: string, threshold: BackendThreshold): Wallet {
  return {
    id: communityId,
    communityId,
    network: 'regtest',
    scriptType: 'P2WSH',
    status: 'draft',
    threshold: threshold.requiredSignatures,
    signerCount: threshold.authorizedSignerCount,
    receiveAddress: null,
    createdAt: null,
    confirmedBalanceSats: 0,
    unconfirmedIncomingSats: 0,
    reservedSats: 0,
  }
}

function safeSats(value: string, field: string): number {
  if (!/^\d+$/.test(value)) throw new ApiError('NETWORK', `The server returned an invalid ${field}.`)
  const amount = Number(value)
  if (!Number.isSafeInteger(amount)) throw new ApiError('NETWORK', `The server returned a ${field} outside the supported display range.`)
  return amount
}

function walletFromBackend(value: BackendWallet, balance?: BackendBalance): Wallet {
  return {
    id: String(value.communityId),
    communityId: String(value.communityId),
    network: value.network === 'signet' ? 'signet' : 'regtest',
    scriptType: 'P2WSH',
    status: value.status === 'READY' ? 'active' : 'draft',
    threshold: value.requiredSignatures,
    signerCount: value.signers.length,
    receiveAddress: value.address,
    createdAt: value.createdAt,
    confirmedBalanceSats: balance ? safeSats(balance.confirmedSats, 'confirmed balance') : 0,
    unconfirmedIncomingSats: balance ? safeSats(balance.pendingSats, 'pending balance') : 0,
    reservedSats: 0,
  }
}

export async function listMyCommunities(): Promise<Community[]> {
  const result = await request<{ communities: BackendCommunity[] }>('/communities')
  return result.communities.map((community) => communityFromBackend(community))
}

export async function getCommunity(communityId: string): Promise<Community> {
  const result = await request<{ community: BackendCommunity }>(`/communities/${communityId}`)
  return communityFromBackend(result.community)
}

export async function createCommunity(input: { name: string; description: string; type: CommunityType }): Promise<Community> {
  const result = await request<{ community: BackendCommunity }>('/communities', {
    method: 'POST',
    body: { name: input.name.trim(), description: input.description.trim() },
  })
  return communityFromBackend(result.community)
}

export async function joinCommunity(joinCode: string): Promise<Community> {
  const result = await request<{ community: BackendCommunity }>('/communities/join', {
    method: 'POST',
    body: { joinCode: joinCode.trim().toUpperCase() },
  })
  return communityFromBackend(result.community)
}

export async function updateCommunity(): Promise<never> {
  throw new ApiError('VALIDATION', 'The backend does not currently support editing community details.')
}

export async function getMembership(communityId: string): Promise<Membership> {
  const [detail, members, signers] = await Promise.all([
    request<{ community: BackendCommunity }>(`/communities/${communityId}`),
    listMembers(communityId),
    listSigners(communityId),
  ])
  const member = members.find((item) => item.userId === currentUser())
  if (!member) throw new ApiError('FORBIDDEN', 'You are not a member of this community.', {}, 403)
  const signer = signers.find((item) => item.memberId === member.userId) ?? null
  return { member, signer, isAdmin: detail.community.role === 'COMMUNITY_ADMIN', isSigner: signer !== null }
}

export async function loadCommunityContext(communityId: string): Promise<{ community: Community; wallet: Wallet; membership: Membership }> {
  const [detailResult, members, signers, threshold, liveWallet] = await Promise.all([
    request<{ community: BackendCommunity }>(`/communities/${communityId}`),
    listMembers(communityId),
    listSigners(communityId),
    request<BackendThreshold>(`/communities/${communityId}/signing-threshold`),
    request<BackendWallet>(`/communities/${communityId}/wallet`).then((value) => walletFromBackend(value)).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null
      throw error
    }),
  ])
  const member = members.find((item) => item.userId === currentUser())
  if (!member) throw new ApiError('FORBIDDEN', 'You are not a member of this community.', {}, 403)
  const signer = signers.find((item) => item.memberId === member.userId) ?? null
  const wallet = liveWallet ?? draftWallet(communityId, threshold)
  const setupStage: Community['setupStage'] = liveWallet?.status === 'active'
    ? 'active'
    : liveWallet
      ? 'review'
    : signers.length === 0
      ? 'members'
      : threshold.requiredSignatures === null
        ? 'rule'
        : signers.some((item) => item.status !== 'ready')
          ? 'signers'
          : 'review'
  return {
    community: communityFromBackend(detailResult.community, setupStage),
    wallet,
    membership: { member, signer, isAdmin: member.isAdmin, isSigner: signer !== null },
  }
}

export async function getDashboard(communityId: string): Promise<DashboardSummary> {
  const [community, wallet, members, requests, recentHistory] = await Promise.all([
    getCommunity(communityId),
    getWallet(communityId),
    listMembers(communityId),
    listSpendingRequests(communityId),
    listTransactions(communityId),
  ])
  const recentContributions = recentHistory
    .filter((entry) => entry.direction === 'incoming')
    .map((entry) => ({
      id: entry.txid, communityId, txid: entry.txid, vout: null,
      amountSats: entry.amountSats, label: null, receivedAt: entry.at,
      blockHeight: entry.blockHeight, confirmations: entry.confirmations,
    }))
  return {
    community,
    wallet: { ...wallet, reservedSats: reservedByRequests(requests) },
    memberCount: members.length,
    requests,
    recentHistory: recentHistory.slice(0, 5),
    recentContributions,
  }
}

// --- Members and signers ---------------------------------------------------

export async function listMembers(communityId: string): Promise<CommunityMember[]> {
  const result = await request<{ members: BackendMember[] }>(`/communities/${communityId}/members`)
  return result.members.map((member) => memberFromBackend(member, communityId))
}

export async function addMember(communityId: string, input: { name?: string; email: string }): Promise<CommunityMember> {
  await request(`/communities/${communityId}/members`, { method: 'POST', body: { email: input.email.trim() } })
  const members = await listMembers(communityId)
  const added = members.find((member) => member.email.toLowerCase() === input.email.trim().toLowerCase())
  if (!added) throw new ApiError('NETWORK', 'The member was added but could not be reloaded.')
  return added
}

export async function changeMemberRole(communityId: string, userId: string, isAdmin: boolean): Promise<void> {
  await request(`/communities/${communityId}/members/${userId}/role`, {
    method: 'PATCH',
    body: { role: isAdmin ? 'COMMUNITY_ADMIN' : 'COMMUNITY_MEMBER' },
  })
}

export async function removeMember(communityId: string, userId: string): Promise<void> {
  await request(`/communities/${communityId}/members/${userId}`, { method: 'DELETE' })
}

export async function listSigners(communityId: string): Promise<AuthorisedSigner[]> {
  const result = await request<{ signers: BackendSigner[] }>(`/communities/${communityId}/signers`)
  return result.signers.map((signer) => signerFromBackend(signer, communityId))
}

export async function setAuthorisedSigners(communityId: string, memberIds: string[]): Promise<AuthorisedSigner[]> {
  const existing = await listSigners(communityId)
  const wanted = new Set(memberIds)
  const existingIds = new Set(existing.map((signer) => signer.memberId))
  for (const userId of memberIds.filter((id) => !existingIds.has(id))) {
    await request(`/communities/${communityId}/signers`, { method: 'POST', body: { userId: Number(userId) } })
  }
  for (const signer of existing.filter((item) => !wanted.has(item.memberId))) {
    await request(`/communities/${communityId}/signers/${signer.memberId}`, { method: 'DELETE' })
  }
  return listSigners(communityId)
}

/** Public key information only. There is deliberately no way to send a private key. */
export function registerSignerKey(
  communityId: string,
  publicKey: string,
): Promise<{ registered: boolean; publicKey: string }> {
  return request(`/communities/${communityId}/signers/me/public-info`, {
    method: 'PUT',
    body: { publicKey: publicKey.trim().toLowerCase() },
  })
}

export function getMySignerPublicInfo(communityId: string): Promise<{ registered: boolean; publicKey: string | null }> {
  return request(`/communities/${communityId}/signers/me/public-info`)
}

// --- Wallet ----------------------------------------------------------------

export async function setThreshold(communityId: string, threshold: number): Promise<Wallet> {
  const result = await request<BackendThreshold>(`/communities/${communityId}/signing-threshold`, {
    method: 'PUT',
    body: { requiredSignatures: threshold },
  })
  return draftWallet(communityId, result)
}

export async function createWallet(communityId: string): Promise<Wallet> {
  const result = await request<BackendWallet>(`/communities/${communityId}/wallet`, { method: 'POST' })
  return walletFromBackend(result)
}

export async function getWallet(communityId: string): Promise<Wallet> {
  const value = await request<BackendWallet>(`/communities/${communityId}/wallet`)
  const balance = value.status === 'READY'
    ? await request<BackendBalance>(`/communities/${communityId}/wallet/balance`)
    : undefined
  return walletFromBackend(value, balance)
}

/** Public wallet policy used by the browser signer to rebuild and check the P2WSH script. */
export interface WalletSigningPolicy {
  descriptor: string
  address: string
  threshold: number
  network: 'regtest'
}

/**
 * Reads the coordinator's descriptor without exposing key material. The browser
 * signer re-derives the address from it and refuses to sign anything else.
 */
export async function getWalletPolicy(communityId: string): Promise<WalletSigningPolicy> {
  const value = await request<BackendWallet>(`/communities/${communityId}/wallet`)
  if (value.status !== 'READY') {
    throw new ApiError('CONFLICT', 'The community wallet is not ready for signing.', {}, 409)
  }
  if (value.network !== 'regtest') {
    throw new ApiError('CONFLICT', 'Browser signing is only available on Regtest.', {}, 409)
  }
  if (typeof value.descriptor !== 'string' || typeof value.address !== 'string') {
    throw new ApiError('NETWORK', 'The server returned an invalid wallet policy.')
  }
  return {
    descriptor: value.descriptor,
    address: value.address,
    threshold: value.requiredSignatures,
    network: 'regtest',
  }
}

export function listContributions(_communityId: string): Promise<Contribution[]> {
  return listTransactions(_communityId).then((history) => history
    .filter((entry) => entry.direction === 'incoming')
    .map((entry) => ({
      id: entry.txid,
      communityId: _communityId,
      txid: entry.txid,
      vout: null,
      amountSats: entry.amountSats,
      label: null,
      receivedAt: entry.at,
      blockHeight: entry.blockHeight,
      confirmations: entry.confirmations,
    })))
}

export function reservedByRequests(requests: SpendingRequestSummary[]): number {
  return requests
    .filter((item) => ['pending', 'awaiting_signatures', 'ready_to_broadcast', 'failed'].includes(item.status))
    .reduce((total, item) => total + item.amountSats + item.estimatedFeeSats, 0)
}

// --- Spending requests -----------------------------------------------------

function spendingStatus(spend: BackendSpend): SpendingRequest['status'] {
  if (spend.status === 'READY' || spend.status === 'BROADCASTING') return 'ready_to_broadcast'
  if (spend.status === 'BROADCAST') return 'broadcast'
  if (spend.status === 'CONFLICTED') return 'failed'
  if (spend.status === 'CANCELLED') return 'cancelled'
  return spend.signatures.length === 0 ? 'pending' : 'awaiting_signatures'
}

function spendFromBackend(spend: BackendSpend, communityId: string, threshold: number, signerCount: number, changeAddress = ''): SpendingRequestSummary {
  const signatures = spend.signatures.map((signature) => ({
    id: `${spend.id}-${signature.signerId}`,
    requestId: String(spend.id),
    signerId: String(signature.signerId),
    signerName: `Signer #${signature.signerId}`,
    decision: 'signed' as const,
    reason: null,
    createdAt: signature.createdAt,
    verified: true,
  }))
  return {
    id: String(spend.id), number: spend.id, communityId,
    title: `Payment #${spend.id}`,
    purpose: 'No purpose text is stored by the current backend.',
    recipientAddress: spend.recipient,
    amountSats: safeSats(spend.amountSats, 'payment amount'),
    estimatedFeeSats: safeSats(spend.feeSats, 'network fee'),
    feeRateSatVb: 0,
    changeAddress,
    createdBy: String(spend.createdBy.id),
    createdByName: `${spend.createdBy.firstName} ${spend.createdBy.lastName}`.trim(),
    createdAt: spend.createdAt,
    updatedAt: spend.updatedAt,
    status: spendingStatus(spend),
    threshold,
    signerCount,
    txid: spend.txid,
    broadcastAttempts: 0,
    lastBroadcastError: null,
    signatures,
  }
}

export async function listSpendingRequests(communityId: string): Promise<SpendingRequestSummary[]> {
  const result = await request<BackendSpendList>(`/communities/${communityId}/wallet/spends`)
  return result.spends.map((spend) => spendFromBackend(spend, communityId, result.requiredSignatures, result.signerCount))
}

export async function getSpendingRequest(communityId: string, requestId: string): Promise<SpendingRequestDetail> {
  const [spend, signers, wallet] = await Promise.all([
    request<BackendSpend & { requiredSignatures: number; signerCount: number }>(`/communities/${communityId}/wallet/spends/${requestId}`),
    listSigners(communityId),
    request<BackendWallet>(`/communities/${communityId}/wallet`),
  ])
  const requestModel = spendFromBackend(spend, communityId, spend.requiredSignatures, spend.signerCount, wallet.address)
  const names = new Map(signers.map((signer) => [signer.id, signer.name]))
  const signatures = requestModel.signatures.map((signature) => ({ ...signature, signerName: names.get(signature.signerId) ?? signature.signerName }))
  return { request: { ...requestModel }, signatures, signers, transaction: null }
}

export async function createSpendingRequest(communityId: string, input: SpendingRequestInput): Promise<{ id: string }> {
  const result = await request<{ id: number }>(`/communities/${communityId}/wallet/spends`, {
    method: 'POST',
    body: { recipient: input.recipientAddress.trim(), amountSats: String(input.amountSats), feeRate: input.feeRate },
  })
  return { id: String(result.id) }
}

export async function updateSpendingRequest(): Promise<never> {
  throw new ApiError('VALIDATION', 'Spending requests cannot be edited. Cancel and create a new request instead.')
}

export async function cancelSpendingRequest(communityId: string, requestId: string): Promise<void> {
  await request(`/communities/${communityId}/wallet/spends/${requestId}/cancel`, { method: 'POST' })
}

export async function getSpendingRequestPsbt(communityId: string, requestId: string): Promise<string> {
  const result = await request<{ psbt: unknown }>(`/communities/${communityId}/wallet/spends/${requestId}/psbt`)
  if (typeof result.psbt !== 'string' || !result.psbt) throw new ApiError('NETWORK', 'The server returned an invalid PSBT.')
  return result.psbt
}

export function submitSignedPsbt(communityId: string, requestId: string, psbt: string): Promise<{ status: 'SIGNING' | 'READY'; signatures: number; requiredSignatures: number }> {
  return request(`/communities/${communityId}/wallet/spends/${requestId}/signatures`, {
    method: 'POST',
    body: { psbt: psbt.trim() },
  })
}

export async function declineSpendingRequest(): Promise<never> {
  throw new ApiError('VALIDATION', 'Declining requests is not supported by the backend.')
}

export function broadcastTransaction(communityId: string, requestId: string): Promise<{ txid: string; status: 'BROADCAST' }> {
  return request(`/communities/${communityId}/wallet/spends/${requestId}/broadcast`, { method: 'POST' })
}

// --- Transactions and audit ------------------------------------------------

function optionalSats(value: string | null | undefined, field: string): number | null {
  return value === null || value === undefined ? null : safeSats(value, field)
}

function historyFromBackend(value: BackendTransaction): HistoryEntry {
  if (!Number.isInteger(value.time) || value.time < 0) {
    throw new ApiError('NETWORK', 'The server returned an invalid transaction time.')
  }
  const outgoing = value.direction ? value.direction === 'outgoing' : value.category === 'send'
  const amountSats = safeSats(value.amountSats, 'transaction amount')
  const feeSats = outgoing ? optionalSats(value.feeSats, 'network fee') : null
  const changeSats = outgoing ? optionalSats(value.changeSats, 'change amount') ?? 0 : 0
  const totalDebitSats = outgoing
    ? optionalSats(value.totalDebitSats, 'total wallet debit') ?? (feeSats === null ? null : amountSats + feeSats)
    : null
  const confirmations = Number.isInteger(value.confirmations) ? value.confirmations : 0
  const blockHeight = confirmations > 0 && Number.isInteger(value.blockHeight) && (value.blockHeight as number) >= 0
    ? value.blockHeight as number
    : null
  const requestId = value.requestId === null || value.requestId === undefined ? null : String(value.requestId)
  const recipients = (Array.isArray(value.recipients) ? value.recipients : [])
    .filter((recipient) => recipient && typeof recipient.address === 'string' && typeof recipient.amountSats === 'string')
    .map((recipient) => ({ address: recipient.address, amountSats: safeSats(recipient.amountSats, 'recipient amount') }))
  const recipientCount = Number.isInteger(value.recipientCount) && (value.recipientCount as number) >= 0
    ? value.recipientCount as number
    : recipients.length
  const label = outgoing
    ? amountSats === 0
      ? 'Internal wallet transfer'
      : requestId
        ? 'Community payment'
        : 'Payment from wallet'
    : 'Bitcoin received'
  return {
    direction: outgoing ? 'outgoing' : 'incoming',
    txid: value.txid,
    amountSats,
    feeSats,
    changeSats,
    totalDebitSats,
    at: new Date(value.time * 1000).toISOString(),
    confirmations,
    status: confirmations > 0 ? 'confirmed' : 'mempool',
    label,
    requestId,
    blockHash: value.blockhash ?? null,
    blockHeight,
    counterpartyAddress: value.recipientAddress ?? (recipients.length === 1 ? recipients[0].address : null),
    recipientCount,
    recipients,
  }
}

export async function listTransactions(communityId: string): Promise<HistoryEntry[]> {
  const result = await request<{ transactions: BackendTransaction[] }>(`/communities/${communityId}/wallet/transactions`)
  return result.transactions.map(historyFromBackend).sort((a, b) => b.at.localeCompare(a.at))
}

export async function getTransaction(communityId: string, txid: string): Promise<HistoryEntry> {
  const detail = await request<BackendTransaction>(`/communities/${communityId}/wallet/transactions/${txid}`)
  if (detail.txid !== txid) throw new ApiError('NETWORK', 'The server returned a different transaction.')
  return historyFromBackend(detail)
}

interface BackendActivityActor { id: number; firstName: string; lastName: string }
interface BackendAuditEvent extends Omit<CommunityAuditEvent, 'id' | 'actor'> { id: number; actor: BackendActivityActor | null }
interface BackendNotification extends Omit<Notification, 'id'> { id: number }
interface BackendDiscussionMessage extends Omit<DiscussionMessage, 'id' | 'author'> { id: number; author: BackendActivityActor }

const actorFromBackend = (actor: BackendActivityActor) => ({ id: String(actor.id), name: `${actor.firstName} ${actor.lastName}`.trim() })
const queryString = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') params.set(key, String(value))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export async function listAuditEvents(communityId: string, options: { cursor?: string; type?: string; limit?: number } = {}): Promise<CursorPage<CommunityAuditEvent>> {
  const result = await request<{ events: BackendAuditEvent[]; nextCursor: string | null }>(`/communities/${communityId}/audit-events${queryString(options)}`)
  return { items: result.events.map((event) => ({ ...event, id: String(event.id), actor: event.actor ? actorFromBackend(event.actor) : null })), nextCursor: result.nextCursor }
}

export async function listNotifications(communityId: string, options: { cursor?: string; limit?: number } = {}): Promise<CursorPage<Notification>> {
  const result = await request<{ notifications: BackendNotification[]; nextCursor: string | null }>(`/communities/${communityId}/notifications${queryString(options)}`)
  return { items: result.notifications.map((item) => ({ ...item, id: String(item.id) })), nextCursor: result.nextCursor }
}

export function getUnreadNotificationCount(communityId: string): Promise<{ count: number }> {
  return request(`/communities/${communityId}/notifications/unread-count`)
}

export async function markNotificationRead(communityId: string, notificationId: string): Promise<void> {
  await request(`/communities/${communityId}/notifications/${notificationId}/read`, { method: 'PATCH' })
}

export async function markAllNotificationsRead(communityId: string): Promise<void> {
  await request(`/communities/${communityId}/notifications/read-all`, { method: 'POST' })
}

export async function listDiscussionMessages(communityId: string, requestId: string, options: { cursor?: string; limit?: number } = {}): Promise<CursorPage<DiscussionMessage>> {
  const result = await request<{ messages: BackendDiscussionMessage[]; nextCursor: string | null }>(`/communities/${communityId}/wallet/spends/${requestId}/discussion${queryString(options)}`)
  return { items: result.messages.map((item) => ({ ...item, id: String(item.id), author: actorFromBackend(item.author) })), nextCursor: result.nextCursor }
}

export async function addDiscussionMessage(communityId: string, requestId: string, body: string): Promise<DiscussionMessage> {
  const result = await request<{ message: BackendDiscussionMessage }>(`/communities/${communityId}/wallet/spends/${requestId}/discussion`, { method: 'POST', body: { body } })
  return { ...result.message, id: String(result.message.id), author: actorFromBackend(result.message.author) }
}
