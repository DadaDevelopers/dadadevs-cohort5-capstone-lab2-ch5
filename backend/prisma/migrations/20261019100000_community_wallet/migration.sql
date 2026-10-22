CREATE TYPE "WalletStatus" AS ENUM ('CREATING', 'READY', 'ERROR');
CREATE TYPE "SpendingStatus" AS ENUM ('SIGNING', 'READY', 'BROADCASTING', 'BROADCAST', 'CONFLICTED', 'CANCELLED');

CREATE TABLE "CommunityWallet" (
  "id" SERIAL PRIMARY KEY,
  "communityId" INTEGER NOT NULL UNIQUE REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "status" "WalletStatus" NOT NULL DEFAULT 'CREATING',
  "network" TEXT NOT NULL DEFAULT 'regtest',
  "coreWalletName" TEXT NOT NULL UNIQUE,
  "descriptor" TEXT NOT NULL,
  "address" TEXT NOT NULL UNIQUE,
  "requiredSignatures" INTEGER NOT NULL,
  "signerSnapshot" JSONB NOT NULL,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityWallet_threshold_check" CHECK ("requiredSignatures" >= 2)
);

CREATE TABLE "SpendingRequest" (
  "id" SERIAL PRIMARY KEY,
  "walletId" INTEGER NOT NULL REFERENCES "CommunityWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdById" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "recipient" TEXT NOT NULL,
  "amountSats" BIGINT NOT NULL,
  "feeSats" BIGINT NOT NULL,
  "unsignedTxHash" TEXT NOT NULL,
  "psbt" TEXT NOT NULL,
  "status" "SpendingStatus" NOT NULL DEFAULT 'SIGNING',
  "txid" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SpendingRequest_amount_check" CHECK ("amountSats" > 0 AND "feeSats" >= 0)
);
CREATE INDEX "SpendingRequest_walletId_status_idx" ON "SpendingRequest"("walletId", "status");

CREATE TABLE "SpendingInput" (
  "id" SERIAL PRIMARY KEY,
  "spendingRequestId" INTEGER NOT NULL REFERENCES "SpendingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "walletId" INTEGER NOT NULL REFERENCES "CommunityWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "txid" TEXT NOT NULL,
  "vout" INTEGER NOT NULL,
  "reserved" BOOLEAN NOT NULL DEFAULT true,
  UNIQUE ("spendingRequestId", "txid", "vout")
);
CREATE INDEX "SpendingInput_walletId_txid_vout_idx" ON "SpendingInput"("walletId", "txid", "vout");
CREATE UNIQUE INDEX "SpendingInput_active_outpoint_key" ON "SpendingInput"("walletId", "txid", "vout") WHERE "reserved" = true;

CREATE TABLE "SpendingSignature" (
  "id" SERIAL PRIMARY KEY,
  "spendingRequestId" INTEGER NOT NULL REFERENCES "SpendingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "signerId" INTEGER NOT NULL,
  "publicKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("spendingRequestId", "signerId")
);
