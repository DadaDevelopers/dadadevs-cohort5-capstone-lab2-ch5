# CommunitySafe Integration Test Report

Last updated: 2026-10-22 (Africa/Nairobi)

## Milestone 0 baseline

This report distinguishes tests actually executed from tests proposed for later milestones. Milestone 0 changed documentation only; no application behavior was modified.

### Environment inspected

- Checkout: `C:\Users\Public\Lilian\personal_Projects\dadadevs-cohort5-capstone-lab2-ch5`
- Branch: `feature/frontend-backend-integration`
- Backend: Node.js/Express, Prisma 7/PostgreSQL, Bitcoin Core Regtest integration
- Frontend: React 18, TypeScript, Vite 8
- Both `frontend/` and `backend/` were present.
- No database reset, migration, Bitcoin wallet mutation, RPC operation, Git merge, commit, or push was performed.

### Actual commands and results

| Command | Result | Evidence / notes |
|---|---|---|
| `git branch --show-current` | PASS | Returned `feature/frontend-backend-integration`. |
| Presence checks for `frontend/` and `backend/` | PASS | Both directories exist. |
| `git status --short` | BLOCKED (tooling) | Git returned `fatal: this operation must be run in a work tree`. This conflicts with `git rev-parse --is-inside-work-tree` returning `true`, `--is-bare-repository` returning `false`, and local `core.bare=false`. No repair was attempted. |
| `git ls-files --others --exclude-standard` | PASS | Identified pre-existing untracked documentation: `backend/MVP_WALLET_DEMO.md`, `backend/README.md`, `backend/WALLET_MANAGEMENT.md`. These were preserved. |
| `cd backend; npm test` | PASS | 20 tests discovered: 18 passed, 0 failed, 2 skipped, duration about 3.6 seconds. |
| `cd frontend; npm run build` (sandboxed first attempt) | ENVIRONMENT BLOCK | TypeScript could not write `frontend/tsconfig.tsbuildinfo` because the checkout is outside the default writable sandbox. This was not a code failure. |
| `cd frontend; npm run build` (approved checkout write) | PASS | TypeScript and Vite completed; 52 modules transformed. Output included `dist/index.html`, CSS, and JS bundle. |
| `node backend/scripts/regtest-signer.js --help` | PASS | Utility displayed setup/sign commands, local Regtest requirements, and the statement that private keys remain in independent Bitcoin Core signer wallets. No signing operation ran. |

### Backend test breakdown actually observed

Passed:

- Authentication, authorization, password reset, rate limits, and API documentation.
- Invalid request handling at the HTTP boundary.
- Community create/join/list/detail and safe projections.
- Community-scoped member management and last-admin/signer safeguards.
- Authorized signer separation from membership roles.
- Regtest signer association, argument/local-endpoint validation, transaction review, and UTXO verification unit tests.
- Wallet creation authorization and immutable M-of-N policy validation.
- Membership-scoped wallet monitoring.
- Exact satoshi conversion and signer policy.
- Bitcoin RPC cookie authentication, wallet scoping, wrong-network, connection, auth, and timeout handling.
- Cryptographic external PSBT signature verification, Core metadata compatibility, exact P2WSH policy enforcement, and finalized threshold-signature identity preservation.

Skipped by explicit environment gates:

- PostgreSQL migration/concurrency integration suite: requires `RUN_DB_TESTS=1` and an isolated schema in `DATABASE_URL`.
- HTTP Bitcoin Regtest workflow suite: requires `RUN_REGTEST_TESTS=1`, a dedicated migrated test database, and a Bitcoin Core Regtest node.

These skips are not passes and must be executed against isolated resources in Milestone 8. Existing development data and verified wallet assets must not be reused or modified.

## Audit findings affecting later verification

- At the Milestone 0 baseline the frontend had no test runner or test files. Milestone 1 subsequently added Vitest, jsdom, Testing Library, and focused API/session/router tests.
- The frontend currently uses only the in-memory mock server. The successful build proves compilation, not backend connectivity or browser behavior.
- No browser-based, database-backed, or Bitcoin Core operation was performed during Milestone 0.
- The backend has no spending-request list endpoint, so the real requests/dashboard journey cannot be verified until that API is added with backend tests.
- The current frontend signing control is simulated and therefore is not valid evidence of a Bitcoin signature. It must not be used in any E2E claim.

## Original planned verification by milestone

Milestone 1 items in this section have now been executed; the authoritative actual results appear in the Milestone 1 section below. Later milestone items remain planned only.

### Milestone 1

- Completed: API base URL/proxy, headers, JSON/no-content handling, normalized errors, abort propagation, network errors, register/login, duplicate/invalid credentials, access-token restoration, one-shot refresh, rejected refresh, logout, and protected routes.
- Actual commands and counts are recorded below.

### Milestone 2

- Community create/list/join/detail, member add, signer selection/removal, role mapping, unauthorized admin actions, non-member access, community switch isolation, and state refresh after mutations.

### Milestone 3

- Current-signer public-key registration, invalid/uncompressed/duplicate key rejection, M-of-N constraints, incomplete wallet setup failure, real wallet creation, address and balance mapping, and immutable policy enforcement.

### Milestone 4

- Spending-list endpoint authorization and projections; request create/detail/list/cancel; Regtest address, exact amount, fee rate, insufficient funds, fee display, reserved input, reload persistence, and unsupported edit-field behavior.

### Milestone 5

- Genuine signed PSBT submission using distinct independent signer wallets; invalid/unauthorized/duplicate signature rejection; threshold transition; browser receives no private key/RPC credential.

### Milestone 6

- Below-threshold and unauthorized broadcast rejection; successful transaction ID; node failure; idempotent repeat; unconfirmed versus confirmed display; balance refresh.

### Milestones 7–9

- Role-based manual journey review, responsive/error/empty/session-expiry states, complete frontend suite, full backend suite, isolated Regtest E2E, and documented startup/recovery limitations.

## Milestone 1 — authentication and session management

### Actual implementation verification

| Command / check | Result | Evidence |
|---|---|---|
| `npm test` in `frontend/` | PASS | Vitest 4.1.12: 2 files, 11 tests passed. Covered login payload/user mapping/token storage, register-then-login/name mapping, duplicate/invalid credentials, authenticated headers, session restoration, one-shot refresh and retry, rejected refresh/session expiry, network failure, logout, protected-route loading/redirect/authenticated child/retry states. |
| `npm run typecheck` in `frontend/` | PASS | TypeScript project validation completed with no errors. |
| `npm run build` in `frontend/` | PASS | Vite 8 production build completed; 58 modules transformed. |
| `npm audit --omit=dev` in `frontend/` | PASS | Zero vulnerabilities after upgrading React Router to 7.18.4 and Vitest to 4.1.12. |
| `npm test` in `backend/` | PASS | 20 discovered: 18 passed, 0 failed, 2 environment-gated suites skipped. |
| `git status --short` with approved checkout write access | PASS | Git anomaly confirmed as sandbox/index-refresh behavior; intended frontend changes and preserved untracked documents were listed. |

### Failures encountered and fixed

- The first test dependency install was interrupted and left `jsdom` incomplete; Vitest initially failed before collecting tests because `jsdom/lib/api.js` was absent. Only the verified incomplete `frontend/node_modules/jsdom` directory was removed and reinstalled. No source or application dependency was deleted.
- Type checking initially found the now-obsolete `RoleSwitcher` still referenced the removed `switchRole` session API. Live imports had already been removed; the component now fails closed by rendering nothing.
- The initial dependency audit reported one critical Vitest advisory and React Router moderate advisories. Vitest was updated within major version to 4.1.12 and React Router was upgraded to 7.18.4. Tests, type checking, and build passed afterward; the final production audit is clean.
- A combined command returned nonzero solely because the pre-upgrade audit found the React Router advisories; its preceding tests, type check, and build had passed. The post-upgrade sequence passed completely.

### What was not claimed

- No browser was connected to the live development database for registration/login because doing so would create records in non-isolated data. Contract behavior is covered by frontend mocked-HTTP tests plus the passing backend auth suite.
- No environment-gated PostgreSQL or Regtest suite was run; both remain skipped pending isolated resources.
- Community and wallet screens remain mock-backed until Milestones 2–3; Milestone 1 completion applies to authentication/session/protected routing only.

## Milestone 2 — communities and authorization

| Command / check | Result | Evidence |
|---|---|---|
| `npm run typecheck` in `frontend/` | PASS | TypeScript project validation completed with no errors after the real community/member/signer adapters and UI changes. |
| `npm test -- --run` in `frontend/` | PASS | Vitest 4.1.12: 3 files, 17 tests passed. Six new tests cover community mapping/create payload, join-code normalization, existing-account member addition/refetch, signer diff POST/DELETE behavior, pre-wallet setup derivation, and preserved 403 errors. |
| `npm run build` in `frontend/` | PASS | Vite 8 production build completed; 58 modules transformed; generated JS 379.08 kB (113.77 kB gzip). |
| `npm test` in `backend/` | PASS | 20 discovered: 18 passed, 0 failed, 2 explicit environment-gated suites skipped. Community/member/signer authorization regressions remain green. |

Environment-only first attempts: the initial sandboxed typecheck and test runner could not write TypeScript/Vite cache files because the checkout is outside the default writable roots. Rerunning with approved checkout write access passed; these were not source failures.

Not claimed: no mutation was sent to a development database, no Bitcoin Core operation ran, and the two isolated PostgreSQL/Regtest suites remain gated. Frontend contract tests use HTTP-shaped responses while backend authorization behavior is covered by the existing passing backend suite.

## Current result

Milestones 0–2: **PASS**. Authentication and community/member/signer-selection flows now use real backend contracts, pre-wallet reload is supported, and selected community state is tab-scoped per user.

## Milestone 3 — signer setup and wallet

| Command / check | Result | Evidence |
|---|---|---|
| `npm run typecheck` in `frontend/` | PASS | TypeScript validation completed after the signer-key, wallet, and balance adapters were replaced. |
| `npm test -- --run` in `frontend/` | PASS | 4 files, 23 tests passed. Six new tests cover current-signer public-key submission/read, threshold mapping, wallet+balance composition, unsafe satoshi rejection, and wallet creation without client policy/key material. |
| `npm run build` in `frontend/` | PASS | Vite production build completed; 58 modules transformed; generated JS 372.55 kB (111.83 kB gzip). |
| `npm test` in `backend/` | PASS | 20 discovered: 18 passed, 0 failed, 2 environment-gated suites skipped. Existing tests verify invalid/duplicate signer keys, admin-only wallet creation, incomplete prerequisites, immutable policy, Regtest RPC scoping, exact satoshi conversion, and cryptographic PSBT safeguards. |

No wallet was created and no public key or database record was changed during this milestone. Frontend tests use HTTP-shaped fixtures; backend unit/HTTP tests cover server enforcement. The dedicated live PostgreSQL/Bitcoin Core workflow is still explicitly skipped until isolated resources are supplied in Milestone 8.

## Current result

Milestones 0–3: **PASS**. Signer readiness, current-signer public-key registration, threshold setup, wallet creation/read, receiving address, and balance now use real backend contracts without weakening key custody or wallet policy.

## Milestone 4 — spending requests

| Check | Result | Evidence |
|---|---|---|
| Frontend typecheck | PASS | No TypeScript errors. |
| Frontend tests | PASS | 5 files, 29 tests. Six new tests cover list/status/signatures, cancelled mapping, exact create payload, detail composition, cancel route, and unsafe satoshi rejection. |
| Frontend production build | PASS | 58 modules; JS 344.71 kB (104.50 kB gzip). |
| Backend tests, first run | FIXED | New service test passed, but the API documentation invariant correctly failed because GET spends was not yet documented. |
| Backend tests, final run | PASS | 21 discovered: 19 passed, 0 failed, 2 gated skips. New list test verifies membership scope and PSBT omission. |

No database, wallet, UTXO, PSBT, or Bitcoin node was mutated. Exact live create/cancel behavior remains for the isolated Regtest E2E suite.

## Current result

Milestones 0–4: **PASS**. Real safe spend listing, creation, detail, actual fees, and cancellation are integrated; simulated approvals and unsupported editing/declining are absent from the live request UI.

## Milestone 5 — genuine signature coordination

| Check | Result | Evidence |
|---|---|---|
| Frontend typecheck | PASS | No TypeScript errors. |
| Frontend tests | PASS | 6 files, 33 tests. Four new tests cover signer-scoped PSBT retrieval, invalid response handling, exact signed-PSBT submission, and backend duplicate/invalid rejection preservation. |
| Frontend build | PASS | 58 modules; JS 346.75 kB (104.93 kB gzip). |
| Backend tests | PASS | 21 discovered: 19 passed, 0 failed, 2 gated skips. Cryptographic signer/policy/metadata/finalization tests passed. |

No PSBT was signed and no key, wallet, node, or database was mutated. Genuine multi-signer live execution remains reserved for the isolated Regtest E2E environment.

## Current result

Milestones 0–5: **PASS**. The frontend now coordinates genuine externally signed PSBTs without browser key custody, and the backend remains responsible for cryptographic verification.

## Milestone 6 — broadcast and monitoring

- Frontend typecheck: PASS.
- Frontend tests: PASS, 7 files / 38 tests; five new broadcast/monitoring tests.
- Frontend build: PASS, 58 modules, JS 348.32 kB (105.26 kB gzip).
- Backend tests: PASS, 21 discovered / 19 passed / 2 gated skips.
- No live broadcast, mining, or wallet mutation was performed.

## Current result

Milestones 0–6: **PASS**. Admin broadcast and Bitcoin Core-backed transaction/confirmation monitoring are integrated. Next: Milestone 7 role and UX review.

## HTTP 429 regression and Milestones 7–9

### Root cause and correction

- Before the fix, `/auth` and `/communities` shared one 30-request/15-minute IP bucket. Routine authenticated reads competed with login/recovery and with other tabs/users on the same address.
- A community restore issues the list plus community, members, signers, threshold, and wallet reads. Dashboard/detail composition adds more. Two tabs and development StrictMode made exhaustion possible without abusive login behavior.
- Public credential operations retain the conservative limiter; login retains its 10-request limiter and five-failure lockout. `/auth/me` uses a 120-request per-user bucket, refresh uses a separate 120-request IP bucket, and community routes use a 300-request per-user bucket after JWT authentication.
- `Retry-After` is present on enforcement responses. The frontend exposes `RATE_LIMITED`, shows the wait in seconds, and performs no automatic 429 retry.
- Simultaneous session restoration is single-flight within a tab. Refresh remains single-flight and retries an original 401 request at most once.

### Final automated results actually executed

| Check | Result | Evidence |
|---|---|---|
| Backend regression suite | PASS | 22 discovered: 20 passed, 0 failed, 2 explicitly skipped. Includes brute-force lockout, reasonable authenticated volume, actual 429 enforcement, `Retry-After`, identity isolation, and window recovery. |
| Frontend API/unit suite | PASS | 7 files, 43 tests. Covers registration/login, restoration, concurrent restoration, JWT refresh, 429/no retry, communities, authorization adapters, wallet, real contribution derivation, held-fund derivation, spending, signing, broadcast, confirmations, and live dashboard composition. |
| Frontend TypeScript | PASS | `npm run typecheck` completed without errors. |
| Frontend production build | PASS | Vite 8; 56 modules; JS 325.75 kB (99.66 kB gzip), CSS 33.51 kB (7.34 kB gzip). |
| Live mock-surface search | PASS | No live API function calls mock dashboard/audit/signing/balance/confirmation data. Remaining mock files are not imported by the live API path. |

The first sandboxed frontend test attempt failed before loading tests because temporary cache renames were denied. The approved final rerun passed 43/43; this was an execution-sandbox issue, not a source failure.

### UX and role review

- Administrator controls match server authority for membership/setup, payment creation/cancellation, and broadcast. Copy no longer says administrators cannot create payments.
- Authorized signers can register only their own compressed public key, export the scoped PSBT, sign independently, and submit the genuinely signed PSBT. The UI no longer promises decline, signer-created payments, or signer broadcast.
- Ordinary members retain read-only wallet, request, signing-progress, transaction, and confirmation views.
- Loading, empty, retry, success, unsupported, and node-error states remain. The audit screen is now explicitly unavailable because no backend audit API exists. Responsive layouts were preserved.

### Environment-dependent work not claimed

- PostgreSQL integration: SKIPPED because `RUN_DB_TESTS=1` and a disposable isolated schema were not supplied.
- Bitcoin Core Regtest HTTP workflow: SKIPPED because `RUN_REGTEST_TESTS=1`, an isolated migrated database, and disposable node/wallets were not supplied.
- Live authenticated browser journey: BLOCKED BY ENVIRONMENT. Services started, but the in-app browser could not reach sandboxed localhost (`ERR_CONNECTION_TIMED_OUT`). No registration, database mutation, key registration, wallet creation, signature, broadcast, or mining action was performed.

## Final result

Milestones 0–9: **PASS for implementation and available automated verification**. Isolated database/Regtest E2E and live authenticated browser verification remain manual environment-dependent gates and are not represented as passes.

## Signer setup guidance and logout UX verification

### Implemented behavior

- Generated signer setup commands use only the real `user.id` and active `community.id` held by frontend contexts, validated as positive decimal IDs before interpolation.
- The command exactly matches the inspected backend utility and is intended to run from `backend/`.
- The modal documents local Regtest port 18444, cookie-file authentication, local API defaults, token environment setup, private-key boundaries, and how to copy the printed `Public key:` value.
- Public-key submission still calls `PUT /communities/:communityId/signers/me/public-info`; existing backend permission and compressed-key validation are unchanged.
- Successful registration reloads signer public information, signer list, and active community setup state.
- Logout is visibly labelled in the application and setup shells. It clears tokens, current-user selected-community storage, community/wallet/membership state, and obsolete in-flight loads before redirecting with history replacement.
- The backend has no logout/revocation contract. Client logout does not claim to revoke an already-issued JWT.

### Actual test results

| Check | Result | Evidence |
|---|---|---|
| Frontend unit/API/UI suite | PASS | 10 files, 48 tests. New tests cover exact ID-derived setup commands, command-injection-resistant ID validation, compressed-key validation, visible labelled logout, credential and community-cache clearing, redirect, Back-button protection, and stale prior-user response isolation. Existing real signer API, authentication, authorization, wallet, spending, broadcast, and monitoring tests remain green. |
| Frontend TypeScript | PASS | `npm run typecheck` completed with no errors. |
| Frontend production build | PASS | Vite 8; 57 modules; JS 330.46 kB (101.15 kB gzip), CSS 33.89 kB (7.39 kB gzip). |
| Backend regression suite | PASS | 22 discovered: 20 passed, 0 failed, 2 explicit environment-gated skips. Signer identity, public-key validation, community authorization, wallet policy, RPC isolation, and cryptographic PSBT checks remain green. |

No Bitcoin key, signer wallet, RPC cookie, JWT, database row, PSBT, transaction, or existing Regtest wallet state was changed during this work.

## Audit, notifications, and discussions validation — 2026-10-26

| Check | Result | Evidence |
|---|---|---|
| Backend regression suite | PASS | 36 discovered: 34 passed, 0 failed, 2 explicitly gated skips. New tests cover cross-community isolation, notification ownership, discussion validation/plain-text rendering contract, author exclusion, event/notification deduplication, optional broadcast-notification failure, and broadcast reconciliation without a second Core send. |
| Prisma schema validation | PASS | `npx prisma validate` reported the schema valid. The migration was reviewed but not applied. |
| Frontend tests | PASS | 27 files, 142 tests. Focused activity tests cover real audit filtering, unread notification routing/read behavior, discussion posting, and script-like content rendered as text. |
| Frontend TypeScript | PASS | `npm run typecheck` completed without diagnostics. |
| Frontend production build | PASS with advisory | Vite transformed 100 modules. JS 547.06 kB (174.49 kB gzip), CSS 40.54 kB (8.49 kB gzip). Vite retained its existing >500 kB chunk-size advisory. |

The PostgreSQL integration suite and live Regtest suite remain intentionally skipped because `RUN_DB_TESTS=1` and `RUN_REGTEST_TESTS=1` were not enabled. No database migration, database cleanup, Bitcoin RPC mutation, broadcast, mining, wallet creation, or transaction modification was performed. Authenticated visual browser testing was not run because the new tables are deliberately not present in the current database; responsive behavior is covered by component structure and tests, not claimed as a manual visual pass.
No Bitcoin key, signer wallet, RPC cookie, JWT, database row, PSBT, transaction, or existing Regtest wallet state was changed during this work.

## Opt-in browser signer verification

### Scope and safety boundary

The experiment adds a Regtest-only alternative to the manual "sign with an independent Bitcoin Core wallet, then paste the signed PSBT" flow. It remains disabled unless `VITE_ENABLE_BROWSER_SIGNER` is exactly `true` (case-insensitive, surrounding whitespace ignored); every other value, including unset, keeps the existing manual flow and renders neither new panel. The flag is read at render time from `import.meta.env`, so no code path can turn the feature on from user input.

- `frontend/src/lib/browser-signer/` holds pure, testable modules: mnemonic/key derivation (`@scure/bip39`, `@scure/bip32`, `@noble/curves`), `@scure/btc-signer` PSBT inspection/signing, wallet-descriptor parsing, and the encrypted IndexedDB vault.
- Derivation is fixed at `m/48'/1'/0'/2'/0/0` (Regtest, P2WSH multisig account) and only compressed secp256k1 public keys leave the browser.
- The vault stores `PBKDF2-SHA256` (600,000 iterations, 16-byte salt) plus `AES-256-GCM` ciphertext (12-byte IV). The record's community/user IDs, public key, derivation path, KDF parameters, and creation time are bound as GCM additional authenticated data; unlocking re-derives the key and refuses to proceed if the public key or path differs from the record.
- No recovery words, passphrase, xprv, or private key are written to `localStorage`, `sessionStorage`, logs, URLs, React state that outlives the modal, or the backend. The decrypted private key is held only for the duration of one signature and zeroed in a `finally` block.
- `BrowserSignerCard` (on `Signers.tsx`) creates or restores a key, shows its public key and derivation path, and registers only the public key through the existing `PUT /communities/:communityId/signers/me/public-info` endpoint. New key creation is refused once the wallet is live; only restoring previously registered words is suggested.
- `BrowserSignRequestPanel` (on `RequestDetail.tsx` for authorised signers) fetches the coordinator PSBT, re-derives the wallet from the backend descriptor, and verifies: wallet address, unchanged previous outputs, exact witness script, SIGHASH_ALL, no already-finalised inputs, input count/total, recipient script and amount, actual fee, change back to the wallet, and that the local key is in the wallet policy. The passphrase prompt appears only after that review succeeds.

### Actual commands and results

| Command | Result | Evidence |
|---|---|---|
| `npm --prefix frontend run typecheck` | PASS | `tsc -b` completed with no diagnostics. |
| `npm --prefix frontend test` | PASS | 19 files, 104 tests. New coverage: flag parsing, key generation/derivation, policy/descriptor parsing, PSBT inspection and refusal paths, vault encryption/tamper/unlock/delete, signer card create/restore/register guards, passphrase and backup-word modals, and end-to-end panel signing with mocked HTTP. |
| `npm --prefix frontend run build` | PASS | Vite 8; 97 modules; JS 527.76 kB (168.86 kB gzip), CSS 34.04 kB (7.42 kB gzip). The bundle now exceeds Vite's 500 kB advisory, which is recorded in the backlog. |
| `npm --prefix backend test` | PASS | 24 discovered: 22 passed, 0 failed, 2 explicit environment-gated skips. |
| Browser signature compatibility (backend) | PASS | `backend/test/browser-signer-compat.test.js` signs the checked-in fixture PSBT with the `@scure` browser path and has the backend's real `bitcoinjs-lib` verification accept it; tampered, mismatched, and injected signatures are rejected. |

### Not verified

- No live Regtest E2E ran: creating a browser key, registering it, creating a 2-of-3 wallet, collecting a second signature, broadcasting, mining, and refreshing confirmations still require a disposable node, migrated database, and reachable browser (`RUN_REGTEST_TESTS=1`). This remains an environment gate, not a pass.
- The WebCrypto + IndexedDB path is covered in jsdom via Node's `webcrypto` and `fake-indexeddb`; real-browser behaviour (private mode, storage eviction, blocked upgrades, multiple tabs) was not exercised.
- The feature is intentionally Regtest-only and must not be enabled for signet or mainnet use without a separate threat review.



## Wallet activity classification, transaction detail, and amount/status layout

### Root causes observed

- Bitcoin Core `listtransactions` is an output-level ledger. For `a0748e…` it returns three rows with the same TXID: `receive` of the 899,811-sat change, `send` of the 100,000-sat recipient output, and `send` of the 899,811-sat change output. The backend forwarded those rows unchanged.
- The frontend classified every `send` row as outgoing and every other row as incoming, so the change appeared once as a contribution and twice as payments. It also hardcoded fee, block height, request ID, and counterparty to null.
- `getTransaction` selected the first list row with the TXID (the change credit) and overwrote its amount with `abs(gettransaction.amount)`. That produced “Contribution received”, “+0.001 BTC”, and “Paid by the sender” for the outgoing payment.
- The detail/table layout used fixed amount columns without consistent right alignment or nowrap separation, allowing long amounts and confirmation text to appear adjacent/concatenated.

### Implemented behavior

- Backend aggregation now groups filtered Core ledger lines by TXID and wallet address. External outputs are summed as the payment; wallet-owned send outputs are change; wallet-owned receive outputs are contributions. A stored spending request is attached only when its `txid` matches, and an unlinked wallet send is still explicitly outgoing.
- The list and detail endpoints share the same aggregation. Responses add `direction`, `feeSats`, `changeSats`, `totalDebitSats`, `recipientAddress`, `recipientCount`, `recipients`, `requestId`, and `blockHeight`, while preserving the previous `category`, `amountSats`, `confirmations`, `blockhash`, and `time` fields.
- Block heights come from Core's `blockheight`; when a confirmed response omits it, the backend resolves `getblockheader` by block hash. It never assigns a height to an unconfirmed transaction and leaves the height unknown if Core cannot provide it.
- `listContributions` now derives from logical incoming entries only, so internal change is not a contribution. Bitcoin Core balances were not modified.
- The Transactions page renders one row per logical transaction with dedicated Date, Type, Amount, and Status columns on desktop and explicit stacked cells on narrow screens. Amounts are right-aligned/tabular/nowrap; status is a separate badge. The filter has a visible label and accessible name. Confirmation wording is “Unconfirmed”, “1 confirmation”, “N confirmations”, or “Confirmed”.
- The details page now shows “Community payment” for outgoing transactions with recipient address(es), network fee, change returned, total wallet debit, linked request, actual block height, date, confirmations, and Regtest. Unlinked sends show an explicit notice and no fabricated request. Incoming contributions retain “Contribution received”, “Paid by the sender”, and their real confirmation/height data.
- The Wallet contribution row was given explicit right-aligned amount/status cells and consistent responsive gaps.


### Files modified

- `backend/src/services/wallet.service.js`
- `backend/src/openapi.js`
- `backend/test/wallet-service.test.js`
- `backend/test/fixtures/bitcoin-core/wallet-activity.json` (new)
- `backend/test/fixtures/bitcoin-core/wallet-activity-details.json` (new)
- `frontend/src/types.ts`
- `frontend/src/api/index.ts`
- `frontend/src/api/monitoring.test.ts`
- `frontend/src/pages/Transactions.tsx`
- `frontend/src/pages/Transactions.test.tsx` (new)
- `frontend/src/pages/Wallet.tsx`
- `frontend/src/components/StatusBadge.tsx`
- `frontend/src/mock/server.ts`
- `frontend/src/lib/browserSignerFlag.ts` (explicit `undefined` now keeps the manual flow; this was the pre-existing flag-test failure)
- `INTEGRATION_TEST_REPORT.md`, `INTEGRATION_BACKLOG.md`

### Tests executed and results

| Command | Result | Evidence |
|---|---|---|
| `cd backend; npm test` | PASS | 28 discovered: 26 passed, 0 failed, 2 explicit DB/Regtest environment-gated skips. New tests cover the real Core fixture, change debit/credit grouping, multi-recipient sums, confirmed/unconfirmed change, unlinked sends, request links, detail identity, fee/change/total debit, heights, and the `getblockheader` height fallback. |
| `cd frontend; npm run typecheck` | PASS | `tsc -b` completed with no diagnostics. |
| `cd frontend; npm test` | PASS | 20 files, 113 tests. Includes new API mapping tests and six Transactions page/component tests for logical rows, contribution exclusion, filter behavior, separated amount/status cells, detail classification, fee/change/debit, block height, unlinked state, and mempool handling. |
| `cd frontend; npm run build` | PASS | Vite 8; 97 modules; JS 531.59 kB (169.80 kB gzip), CSS 34.48 kB (7.47 kB gzip). The existing >500 kB advisory remains. |
| Live read-only service check against the existing Regtest wallet | PASS | `wallet.service.transactions()` returned exactly 2 logical entries: the 1,000,000-sat contribution (incoming, 2 confirmations, height 1333) and the 100,000-sat payment (outgoing, fee 189, change 899,811, total debit 100,189, request 1, 1 confirmation, height 1334). `wallet.service.transaction()` returned the same values for both TXIDs. No wallet, request, block, or broadcast state was changed. |

### Remaining limitations

- No automated browser is installed in this environment, so the Transactions page was not visually screenshotted at desktop/tablet/mobile widths. Component tests verify semantic separation, right-aligned/nowrap amount styling, responsive grid declarations, filtering, and the absence of a change row; a manual/responsive browser pass remains recommended.
- Request linking is by exact TXID only. Wallet sends created outside CommunitySafe are classified as outgoing with `requestId: null` and an explicit “not linked” notice rather than guessed.
- A confirmed transaction whose Core response lacks both `blockheight` and `blockhash` cannot show a height; the UI reports “Unavailable” instead of inventing one.
- The history endpoint still uses Core's 100-entry window, so very high-volume wallets will need pagination later.

## Public logo navigation and development rate limiting

Root cause: the original middleware mounted one in-memory, per-IP 30-request/15-minute limiter over all authentication and community routes. A normal authenticated load performs multiple community, wallet, member, signer, request, and transaction calls; repeated logins/tests therefore consumed the same bucket. No frontend polling loop was found. Express proxy trust was unset, so a proxied deployment could also group clients under the proxy IP. There is no Redis or other persistent rate-limit store.

Implemented behavior:

- Public auth, login, refresh, authenticated session, routine community, and sensitive wallet mutation traffic now have explicit tiers. Production defaults remain 30/10/120/120/300/30 requests per 15 minutes; development defaults are 300/50/1000/2000/5000/120. Failed login lockout remains five failures per normalized email and IP for 15 minutes.
- `NODE_ENV=test` uses high application defaults, while the direct limiter test supplies a 500 ms/two-request instance. This prevents unrelated tests and manual development from sharing counters or requiring waits.
- All limits and windows are optional environment overrides; blank or invalid values safely fall back to the current environment. Proxy IP handling requires an explicit numeric `TRUST_PROXY` hop count.
- HTTP 429 responses expose `Retry-After`, `RateLimit`, and `RateLimit-Policy` through CORS. The existing browser client reads `Retry-After`, shows a useful message, and makes no automatic 429 retry.
- Brand links route to `/` without resetting session/community state. Authenticated landing actions return active users to `/app` and preserve incomplete onboarding routes.

Validation: frontend `npm test` passed 25 files/130 tests; `npm run typecheck` passed; `npm run build` passed (with the existing >500 kB bundle advisory). Backend `npm test` passed 28 tests with 0 failures and the two explicit database/Regtest suites skipped. The initial sandboxed runs were blocked by Windows temporary-cache/local-port permissions; normal-permission reruns passed.

## Incomplete-onboarding community switching

Root cause: the community selector and its `selectCommunity` call were implemented directly in `AppLayout`. Selecting an incomplete community caused the layout guard to redirect into `SetupLayout`, where no selector existed. In addition, unselected communities from the list API defaulted to the `members` stage, and selection returned no success value for safe post-load navigation.

Implementation:

- A shared native-select control is rendered in both application and setup headers, including the compact mobile setup header. It labels options as **Ready** or **Setup: next step**, remains keyboard accessible, and retains the public landing-page logo link.
- The membership-scoped community list now derives `members`, `rule`, `signers`, `review`, or `active` from existing server state. No database or wallet state is changed.
- Selection returns the freshly authorized context and only then replaces the route. Context, wallet, and membership values update together; failures retain the prior context and stored ID. Removed stored selections safely fall back to another accessible membership.
- Setup load errors keep the selector visible so another community remains reachable, while existing protected-route and setup-stage redirects continue to enforce authorization and progress.

Validation: frontend tests passed 26 files/139 tests; TypeScript and the production build passed. Backend regression tests passed with only the two existing opt-in database/Regtest suites skipped. Coverage includes active↔incomplete switching, multiple incomplete communities, exact partial stages, refresh restoration, inaccessible stored selections, request failure, keyboard focus, setup error recovery, and wallet-state isolation.
