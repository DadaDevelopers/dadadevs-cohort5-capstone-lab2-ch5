-- Existing signers remain valid until they register public information.
ALTER TABLE "AuthorizedSigner" ADD COLUMN "publicKey" TEXT;
