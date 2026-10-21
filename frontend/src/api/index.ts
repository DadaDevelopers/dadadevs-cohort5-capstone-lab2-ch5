/**
 * CommunitySafe API client.
 *
 * Every screen reads and writes through the functions in this file. Today they
 * call an in-memory mock (src/mock/server.ts) after a short artificial delay so
 * loading states are real. When the Node.js + Express backend is ready, replace
 * the body of each function with a fetch to the endpoint listed below. No
 * component needs to change as long as the return types stay the same.
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
 * updateCommunity              PATCH  /api/communities/:communityId
 * getMembership                GET    /api/communities/:communityId/me
 * getDashboard                 GET    /api/communities/:communityId/dashboard
 * listMembers                  GET    /api/communities/:communityId/members
 * addMember                    POST   /api/communities/:communityId/members
 * listSigners                  GET    /api/communities/:communityId/signers
 * setAuthorisedSigners         PUT    /api/communities/:communityId/signers
 * registerSignerKey            PUT    /api/communities/:communityId/signers/:signerId/public-key
 * setThreshold                 PUT    /api/communities/:communityId/wallet/threshold
 * createWallet                 POST   /api/communities/:communityId/wallet
 * getWallet                    GET    /api/communities/:communityId/wallet
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

import * as server from '../mock/server'
import type { SpendingRequestInput } from '../mock/server'
import type {
  AuditEvent,
  AuthorisedSigner,
  Community,
  CommunityMember,
  CommunityType,
  Contribution,
  DashboardSummary,
  DemoRole,
  HistoryEntry,
  Membership,
  SpendingRequest,
  SpendingRequestDetail,
  SpendingRequestSummary,
  User,
  Wallet,
} from '../types'
import { ApiError } from './errors'

export { ApiError } from './errors'
export type { SpendingRequestInput }

// Stands in for the auth token. Held in memory only, so a page reload logs out.
let sessionUserId: string | null = null

function currentUser(): string {
  if (!sessionUserId) throw new ApiError('UNAUTHENTICATED', 'Please log in to continue.')
  return sessionUserId
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Runs a mock handler with network-like latency and the same error behaviour a real API would have. */
async function call<T>(handler: () => T, latency = 350 + Math.random() * 400): Promise<T> {
  await delay(latency)
  if (server.demoFlags.apiOutage) {
    throw new ApiError('NETWORK', 'Could not reach the CommunitySafe server. Check your connection and try again.')
  }
  // structuredClone stops components from mutating the mock database by accident.
  return structuredClone(handler())
}

// --- Authentication --------------------------------------------------------

export async function register(input: { name: string; email: string; password: string }): Promise<User> {
  const u = await call(() => server.register(input.name, input.email))
  sessionUserId = u.id
  return u
}

export async function login(input: { email: string; password: string }): Promise<User> {
  const u = await call(() => server.login(input.email))
  sessionUserId = u.id
  return u
}

export async function logout(): Promise<void> {
  await delay(150)
  sessionUserId = null
}

// --- Communities -----------------------------------------------------------

export function listMyCommunities(): Promise<Community[]> {
  return call(() => server.listCommunities(currentUser()))
}

export function getCommunity(communityId: string): Promise<Community> {
  return call(() => server.getCommunity(communityId, currentUser()))
}

export function createCommunity(input: { name: string; description: string; type: CommunityType }): Promise<Community> {
  return call(() => server.createCommunity(currentUser(), input))
}

export function updateCommunity(communityId: string, input: { name: string; description: string }): Promise<Community> {
  return call(() => server.updateCommunity(communityId, currentUser(), input))
}

export function getMembership(communityId: string): Promise<Membership> {
  return call(() => server.getMembership(communityId, currentUser()), 120)
}

export function getDashboard(communityId: string): Promise<DashboardSummary> {
  return call(() => server.getDashboard(communityId, currentUser()))
}

// --- Members and signers ---------------------------------------------------

export function listMembers(communityId: string): Promise<CommunityMember[]> {
  return call(() => server.listMembers(communityId, currentUser()))
}

export function addMember(communityId: string, input: { name: string; email: string }): Promise<CommunityMember> {
  return call(() => server.addMember(communityId, currentUser(), input))
}

export function listSigners(communityId: string): Promise<AuthorisedSigner[]> {
  return call(() => server.listSigners(communityId, currentUser()))
}

export function setAuthorisedSigners(communityId: string, memberIds: string[]): Promise<AuthorisedSigner[]> {
  return call(() => server.setAuthorisedSigners(communityId, currentUser(), memberIds))
}

/** Public key information only. There is deliberately no way to send a private key. */
export function registerSignerKey(
  communityId: string,
  signerId: string,
  input: { xpub: string; fingerprint: string; derivationPath: string },
): Promise<AuthorisedSigner> {
  return call(() => server.registerSignerKey(communityId, currentUser(), signerId, input))
}

// --- Wallet ----------------------------------------------------------------

export function setThreshold(communityId: string, threshold: number): Promise<Wallet> {
  return call(() => server.setThreshold(communityId, currentUser(), threshold))
}

export function createWallet(communityId: string): Promise<Wallet> {
  return call(() => server.createWallet(communityId, currentUser()), 1200)
}

export function getWallet(communityId: string): Promise<Wallet> {
  return call(() => server.getWallet(communityId, currentUser()))
}

export function listContributions(communityId: string): Promise<Contribution[]> {
  return call(() => server.listContributions(communityId, currentUser()))
}

// --- Spending requests -----------------------------------------------------

export function listSpendingRequests(communityId: string): Promise<SpendingRequestSummary[]> {
  return call(() => server.listRequests(communityId, currentUser()))
}

export function getSpendingRequest(requestId: string): Promise<SpendingRequestDetail> {
  return call(() => server.getRequestDetail(requestId, currentUser()))
}

export function createSpendingRequest(communityId: string, input: SpendingRequestInput): Promise<SpendingRequest> {
  return call(() => server.createRequest(communityId, currentUser(), input), 700)
}

export function updateSpendingRequest(requestId: string, input: SpendingRequestInput): Promise<SpendingRequest> {
  return call(() => server.updateRequest(requestId, currentUser(), input), 600)
}

/**
 * In production the signer's own device signs the PSBT and this call submits
 * the partial signature. Here the signature is simulated.
 */
export function signTransaction(requestId: string): Promise<SpendingRequestDetail> {
  return call(() => server.signRequest(requestId, currentUser()), 1100)
}

export function declineSpendingRequest(requestId: string, reason: string): Promise<SpendingRequestDetail> {
  return call(() => server.declineRequest(requestId, currentUser(), reason))
}

export function broadcastTransaction(requestId: string): Promise<SpendingRequestDetail> {
  return call(() => server.broadcastRequest(requestId, currentUser()), 1400)
}

// --- Transactions and audit ------------------------------------------------

export function listTransactions(communityId: string): Promise<HistoryEntry[]> {
  return call(() => server.listHistory(communityId, currentUser()))
}

export function getTransaction(communityId: string, txid: string): Promise<HistoryEntry> {
  return call(() => server.getHistoryEntry(communityId, txid, currentUser()))
}

export function listAuditEvents(communityId: string): Promise<AuditEvent[]> {
  return call(() => server.listAudit(communityId, currentUser()))
}

// --- Mock only -------------------------------------------------------------

/** Signs in as the seeded person who holds a role, so one browser can demo every view. */
export async function switchDemoRole(communityId: string, role: DemoRole): Promise<User> {
  const u = await call(() => server.personaFor(communityId, role), 250)
  sessionUserId = u.id
  return u
}

export function simulateSignerRegistration(communityId: string, signerId: string): Promise<AuthorisedSigner> {
  return call(() => server.simulateSignerRegistration(communityId, currentUser(), signerId), 600)
}

export interface DemoFlags {
  apiOutage: boolean
  nodeDown: boolean
}

export function getDemoFlags(): DemoFlags {
  return { ...server.demoFlags }
}

export function setDemoFlags(flags: Partial<DemoFlags>): DemoFlags {
  Object.assign(server.demoFlags, flags)
  return getDemoFlags()
}

export function currentChainTip(): number {
  return server.chainTip()
}
