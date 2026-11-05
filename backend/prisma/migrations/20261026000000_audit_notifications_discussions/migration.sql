-- This migration is intentionally additive. Review before applying with
-- `npx prisma migrate deploy`; do not use migrate reset on an existing wallet database.
CREATE TABLE "AuditEvent" (
    "id" SERIAL NOT NULL,
    "communityId" INTEGER NOT NULL,
    "actorUserId" INTEGER,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "communityId" INTEGER NOT NULL,
    "auditEventId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscussionMessage" (
    "id" SERIAL NOT NULL,
    "communityId" INTEGER NOT NULL,
    "spendingRequestId" INTEGER NOT NULL,
    "authorUserId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscussionMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DiscussionMessage_body_length_check" CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000)
);

CREATE UNIQUE INDEX "AuditEvent_dedupeKey_key" ON "AuditEvent"("dedupeKey");
CREATE INDEX "AuditEvent_communityId_createdAt_id_idx" ON "AuditEvent"("communityId", "createdAt", "id");
CREATE INDEX "AuditEvent_communityId_eventType_createdAt_id_idx" ON "AuditEvent"("communityId", "eventType", "createdAt", "id");
CREATE UNIQUE INDEX "Notification_auditEventId_userId_key" ON "Notification"("auditEventId", "userId");
CREATE INDEX "Notification_userId_communityId_createdAt_id_idx" ON "Notification"("userId", "communityId", "createdAt", "id");
CREATE INDEX "Notification_userId_communityId_readAt_idx" ON "Notification"("userId", "communityId", "readAt");
CREATE INDEX "DiscussionMessage_spendingRequestId_createdAt_id_idx" ON "DiscussionMessage"("spendingRequestId", "createdAt", "id");
CREATE INDEX "DiscussionMessage_communityId_createdAt_id_idx" ON "DiscussionMessage"("communityId", "createdAt", "id");

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_auditEventId_fkey" FOREIGN KEY ("auditEventId") REFERENCES "AuditEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionMessage" ADD CONSTRAINT "DiscussionMessage_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscussionMessage" ADD CONSTRAINT "DiscussionMessage_spendingRequestId_fkey" FOREIGN KEY ("spendingRequestId") REFERENCES "SpendingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscussionMessage" ADD CONSTRAINT "DiscussionMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
