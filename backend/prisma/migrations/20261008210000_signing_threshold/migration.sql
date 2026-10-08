-- Communities may exist before their signer set and threshold are configured.
ALTER TABLE "Community" ADD COLUMN "requiredSignatures" INTEGER;
