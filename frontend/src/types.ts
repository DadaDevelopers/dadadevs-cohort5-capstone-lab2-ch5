// Domain types. These mirror the logical entities in the SRS (section 12) and the
// architecture document (section 7.1). Amounts are always integer satoshis.

export type ISODate = string

export type Network = 'regtest' | 'signet'

/** A person with a CommunitySafe account. */
export interface User {
  id: string
  name: string
  email: string
  createdAt: ISODate
}

export type CommunityType = 'community' | 'organization' | 'group'

/**
 * Where a community is in the setup journey. The wallet only exists once
 * setupStage is 'active'; before that the admin is still configuring it.
 */
export type SetupStage = 'members' | 'rule' | 'signers' | 'review' | 'active'

export interface Community {
  id: string
  name: string
  description: string
  type: CommunityType
  createdBy: string // user id of the founding administrator
  createdAt: ISODate
  setupStage: SetupStage
}

/** Links a user to a community. Membership alone never grants signing authority (BR-01). */
export interface CommunityMember {
  id: string
  communityId: string
  userId: string
  name: string
  email: string
  isAdmin: boolean
  joinedAt: ISODate
}

export type SignerStatus = 'awaiting_key' | 'ready'

/**
 * A member selected to take part in multisig spending. Only public key
 * information is ever held here; private keys stay on the signer's device.
 */
export interface AuthorisedSigner {
  id: string
  communityId: string
  memberId: string
  name: string
  status: SignerStatus
  /** Extended public key (tpub/vpub on test networks). Null until registered. */
  xpub: string | null
  /** BIP32 master key fingerprint, 8 hex characters. */
  fingerprint: string | null
  derivationPath: string | null
  selectedAt: ISODate
  registeredAt: ISODate | null
}

export type WalletStatus = 'draft' | 'active'

export interface Wallet {
  id: string
  communityId: string
  network: Network
  scriptType: 'P2WSH'
  status: WalletStatus
  /** M: signatures required to spend. Null until the admin picks it. */
  threshold: number | null
  /** N: number of authorised signers. */
  signerCount: number
  receiveAddress: string | null
  createdAt: ISODate | null
  /** Balance figures are derived by the backend from the node's view of the wallet. */
  confirmedBalanceSats: number
  unconfirmedIncomingSats: number
  /** Funds held back by active spending requests so two requests cannot spend the same coins. */
  reservedSats: number
}

/** Incoming Bitcoin received by the community wallet (BR-10). */
export interface Contribution {
  id: string
  communityId: string
  txid: string
  vout: number
  amountSats: number
  /** Optional note the treasurer attached, for example "September harambee". */
  label: string | null
  receivedAt: ISODate
  blockHeight: number | null
  confirmations: number
}

export type SpendingRequestStatus =
  | 'pending' // prepared, no signatures yet, still editable by its creator
  | 'awaiting_signatures' // signing has started, below threshold
  | 'ready_to_broadcast' // threshold reached, not yet sent
  | 'broadcast' // accepted by the node
  | 'failed' // node rejected the broadcast; signatures are kept for retry
  | 'rejected' // enough signers declined that the threshold can no longer be reached

export interface BroadcastError {
  code: string
  message: string
  at: ISODate
}

export interface SpendingRequest {
  id: string
  number: number
  communityId: string
  title: string
  purpose: string
  recipientAddress: string
  amountSats: number
  estimatedFeeSats: number
  feeRateSatVb: number
  changeAddress: string
  createdBy: string // member id
  createdByName: string
  createdAt: ISODate
  updatedAt: ISODate
  status: SpendingRequestStatus
  /** Threshold and signer count at the time the request was prepared. */
  threshold: number
  signerCount: number
  txid: string | null
  broadcastAttempts: number
  lastBroadcastError: BroadcastError | null
}

export type SignatureDecision = 'signed' | 'declined'

/** One signer's participation in one spending request. A signer counts at most once (BR-06). */
export interface Signature {
  id: string
  requestId: string
  signerId: string
  signerName: string
  decision: SignatureDecision
  reason: string | null
  createdAt: ISODate
  verified: boolean
}

export type TxStatus = 'mempool' | 'confirmed'

/** An outgoing transaction the community broadcast. */
export interface BitcoinTransaction {
  txid: string
  communityId: string
  requestId: string
  amountSats: number
  feeSats: number
  recipientAddress: string
  broadcastAt: ISODate
  blockHeight: number | null
  confirmations: number
  status: TxStatus
}

export type AuditAction =
  | 'community_created'
  | 'member_added'
  | 'signers_selected'
  | 'signer_key_registered'
  | 'threshold_set'
  | 'wallet_created'
  | 'contribution_received'
  | 'request_created'
  | 'request_edited'
  | 'request_signed'
  | 'request_declined'
  | 'threshold_reached'
  | 'request_rejected'
  | 'broadcast_succeeded'
  | 'broadcast_failed'
  | 'community_updated'

export interface AuditEvent {
  id: string
  communityId: string
  action: AuditAction
  actorId: string | null // null for system events such as an incoming deposit
  actorName: string
  summary: string
  targetType: 'community' | 'member' | 'signer' | 'wallet' | 'request' | 'transaction' | 'contribution'
  targetId: string
  createdAt: ISODate
}

// ---------------------------------------------------------------------------
// View models returned by the API that combine entities.

/** What the signed-in user is allowed to do in one community. */
export interface Membership {
  member: CommunityMember
  signer: AuthorisedSigner | null
  isAdmin: boolean
  isSigner: boolean
}

export interface SpendingRequestDetail {
  request: SpendingRequest
  signatures: Signature[]
  signers: AuthorisedSigner[]
  transaction: BitcoinTransaction | null
}

/** A spending request together with its signatures, used by lists. */
export interface SpendingRequestSummary extends SpendingRequest {
  signatures: Signature[]
}

/** Combined incoming and outgoing history for the transactions screen. */
export interface HistoryEntry {
  direction: 'incoming' | 'outgoing'
  txid: string
  amountSats: number
  feeSats: number | null
  at: ISODate
  confirmations: number
  status: TxStatus
  label: string
  requestId: string | null
  blockHeight: number | null
  counterpartyAddress: string | null
}

export interface DashboardSummary {
  community: Community
  wallet: Wallet
  memberCount: number
  requests: SpendingRequestSummary[]
  recentHistory: HistoryEntry[]
  recentContributions: Contribution[]
}

/** The three views the role switcher can demo. */
export type DemoRole = 'admin' | 'signer' | 'member'
