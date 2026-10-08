-- Remove signer authority explicitly before deleting its CommunityMembership.
BEGIN;
ALTER TABLE "AuthorizedSigner" DROP CONSTRAINT "AuthorizedSigner_membershipId_fkey";
ALTER TABLE "AuthorizedSigner" ADD CONSTRAINT "AuthorizedSigner_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "CommunityMembership"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
