# CommunitySafe Frontend–Backend Integration Plan

Last updated: 2026-10-22 (Africa/Nairobi)

## Checkpoint status

- Active branch verified: `feature/frontend-backend-integration`.
- Required applications verified: `frontend/` and `backend/` both exist.
- Milestones 0–9 are complete at the source and automated-verification level.
- HTTP 429 remediation is complete: credential operations remain tightly IP-limited, session reads use a separate bucket, and community traffic is limited per authenticated user.
- Isolated PostgreSQL/Bitcoin Core Regtest E2E and live authenticated browser mutation remain explicitly outstanding because dedicated disposable resources were not available.
- The opt-in Regtest browser signer is implemented behind `VITE_ENABLE_BROWSER_SIGNER` and verified by unit/component tests, a production build, and a backend compatibility test that makes the real `bitcoinjs-lib` verification accept a `@scure`-signed PSBT fixture. Live Regtest/browser E2E for this path remains an environment gate.
- The Git anomaly is resolved: the checkout is valid. Sandboxed `git status`/`git diff` failed because Git refreshes index metadata outside the default writable roots. The same commands work with approved checkout write access. Pre-existing untracked wallet documents remain preserved.

## Architecture established by the audit

The Express API is mounted directly at `/auth` and `/communities`; there is no `/api` prefix. CORS permits `FRONTEND_ORIGIN` (default `http://localhost:5173`) and the `Authorization` and `Content-Type` headers. Errors use `{ "error": string }`. Protected endpoints require an HS256 access JWT in `Authorization: Bearer <token>`.

Registration returns `{ user }` but no tokens. Login returns `{ token, refreshToken, user }`. `/auth/refresh` accepts `{ refreshToken }` and returns a new `{ token }`; `/auth/me` restores the current user. Users have numeric IDs and `firstName`/`lastName`, while the frontend currently expects string IDs and one `name` field. The adapter will convert IDs to strings and join names for presentation.

The backend is authoritative for membership and roles. Community roles are `COMMUNITY_ADMIN` and `COMMUNITY_MEMBER`; signer authority is a separate `AuthorizedSigner` relationship. Wallet signers register one compressed secp256k1 public key through `/signers/me/public-info`. The frontend's mock xpub/fingerprint/derivation-path model is incompatible and must be replaced, not fabricated.

Wallet creation is admin-only, Regtest-only, watch-only, descriptor-based P2WSH `sortedmulti(M,...)`, and immutable after creation. Spending requests reserve confirmed UTXOs, store a PSBT, accept only externally signed PSBTs from snapshot signers, cryptographically verify the signer and unchanged transaction policy, and become `READY` only after genuine signatures. Broadcasting is admin-only. Private keys stay in independent signer Bitcoin Core wallets.

## API compatibility matrix

All actual paths below are relative to the backend origin. `Bearer` means a valid access token is required.

| Frontend function | UI consumer | Frontend assumption | Actual backend contract | Auth / compatibility | Integration decision and required tests |
|---|---|---|---|---|---|
| `register` | Signup | `POST /api/auth/register`; `{name,email,password}` returns authenticated `User` | `POST /auth/register`; `{firstName,lastName,email,password}` -> `201 {user}`; duplicate `409`; no token | Public; adapter needed | Split trimmed full name into first name plus remaining last name, then login with submitted credentials to preserve sign-in UX. Test validation, duplicate email, registration followed by login, and name mapping. |
| `login` | Login | Mock accepts any password and returns `User` | `POST /auth/login`; `{email,password}` -> `{token,refreshToken,user}`; invalid credentials `401` | Public; adapter needed | Store tokens in session storage and normalized user in memory; remove demo-account shortcuts. Test success, bad password, missing fields, rate-limit response, and network failure. |
| `logout` | App shell, Settings | `POST /api/auth/logout` | No backend logout endpoint | Frontend-only compatible action | Clear tokens, user, selected community, and in-flight state. Document that JWTs remain valid until expiry. Test storage/state removal and redirect. |
| session restore (new client operation) | SessionProvider / protected layouts | None; reload logs out | `GET /auth/me`; `POST /auth/refresh` | Bearer / refresh token | On startup use access token with `/auth/me`; on one `401`, refresh once and retry; otherwise clear session. Test valid, expired, invalid, and absent tokens plus concurrent-401 handling. |
| `listMyCommunities` | CommunityProvider | `GET /api/communities` returns frontend `Community[]` | `GET /communities` -> `{communities:[{id,name,description,role}]}` | Bearer; adapter needed | Normalize IDs and derive setup state with signer/threshold/wallet reads after selection. Test isolation between users. |
| `getCommunity` | Context/setup | Rich mock community | `GET /communities/:id` -> `{community:{id,name,description,createdAt,role,joinCode?}}`; join code only for admin | Bearer membership; adapter needed | Map role and preserve join code only in an internal/detail type. Do not infer creator ID. Test member/admin projections and 403/404. |
| `createCommunity` | Setup step 1 | `{name,description,type}` and staged draft | `POST /communities`; `{name,description}` -> `{community:{...,role:"COMMUNITY_ADMIN"}}` | Bearer; adapter needed | Do not send or persist prototype-only `type`; require non-empty description (backend max 500). Immediately select returned community and derive setup state. |
| join community (new frontend function/screen action) | Start/community chooser | Not implemented | `POST /communities/join`; `{joinCode}` -> `201 {community}` | Bearer; missing UI | Add a join-code action without disrupting create flow. Test invalid, unknown, duplicate, and successful join. |
| `updateCommunity` | Settings | `PATCH /api/communities/:id` | No endpoint | Missing | Disable/hide save in live mode and retain read-only details; backlog a tested admin update endpoint rather than fake success. |
| `getMembership` | Context and role-aware UI | Dedicated `/me` aggregate | No dedicated endpoint; community detail returns role; members/signers identify current user | Bearer; derivable adapter | Build membership from authenticated user + community role + member list + signer list. Backend remains authoritative. Test admin, signer-only, ordinary member. |
| `getDashboard` | Dashboard | Aggregated dashboard endpoint | No aggregate endpoint | Derivable/partial | Compose community, wallet/balance, available request list, and transactions. Until request listing exists, show supported sections with explicit unavailable/empty states. |
| `listMembers` | Members, review | Array of mock members | `GET /communities/:id/members` -> `{members:[{id,firstName,lastName,email,role}]}` | Bearer membership; adapter | Normalize member view model; derive `isAdmin`. Backend does not return membership record ID or joined time, so types/UI must not fabricate them. |
| `addMember` | Members | `{name,email}` creates arbitrary person | `POST /communities/:id/members`; `{email}` adds an existing registered user -> `{member:{userId,communityId,role}}` | Admin; adapter/UI change | Remove name input or explain account prerequisite; submit email then refetch member list. Test unknown user, duplicate, non-admin, and success. |
| role/remove member (new frontend operations) | Members | Not exposed | `PATCH .../members/:userId/role` with backend role; `DELETE .../members/:userId` -> 204 | Admin; backend supported, UI missing | Add after core member listing/add flow; preserve last-admin and signer-removal safeguards. |
| `listSigners` | Members, Signers, review | Rich xpub signer array | `GET /communities/:id/signers` -> `{signers:[{signerId,userId,firstName,lastName,email,membershipRole,publicInfoRegistered,createdAt}]}` | Bearer membership; adapter | Map compressed-key registration status; do not expose invented xpub metadata. |
| `setAuthorisedSigners` | Members/setup | Atomic bulk `PUT` with member IDs | `POST /communities/:id/signers {userId}` and `DELETE .../signers/:userId` | Admin; adapter needed | Diff selected user IDs against current list and apply sequential adds/removes, stopping and refreshing on error. Block changes after wallet creation. Test partial failure and threshold safeguards. |
| `registerSignerKey` | Signers | Admin-addressable xpub/fingerprint/path | `PUT /communities/:id/signers/me/public-info {publicKey}` -> `{registered,publicKey}` | Current authorized signer only; incompatible UI | Replace form with compressed public key input and submit only for the signed-in signer. Test malformed/uncompressed/duplicate keys, non-signer, and immutability after wallet creation. |
| `simulateSignerRegistration` | Signers/setup | Fake another signer's registration | No endpoint by design | Must be removed/disabled | Remove from live flow and explain that each signer logs in and registers their own key. Never simulate completion. |
| `setThreshold` | ApprovalRule | Returns complete mock wallet | `PUT /communities/:id/signing-threshold {requiredSignatures}` -> `{requiredSignatures,authorizedSignerCount}` | Admin; adapter | Update draft wallet view from returned M/N. Test minimum two signers, M<=N, non-admin, and post-wallet immutability. |
| `createWallet` | Review | Creates active mock wallet | `POST /communities/:id/wallet` -> public wallet `{communityId,status,network,address,descriptor,requiredSignatures,signers,createdAt}` | Admin; adapter | Preserve backend creation and Regtest checks; map `READY` to active. Treat `409` existing wallet explicitly; never retry blindly after uncertain node failure. |
| `getWallet` | Context, Wallet, RequestForm | Always returns draft or active wallet with balances | `GET /communities/:id/wallet`; absent wallet is `404`; balance is separate `GET .../balance` | Bearer membership; adapter | On 404 synthesize a UI-only setup projection from signer/threshold endpoints; for ready wallet combine wallet and balance. Test missing, creating/error, ready, and node unavailable. |
| `listContributions` | Wallet | Labeled deposits | No contribution endpoint; wallet transactions/UTXOs expose chain data without labels | Partial/adapter | Derive unlabeled incoming history from real transaction data where safe; label feature stays disabled/backlogged. |
| `listSpendingRequests` | Requests, dashboard | Community list | No list endpoint | Essential missing API | Add a membership-scoped backend `GET /communities/:id/wallet/spends` with safe projections and tests in Milestone 4. Do not infer a list from mock data. |
| `getSpendingRequest` | Request detail/edit | Global route with rich detail | `GET /communities/:cid/wallet/spends/:spendId` -> `{id,status,recipient,amountSats,feeSats,signatures,requiredSignatures,txid}` | Bearer membership; adapter/path change | Require community context; map real statuses and signature counts. Use neutral labels such as `Payment #id`; do not fabricate title/purpose/creator/fee rate. |
| `createSpendingRequest` | RequestForm | title, purpose, recipient, amount, fee rate | `POST /communities/:cid/wallet/spends`; `{recipient,amountSats:string,feeRate:int}` -> created spend incl. actual fee | Admin only; adapter/UI change | Hide or explicitly mark title/purpose non-persistent; send exact integer strings; display returned actual fee. Test address, amount, fee, funds, permission, and node errors. |
| `updateSpendingRequest` | RequestForm edit | `PATCH` editable pending request | No endpoint | Missing/deferred | Remove edit navigation/control in live mode. Do not claim persistence. |
| `signTransaction` | RequestDetail modal | Button click simulates signature | `GET .../psbt`; external signer signs; `POST .../signatures {psbt}` | Wallet snapshot signer; security-incompatible | Replace with PSBT retrieval/copy/download guidance plus signed-PSBT submission. Continue supporting `regtest-signer.js`; never send keys/RPC credentials to browser/backend. |
| `declineSpendingRequest` | RequestDetail | Persistent decline and rejection math | No endpoint/status | Missing/deferred | Disable/remove action and explain unavailable; do not map decline to cancellation. |
| cancel request (new frontend operation) | RequestDetail | Not modeled | `POST .../cancel` -> `{id,status:"CANCELLED"}` | Admin; supported | Add for `SIGNING`/`READY`; test permission and terminal-state conflict. |
| `broadcastTransaction` | RequestDetail | Any signer may broadcast and gets rich detail | `POST .../broadcast` -> `{txid,status:"BROADCAST"}` | Admin only; adapter/UI correction | Show admin-only send control at `READY`, refetch detail/transaction afterward, and distinguish broadcast from confirmation. |
| `listTransactions` | Transactions/dashboard/wallet | Rich combined history | `GET /communities/:id/wallet/transactions` -> `{transactions:[{txid,category,amountSats,confirmations,blockhash,time}]}` | Bearer membership; adapter | Map Core categories to incoming/outgoing and timestamps; unsupported fee/label/request link remain null/omitted. Never show mock confirmations. |
| `getTransaction` | TransactionDetail | Rich history entry | `GET .../transactions/:txid` -> `{txid,confirmations,blockhash,amountSats}` | Bearer membership; adapter | Map real confirmation state; supplement only from already-fetched request/list data, not invented values. |
| `listAuditEvents` | Audit | Persistent audit endpoint | No endpoint/model | Missing/deferred | Keep screen but replace mock events with an honest unavailable state until a backend audit model exists. |
| `switchDemoRole`, demo flags, chain tip | App shell/prototype banner | Impersonation and simulated outages/blocks | No API; unsafe in live mode | Remove from integrated UI | Remove role switcher/demo controls from live routes. Test that changing frontend state cannot impersonate another user. |

## Screen-to-API and journey audit

| Screen / route | Purpose and actions | Real data/API dependencies | Current states and risks | Integration outcome |
|---|---|---|---|---|
| Landing `/` | Explain product and enter auth | None | Static and usable | Preserve. |
| Login `/login` | Authenticate | `/auth/login`, session restore | Has validation/loading/error, but demo buttons accept fake credentials | Connect real API; remove demo accounts; redirect authenticated users appropriately. |
| Signup `/signup` | Create account | `/auth/register`, then `/auth/login` | Full-name input differs from backend fields | Split name explicitly; surface backend validation/duplicate errors; auto-login only after successful real login. |
| Start `/start` | Create community | list/create/join communities | Only create exists; optional description conflicts with backend-required description; type is mock-only | Make description required/max 500; add join-code path; explain type is presentation-only or remove it. |
| Members `/setup/members`, `/app/members` | List/add members and select signers | members GET/POST; signers GET/POST/DELETE | Mock creates arbitrary person by name/email and bulk-saves signers | Require existing account email; map roles; diff signer changes; admin controls permission-aware; show empty/loading/error/success. |
| Approval rule | Configure/display M-of-N | threshold GET/PUT; signer list | UI already enforces M>=2 and M<=N but setup ordering currently places rule before key registration | Keep threshold before keys (backend permits it), but derive N from real signers and lock after wallet creation. |
| Signers | Each signer registers their own public key | signers GET; `/signers/me/public-info` GET/PUT | xpub form and admin simulation conflict with backend/security model | Replace with compressed-public-key flow; remove simulation and role impersonation; show per-signer completion only from backend. |
| Review/create wallet | Verify prerequisites and create | members, signers, threshold, wallet POST | Button currently relies on mock draft and can imply readiness from synthetic state | Refetch prerequisites; disable with exact missing requirements; only show success after backend returns `READY`. |
| App shell | Protect routes, select community, role-aware nav | session, communities, derived membership/wallet | Protected routing exists, but reload loses session; context treats wallet 404 as fatal; role switcher impersonates | Restore tokens/session, tolerate pre-wallet state, remove role switcher, add community selector without leakage. |
| Dashboard | Overview | composed wallet/balance/requests/transactions/members | Entirely aggregate mock API | Compose supported endpoints; honest partial/empty states until spend listing exists. |
| Wallet | Address, QR, balances, contributions | wallet GET, balance, transactions/UTXOs | Strong loading/error/empty UI; contributions labels are mock-only | Preserve address/QR/copy; use exact satoshi strings safely; show real chain data and no invented labels. |
| Requests list | Track spends | essential new spend-list endpoint | Entire list is mock-only | Add minimal tested backend list API in Milestone 4, then real status mapping. |
| New/edit request | Create/edit payment | spend POST; wallet/balance | Title/purpose/editing are unsupported; client accepts signet though backend is Regtest-only | Regtest-only validation; hide unsupported persistent fields/edit route; use backend actual fee response. |
| Request detail | Review, sign, decline, broadcast | spend GET, PSBT GET, signature POST, cancel, broadcast | Signing is simulated approval; decline unsupported; copy says any signer can broadcast | Replace with external PSBT workflow and verified progress; admin-only broadcast; no fake decline. |
| Transactions/detail | Real history and confirmations | transaction list/detail | Mock chain tip advances confirmations | Use Bitcoin Core-derived responses and explicit unconfirmed/confirmed labels. |
| Audit | Accountability log | none | Mock-only | Honest unavailable state; retain screen for later backend audit API. |
| Settings | Edit community/logout | no update endpoint; local logout | Save currently fakes persistence | Make community data read-only until API exists; logout remains functional. |

### User-journey ordering risks

1. `CommunityContext` currently calls `getWallet` immediately and treats absence as a load failure, although a new real community has no wallet. Milestone 2/3 must represent pre-wallet setup explicitly.
2. `setupStage` exists only in mock data. It must be derived from real signer count, threshold, registered keys, and wallet existence; navigation must never advance on local state alone.
3. The current setup permits administrator impersonation and simulated key registration. Both must disappear before live signer setup.
4. The sign button currently equates acknowledgement with a Bitcoin signature. It must be disabled/replaced before any real spending request is exposed.
5. Frontend copy says any signer can broadcast, while the backend correctly restricts broadcast to admins. UI must follow backend authorization.
6. The frontend supports `tb1`/signet addresses, while the backend and verified architecture are Regtest-only. Integrated validation must accept `bcrt1` only.
7. JavaScript `number` is unsafe for arbitrary satoshi values returned as strings. Adapters will keep monetary values as validated decimal strings or convert only after safe-range checks; formatting helpers must not silently lose precision.

## Security and implementation decisions

- Preserve the backend wallet, PSBT verification, signer snapshot, threshold, authorization, and Regtest-only architecture.
- Store access and refresh tokens in `sessionStorage` for the MVP, mirrored in memory while the app runs. This supports reload within one browser tab and limits persistence after the tab closes. It remains vulnerable to XSS and has no server-side revocation; production should use hardened same-site secure HttpOnly refresh cookies plus rotation/revocation.
- Never put tokens in URLs, logs, error text, or analytics. Normalize all non-2xx responses centrally and discard unexpected response bodies.
- Retry at most once after a 401 refresh and coordinate concurrent refresh attempts. Abort obsolete GET requests when session/community changes.
- Frontend role checks improve usability only. All protected mutations rely on backend authorization and surface 401/403 responses.
- Registration does not invent token issuance: the client performs a separate real login after successful registration.
- Signers submit externally signed PSBTs. Private keys, seed phrases, Bitcoin RPC cookies, and RPC credentials never enter the browser or central backend.
- Unsupported mock features are disabled or presented as unavailable; they never report success.

## Milestone sequence

1. **Milestone 1 — API client and authentication: COMPLETE.** Centralized fetch client, development proxy/configurable base URL, authorization headers, error normalization, one-shot refresh, session restoration, logout, user adapters, protected routing, auth tests, and fail-closed removal of live impersonation controls are implemented.
2. **Milestone 2 — communities and authorization: COMPLETE.** Real community list/create/join/detail, membership/member/role operations, signer selection/removal, role-aware UI, setup-state derivation, and per-user selected-community persistence.
3. **Milestone 3 — signer setup and wallet: COMPLETE.** Compressed public-key UX, current-signer endpoint, threshold configuration, wallet creation/get, receiving address, real balance, prerequisite and immutable-policy handling.
4. **Milestone 4 — spending requests: COMPLETE.** Added the essential backend spend-list API with tests; integrated real create/detail/list/cancel, actual amounts/fees, admin permissions, Regtest-only validation, and removed unsupported edit/decline/mock-sign controls.
5. **Milestone 5 — real signature coordination: COMPLETE.** Signer-only PSBT access and externally signed PSBT submission with independent-wallet guidance; no browser custody or simulated approvals.
6. **Milestone 6 — broadcast and monitoring: COMPLETE.** Admin broadcast, transaction ID, real confirmations/history/balance refresh, and node-error propagation.
7. **Milestone 7 — UX review: COMPLETE.** Admin/signer/member authority text and controls were reconciled with backend rules; the dashboard now composes live APIs; the audit screen honestly reports the absent API; remaining public mock claims were removed.
8. **Milestone 8 — automated/manual testing: COMPLETE WITH ENVIRONMENT SKIPS.** Frontend tests/typecheck/build and backend regression/rate-limit suites pass. Disposable PostgreSQL/Regtest E2E and authenticated live-browser workflows remain skipped, not passed.
9. **Milestone 9 — documentation/deferred features: COMPLETE.** Final security, API, unsupported-feature, evidence, and priority review is recorded in the plan, report, and backlog.

## Milestone checkpoint history

Files added: `INTEGRATION_PLAN.md`, `INTEGRATION_TEST_REPORT.md`, and `INTEGRATION_BACKLOG.md`. Application source files were not modified. The audit used actual routes, controllers, services, schema, tests, frontend consumers, and build output rather than README assumptions.

### Milestone 1 — completed

Implemented:

- `frontend/src/api/http.ts`: configurable `VITE_API_BASE_URL`, JSON client, Bearer header, tab-scoped token storage, normalized errors, request cancellation propagation, coordinated one-shot access-token refresh, and session-expiry notification.
- Real `/auth/register`, `/auth/login`, `/auth/me`, and `/auth/refresh` adapters. Registration splits the UI full name into backend `firstName` and `lastName`, then performs a separate real login because registration correctly returns no tokens.
- `SessionContext` startup restoration, retryable restoration failures, local logout, and centralized expiry handling.
- `ProtectedRoute` initialization/loading/error/redirect behavior around all setup and application routes.
- Removal of demo login buttons, role-switch controls, simulated failure controls, and misleading mock-network banner text from live routes.
- Vite development proxy for `/auth`, `/communities`, and `/health`; production can set `VITE_API_BASE_URL`.
- Vitest/jsdom/Testing Library infrastructure and 11 focused auth/client/protected-route tests.
- React Router upgraded to 7.18.4 and Vitest to 4.1.12 to eliminate audited vulnerabilities. Final `npm audit --omit=dev` reports zero vulnerabilities.

Files modified or added in Milestone 1:

- `frontend/package.json`, `frontend/package-lock.json`, `frontend/vite.config.ts`
- `frontend/src/App.tsx`
- `frontend/src/api/errors.ts`, `frontend/src/api/index.ts`, `frontend/src/api/http.ts`, `frontend/src/api/http.test.ts`
- `frontend/src/context/SessionContext.tsx`
- `frontend/src/pages/Auth.tsx`
- `frontend/src/components/AppLayout.tsx`, `PrototypeBanner.tsx`, `ProtectedRoute.tsx`, `ProtectedRoute.test.tsx`, `RoleSwitcher.tsx`, `SetupLayout.tsx`

Intentional limitation at this checkpoint: post-authentication community operations still use the mock layer and are not claimed as integrated. Milestone 2 must replace that bridge before a real newly registered user can create or manage a real community.

### Milestone 2 — completed

Implemented:

- Real `/communities` create/list/detail/join adapters with numeric-to-string ID mapping and backend validation alignment (required description, maximum 500 characters).
- Real members, role changes, member removal, signer list, signer selection, and signer removal. Bulk signer selection is an adapter that diffs the current server set and calls the actual POST/DELETE endpoints; it never treats frontend state as authority.
- Membership derivation from the authenticated user, real member list, real signer list, and backend community role.
- Pre-wallet setup-state derivation from signer status, signing threshold, and wallet existence. Wallet 404 now produces an explicit draft projection rather than a fatal page error.
- Join-code UI, existing-account email member addition, role/removal controls, administrator join-code display, and a selector for users in more than one community.
- Selected community ID persisted per authenticated user in tab-scoped storage. Community data itself is refetched and is never reused across users.
- Community settings are read-only because the backend exposes no update endpoint; no mock save remains in that screen.
- Six focused frontend API contract tests added. The full frontend suite now has 17 passing tests.

Files modified or added in Milestone 2:

- `frontend/src/api/index.ts`, `frontend/src/api/community.test.ts`
- `frontend/src/context/CommunityContext.tsx`, `frontend/src/types.ts`
- `frontend/src/pages/Setup.tsx`, `frontend/src/pages/Members.tsx`, `frontend/src/pages/Settings.tsx`
- `frontend/src/components/AppLayout.tsx`
- `INTEGRATION_PLAN.md`, `INTEGRATION_TEST_REPORT.md`, `INTEGRATION_BACKLOG.md`

Decision: the client may derive navigation state for presentation, but every mutation and all authorization remain server-enforced. Missing creator/joined timestamps are represented as unavailable instead of fabricated. The prototype community type remains presentation-only and is not sent to the backend.

Clean checkpoint and next milestone: Milestone 3 will replace mock xpub/simulated registration with the authenticated signer's compressed public key, integrate threshold and real wallet/balance responses, and verify wallet immutability and Regtest prerequisites. It requires no schema or destructive operation.

### Milestone 3 — completed

Implemented:

- Replaced the prototype xpub/fingerprint/path submission with the backend's exact `{publicKey}` contract at `/communities/:id/signers/me/public-info`.
- Only the authenticated signer can read or register their exact compressed key. Other members see readiness only; administrators cannot register keys for other people and the simulation control is removed.
- Client-side early validation accepts only 66-character compressed secp256k1 public keys beginning `02` or `03`, clears apparent private/recovery material, and still relies on backend validation and authorization as authoritative.
- Real signing-threshold PUT mapping and draft-wallet refresh.
- Real wallet POST/GET and balance GET mapping. The client supplies no keys or policy in wallet creation; the backend derives and verifies the immutable Regtest `wsh(sortedmulti(...))` descriptor.
- Ready-wallet balance values are parsed from decimal satoshi strings only when they are safe integers; out-of-range values fail explicitly rather than rounding.
- Wallet existence/setup routing no longer depends on the Bitcoin node balance call. A node/balance failure can be shown by the wallet screen without reopening setup.
- Mock contribution data is no longer used for a real wallet; the section remains honestly empty until real incoming transaction mapping in Milestone 6.
- Payment creation visibility now follows the backend's admin-only rule; signing remains separately restricted to wallet signers.

Files modified or added in Milestone 3:

- `frontend/src/api/index.ts`, `frontend/src/api/wallet.test.ts`
- `frontend/src/types.ts`
- `frontend/src/pages/Signers.tsx`, `frontend/src/pages/Setup.tsx`, `frontend/src/pages/Wallet.tsx`
- `INTEGRATION_PLAN.md`, `INTEGRATION_TEST_REPORT.md`, `INTEGRATION_BACKLOG.md`

Decision: no private key, recovery phrase, RPC cookie, RPC credential, or signing operation belongs in the browser or coordinator API. Wallet creation stays entirely backend-controlled and is not retried blindly after an uncertain node failure.

Clean checkpoint and next milestone: Milestone 4 will add the missing spend-list backend API with authorization tests, then integrate create/detail/list/cancel using exact backend amounts and fees. The isolated database/Regtest suites remain prerequisites for the final E2E milestone, not for source-level Milestone 4 work.

### Milestone 4 — completed

- Added `GET /communities/:communityId/wallet/spends`, membership-scoped and newest-first, with creator, exact satoshi strings, status, and signature records. Ordinary list responses never include PSBT data.
- Added OpenAPI documentation and a backend service test for membership isolation, exact projection, and PSBT omission.
- Extended real spend detail with creator/timestamps and wallet snapshot counts; no secret material is exposed.
- Replaced mock request list/create/detail/cancel adapters and screens. Only administrators create/cancel; wallet signers remain cryptographic approvers.
- Removed request editing and decline claims because no backend contracts exist. Removed click-only mock signing from live request detail pending Milestone 5.
- The create screen now submits only recipient, exact satoshi text, and integer fee rate; it is Regtest-only and displays the backend's actual fee after creation.
- Added an honest cancelled status and retained explicit unsafe-integer rejection.

Files changed: backend wallet service/controller/routes/OpenAPI and wallet-service test; frontend API/types/status/Bitcoin validation/request list/form/detail/App routes; `frontend/src/api/spending.test.ts`; all three integration documents.

Failure fixed during verification: the first backend run failed its route-documentation invariant for the new GET path. The OpenAPI entry was added and the complete rerun passed.

Next milestone: implement PSBT retrieval and externally signed PSBT submission for the authenticated wallet signer, with no private-key or browser signing path.

### Milestone 5 — completed

- Added signer-only PSBT retrieval and signed-PSBT submission adapters using the existing backend endpoints.
- Added a live request-detail workflow to copy the coordinator PSBT, sign it in an independent Regtest wallet, and paste only the resulting signed PSBT.
- The UI explicitly requires transaction review and warns that private keys, recovery phrases, RPC cookies, and RPC credentials must never enter CommunitySafe.
- Duplicate/invalid/unauthorized submissions remain server errors; successful progress is refetched from the backend. Each signer counts at most once.
- No in-browser key generation, custody, RPC access, fake acknowledgement, or simulated signature remains in the live flow.

Files changed: `frontend/src/api/index.ts`, `frontend/src/pages/RequestDetail.tsx`, `frontend/src/api/signing.test.ts`, and the three integration documents.

Next milestone: admin-only broadcast and real transaction/balance monitoring.

### Milestone 6 — completed

- Replaced mock broadcast with the admin-only backend endpoint and refetch after success/error.
- Added real wallet transaction-list and transaction-detail adapters with Bitcoin Core timestamps, directions, exact satoshi validation, and reported confirmations.
- Transaction screens now describe actual Regtest mining/refresh behavior, not simulated blocks.
- Added five focused tests for broadcast success/failure, activity mapping, confirmation refresh, and unsafe amounts.

Files changed: frontend API, request detail, transactions screen, `frontend/src/api/monitoring.test.ts`, and integration documents. Next: Milestone 7 role/UX and remaining mock-surface cleanup.

### HTTP 429 remediation and Milestones 7–9 — completed

Root cause: one 30-request/15-minute IP bucket was mounted across both `/auth` and `/communities`. Normal community restoration performs a list plus five context reads; dashboard/detail screens add more. React development StrictMode could start duplicate `/auth/me` restoration, and two tabs repeated the traffic. Routine reads therefore depleted the same bucket as login and recovery.

Corrective design:

- Retain the 30/15-minute public credential/recovery limiter, the 10/15-minute login limiter, and the five-failure email/IP lockout.
- Use separate 120/15-minute limiters: `/auth/me` is keyed by authenticated `userId`, while unauthenticated token refresh retains its own IP bucket.
- Use a 300/15-minute community limiter after authentication, keyed by `userId`, so unrelated users behind one proxy do not share a bucket.
- Preserve standard rate-limit headers and `Retry-After`; the client displays the delay and deliberately does not automatically retry 429.
- Coalesce simultaneous `/auth/me` restoration within a tab. Tabs retain independent `sessionStorage`; the backend safely aggregates the same identity under the larger authenticated bucket.

Milestone 7 replaced the mock dashboard aggregate with real community, wallet/balance, member, spending-request, and transaction endpoints. The audit page now states that no audit API exists. Authority text now matches the backend: administrators create/cancel/broadcast; wallet signers independently sign; ordinary members observe.

Milestone 8 ran all safely available automation. The database and Bitcoin Core suites remained gated to protect existing data, wallets, UTXOs, PSBTs, and transactions. Local services started, but the available in-app browser could not reach sandboxed localhost (`ERR_CONNECTION_TIMED_OUT`), so browser verification is blocked rather than passed.

Milestone 9 found no live frontend use of mock signing, fabricated balances, mock dashboard data, simulated confirmations, role impersonation, or fake audit events. Remaining unsupported capabilities are recorded in `INTEGRATION_BACKLOG.md`.

### Signer setup guidance and logout UX — completed

The signer registration screen now derives the authenticated user ID and active community ID from `SessionContext` and `CommunityContext`. It generates the utility’s exact setup invocation:

`npm run regtest:signer -- setup --community-id <communityId> --user-id <userId>`

The guided modal instructs the signer to run from `backend/`, use a local Regtest node on RPC port 18444, prefer `BITCOIN_RPC_COOKIE_FILE`, set the short-lived `COMMUNITYSAFE_TOKEN` only in the local terminal, and copy only the compressed public key printed by the utility. The generated command contains no JWT, key material, seed words, RPC password, or cookie contents. Existing client and backend key validation/authorization remain authoritative, and signer state is reloaded after successful registration.

Logout is now visibly labelled in both the active application header and the setup shell at small and large breakpoints. It reuses the existing session logout function, clears access/refresh tokens, clears selected-community storage and all in-memory community/wallet/membership state, invalidates in-flight community loads, and redirects with history replacement to `/login`. Protected routes remain guarded after browser Back, and stale responses from a prior user are ignored.

There is still no backend logout/revocation endpoint. Logout is therefore local: previously issued JWTs remain valid until expiration. Production hardening continues to require refresh-token rotation, revocation, and secure HttpOnly cookie delivery.

### Opt-in browser signer (Regtest experiment) — implemented and verified

The browser signer is an explicitly experimental alternative to the manual "sign in an independent Bitcoin Core wallet, then paste the signed PSBT" flow. It is off unless `VITE_ENABLE_BROWSER_SIGNER` is exactly `true`; the check lives in `frontend/src/lib/browserSignerFlag.ts` and gates both new UI surfaces, so the manual flow is byte-for-byte unchanged when the flag is unset, `false`, `1`, or `yes`.

Architecture:

- `frontend/src/lib/browser-signer/` separates concerns: `keygen` (BIP39/BIP32 `@scure` derivation at `m/48'/1'/0'/2'/0/0`, compressed public key only), `policy` (parses the backend `wsh(sortedmulti(...))` descriptor, derives the Regtest address and witness script), `psbt` (inspects and signs with `@scure/btc-signer`, enforcing SIGHASH_ALL and rejecting finalised inputs), `vault` (encrypted IndexedDB storage), and `errors`.
- The vault is keyed by community and user. It stores `PBKDF2-SHA256` (600,000 iterations, random 16-byte salt), `AES-256-GCM` ciphertext with a random 12-byte IV, and binds community/user IDs, public key, derivation path, KDF parameters, and creation time as additional authenticated data. Unlocking re-derives the key and refuses a record whose public key or path no longer match.
- No secret reaches storage in plaintext or leaves the browser. Recovery words and passphrase are never sent to the backend; the decrypted private key is zeroed in a `finally` block after a single signature.
- `BrowserSignerCard` on `Signers.tsx` creates words (draft wallets only), restores words, displays the public key/derivation path, and reuses `PUT /communities/:communityId/signers/me/public-info` to register only the public key. `BrowserSignRequestPanel` on `RequestDetail.tsx` fetches `GET /communities/:communityId/wallet` for the descriptor/address and the existing coordinator PSBT endpoint, reviews inputs, total, recipient, amount, fee, and change, and checks that the local key belongs to the policy before prompting for the passphrase.
- Backend contracts were extended only by returning the existing wallet `descriptor` in the wallet projection; no authorization, threshold, or verification rule was relaxed. `backend/test/browser-signer-compat.test.js` proves the backend's `bitcoinjs-lib` verification accepts a browser-signed fixture and rejects tampered, mismatched, and injected signatures.

Verification and limits:

- Frontend: typecheck, 19 test files/104 tests, and the production build pass.
- Backend: 22 tests pass with 0 failures and 2 explicit environment-gated skips.
- Not claimed: a live browser → Regtest journey (key registration, 2-of-3 signing, broadcast, mining, confirmation refresh). It still needs disposable resources and remains documented in `INTEGRATION_BACKLOG.md` along with bundle-size and real-browser storage follow-ups.

### Public brand navigation and environment-aware rate limits — completed

- Every CommunitySafe wordmark now uses React Router to open the public `/` route, including expanded/collapsed desktop navigation, the mobile header/drawer, authentication, and onboarding layouts. Dashboard remains a distinct workspace navigation item.
- The landing page is session-aware: active members see **Open Dashboard**, users without a community see **Create community**, and incomplete communities see **Continue setup** at the required stage. Landing navigation does not clear credentials, the selected community, or onboarding state.
- Rate limiting remains enabled everywhere. Production retains conservative defaults; development gets larger routine authenticated buckets while keeping failed-login lockout and a bounded financial-operation bucket. Automated tests force `NODE_ENV=test` and focused limiter tests use small isolated instances.
- Proxy trust is opt-in via an exact `TRUST_PROXY` hop count. `Retry-After` and standard rate-limit headers are exposed through CORS, and the frontend continues to surface 429s without automatic retry.

### Incomplete-onboarding community switching — completed

- Extracted the application’s community selector into one responsive, keyboard-accessible `CommunitySwitcher` shared by `AppLayout` and `SetupLayout`.
- Community list responses now include the server-derived next setup stage without exposing wallet descriptors, public keys, or other community-private state. Options distinguish ready communities from each precise remaining setup step.
- A successful selection atomically loads the authorized community context before navigating: active communities go to `/app`; incomplete communities go to `/setup/{nextStage}`. Failed selections retain the previous community and route, display the error, and never overwrite stored selection.
- Stored selections that are no longer accessible fall back to the first currently authorized membership. The setup error state keeps the selector and public brand link available, preventing users from becoming trapped.

### Audit, notifications, and spending discussions — implemented; migration pending approval

Architecture is centered on one `recordEvent` service. Existing authorized domain mutations call it with the same Prisma transaction as their business-state change, producing an immutable `AuditEvent` and optional per-user `Notification` rows. Retryable external effects use unique dedupe keys. Bitcoin confirmation observations are reconciled from Core with deterministic keys, and broadcast retry checks Core before attempting another send.

- Audit: membership-scoped cursor pagination, event-type filtering, actor/entity references, JSON metadata, and no update/delete API.
- Notifications: membership and ownership-scoped list/count/read/read-all endpoints. The application and setup headers use a 60-second, visibility-aware unread-count poll; 429 responses are not retried automatically.
- Discussions: membership-scoped, chronological cursor pagination; 1–2,000-character plain-text validation; retained after request completion; posting records an audit event and notifies other current community members without creating an approval or signature.
- UI: the Audit placeholder is replaced by the real API, the teal authenticated headers contain an accessible responsive notification bell, and spending details contain a shared-panel discussion surface. Community changes clear activity UI state before loading the new community.

Deployment is intentionally stopped before schema mutation. After approval, back up the production database, review `backend/prisma/migrations/20261026000000_audit_notifications_discussions/migration.sql`, run `npx prisma migrate deploy` from `backend/` with the intended `DATABASE_URL`, run `npx prisma generate`, deploy the backend, then deploy the frontend. Do not use `migrate reset` or `db push` on an existing wallet database.

