# CommunitySafe Integration Backlog

Last updated: 2026-10-22 (Africa/Nairobi)

## Blocking and near-term integration gaps

| Priority | Gap | Evidence / current behavior | Recommended action | Security and tests |
|---|---|---|---|---|
| P2 | Registration name parsing is intentionally simple | Milestone 1 requires at least two name words, sends the first as `firstName` and the remainder as `lastName`, then performs a separate login | Consider separate first/last fields if product requirements need unambiguous international name handling | No token is invented; preserve backend validation. Test UI migration if fields change. |
| P1 | Monetary type mismatch | Backend correctly returns satoshi strings; frontend types use JS `number` | Move API/domain money fields to decimal strings/BigInt-safe formatting and convert only within safe range | Test max values, formatting, comparisons, and JSON boundaries without precision loss. |
| Resolved | Regtest versus signet mismatch | Integrated validation and safety copy are Regtest-only (`bcrt1`) | Preserve until an explicitly separated production-network design exists | Existing recipient tests reject unsupported networks and self-addresses. |

## Deferred product and UX features

These items must remain visible even when not required for the core MVP.

| Feature | Existing frontend component / mock behavior | Missing backend capability / existing support | Recommended implementation | Priority | Security implications | Tests required |
|---|---|---|---|---|---|---|
| Community profile editing | `Settings.tsx`; mock `updateCommunity` reports success | No PATCH community endpoint | Add admin-only validated update endpoint with uniqueness handling; until then render details read-only | P2 | Enforce community-scoped admin; audit name changes | Validation, duplicate name, non-admin, non-member, concurrent update |
| Dedicated membership summary | `CommunityContext` calls mock `getMembership` | Can derive from community detail, members, and signers | Initially use adapter composition; add `/communities/:id/me` only if latency/complexity warrants it | P3 | Never trust client-computed role for authorization | Admin/signer/member combinations and cross-community isolation |
| Aggregated dashboard statistics | Dashboard composes real wallet/balance/member/spend/transaction endpoints | No dedicated aggregate endpoint | Keep client composition; add a scoped aggregate only if measured latency warrants it | P3 performance | Aggregate must preserve membership scoping | Empty, partial, node-down, large history, permission tests |
| Contribution categorization and labels | `Wallet.tsx`; mock contributions have labels | Transactions/UTXOs exist; no contribution entity/label persistence | Show real unlabeled incoming transactions first; later add scoped metadata table/API | P3 | Labels can expose personal/community data; authorize edits | Tx association, reorg/confirmation, edit permissions, sanitization |
| Spending-request editing | `RequestForm.tsx` edit route; mock updates pending request | No PATCH endpoint; backend PSBT/input reservations make edits security-sensitive | Disable route. Future design should cancel/recreate rather than mutate a signed/locked PSBT | P3 | Never change recipient/amount/fee under collected signatures | Status gates, reservation release, signatures invalidate, concurrency |
| Spending-request decline/rejection | `RequestDetail.tsx` persists mock declines and computes rejection | No decline model/status | Keep unavailable. If added, define whether decline is informational or terminal and persist signer identity | P3 | Decline must not count as cryptographic approval or permit denial spoofing | Authorized/duplicate decline, threshold reachability, audit, privacy |
| Persistent audit events/log screen | `Audit.tsx`; mock event list | No audit model/API | Retain honest unavailable screen; later append immutable server-side events inside mutation transactions | P2 | Tamper resistance, least-privilege visibility, no secrets/PSBT leakage | Event completeness/order, actor projection, failure rollback, access control |
| Advanced transaction history/filtering | `Transactions.tsx`; mock rich combined entries | Basic Core wallet transactions and detail exist | First map real Core history; later add pagination, filters, request/contribution links | P3 | Avoid address/metadata leakage across communities | Pagination, category mapping, duplicates, reorgs, large histories |
| Native signer key generation/recovery | No safe real implementation; xpub copy implies wallet-app flow | Backend intentionally stores public keys only | Separate security-reviewed signer-side product; never generate central-custody keys in this web app | P4 | Critical key custody, backups, malware, entropy, recovery | Independent security review, deterministic backup/recovery, device-loss scenarios |
| Independent wallet application integration | Signers page names Sparrow/Nunchuk but no interoperability | Backend accepts compatible signed PSBT; descriptor/PSBT export UX missing | Research tested QR/file/clipboard workflow and wallet compatibility matrix | P2 research | Validate exact policy/output before signing; prevent clipboard substitution | Import/export round trips, exact policy, signer identity, malformed PSBT |
| Full in-app cryptographic signing | Current mock button simulates it | No secure signer keystore/browser architecture | Do not implement in core MVP. Consider hardware wallet/WebUSB only after threat model and compatibility review | P4 | Highest risk: keys, origins, supply chain, transaction review | Hardware/device matrix, origin isolation, XSS/CSP, cancellation, malicious PSBT |
| Signer-controlled desktop companion | Existing `backend/scripts/regtest-signer.js` proves independent Core-wallet flow but requires CLI/PowerShell | No companion protocol/app | Design local-only companion that fetches by authenticated signer, verifies policy/details, asks explicit consent, signs via local Core/wallet, submits PSBT | P2 research | Local authentication, origin binding, update signing, key/RPC isolation | Threat model, local endpoint restrictions, transaction review, replay, upgrade security |
| Secure production signer custody | Regtest wallets only | No production custody design | Treat as separate product/security program; evaluate hardware wallets and multisig coordinators | P4 | Mainnet funds, disaster recovery, insider/device compromise | External audit, recovery drills, mainnet-readiness checklist |
| Mainnet readiness | Frontend mentions test networks; backend enforces Regtest | Entire production network/config/operations model intentionally absent | Keep out of MVP; require explicit network separation, descriptors, fee policy, monitoring, deployment review | P4 | Real financial loss | Signet staging, network isolation, fee/replace/reorg tests, security audit |
| Production session renewal/hardening | Backend has stateless access/refresh JWTs; frontend no integration | No rotation/revocation/cookie delivery/logout | MVP sessionStorage adapter first; later secure HttpOnly refresh cookie, rotation, revocation, CSRF strategy, CSP | P2 | XSS/token theft and long-lived refresh tokens | Rotation/reuse detection, logout/revocation, CSRF/XSS, multi-tab/device behavior |
| Replacement of prototype-only controls | Live routes no longer expose role switching, demo login, simulated outages, or mock financial state | No backend equivalent by design | Keep legacy mock sources unreferenced or remove them in a cleanup-only change | P3 cleanup | Prevent reintroduction of impersonation/misleading success | Production-build absence, permission E2E, no seeded-token shortcuts |
| Additional responsive/accessibility improvements | Existing layouts include responsive/loading patterns | No API dependency | Perform role/journey audit after real states land; preserve semantic labels and focus handling | P3 | Accessible error/confirmation messaging matters for signing consent | Keyboard, focus, screen reader, contrast, mobile viewport, long data |
| Community selection/chooser | Implemented for users with multiple real communities; only the selected ID is tab-scoped | No dedicated full-page chooser | Consider a full chooser only for discoverability | P3 | Prevent stale data leakage during switches | Rapid switch/abort, reload selection, revoked membership, empty list |
| Password-reset delivery | Backend creates hashed reset token but deliberately does not deliver it | Email delivery provider/templates absent | Keep API response non-enumerating; add secure email delivery separately | P3 | Token secrecy, expiry, enumeration, abuse | Delivery failure, expiry, single use, rate limits, non-enumeration |

## Known backend behavior to preserve

- Membership checks return 403 for non-members and 404 for missing communities where appropriate.
- At least one community admin must remain.
- An authorized signer must be removed before their membership can be removed.
- Signer set, signer keys, and signing threshold become immutable once the wallet exists.
- Wallet coordinator is a watch-only descriptor wallet on Regtest.
- Spending inputs are reserved to prevent concurrent requests from double-selecting them.
- Only snapshot signers can retrieve/sign the PSBT; each signer counts once.
- Submitted PSBTs are checked for unchanged unsigned transaction, outputs, inputs, metadata, policy, and valid signer signature.
- Only admins create spending requests, cancel them, and broadcast; all members may view wallet/status information.
- Broadcast is distinct from confirmation; transaction endpoints report Bitcoin Core confirmations.

## Current resolution and next action

Milestones 0–9 are complete for implementation and available automated verification. The next release gate is an isolated PostgreSQL + Bitcoin Core Regtest E2E run followed by a three-role live browser journey where the browser can reach both services.

## Resolved during Milestone 1

- Git status/diff anomaly: caused by sandbox denial of Git index refresh outside writable roots, not repository corruption.
- Real authentication/session layer: implemented and tested.
- Live demo login, role impersonation, and simulated failure controls: removed/fail closed.
- Registration contract mapping: implemented as register followed by real login.
- Dependency advisories introduced/discovered during testing: resolved; production audit reports zero vulnerabilities.

## Resolved during Milestone 2

- Real community, member, role, signer-selection, and join adapters now replace the mixed mock data source.
- A missing wallet is a supported setup state derived from real signer/threshold/wallet reads.
- Join-code and multi-community selector UI are implemented; selection stores only a per-user ID and refetches server data.
- Member addition matches the existing-account email contract; roles and removals rely on backend authorization and safeguards.
- Community settings no longer report a fake save when no backend update API exists.

## Resolved during Milestone 3

- The signer UI and API now use only the authenticated signer's compressed public key; xpub/fingerprint/path and simulated registration are removed from live flow.
- Threshold, wallet creation/get, receiving address, and Bitcoin Core balance are real adapters.
- Wallet creation sends no client-supplied signer policy or key material and continues to rely on backend Regtest/descriptor/immutability checks.
- Unsafe satoshi strings fail instead of being rounded; the broader monetary-domain migration remains open for spending and transaction models.
- Mock contribution records are no longer displayed for real communities.

## Resolved during Milestone 4

- Added the essential safe spend-list backend API and OpenAPI documentation; list projections omit PSBTs.
- Real request create/detail/list/cancel replaces the mock request ledger.
- Create/cancel UI follows backend admin authorization, while signature authority remains separate.
- Unsupported request editing, decline/rejection persistence, and simulated click-to-sign controls are removed from live flow.
- Integrated recipient validation is Regtest-only and the backend remains authoritative for address, funds, fee, and UTXO checks.

## Resolved during Milestone 5

- Live click-only simulated signing is removed and replaced by signer-scoped PSBT export plus externally signed PSBT submission.
- The coordinator never receives private keys, recovery phrases, signer-wallet RPC cookies, or RPC credentials.
- Backend cryptographic verification, exact transaction/policy checks, duplicate prevention, and signer identity remain authoritative.

## Resolved during Milestone 6

- Broadcast uses the real admin-only endpoint and preserves backend threshold/idempotency/node errors.
- Transaction list/detail and confirmations use wallet-scoped Bitcoin Core responses; mock chain-tip progression is absent.

## Resolved during HTTP 429 work and Milestones 7–9

- Separated routine `/auth/me` and `/communities` reads from the shared 30-request public-auth bucket while preserving strict login and failed-login protections.
- Added session and per-user community limits, retry headers, enforcement/recovery tests, and frontend `Retry-After` presentation without automatic retry loops.
- Coalesced simultaneous session restoration and retained coordinated one-shot refresh behavior.
- Replaced the mock-backed dashboard aggregate with real endpoints and made the missing audit API explicit instead of showing seed events.
- Corrected administrator/signer/member copy and controls to match backend authority and independent key custody.
- Final available matrix: backend 20 passed / 2 gated skips; frontend 43 passed; TypeScript and production build passed.

## Final next-development priorities

1. Run the gated PostgreSQL and Regtest suites against disposable resources, including full 2-of-3 signing, broadcast, mining, and confirmation refresh.
2. Perform the three-role browser journey and responsive/accessibility pass on a host-reachable integration deployment.
3. Replace `number` money view models with decimal-string/BigInt-safe domain types throughout.
4. Add refresh-token rotation/revocation and secure HttpOnly cookie delivery before any internet/mainnet deployment.
5. Implement a durable, membership-scoped audit event model/API; keep the honest unavailable screen until then.
6. Add password-reset delivery, community profile editing, transaction pagination/metadata, and a security-reviewed signer companion only as separately scoped features.

## Resolved during signer setup and logout UX work

- Signers no longer need to discover their numeric user/community IDs manually. The guided modal derives them from authenticated frontend state and produces the exact inspected Regtest utility command.
- The command never contains tokens, private keys, seeds, RPC passwords, or cookie contents. Local terminal and cookie-file prerequisites are explained beside it.
- Compressed-key paste validation, secret-material clearing, real API submission, backend authorization, and status refresh remain intact.
- Logout is now visibly labelled on desktop and smaller layouts, including during community setup.
- Logout clears tab-scoped credentials, selected-community storage, and all community/wallet/membership state; old in-flight responses cannot populate a new user’s view.

## Remaining session limitation

The backend still has stateless JWT issuance with no logout, revocation, rotation, or reuse-detection endpoint. Current logout is intentionally client-side, so copied access or refresh tokens remain valid until expiry. Before internet or mainnet use, add server-side refresh-token rotation/revocation and secure same-site HttpOnly cookie delivery with corresponding logout, CSRF, reuse, and multi-device tests.


## Resolved during opt-in browser signer work

- Added a flag-gated (`VITE_ENABLE_BROWSER_SIGNER === "true"`) Regtest browser signer so a signer can create or restore a secp256k1 key, register only its compressed public key, review the coordinator PSBT, and submit a genuine signature without a separate Core wallet. The default and every non-`true` value keep the manual export/paste flow unchanged.
- Key material stays client-side: recovery words are encrypted in IndexedDB with PBKDF2-SHA256 (600k iterations) and AES-256-GCM, with record identity bound as additional authenticated data. The decrypted key exists only for one signature and is zeroed afterwards; nothing secret is sent to the coordinator.
- Signing is gated on inspection, not trust: backend descriptor/address, exact witness script, previous outputs, SIGHASH_ALL, non-finalised inputs, recipient script and amount, actual fee, change, and membership of the local key in the wallet policy are all checked before the passphrase prompt appears.
- The backend already accepts these signatures: `backend/test/browser-signer-compat.test.js` has `bitcoinjs-lib` verify a `@scure`-signed fixture and rejects tampered, mismatched, and injected signatures.

## Browser signer limitations and follow-ups

| Priority | Limitation | Current behavior / evidence | Recommended action |
|---|---|---|---|
| P1 | No live Regtest E2E for the browser path | Unit, component, build, and backend signature-compatibility checks pass; full key → wallet → sign → broadcast → mine flow still requires disposable resources | Run the gated Regtest suite plus a browser journey before calling the feature complete; keep it flag-off until then |
| P2 | Unconditional bundle growth | Vite reports 527.76 kB (168.86 kB gzip) and the >500 kB advisory because `@scure`/`@noble` and the new panels load with the normal bundle even when the flag is off | Lazy-load `components/browser-signer/*` and the crypto modules behind the flag (dynamic `import()` + `Suspense`) so manual-flow users do not download them |
| P2 | Browser storage semantics untested in a real browser | jsdom covers the logic with Node `webcrypto` and `fake-indexeddb`; private mode, storage eviction, blocked version upgrades, and multi-tab behavior are not exercised | Test in current Chrome/Firefox/Safari, including a second tab and wiped storage, and surface a clear unavailable state |
| P3 | Passphrase recovery is one-shot | A wrong passphrase or a lost passphrase cannot be recovered from the ciphertext; the recovery words remain the only backup, and deleting the vault does not delete the on-chain key | Keep copy explicit; never add passphrase hints or server-side escrow; document that restoring words on another device re-creates the same key |
| P3 | Regtest-only by construction | `getWalletPolicy` rejects non-`READY` wallets and any network other than Regtest; derivation is fixed to `m/48'/1'/0'/2'/0/0` | Do not relax without a separate threat model for signet/mainnet, hardware-backed keys, and account-index selection |


## Resolved during wallet activity and transaction detail work

- Bitcoin Core's per-output ledger rows are aggregated into one logical entry per TXID. External recipient outputs determine the payment amount; wallet-owned send/change legs are reported as `changeSats`; wallet-owned receives are contributions. Internal change no longer appears in Incoming Contributions or as a second payment.
- The list and detail endpoints now return the same direction, amount, fee, change, total debit, recipients, request link, confirmations, block hash, and actual block height. Detail no longer picks the first matching Core row or overwrites the amount from `gettransaction.amount`.
- Confirmed transactions show Core's block height; unconfirmed transactions show zero confirmations and no height. If height metadata is unavailable, the UI says “Unavailable” rather than contradicting the confirmation state.
- Transactions and Wallet rows now give Amount and Status explicit, right-aligned cells with nowrap/tabular amounts and responsive stacking. Confirmation wording is unconfirmed / N confirmation(s) / confirmed, and the type filter is visibly labelled.
- Added realistic Bitcoin Core fixtures and backend aggregation/detail tests, plus frontend API and Transactions page tests covering logical grouping, change exclusion, multi-recipient sums, confirmed/unconfirmed height handling, unlinked sends, filters, and amount/status separation.
- Fixed the pre-existing `browserSignerFlag` default-argument test issue: an explicitly passed `undefined` now means “missing flag”, while an omitted argument still reads `import.meta.env`.

### Remaining wallet-activity limitations

- Request association uses the exact stored TXID. Sends created outside the app remain consciously classified as outgoing with `requestId: null` and a visible “not linked” warning; no request is inferred from amount or recipient.
- A confirmed transaction that lacks both `blockheight` and `blockhash` cannot display a height. This is shown as unavailable, not fabricated.
- The wallet history is still capped by Core's 100-entry `listtransactions` window; add pagination or a larger bounded window before high-volume use.
- Visual browser validation at desktop/tablet/mobile widths was not performed because no browser automation is available here. The responsive contract and separated cells are covered by component tests, but a manual cross-width pass remains.
- Transaction detail shows a single logical fee/amount per TXID. A transaction that both spends externally and receives unrelated external funds in the same TXID would need a richer multi-leg view; the current app only creates one recipient plus change.

### Rate-limit deployment follow-ups

- The current `express-rate-limit` store is process-local. Before running multiple backend replicas, add and test a shared supported store so limits cannot be multiplied by replica count.
- Set `TRUST_PROXY` to the verified numeric hop count in each proxied production environment. It is intentionally unset by default because an overly broad trust setting allows client-IP spoofing.
- Revisit production thresholds using real traffic measurements before changing them; development overrides must not be copied into production environment variables.

## Resolved: durable activity surfaces

- Added append-only, community-scoped audit events with actor/entity metadata, cursor pagination, filtering, transactional writes, and deterministic deduplication for retryable wallet events.
- Added persistent user/community notifications with unread count, ownership-enforced read/read-all operations, an accessible header bell, and restrained visibility-aware polling.
- Added retained spending-request discussions with community membership checks, chronological pagination, plain-text rendering, bounded input, author-excluding notifications, and no connection to signature/approval counts.
- Added broadcast reconciliation coverage: after Core accepts a transaction, a temporary activity-write failure leaves the request retryable; the next attempt detects the known transaction, persists the final status/event, and does not rebroadcast.

## Remaining activity follow-ups

1. Apply the additive migration only after backup and explicit approval, then run the gated PostgreSQL suite against a disposable migrated schema.
2. Run the gated Regtest and authenticated browser journeys against disposable resources after migration; current tests do not mutate the manual node or database.
3. Replace notification polling with a reviewed push channel only if product needs justify the added operational complexity. The current 60-second visible-tab poll is intentionally conservative.
4. Add retention/export policy and database-level write-role restrictions if audit records must meet formal compliance requirements; the application exposes no audit update/delete endpoints, but database administrators retain database-level authority.
5. Code-split the browser signer/activity screens to address Vite's existing bundle-size advisory.
