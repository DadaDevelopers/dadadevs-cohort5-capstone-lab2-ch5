# CommunitySafe frontend

The React web frontend for CommunitySafe, a Bitcoin multisignature wallet coordination platform for communities that pool money: chamas, savings groups, NGOs, student organisations and small teams. Several trusted members each hold a key, and the group agrees how many of them must sign before anything is spent (for example, 3 of 5). Every member can see the balance, each contribution, each spending request and who signed it.

> **All data is mocked. Nothing is wired to the backend yet.**
> The frontend runs entirely on an in-memory mock in `src/mock/` that simulates a regtest Bitcoin network. It makes no network calls to `backend/`. No real Bitcoin is involved, nothing is saved between page reloads, and the app never asks for or stores a private key or recovery phrase.

## Running locally

Requires Node.js 20.19+ or 22.12+.

```bash
cd frontend
npm ci
npm run dev        # http://localhost:5173/
npm run build      # type-checks, then builds to frontend/dist
npm run preview    # serves the production build
```

## Trying it out

- **Log in** with any email and password. Unknown emails sign in as the demo administrator of *Machakos Builders Fund*. The login page also has one-click buttons for each role.
- **Role switcher.** The "View as" control at the top of every screen switches between the three roles from the SRS:
  - *Administrator*: manages members and settings. Can also be in the signer set, but has no override.
  - *Signer*: proposes, reviews, signs, declines and sends payments.
  - *Member*: read-only view of everything.
- **Demo controls** in the top banner simulate a server outage (every screen shows its error and retry state) and a Bitcoin node outage (sending fails and is kept for retry).
- **Sign up** to go through the five-step setup for a new community: create, add members and choose signers, set the approval rule, register signer public keys, then create the wallet.

## Project structure

```
frontend/
  src/
    types.ts            Domain types, mirroring the SRS entities
    api/index.ts        The only data layer components use (see table below)
    api/errors.ts       ApiError shape the backend should also return
    mock/data.ts        Seed data (regtest addresses, txids, tpubs)
    mock/server.ts      In-memory stand-in for the backend and its business rules
    context/            Session (current user) and community/wallet state
    components/         Layouts, UI primitives, the signer-slot progress display
    pages/              One file per screen
    lib/                Formatting, Bitcoin validation helpers, useAsync hook
```

Components never import from `src/mock`. To connect the backend, replace the body of each function in `src/api/index.ts` with a `fetch` to the matching endpoint and delete `src/mock`. Return types stay the same, so no screen needs to change.

## API functions and the backend endpoints they expect

**This table is the contract the frontend expects, not a description of what the backend serves today.** Some of these endpoints don't exist on `main` yet, and none of them are called: every function currently returns mock data.

`feature/community-management` isn't merged into `main` yet, so some of the community, member, signer and threshold endpoints may already exist there, possibly under different paths or methods. The Status column notes what I found on each branch, but treat it as a starting point for agreeing the contract, not as final.

Paths are written with an `/api` prefix. The backend on `main` currently mounts its routes at `/auth` and `/communities` without that prefix, so one side will need to adjust when we wire it up.

Authentication is token based (SRS FR-03): `login` and `register` return a token, which every other call sends as `Authorization: Bearer <token>`. Role checks must be enforced by the backend; the UI only mirrors them. Errors should be JSON shaped like `ApiError`: `{ code, message, fields }`, where `fields` maps form inputs to messages.

| Function | Method | Endpoint | Status | Notes |
| --- | --- | --- | --- | --- |
| `register` | POST | `/api/auth/register` | On `main` as `POST /auth/register` | name, email, password |
| `login` | POST | `/api/auth/login` | On `main` as `POST /auth/login` | email, password |
| `logout` | POST | `/api/auth/logout` | Not yet | |
| `listMyCommunities` | GET | `/api/communities` | On `feature/community-management` | communities the user belongs to |
| `getCommunity` | GET | `/api/communities/:communityId` | On `feature/community-management` | |
| `createCommunity` | POST | `/api/communities` | On `feature/community-management` | creator becomes administrator |
| `updateCommunity` | PATCH | `/api/communities/:communityId` | Not yet | admin only |
| `getMembership` | GET | `/api/communities/:communityId/me` | Not yet | role and signer record for the current user |
| `getDashboard` | GET | `/api/communities/:communityId/dashboard` | Not yet | balance, requests, recent history |
| `listMembers` | GET | `/api/communities/:communityId/members` | On `feature/community-management` | |
| `addMember` | POST | `/api/communities/:communityId/members` | On `feature/community-management` | admin only |
| `listSigners` | GET | `/api/communities/:communityId/signers` | On `feature/community-management` | |
| `setAuthorisedSigners` | PUT | `/api/communities/:communityId/signers` | Similar on `feature/community-management` (POST) | admin only, before wallet creation, at least 2 |
| `registerSignerKey` | PUT | `/api/communities/:communityId/signers/:signerId/public-key` | Similar on `feature/community-management` (`PUT .../signers/me/public-info`) | the signer themself; xpub, fingerprint, path. Public data only |
| `setThreshold` | PUT | `/api/communities/:communityId/wallet/threshold` | Similar on `feature/community-management` (`PUT .../signing-threshold`) | admin only, 2 ≤ M ≤ N, before wallet creation |
| `createWallet` | POST | `/api/communities/:communityId/wallet` | Not yet | locks signer set and threshold |
| `getWallet` | GET | `/api/communities/:communityId/wallet` | Not yet | address, balance, reserved funds |
| `listContributions` | GET | `/api/communities/:communityId/wallet/contributions` | Not yet | incoming, with confirmations |
| `listSpendingRequests` | GET | `/api/communities/:communityId/spending-requests` | Not yet | includes signatures |
| `getSpendingRequest` | GET | `/api/spending-requests/:requestId` | Not yet | request, signatures, signers, transaction |
| `createSpendingRequest` | POST | `/api/communities/:communityId/spending-requests` | Not yet | signers only |
| `updateSpendingRequest` | PATCH | `/api/spending-requests/:requestId` | Not yet | creator only, only while no one has signed |
| `signTransaction` | POST | `/api/spending-requests/:requestId/signatures` | Not yet | partial signature from the signer's device; one per signer |
| `declineSpendingRequest` | POST | `/api/spending-requests/:requestId/declines` | Not yet | optional reason |
| `broadcastTransaction` | POST | `/api/spending-requests/:requestId/broadcast` | Not yet | only once the threshold is met; failure keeps the request and signatures |
| `listTransactions` | GET | `/api/communities/:communityId/transactions` | Not yet | incoming and outgoing history |
| `getTransaction` | GET | `/api/communities/:communityId/transactions/:txid` | Not yet | |
| `listAuditEvents` | GET | `/api/communities/:communityId/audit-events` | Not yet | |

Mock-only helpers with no backend equivalent (remove when the backend is wired up): `switchDemoRole`, `simulateSignerRegistration`, `getDemoFlags`, `setDemoFlags`, `currentChainTip`.

## Rules the UI reflects

These come from the SRS and must also be enforced server side:

- Membership does not grant signing authority. Only authorised signers can create, sign or send requests.
- The approval rule is at least 2 and never more than the number of signers. Nobody, including the administrator, can bypass it.
- The signer set and rule are fixed once the wallet is created.
- A signer counts once per request. Declining does not cancel a request while the remaining signers can still reach the threshold.
- Request details are read-only once the first signature exists; a different payment needs a new request.
- Nothing is broadcast below the threshold. A failed broadcast keeps the request and its signatures, shows the node error and allows a retry.
- Only public key information is handled. Anything pasted that looks like a private key or recovery words is discarded immediately.

## Stack

React 18, TypeScript, Vite, Tailwind CSS 4, React Router (HashRouter) and qrcode.react. No component library.

## Deployment

`render.yaml` at the repo root describes a Render static site with `rootDir: frontend`. It runs `npm ci && npm run build` and publishes `frontend/dist`.
