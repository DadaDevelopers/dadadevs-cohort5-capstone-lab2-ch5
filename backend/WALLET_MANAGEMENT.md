# CommunitySafe wallet management

This module coordinates native SegWit `wsh(sortedmulti(M,keys...))` wallets on Bitcoin Core Regtest. Each community has a separate Core descriptor wallet named `communitysafe-<communityId>` with private keys disabled. The backend stores only public keys, the checksummed descriptor, address, PSBTs and transaction metadata. Signer keys stay in independent wallets or hardware devices.

## Set up

1. Start PostgreSQL and apply the existing migrations plus `20261019100000_community_wallet`. From `backend`, run `npx prisma migrate deploy` and `npx prisma generate` with `DATABASE_URL` configured. Do not reset the database.
2. Start the isolated Bitcoin Core Regtest node with RPC listening on `127.0.0.1:18444`. Set `BITCOIN_RPC_COOKIE_FILE` to that node's Regtest `.cookie` path, or set both `BITCOIN_RPC_USER` and `BITCOIN_RPC_PASSWORD`. Keep RPC bound to loopback.
3. Set the existing JWT variables and start the backend with `npm start`.
4. For every selected community signer, run `npm run regtest:signer -- setup --community-id <id> --user-id <id>` with that signer's access token in `COMMUNITYSAFE_TOKEN`. Register the displayed compressed 33-byte public key using `PUT /communities/:communityId/signers/me/public-info`. Set the signing threshold, then call `POST /communities/:communityId/wallet` as an admin.

Wallet creation first records a `CREATING` row under the community lock, then creates or loads the Core wallet, verifies that it has no private keys, imports the checksummed descriptor, and marks the row `READY`. A failed provision is marked `ERROR`; an admin may retry the same create route. If a process dies between Core and database updates, inspect the wallet row and Core wallet before retrying. The per-community wallet name prevents balance and UTXO reads from crossing communities.

The current public-key model makes **one fixed address per community wallet**. It is not a ranged HD wallet. Reusing that address has privacy costs. Changing a signer key or threshold requires a new wallet policy, moving funds with the old signers, and then directing future deposits to the new address. The current API deliberately blocks edits to an existing wallet's signer set and threshold. It does not yet implement automated wallet rotation. Back up signer keys independently; losing enough keys to fall below M makes the funds unspendable.

Public-key registration verifies compressed secp256k1 format and curve validity, but it does not yet prove possession of the matching private key. The Regtest utility keeps private keys inside separate Bitcoin Core wallets and requires interactive review before signing. See `MVP_WALLET_DEMO.md` for the complete workflow.

## API workflow

All routes require the existing Bearer JWT. Members may read their community wallet, balance, UTXOs, transactions and spending progress. Community admins create wallets and spending requests and authorize broadcasts. Original wallet signers can retrieve and submit PSBTs. These roles are checked against the current community membership.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/communities/:communityId/wallet` | Create or retry the watch-only wallet |
| GET | `/communities/:communityId/wallet` | Public descriptor and fixed address |
| GET | `/communities/:communityId/wallet/balance` | Confirmed, pending and immature satoshis |
| GET | `/communities/:communityId/wallet/utxos` | Wallet-attributed outputs |
| GET | `/communities/:communityId/wallet/transactions` | Wallet transaction history |
| GET | `/communities/:communityId/wallet/transactions/:txid` | Confirmation status |
| POST | `/communities/:communityId/wallet/spends` | Create request with `{ "recipient": "bcrt1...", "amountSats": "25000000", "feeRate": 2 }` |
| GET | `/communities/:communityId/wallet/spends/:spendId` | Spending and signature progress |
| GET | `/communities/:communityId/wallet/spends/:spendId/psbt` | PSBT for an original signer |
| POST | `/communities/:communityId/wallet/spends/:spendId/signatures` | Submit `{ "psbt": "<signed base64 PSBT>" }` |
| POST | `/communities/:communityId/wallet/spends/:spendId/broadcast` | Admin broadcasts a ready spend |
| POST | `/communities/:communityId/wallet/spends/:spendId/cancel` | Admin cancels an unbroadcast request and releases its UTXOs |

The admin request reserves confirmed UTXOs in PostgreSQL using a unique active-outpoint index, then Bitcoin Core builds the PSBT with exactly those inputs, the requested output and change back to the community address. The backend checks inputs, outputs and fee. A signer reviews the recipient, amount and fee in an independent signing environment, signs the PSBT, and returns it. The backend verifies that the unsigned transaction and security-critical PSBT metadata are unchanged, that prior signatures remain byte-for-byte intact, and that the matching signer key added one valid SIGHASH_ALL signature to every input. When Bitcoin Core reaches the threshold and replaces partial signing fields with a final witness, the backend parses that witness and verifies its script and every signature before accepting it. It combines valid submissions without signing itself. Once Core finalizes and accepts the transaction, an admin can broadcast it.

The recorded signature is a cryptographic signature, **not a separate application approval**. Admin authorization is required at request creation and broadcast. There is no member voting workflow. An admin may cancel an unbroadcast request to release its UTXOs. Requests do not expire automatically.

## Tests

`npm test` runs unit and mock-backed tests only. It never broadcasts. `RUN_DB_TESTS=1` enables the existing disposable-schema PostgreSQL tests with `TEST_DATABASE_URL` or `DATABASE_URL`.

The separate `test/regtest-wallet.test.js` test creates independent signer wallets, mines blocks, funds the multisig, collects two PSBT signatures, broadcasts and confirms the spend. Run it **only against a dedicated Regtest node and migrated test database**:

```powershell
$env:RUN_REGTEST_TESTS='1'
$env:REGTEST_TEST_DATABASE_URL='postgresql://.../communitysafe_regtest_test'
$env:BITCOIN_RPC_COOKIE_FILE='C:\path\to\regtest\.cookie'
$env:BITCOIN_RPC_TIMEOUT_MS='120000'
node --test test/regtest-wallet.test.js
```

The integration test leaves its named Core wallets and database fixtures for inspection. Its coordinator name uses the database community ID, so use a fresh dedicated Regtest datadir or remove old test wallets between runs. It must not point at a production Core node or database.

## Operational limits

- The RPC client accepts loopback HTTP only and verifies `chain=regtest` before wallet actions. No generic RPC route is exposed.
- Amounts and fees are stored as integer satoshis. API satoshi values are strings. Bitcoin Core's JSON RPC uses BTC decimals at the transport boundary.
- The wallet imports the descriptor at creation with timestamp `now`; deposits sent before import require a Core rescan. The wallet does not derive new addresses.
- Broadcast attempts have a `BROADCASTING` state and a stored transaction ID for retry after interrupted operations. An operator should investigate repeated mempool rejection; the request remains reserved.
- A synced node and normal Core mempool policy are needed for monitoring and broadcast. Incoming funds may be unconfirmed or immature, and spending uses confirmed UTXOs only.
