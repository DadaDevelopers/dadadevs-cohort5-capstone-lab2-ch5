// Seed data for the prototype. Everything here is fictional and lives on a
// simulated regtest chain. Addresses and txids are well formed (bech32
// checksums are valid) but none of them exist on any real network.
//
// Only src/mock/server.ts reads this file. Components go through src/api.

import type {
  AuditEvent,
  AuthorisedSigner,
  BitcoinTransaction,
  Community,
  CommunityMember,
  Contribution,
  Signature,
  SpendingRequest,
  User,
  Wallet,
} from '../types'

/** Chain height of the simulated regtest node when the app loads. */
export const SEED_TIP_HEIGHT = 2140

export const COMMUNITY_ID = 'com-machakos'

export const users: User[] = [
  { id: 'usr-martha', name: 'Martha Ngendo', email: 'martha.ngendo@example.org', createdAt: '2026-09-01T07:12:00Z' },
  { id: 'usr-sharnie', name: 'Sharnie Essy', email: 'sharnie.essy@example.org', createdAt: '2026-09-02T09:40:00Z' },
  { id: 'usr-sheila', name: 'Sheila Amor', email: 'sheila.amor@example.org', createdAt: '2026-09-02T10:05:00Z' },
  { id: 'usr-nelly', name: 'Nelly Arsey', email: 'nelly.arsey@example.org', createdAt: '2026-09-02T11:22:00Z' },
  { id: 'usr-daniel', name: 'Daniel Mutua', email: 'daniel.mutua@example.org', createdAt: '2026-09-03T06:58:00Z' },
  { id: 'usr-linder', name: 'Linder Stacy', email: 'linder.stacy@example.org', createdAt: '2026-09-03T15:30:00Z' },
]

export const communities: Community[] = [
  {
    id: COMMUNITY_ID,
    name: 'Machakos Builders Fund',
    description:
      'Pooled savings from twelve households in Mutituni, Machakos, used to build and maintain the community hall and borehole. Contributions come in after each monthly meeting.',
    type: 'community',
    createdBy: 'usr-martha',
    createdAt: '2026-09-02T08:00:00Z',
    setupStage: 'active',
  },
]

export const members: CommunityMember[] = [
  { id: 'mem-martha', communityId: COMMUNITY_ID, userId: 'usr-martha', name: 'Martha Ngendo', email: 'martha.ngendo@example.org', isAdmin: true, joinedAt: '2026-09-02T08:00:00Z' },
  { id: 'mem-sharnie', communityId: COMMUNITY_ID, userId: 'usr-sharnie', name: 'Sharnie Essy', email: 'sharnie.essy@example.org', isAdmin: false, joinedAt: '2026-09-02T09:45:00Z' },
  { id: 'mem-sheila', communityId: COMMUNITY_ID, userId: 'usr-sheila', name: 'Sheila Amor', email: 'sheila.amor@example.org', isAdmin: false, joinedAt: '2026-09-02T10:10:00Z' },
  { id: 'mem-nelly', communityId: COMMUNITY_ID, userId: 'usr-nelly', name: 'Nelly Arsey', email: 'nelly.arsey@example.org', isAdmin: false, joinedAt: '2026-09-02T11:25:00Z' },
  { id: 'mem-daniel', communityId: COMMUNITY_ID, userId: 'usr-daniel', name: 'Daniel Mutua', email: 'daniel.mutua@example.org', isAdmin: false, joinedAt: '2026-09-03T07:00:00Z' },
  { id: 'mem-linder', communityId: COMMUNITY_ID, userId: 'usr-linder', name: 'Linder Stacy', email: 'linder.stacy@example.org', isAdmin: false, joinedAt: '2026-09-03T15:35:00Z' },
]

const PATH = "m/48'/1'/0'/2'"

export const signers: AuthorisedSigner[] = [
  {
    id: 'sig-martha', communityId: COMMUNITY_ID, memberId: 'mem-martha', name: 'Martha Ngendo', status: 'ready',
    xpub: 'tpubDEBRuDeG93VYtYcYoDfneXwctPb7YAqC8fn96x25zZ6r6doRKTGuAKvDCH2SkA16q8WH6x89QN5TZ5mEnugtAdmgt2SRydUDEajQdUqTayG',
    fingerprint: 'a556a437', derivationPath: PATH, selectedAt: '2026-09-04T08:30:00Z', registeredAt: '2026-09-04T19:02:00Z',
  },
  {
    id: 'sig-sharnie', communityId: COMMUNITY_ID, memberId: 'mem-sharnie', name: 'Sharnie Essy', status: 'ready',
    xpub: 'tpubDE1WhmbVQywEDxrUtbXgqzngSsptrJVE8NKxotuJ88DcFs5S5ivVxsEniHCB9MMEnaWqPobr7Zj44RJXyP78Yjybzun7xjnLypomm2JmkyF',
    fingerprint: '9bc1b974', derivationPath: PATH, selectedAt: '2026-09-04T08:30:00Z', registeredAt: '2026-09-05T06:41:00Z',
  },
  {
    id: 'sig-sheila', communityId: COMMUNITY_ID, memberId: 'mem-sheila', name: 'Sheila Amor', status: 'ready',
    xpub: 'tpubDFMJGaeWUszXo3hotH2mUdnnDDzXhhpeJUFirkH2hwSB4UFLeRpDzo7hPx9BBxkD6LTKYgGCVNZcUE8Xg1tajbG5FihJYaQtZucrMJfNh6R',
    fingerprint: 'e4fe8886', derivationPath: PATH, selectedAt: '2026-09-04T08:30:00Z', registeredAt: '2026-09-04T21:15:00Z',
  },
  {
    id: 'sig-nelly', communityId: COMMUNITY_ID, memberId: 'mem-nelly', name: 'Nelly Arsey', status: 'ready',
    xpub: 'tpubDFJ5m1Ljuw4HPcrRW4fqpW5ahubaPsayjnaqRVwkd5mqj9F6t8YG4Es8nriqmuDp9zD1SVNa53uyaxP8cs7sXgcihhHYWhDWHcDSUzrxo1W',
    fingerprint: '9e155e88', derivationPath: PATH, selectedAt: '2026-09-04T08:30:00Z', registeredAt: '2026-09-05T12:20:00Z',
  },
  {
    id: 'sig-daniel', communityId: COMMUNITY_ID, memberId: 'mem-daniel', name: 'Daniel Mutua', status: 'ready',
    xpub: 'tpubDFME13DGxQiKYsmeDEto9nmAPu1DKfbJncWsv7shf6NGB88CMWBXtAGv2qkc7h6hmHUg3uuNZaynvKgg1hMkGoFQuTWMYHvDk7msrMmGNXD',
    fingerprint: 'b28ccb93', derivationPath: PATH, selectedAt: '2026-09-04T08:30:00Z', registeredAt: '2026-09-05T17:48:00Z',
  },
]

export const WALLET_ADDRESS = 'bcrt1qk2nscarxcp4j487549xkhf955ds9h0dcx8vk3432q8ata5a4z7ksawg9x8'

export const wallets: Wallet[] = [
  {
    id: 'wal-machakos', communityId: COMMUNITY_ID, network: 'regtest', scriptType: 'P2WSH', status: 'active',
    threshold: 3, signerCount: 5, receiveAddress: WALLET_ADDRESS, createdAt: '2026-09-06T09:00:00Z',
    // Derived fields; the mock server recalculates these on every read.
    confirmedBalanceSats: 0, unconfirmedIncomingSats: 0, reservedSats: 0,
  },
]

export const contributions: Contribution[] = [
  { id: 'ctb-1', communityId: COMMUNITY_ID, txid: '31b1befca721934867c0e73db1a2eed75476bddcf913d09c767fdd7089c8a101', vout: 0, amountSats: 5_000_000, label: 'September meeting contributions', receivedAt: '2026-09-08T14:22:00Z', blockHeight: 1702, confirmations: 0 },
  { id: 'ctb-2', communityId: COMMUNITY_ID, txid: 'f34ef955396a0c441542fc0bf98a050bcfbeae46dd4990d3f229dda6e87d477f', vout: 1, amountSats: 3_000_000, label: 'Harambee for the hall roof', receivedAt: '2026-09-15T11:05:00Z', blockHeight: 1850, confirmations: 0 },
  { id: 'ctb-3', communityId: COMMUNITY_ID, txid: 'bbd2166490454a81e6a5fca713ce1819c047a6c0c55acddadd04324e31ce9a80', vout: 0, amountSats: 2_500_000, label: 'October meeting contributions', receivedAt: '2026-09-29T16:40:00Z', blockHeight: 1990, confirmations: 0 },
  { id: 'ctb-4', communityId: COMMUNITY_ID, txid: '8bcf96e7cfd23620505b19eea1cec89d62f1c7c2afa248bc263b3677d49332b0', vout: 0, amountSats: 1_500_000, label: 'Diaspora member, Daniel’s cousin', receivedAt: '2026-10-12T09:18:00Z', blockHeight: 2101, confirmations: 0 },
  { id: 'ctb-5', communityId: COMMUNITY_ID, txid: 'b59916fda859cc9ee660252e86a37aec8eff5e1c8cde347cd24784ff2b994e94', vout: 2, amountSats: 400_000, label: 'Late contribution, Mama Mwende', receivedAt: '2026-10-19T07:51:00Z', blockHeight: null, confirmations: 0 },
]

const CHANGE = 'bcrt1qmnex5gg8n43kz5jx97phupks0q5z0ykr43u3up3qsyjzu4sl9wmsvvdpn2'

export const spendingRequests: SpendingRequest[] = [
  {
    id: 'req-1', number: 1, communityId: COMMUNITY_ID,
    title: 'Cement and river sand for the borehole housing',
    purpose: 'Forty bags of cement and two lorries of river sand from Kyumbi Hardware, quoted on 28 September. Receipt will be shared at the next meeting.',
    recipientAddress: 'bcrt1qkf493vt40uq85mlwa0m3xlvp4dvrvgsjhpsadr',
    amountSats: 1_800_000, estimatedFeeSats: 948, feeRateSatVb: 4, changeAddress: CHANGE,
    createdBy: 'mem-sheila', createdByName: 'Sheila Amor', createdAt: '2026-10-01T10:15:00Z', updatedAt: '2026-10-03T08:02:00Z',
    status: 'broadcast', threshold: 3, signerCount: 5,
    txid: '4fe03210a2d621767ee6f87a1aa8e0e4b710fdbf8f0288379ab7940447fb5a6e', broadcastAttempts: 1, lastBroadcastError: null,
  },
  {
    id: 'req-2', number: 2, communityId: COMMUNITY_ID,
    title: 'Lorry hire to deliver hall materials',
    purpose: 'Two trips from Machakos town to the site with the roofing timber. Driver is Peter Kioko.',
    recipientAddress: 'bcrt1q45u2ukpl88h0rk4ypxxpx9ex2039u9nwlv5zzy',
    amountSats: 650_000, estimatedFeeSats: 948, feeRateSatVb: 4, changeAddress: CHANGE,
    createdBy: 'mem-daniel', createdByName: 'Daniel Mutua', createdAt: '2026-10-15T13:30:00Z', updatedAt: '2026-10-17T18:44:00Z',
    status: 'failed', threshold: 3, signerCount: 5,
    txid: null, broadcastAttempts: 1,
    lastBroadcastError: {
      code: 'NODE_UNREACHABLE',
      message: 'connect ECONNREFUSED 10.0.4.12:18443 — the Bitcoin node did not answer, so the transaction was not sent.',
      at: '2026-10-17T18:44:00Z',
    },
  },
  {
    id: 'req-3', number: 3, communityId: COMMUNITY_ID,
    title: 'Iron sheets for the community hall roof',
    purpose: 'Thirty gauge-28 iron sheets and ridging from Mlolongo Steel. Quote attached in the WhatsApp group on 13 October.',
    recipientAddress: 'bcrt1qhy0nl3ddt4txg8v639yugqvx40eyhfdgw4k86t',
    amountSats: 2_100_000, estimatedFeeSats: 948, feeRateSatVb: 4, changeAddress: CHANGE,
    createdBy: 'mem-sheila', createdByName: 'Sheila Amor', createdAt: '2026-10-14T09:10:00Z', updatedAt: '2026-10-16T20:31:00Z',
    status: 'awaiting_signatures', threshold: 3, signerCount: 5,
    txid: null, broadcastAttempts: 0, lastBroadcastError: null,
  },
  {
    id: 'req-4', number: 4, communityId: COMMUNITY_ID,
    title: 'Fundi labour, week 42',
    purpose: 'Five days of masonry work on the hall walls by two fundis at the agreed daily rate.',
    recipientAddress: 'bcrt1q4sg4atce38qk2283d7jhyw48p9scgx0la4tmhd',
    amountSats: 850_000, estimatedFeeSats: 948, feeRateSatVb: 4, changeAddress: CHANGE,
    createdBy: 'mem-nelly', createdByName: 'Nelly Arsey', createdAt: '2026-10-17T16:05:00Z', updatedAt: '2026-10-17T16:20:00Z',
    status: 'awaiting_signatures', threshold: 3, signerCount: 5,
    txid: null, broadcastAttempts: 0, lastBroadcastError: null,
  },
]

export const signatures: Signature[] = [
  { id: 'sg-1', requestId: 'req-1', signerId: 'sig-sheila', signerName: 'Sheila Amor', decision: 'signed', reason: null, createdAt: '2026-10-01T10:20:00Z', verified: true },
  { id: 'sg-2', requestId: 'req-1', signerId: 'sig-martha', signerName: 'Martha Ngendo', decision: 'signed', reason: null, createdAt: '2026-10-02T07:48:00Z', verified: true },
  { id: 'sg-3', requestId: 'req-1', signerId: 'sig-nelly', signerName: 'Nelly Arsey', decision: 'signed', reason: null, createdAt: '2026-10-03T08:00:00Z', verified: true },

  { id: 'sg-4', requestId: 'req-2', signerId: 'sig-daniel', signerName: 'Daniel Mutua', decision: 'signed', reason: null, createdAt: '2026-10-15T13:34:00Z', verified: true },
  { id: 'sg-5', requestId: 'req-2', signerId: 'sig-martha', signerName: 'Martha Ngendo', decision: 'signed', reason: null, createdAt: '2026-10-16T06:55:00Z', verified: true },
  { id: 'sg-6', requestId: 'req-2', signerId: 'sig-sharnie', signerName: 'Sharnie Essy', decision: 'signed', reason: null, createdAt: '2026-10-17T18:40:00Z', verified: true },

  { id: 'sg-7', requestId: 'req-3', signerId: 'sig-sheila', signerName: 'Sheila Amor', decision: 'signed', reason: null, createdAt: '2026-10-14T09:12:00Z', verified: true },
  { id: 'sg-8', requestId: 'req-3', signerId: 'sig-daniel', signerName: 'Daniel Mutua', decision: 'declined', reason: 'I would like a second quote before we pay. Mlolongo is higher than what we paid last year.', createdAt: '2026-10-15T07:30:00Z', verified: true },
  { id: 'sg-9', requestId: 'req-3', signerId: 'sig-martha', signerName: 'Martha Ngendo', decision: 'signed', reason: null, createdAt: '2026-10-16T20:31:00Z', verified: true },

  { id: 'sg-10', requestId: 'req-4', signerId: 'sig-nelly', signerName: 'Nelly Arsey', decision: 'signed', reason: null, createdAt: '2026-10-17T16:20:00Z', verified: true },
]

export const transactions: BitcoinTransaction[] = [
  {
    txid: '4fe03210a2d621767ee6f87a1aa8e0e4b710fdbf8f0288379ab7940447fb5a6e', communityId: COMMUNITY_ID, requestId: 'req-1',
    amountSats: 1_800_000, feeSats: 948, recipientAddress: 'bcrt1qkf493vt40uq85mlwa0m3xlvp4dvrvgsjhpsadr',
    broadcastAt: '2026-10-03T08:02:00Z', blockHeight: 2034, confirmations: 0, status: 'confirmed',
  },
]

let n = 0
const ev = (e: Omit<AuditEvent, 'id' | 'communityId'>): AuditEvent => ({ id: `aud-${++n}`, communityId: COMMUNITY_ID, ...e })

export const auditEvents: AuditEvent[] = [
  ev({ action: 'community_created', actorId: 'usr-martha', actorName: 'Martha Ngendo', summary: 'Created the community “Machakos Builders Fund”', targetType: 'community', targetId: COMMUNITY_ID, createdAt: '2026-09-02T08:00:00Z' }),
  ev({ action: 'member_added', actorId: 'usr-martha', actorName: 'Martha Ngendo', summary: 'Added Sharnie Essy, Sheila Amor and Nelly Arsey as members', targetType: 'member', targetId: 'mem-sharnie', createdAt: '2026-09-02T11:25:00Z' }),
  ev({ action: 'member_added', actorId: 'usr-martha', actorName: 'Martha Ngendo', summary: 'Added Daniel Mutua and Linder Stacy as members', targetType: 'member', targetId: 'mem-daniel', createdAt: '2026-09-03T15:35:00Z' }),
  ev({ action: 'signers_selected', actorId: 'usr-martha', actorName: 'Martha Ngendo', summary: 'Selected 5 authorised signers: Martha Ngendo, Sharnie Essy, Sheila Amor, Nelly Arsey, Daniel Mutua', targetType: 'signer', targetId: 'sig-martha', createdAt: '2026-09-04T08:30:00Z' }),
  ev({ action: 'threshold_set', actorId: 'usr-martha', actorName: 'Martha Ngendo', summary: 'Set the approval rule to 3 of 5 signers', targetType: 'wallet', targetId: 'wal-machakos', createdAt: '2026-09-04T08:34:00Z' }),
  ev({ action: 'signer_key_registered', actorId: 'usr-martha', actorName: 'Martha Ngendo', summary: 'Registered public key (fingerprint a556a437)', targetType: 'signer', targetId: 'sig-martha', createdAt: '2026-09-04T19:02:00Z' }),
  ev({ action: 'signer_key_registered', actorId: 'usr-sheila', actorName: 'Sheila Amor', summary: 'Registered public key (fingerprint e4fe8886)', targetType: 'signer', targetId: 'sig-sheila', createdAt: '2026-09-04T21:15:00Z' }),
  ev({ action: 'signer_key_registered', actorId: 'usr-sharnie', actorName: 'Sharnie Essy', summary: 'Registered public key (fingerprint 9bc1b974)', targetType: 'signer', targetId: 'sig-sharnie', createdAt: '2026-09-05T06:41:00Z' }),
  ev({ action: 'signer_key_registered', actorId: 'usr-nelly', actorName: 'Nelly Arsey', summary: 'Registered public key (fingerprint 9e155e88)', targetType: 'signer', targetId: 'sig-nelly', createdAt: '2026-09-05T12:20:00Z' }),
  ev({ action: 'signer_key_registered', actorId: 'usr-daniel', actorName: 'Daniel Mutua', summary: 'Registered public key (fingerprint b28ccb93)', targetType: 'signer', targetId: 'sig-daniel', createdAt: '2026-09-05T17:48:00Z' }),
  ev({ action: 'wallet_created', actorId: 'usr-martha', actorName: 'Martha Ngendo', summary: 'Created the 3-of-5 regtest wallet. The signer set is now fixed.', targetType: 'wallet', targetId: 'wal-machakos', createdAt: '2026-09-06T09:00:00Z' }),
  ev({ action: 'contribution_received', actorId: null, actorName: 'Bitcoin node', summary: 'Received 0.05 BTC (September meeting contributions)', targetType: 'contribution', targetId: 'ctb-1', createdAt: '2026-09-08T14:22:00Z' }),
  ev({ action: 'contribution_received', actorId: null, actorName: 'Bitcoin node', summary: 'Received 0.03 BTC (Harambee for the hall roof)', targetType: 'contribution', targetId: 'ctb-2', createdAt: '2026-09-15T11:05:00Z' }),
  ev({ action: 'contribution_received', actorId: null, actorName: 'Bitcoin node', summary: 'Received 0.025 BTC (October meeting contributions)', targetType: 'contribution', targetId: 'ctb-3', createdAt: '2026-09-29T16:40:00Z' }),
  ev({ action: 'request_created', actorId: 'usr-sheila', actorName: 'Sheila Amor', summary: 'Created request #1 for 0.018 BTC: Cement and river sand for the borehole housing', targetType: 'request', targetId: 'req-1', createdAt: '2026-10-01T10:15:00Z' }),
  ev({ action: 'request_signed', actorId: 'usr-sheila', actorName: 'Sheila Amor', summary: 'Signed request #1 (1 of 3)', targetType: 'request', targetId: 'req-1', createdAt: '2026-10-01T10:20:00Z' }),
  ev({ action: 'request_signed', actorId: 'usr-martha', actorName: 'Martha Ngendo', summary: 'Signed request #1 (2 of 3)', targetType: 'request', targetId: 'req-1', createdAt: '2026-10-02T07:48:00Z' }),
  ev({ action: 'request_signed', actorId: 'usr-nelly', actorName: 'Nelly Arsey', summary: 'Signed request #1 (3 of 3)', targetType: 'request', targetId: 'req-1', createdAt: '2026-10-03T08:00:00Z' }),
  ev({ action: 'threshold_reached', actorId: null, actorName: 'CommunitySafe', summary: 'Request #1 reached 3 of 3 signatures and can be sent', targetType: 'request', targetId: 'req-1', createdAt: '2026-10-03T08:00:00Z' }),
  ev({ action: 'broadcast_succeeded', actorId: 'usr-nelly', actorName: 'Nelly Arsey', summary: 'Sent request #1 to the Bitcoin network (txid 4fe03210…fb5a6e)', targetType: 'transaction', targetId: '4fe03210a2d621767ee6f87a1aa8e0e4b710fdbf8f0288379ab7940447fb5a6e', createdAt: '2026-10-03T08:02:00Z' }),
  ev({ action: 'contribution_received', actorId: null, actorName: 'Bitcoin node', summary: 'Received 0.015 BTC (Diaspora member, Daniel’s cousin)', targetType: 'contribution', targetId: 'ctb-4', createdAt: '2026-10-12T09:18:00Z' }),
  ev({ action: 'request_created', actorId: 'usr-sheila', actorName: 'Sheila Amor', summary: 'Created request #3 for 0.021 BTC: Iron sheets for the community hall roof', targetType: 'request', targetId: 'req-3', createdAt: '2026-10-14T09:10:00Z' }),
  ev({ action: 'request_signed', actorId: 'usr-sheila', actorName: 'Sheila Amor', summary: 'Signed request #3 (1 of 3)', targetType: 'request', targetId: 'req-3', createdAt: '2026-10-14T09:12:00Z' }),
  ev({ action: 'request_declined', actorId: 'usr-daniel', actorName: 'Daniel Mutua', summary: 'Declined request #3: “I would like a second quote before we pay.” The request stays open because 3 signers can still sign.', targetType: 'request', targetId: 'req-3', createdAt: '2026-10-15T07:30:00Z' }),
  ev({ action: 'request_created', actorId: 'usr-daniel', actorName: 'Daniel Mutua', summary: 'Created request #2 for 0.0065 BTC: Lorry hire to deliver hall materials', targetType: 'request', targetId: 'req-2', createdAt: '2026-10-15T13:30:00Z' }),
  ev({ action: 'request_signed', actorId: 'usr-daniel', actorName: 'Daniel Mutua', summary: 'Signed request #2 (1 of 3)', targetType: 'request', targetId: 'req-2', createdAt: '2026-10-15T13:34:00Z' }),
  ev({ action: 'request_signed', actorId: 'usr-martha', actorName: 'Martha Ngendo', summary: 'Signed request #2 (2 of 3)', targetType: 'request', targetId: 'req-2', createdAt: '2026-10-16T06:55:00Z' }),
  ev({ action: 'request_signed', actorId: 'usr-martha', actorName: 'Martha Ngendo', summary: 'Signed request #3 (2 of 3)', targetType: 'request', targetId: 'req-3', createdAt: '2026-10-16T20:31:00Z' }),
  ev({ action: 'request_created', actorId: 'usr-nelly', actorName: 'Nelly Arsey', summary: 'Created request #4 for 0.0085 BTC: Fundi labour, week 42', targetType: 'request', targetId: 'req-4', createdAt: '2026-10-17T16:05:00Z' }),
  ev({ action: 'request_signed', actorId: 'usr-nelly', actorName: 'Nelly Arsey', summary: 'Signed request #4 (1 of 3)', targetType: 'request', targetId: 'req-4', createdAt: '2026-10-17T16:20:00Z' }),
  ev({ action: 'request_signed', actorId: 'usr-sharnie', actorName: 'Sharnie Essy', summary: 'Signed request #2 (3 of 3)', targetType: 'request', targetId: 'req-2', createdAt: '2026-10-17T18:40:00Z' }),
  ev({ action: 'threshold_reached', actorId: null, actorName: 'CommunitySafe', summary: 'Request #2 reached 3 of 3 signatures and can be sent', targetType: 'request', targetId: 'req-2', createdAt: '2026-10-17T18:40:00Z' }),
  ev({ action: 'broadcast_failed', actorId: 'usr-sharnie', actorName: 'Sharnie Essy', summary: 'Sending request #2 failed: the Bitcoin node did not answer. The request and its 3 signatures are kept.', targetType: 'request', targetId: 'req-2', createdAt: '2026-10-17T18:44:00Z' }),
  ev({ action: 'contribution_received', actorId: null, actorName: 'Bitcoin node', summary: 'Received 0.004 BTC (Late contribution, Mama Mwende), waiting for confirmation', targetType: 'contribution', targetId: 'ctb-5', createdAt: '2026-10-19T07:51:00Z' }),
]
