const prisma = require("../lib/prisma");
const { requireMembership } = require("./community-access.service");
const { recordEvent } = require("./domain-events.service");

class ActivityError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const boundedLimit = (value) => Math.min(50, Math.max(1, Number.parseInt(value, 10) || 20));
const optionalId = (value) => {
  if (value === undefined) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ActivityError(400, "Invalid cursor");
  return id;
};

async function listAuditEvents(userId, communityId, query = {}) {
  await requireMembership(prisma, userId, communityId);
  const limit = boundedLimit(query.limit);
  const cursor = optionalId(query.cursor);
  const where = { communityId, ...(query.type ? { eventType: String(query.type) } : {}), ...(cursor ? { id: { lt: cursor } } : {}) };
  const rows = await prisma.auditEvent.findMany({
    where,
    orderBy: { id: "desc" },
    take: limit + 1,
    select: {
      id: true, eventType: true, entityType: true, entityId: true, metadata: true, createdAt: true,
      actor: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  const hasMore = rows.length > limit;
  const events = rows.slice(0, limit);
  return { events, nextCursor: hasMore ? String(events.at(-1).id) : null };
}

async function listNotifications(userId, communityId, query = {}) {
  await requireMembership(prisma, userId, communityId);
  const limit = boundedLimit(query.limit);
  const cursor = optionalId(query.cursor);
  const rows = await prisma.notification.findMany({
    where: { userId, communityId, ...(cursor ? { id: { lt: cursor } } : {}) },
    orderBy: { id: "desc" }, take: limit + 1,
    select: { id: true, category: true, message: true, entityType: true, entityId: true, createdAt: true, readAt: true },
  });
  const hasMore = rows.length > limit;
  const notifications = rows.slice(0, limit);
  return { notifications, nextCursor: hasMore ? String(notifications.at(-1).id) : null };
}

async function unreadCount(userId, communityId) {
  await requireMembership(prisma, userId, communityId);
  return { count: await prisma.notification.count({ where: { userId, communityId, readAt: null } }) };
}

async function markNotificationRead(userId, communityId, notificationId) {
  await requireMembership(prisma, userId, communityId);
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId, communityId, readAt: null }, data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.notification.findFirst({ where: { id: notificationId, userId, communityId }, select: { id: true } });
    if (!exists) throw new ActivityError(404, "Notification not found");
  }
  return { read: true };
}

async function markAllNotificationsRead(userId, communityId) {
  await requireMembership(prisma, userId, communityId);
  const result = await prisma.notification.updateMany({ where: { userId, communityId, readAt: null }, data: { readAt: new Date() } });
  return { updated: result.count };
}

function validateMessage(body) {
  if (typeof body !== "string") throw new ActivityError(400, "Message is required");
  const value = body.trim();
  if (!value || value.length > 2000) throw new ActivityError(400, "Message must be between 1 and 2000 characters");
  if (/[^\P{Cc}\t\n\r]/u.test(value)) throw new ActivityError(400, "Message contains unsupported control characters");
  return value;
}

async function requireSpendingRequest(client, communityId, spendingRequestId) {
  const spendingRequest = await client.spendingRequest.findFirst({
    where: { id: spendingRequestId, wallet: { is: { communityId } } }, select: { id: true },
  });
  if (!spendingRequest) throw new ActivityError(404, "Spending request not found");
}

async function listDiscussion(userId, communityId, spendingRequestId, query = {}) {
  await requireMembership(prisma, userId, communityId);
  await requireSpendingRequest(prisma, communityId, spendingRequestId);
  const limit = boundedLimit(query.limit);
  const cursor = optionalId(query.cursor);
  const rows = await prisma.discussionMessage.findMany({
    where: { communityId, spendingRequestId, ...(cursor ? { id: { gt: cursor } } : {}) },
    orderBy: { id: "asc" }, take: limit + 1,
    select: { id: true, body: true, createdAt: true, author: { select: { id: true, firstName: true, lastName: true } } },
  });
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit);
  return { messages, nextCursor: hasMore ? String(messages.at(-1).id) : null };
}

async function addDiscussionMessage(userId, communityId, spendingRequestId, body) {
  const message = validateMessage(body);
  return prisma.$transaction(async (tx) => {
    await requireMembership(tx, userId, communityId);
    await requireSpendingRequest(tx, communityId, spendingRequestId);
    const created = await tx.discussionMessage.create({
      data: { communityId, spendingRequestId, authorUserId: userId, body: message },
      select: { id: true, body: true, createdAt: true, author: { select: { id: true, firstName: true, lastName: true } } },
    });
    await recordEvent(tx, {
      communityId, actorUserId: userId, eventType: "DISCUSSION_MESSAGE_ADDED", entityType: "spending_request",
      entityId: spendingRequestId, metadata: { messageId: created.id },
      notification: { audience: "members", category: "discussion", message: `A new message was added to payment #${spendingRequestId}.` },
    });
    return { message: created };
  });
}

module.exports = {
  ActivityError, listAuditEvents, listNotifications, unreadCount, markNotificationRead,
  markAllNotificationsRead, listDiscussion, addDiscussionMessage, validateMessage,
};
