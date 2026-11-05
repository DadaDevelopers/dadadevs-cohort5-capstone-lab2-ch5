# CommunitySafe MVP wallet demonstration

This guide runs the complete Regtest workflow for any new users and community. Replace every value in angle brackets. Never paste a password, private key, seed, RPC cookie, or real JWT into source files or screenshots.

## 1. Start and verify the environment

Use the dedicated Bitcoin Core data directory and RPC port. Do not use the node on port 18443.

```powershell
bitcoind.exe -regtest -server=1 -datadir="C:\Users\Administrator\communitysafe-regtest" -rpcport=18444
```

In a separate PowerShell window, configure the backend with a migrated PostgreSQL database and the Regtest cookie. Keep the actual database URL private.

```powershell
cd C:\Users\Public\Lilian\personal_Projects\dadadevs-cohort5-capstone-lab2-ch5\backend
$env:DATABASE_URL = '<POSTGRESQL_DATABASE_URL>'
$env:BITCOIN_RPC_URL = 'http://127.0.0.1:18444'
$env:BITCOIN_RPC_COOKIE_FILE = 'C:\Users\Administrator\communitysafe-regtest\regtest\.cookie'
npx prisma migrate deploy
npx prisma generate
npm start
```

Verify the database and node before continuing:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
bitcoin-cli.exe -regtest -datadir="C:\Users\Administrator\communitysafe-regtest" -rpcport=18444 getblockchaininfo
```

Expected facts are `database: connected` and `chain: regtest`. Open Swagger at `http://127.0.0.1:3000/api-docs`.

## 2. Register and authenticate users

Repeat registration and login for the future admin and every signer.

### Register

- Method: `POST`
- Route: `/auth/register`
- Role: public

```json
{
  "firstName": "<FIRST_NAME>",
  "lastName": "<LAST_NAME>",
  "email": "<EMAIL>",
  "password": "<PASSWORD_AT_LEAST_8_CHARACTERS>"
}
```

Success is HTTP 201 with `user.id`. A duplicate email returns 409.

### Login

- Method: `POST`
- Route: `/auth/login`
- Role: public

```json
{
  "email": "<EMAIL>",
  "password": "<PASSWORD>"
}
```

Success is HTTP 200 with `token`, `refreshToken`, and `user`. In Swagger, select **Authorize** and enter only the access token. Keep a separate token for each signer.

## 3. Create the community and add members

### Create a community

- Method: `POST`
- Route: `/communities`
- Role: authenticated user; creator becomes `COMMUNITY_ADMIN`

```json
{
  "name": "<UNIQUE_COMMUNITY_NAME>",
  "description": "<COMMUNITY_DESCRIPTION>"
}
```

Success is HTTP 201 with `community.id`, `joinCode`, and the admin role. Names are trimmed and case-insensitively unique.

### Add an existing registered user

- Method: `POST`
- Route: `/communities/<COMMUNITY_ID>/members`
- Role: `COMMUNITY_ADMIN`

```json
{
  "email": "<REGISTERED_MEMBER_EMAIL>"
}
```

Success is HTTP 201. A missing user returns 404; an existing membership returns 409.

### Check members

- Method: `GET`
- Route: `/communities/<COMMUNITY_ID>/members`
- Role: current Community member

Record each future signer's `id`.

## 4. Select authorized signers

Repeat for every signer.

- Method: `POST`
- Route: `/communities/<COMMUNITY_ID>/signers`
- Role: `COMMUNITY_ADMIN`

```json
{
  "userId": <SIGNER_USER_ID>
}
```

Success is HTTP 201 with `publicInfoRegistered: false`. The user must already be a member. Duplicate selection returns 409.

## 5. Create each independent Regtest signer key

Open a PowerShell session for the signer and use that signer's access token. The utility verifies the token identity and current Community signer selection before creating a key.

```powershell
cd C:\Users\Public\Lilian\personal_Projects\dadadevs-cohort5-capstone-lab2-ch5\backend
$env:COMMUNITYSAFE_TOKEN = '<SIGNER_ACCESS_TOKEN>'
$env:COMMUNITYSAFE_API_URL = 'http://127.0.0.1:3000'
$env:BITCOIN_RPC_URL = 'http://127.0.0.1:18444'
$env:BITCOIN_RPC_COOKIE_FILE = 'C:\Users\Administrator\communitysafe-regtest\regtest\.cookie'
npm run regtest:signer -- setup --community-id <COMMUNITY_ID> --user-id <SIGNER_USER_ID>
```

The command creates one deterministic Bitcoin Core wallet association for that user and community, then displays only the compressed public key. Repeating it returns the same key. If the wallet or local association is inconsistent, it stops rather than replacing the key.

Separate Core wallets provide logical separation on a single demonstration computer. They do not provide production-grade physical or administrative custody.

## 6. Register each public key

Authorize Swagger as the signer whose key was just created.

- Method: `PUT`
- Route: `/communities/<COMMUNITY_ID>/signers/me/public-info`
- Role: that Community's selected signer

```json
{
  "publicKey": "<66_CHARACTER_COMPRESSED_PUBLIC_KEY>"
}
```

Success is HTTP 200:

```json
{
  "registered": true,
  "publicKey": "<NORMALIZED_LOWERCASE_PUBLIC_KEY>"
}
```

Malformed, placeholder, uncompressed, or off-curve keys return 400. A key already used by another signer in the Community returns 409. Key changes return 409 after wallet creation.

Confirm readiness with `GET /communities/<COMMUNITY_ID>/signers`. Every selected signer must have `publicInfoRegistered: true`.

## 7. Configure the signing threshold

- Method: `PUT`
- Route: `/communities/<COMMUNITY_ID>/signing-threshold`
- Role: `COMMUNITY_ADMIN`

```json
{
  "requiredSignatures": 2
}
```

For three selected signers, this creates a 2-of-3 policy. Success returns `requiredSignatures` and `authorizedSignerCount`. At least two signers are required, and the threshold cannot exceed the signer count. It becomes immutable after wallet creation.

## 8. Create the shared wallet

- Method: `POST`
- Route: `/communities/<COMMUNITY_ID>/wallet`
- Role: `COMMUNITY_ADMIN`
- Body: none

Success is HTTP 201 with:

- `status: READY`
- `network: regtest`
- A `bcrt1...` receiving address
- A checksummed `wsh(sortedmulti(...))` descriptor
- The configured threshold and signer snapshot

The coordinator wallet is watch-only and descriptor based. It contains no signer private keys. Missing or invalid signer keys return an actionable 409 before Bitcoin Core is contacted. Existing wallets and policies cannot be silently replaced.

## 9. Fund and inspect the wallet

Copy the address from `GET /communities/<COMMUNITY_ID>/wallet`. Create a funding wallet once; on later demonstrations, load the existing wallet instead.

```powershell
$dataDir = 'C:\Users\Administrator\communitysafe-regtest'
$fundingWallet = '<FUNDING_WALLET_NAME>'
bitcoin-cli.exe -regtest -datadir=$dataDir -rpcport=18444 createwallet $fundingWallet
$miningAddress = bitcoin-cli.exe -regtest -datadir=$dataDir -rpcport=18444 -rpcwallet=$fundingWallet getnewaddress
bitcoin-cli.exe -regtest -datadir=$dataDir -rpcport=18444 generatetoaddress 101 $miningAddress
bitcoin-cli.exe -regtest -datadir=$dataDir -rpcport=18444 -rpcwallet=$fundingWallet sendtoaddress '<COMMUNITY_RECEIVE_ADDRESS>' 0.1 '' '' false true null unset false 2
bitcoin-cli.exe -regtest -datadir=$dataDir -rpcport=18444 generatetoaddress 1 $miningAddress
```

The final `2` requests an explicit 2 sat/vB funding fee rate. On a long-lived Regtest chain, block subsidies may have halved; fund an amount below the funding wallet's confirmed balance.

Use any current Community member token:

- `GET /communities/<COMMUNITY_ID>/wallet/balance` returns confirmed, pending, and immature satoshis as strings.
- `GET /communities/<COMMUNITY_ID>/wallet/utxos` returns wallet outputs and confirmations.
- `GET /communities/<COMMUNITY_ID>/wallet/transactions` returns wallet history.

## 10. Create and review a spending request

First create a different Regtest recipient address:

```powershell
$recipient = bitcoin-cli.exe -regtest -datadir=$dataDir -rpcport=18444 -rpcwallet=$fundingWallet getnewaddress
```

### Create the request

- Method: `POST`
- Route: `/communities/<COMMUNITY_ID>/wallet/spends`
- Role: `COMMUNITY_ADMIN`

```json
{
  "recipient": "<REGTEST_BECH32_RECIPIENT>",
  "amountSats": "2500000",
  "feeRate": 2
}
```

Success is HTTP 201 with `id`, `status: SIGNING`, `recipient`, `amountSats`, and `feeSats`. The amount is a decimal satoshi string; `feeRate` is an integer from 1 to 100 sat/vB. Invalid values return 400. Insufficient unreserved confirmed funds return 409.

### Review status

- Method: `GET`
- Route: `/communities/<COMMUNITY_ID>/wallet/spends/<SPEND_ID>`
- Role: current Community member

The response includes recipient, amount, fee, status, accepted signature records, required signatures, and transaction ID when broadcast.

### Retrieve the PSBT

- Method: `GET`
- Route: `/communities/<COMMUNITY_ID>/wallet/spends/<SPEND_ID>/psbt`
- Role: signer captured in this wallet's immutable signer snapshot

The response includes the same public details plus `psbt`. Ordinary members receive 403.

## 11. Sign independently

Run this separately for each required signer. The utility fetches the wallet, request, and PSBT; checks network, signer identity, local key association, recipient, amount, fee, outputs, and exact multisig policy; then displays a summary.

```powershell
$env:COMMUNITYSAFE_TOKEN = '<THIS_SIGNER_ACCESS_TOKEN>'
npm run regtest:signer -- sign --community-id <COMMUNITY_ID> --user-id <THIS_SIGNER_USER_ID> --spend-id <SPEND_ID>
```

Review the displayed values and type `SIGN` exactly. Bitcoin Core signs inside that signer's wallet, and the utility submits the signed PSBT to:

- Method: `POST`
- Route: `/communities/<COMMUNITY_ID>/wallet/spends/<SPEND_ID>/signatures`
- Role: original wallet signer

```json
{
  "psbt": "<SIGNED_BASE64_PSBT>"
}
```

For 2-of-3, the first accepted signature leaves `status: SIGNING`; the second returns `status: READY`. Duplicate signatures, another Community's key, modified PSBTs, or invalid signatures are rejected.

## 12. Broadcast and confirm

### Broadcast

- Method: `POST`
- Route: `/communities/<COMMUNITY_ID>/wallet/spends/<SPEND_ID>/broadcast`
- Role: `COMMUNITY_ADMIN`
- Body: none

Before the threshold is met, this returns 409. Success returns `status: BROADCAST` and a 64-character `txid` after finalization and mempool acceptance.

Mine one confirmation:

```powershell
bitcoin-cli.exe -regtest -datadir=$dataDir -rpcport=18444 generatetoaddress 1 $miningAddress
```

Check the final result:

- `GET /communities/<COMMUNITY_ID>/wallet/transactions/<TXID>` should report at least one confirmation.
- `GET /communities/<COMMUNITY_ID>/wallet/spends/<SPEND_ID>` should report `BROADCAST`.
- `GET /communities/<COMMUNITY_ID>/wallet/balance` shows the remaining confirmed balance.
- `GET /communities/<COMMUNITY_ID>/wallet/transactions` includes the transaction history.

## Common errors

| Error | Resolution |
|---|---|
| 401 Unauthorized | Log in again and authorize Swagger with that user's access token. |
| 403 Forbidden | Use a current member, the correct signer, or a Community admin as required. |
| Invalid compressed public key | Run signer setup and copy the complete 66-character key. |
| Duplicate signer key | Run setup for the correct user-community association; do not reuse another signer or Community key. |
| Every authorized signer must register a valid compressed public key | Check the signer list, then register each missing key as that signer. |
| Signing threshold conflict | Select at least two signers and set M no higher than N. |
| Insufficient unreserved confirmed funds | Mine a confirmation and check balance and UTXOs. Cancel stale spending requests if appropriate. |
| Bitcoin service unavailable | Confirm port 18444, `chain: regtest`, cookie path, and that Bitcoin Core is running. |
| Wallet policy is immutable | Use the established keys and threshold. Wallet rotation is outside this MVP. |

## MVP limitations

- Public-key registration validates key structure and curve membership but does not prove possession of the private key.
- The server never receives signer private keys or seeds.
- Single-machine Core wallets provide logical separation only. Production requires signer-controlled devices or separate hosts.
- Key backup, recovery, encrypted custody, hardware wallets, wallet rotation, ranged receive descriptors, and mainnet deployment are future work.
