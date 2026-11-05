# CommunitySafe backend review

Reviewed the current MVP on `feature/community-management`. No commit or push was made.

## 1. Problems found

- Concurrent joins depended on Prisma error metadata that the PostgreSQL adapter does not always provide. A real database test reproduced the failure.
- Threshold reads could combine an earlier threshold with a later signer count.
- The AuthorizedSigner foreign key allowed membership deletion to silently cascade into signer deletion.
- Admin authorization and locking were duplicated between services.
- Authentication database operations lived in the HTTP controller.
- Unexpected authentication failures were not logged, while other handlers logged whole errors that could contain submitted values. Development password-reset tokens were printed to the console.
- Authentication had no upper bounds for names, email, or bcrypt password input. JWT user IDs could exceed PostgreSQL Int capacity.
- Request-parser and malformed URL errors could be reported as internal server failures.
- Public information validation missed recognizable testnet WIF and some private-key prefixes.
- Temporary permission-test endpoints and redundant comments remained in production routes and Swagger.
- Existing concurrency coverage used mocks rather than actual PostgreSQL locks and constraints.

## 2. Problems fixed

Duplicate joins now return the existing 409 response even when Prisma omits `meta.target`. Threshold reads use a repeatable-read transaction. Admin mutations share one transaction and authorization helper. Member listing checks access without fetching full community details or the join code. Authentication persistence and password operations now live in a service.

Comments explain the lock, last-admin rule, signer membership rule, snapshot consistency, and sensitive logging choices. Redundant route and Swagger narration was removed.

## 3. Files changed

Paths below are relative to `backend/`:

- `prisma/schema.prisma`
- `src/app.js`
- `src/controllers/auth.controller.js`
- `src/controllers/community.controller.js`
- `src/controllers/community-members.controller.js`
- `src/controllers/community-signers.controller.js`
- `src/controllers/signer-public-info.controller.js`
- `src/controllers/signing-threshold.controller.js`
- `src/lib/auth-validation.js`
- `src/lib/signer-public-info-validation.js`
- `src/middleware/auth.middleware.js`
- `src/openapi.js`
- `src/routes/auth.routes.js`
- `src/routes/community.routes.js`
- `src/services/community.service.js`
- `src/services/community-members.service.js`
- `src/services/community-signers.service.js`
- `test/auth.test.js`
- `test/community-auth.test.js`

## 4. Files created/deleted

Created:

- `src/lib/log-error.js`
- `src/services/auth.service.js`
- `src/services/community-access.service.js`
- `test/database.test.js`
- `prisma/migrations/20261009000000_membership_signer_guard/migration.sql`
- `REVIEW.md`

Deleted `src/middleware/community-authorization.middleware.js`. Only the removed temporary endpoints used it; production permission checks now share the service helper where appropriate. Current-role and community-scoping behavior remains covered by real endpoints.

## 5. Prisma/schema changes

Changed `AuthorizedSigner.membership` from `onDelete: Cascade` to `onDelete: Restrict`. Deleting a membership, including through a parent cascade, cannot silently erase signer authority. No fields or models were added or removed. Existing case-insensitive community-name uniqueness was retained and verified against PostgreSQL.

## 6. Migration changes

Added and applied this migration to the local `communitysafe_dev` database:

```sql
BEGIN;
ALTER TABLE "AuthorizedSigner" DROP CONSTRAINT "AuthorizedSigner_membershipId_fkey";
ALTER TABLE "AuthorizedSigner" ADD CONSTRAINT "AuthorizedSigner_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "CommunityMembership"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
```

It replaces only a foreign-key constraint. It does not update or delete user, community, membership, or signer rows. No database reset or historical migration edit was performed.

## 7. API behavior changed

- Removed temporary `GET /communities/:communityId/test/member`, `/test/admin`, and `/test/signer` routes; they now return 404.
- Concurrent duplicate joins consistently return 409 with `Already a member of this community`.
- Malformed URL encoding returns 400; oversized JSON bodies return 413; unsupported body encoding returns 415.
- Registration/reset reject passwords above 72 UTF-8 bytes. Login returns generic invalid credentials for such input. Registration also bounds trimmed names to 100 characters and normalized email to 254 characters. Reset tokens are bounded to 256 characters.
- Access and refresh tokens must use HS256 and contain a positive PostgreSQL Int user ID.
- Recognizable testnet WIF, xpriv, and private-key PEM input is rejected by public-info validation.
- Reset tokens are no longer logged, including in development.

The existing single `GET /communities/:identifier` endpoint remains: numeric identifiers default to ID lookup; names are decoded and normalized; `?by=name` supports numeric names. No separate by-name endpoint was introduced, in keeping with the earlier requested API design. Join-code format, membership roles, signer authority, and safe community response shapes are preserved.

## 8. Security improvements

Unexpected errors log a fixed context and a safe Prisma code, never raw error messages, request bodies, SQL, passwords, tokens, or keys. HTTP responses remain generic for unexpected errors. Admin authorization is checked from the database after acquiring the shared community lock. The new foreign key provides a second guard against accidental signer deletion.

## 9. Performance improvements

Member listing no longer loads the community name, description, creation date, or join code merely to check access. Join-code generation produces exactly the six random bytes used in the existing format instead of discarding three bytes. Existing related-user selections and database signer counts remain; no cache or per-signer query loop was added.

## 10. Validation improvements

Added bounded authentication strings, bcrypt byte-length validation, JWT algorithm/ID bounds, recognizable private-material rejection, and correct handling of request-parser errors. Existing strict community ID, description, role, and integer threshold validation remains covered.

## 11. Test coverage added/fixed

- Real PostgreSQL migrations in a disposable schema, without touching application fixtures.
- Concurrent case-insensitive community creation, duplicate joins, and atomic creator-membership rollback.
- Concurrent registration and duplicate signer selection.
- Concurrent last-admin demotions/removals and immediate permission changes.
- Signer selection racing membership deletion.
- Threshold setting racing signer removal, and simultaneous signer removals.
- Deterministic threshold-read snapshot consistency during an actual update/removal.
- Database rejection of membership deletion while signer authority remains.
- Concurrent reset-token consumption.
- Authentication bounds, invalid JWT algorithms/IDs, private-material inputs, safe error logging, malformed/oversized requests, and removed-route checks.
- Swagger route parity and bearer-auth assertions.
- Reset tests obtain a fixture token directly instead of depending on sensitive console output.

## 12. Full test results

From `backend/`, in PowerShell:

```powershell
$env:RUN_DB_TESTS = '1'
npm test
```

Result: **14 passed, 0 failed, 0 skipped**. This includes five existing/updated endpoint groups and the database parent test with eight subtests. Database tests use `TEST_DATABASE_URL` if supplied, otherwise `DATABASE_URL`, create a uniquely named schema, and remove only that schema afterward. Without `RUN_DB_TESTS=1`, database integration is explicitly skipped; the normal mocked endpoint tests still run.

## 13. Prisma validation result

`npx prisma validate --config prisma7.config.ts` passed. `npx prisma generate --config prisma7.config.ts` also passed using Prisma 7.10.0.

## 14. Migration status result

`npx prisma migrate status --config prisma7.config.ts` reports **9 migrations** and **Database schema is up to date** on the configured local development database.

## 15. Swagger status

Removed temporary paths, corrected public-info validation text, documented authentication limits and parser failures, and removed future wallet-lock conflicts from current response descriptions. Automated route-parity checks pass. A temporary server using the local development database returned:

- `GET /health`: 200, `{"status":"ok","database":"connected"}`.
- `GET /api-docs/`: 200, HTML.

These endpoints were checked over HTTP; no interactive browser clicking was performed.

## 16. Remaining risks and verification limits

- Password-reset email delivery remains unimplemented as requested. Tokens are stored only as hashes and are not exposed via logs or HTTP, so users currently have no delivery channel for completing a reset.
- Existing passwords longer than 72 UTF-8 bytes will be rejected at login. Such accounts need a password reset; password hashes cannot reveal whether these accounts exist.
- Refresh tokens remain stateless, without rotation/revocation. Password reset does not invalidate previously issued JWTs. Other outstanding reset tokens remain valid until expiry or use. This pass preserved that authentication design.
- Rate limits and login lockout remain per-process memory; multiple replicas need shared enforcement.
- Public-key validation is deliberately format-agnostic. It rejects recognizable private material but cannot prove an arbitrary string is a public key.
- Last-admin and M-of-N guarantees apply to these coordinated API mutations. Direct database writes can bypass those service rules; the signer foreign-key restriction and name uniqueness are enforced by PostgreSQL.
- Local tests verify the specified flows, not production deployment, distributed load, or every possible schedule of concurrent requests. The new migration was tested locally; deployment elsewhere remains unverified.

## 17. Deferred to the Bitcoin wallet phase

Final public-key format and cryptographic validation, wallet creation, locking the signer set and threshold after wallet creation, descriptors/addresses, UTXOs, PSBTs, transactions, signatures, spending requests, broadcast, and monitoring remain deferred. No fake wallet-created state was introduced.
