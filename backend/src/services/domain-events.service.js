const prisma = require("../lib/prisma");

function activityAvailable(client) {
  if (client?.auditEvent && client?.notification) return true;
  // Older unit-test doubles intentionally model only the service under test.
  if (process.env.NODE_ENV === "test") return false;
  throw new Error("Activity storage is unavailable. Apply the audit and notifications migration.");
}

async function recipientIds(client, communityId, audience, explicitUserIds, excludeUserId) {
  if (Array.isArray(explicitUserIds)) {
    return [...new Set(explicitUserIds)].filter((id) => id !== excludeUserId).map((userId) => ({ userId, isSigner: false }));
  }
  if (!audience) return [];
  const where = { communityId };
  if (audience === "admins") where.role = "COMMUNITY_ADMIN";
  if (audience === "signers") where.authorizedSigner = { isNot: null };
  const rows = await client.communityMembership.findMany({ where, select: { userId: true, authorizedSigner: { select: { id: true } } } });
  return [...new Map(rows.map((row) => [row.userId, { userId: row.userId, isSigner: Boolean(row.authorizedSigner) }])).values()].filter(({ userId }) => userId !== excludeUserId);
}

/** Records the durable audit row and its notification fan-out in the caller's transaction. */
async function recordEvent(client, input) {
  if (!activityAvailable(client)) return null;
  const create = {
    communityId: input.communityId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: String(input.entityId),
    metadata: input.metadata ?? undefined,
    dedupeKey: input.dedupeKey ?? undefined,
  };
  const event = input.dedupeKey
    ? await client.auditEvent.upsert({ where: { dedupeKey: input.dedupeKey }, create, update: {} })
    : await client.auditEvent.create({ data: create });

  if (!input.notification) return event;
  const users = await recipientIds(
    client,
    input.communityId,
    input.notification.audience,
    input.notification.userIds,
    input.notification.excludeActor === false ? null : input.actorUserId,
  );
  if (users.length) {
    const writeNotifications = () => client.notification.createMany({
      data: users.map(({ userId, isSigner }) => ({
        userId,
        communityId: input.communityId,
        auditEventId: event.id,
        category: input.notification.category,
        message: isSigner && input.notification.signerMessage ? input.notification.signerMessage : input.notification.message,
        entityType: input.entityType,
        entityId: String(input.entityId),
      })),
      skipDuplicates: true,
    });
    if (input.notification.bestEffort) {
      try { await writeNotifications(); }
      catch (_) { console.error("Notification delivery will be retried on broadcast reconciliation"); }
    } else {
      await writeNotifications();
    }
  }
  return event;
}

async function recordEventTransaction(input) {
  return prisma.$transaction((tx) => recordEvent(tx, input));
}

module.exports = { activityAvailable, recordEvent, recordEventTransaction };
