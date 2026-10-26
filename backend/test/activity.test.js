const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";

const memberships = [
  { id: 1, userId: 1, communityId: 1, role: "COMMUNITY_ADMIN" },
  { id: 2, userId: 2, communityId: 1, role: "COMMUNITY_MEMBER" },
  { id: 3, userId: 3, communityId: 2, role: "COMMUNITY_ADMIN" },
];
const auditEvents = [
  { id: 2, communityId: 1, actorUserId: 1, eventType: "MEMBER_ADDED", entityType: "member", entityId: "2", metadata: null, createdAt: new Date("2026-01-02"), actor: { id: 1, firstName: "Admin", lastName: "One" } },
  { id: 1, communityId: 2, actorUserId: 3, eventType: "COMMUNITY_CREATED", entityType: "community", entityId: "2", metadata: null, createdAt: new Date("2026-01-01"), actor: { id: 3, firstName: "Other", lastName: "Admin" } },
];
const notifications = [
  { id: 1, userId: 1, communityId: 1, auditEventId: 2, category: "membership", message: "Member added", entityType: "member", entityId: "2", createdAt: new Date("2026-01-02"), readAt: null },
];
const messages = [];
let nextAuditId = 3;
let nextNotificationId = 2;
let nextMessageId = 1;

const project = (value, select) => select ? Object.fromEntries(Object.keys(select).map((key) => [key, value[key]])) : value;
const prisma = {
  community: { async findUnique({ where }) { return [1, 2].includes(where.id) ? { id: where.id } : null; } },
  communityMembership: {
    async findUnique({ where }) { const row = memberships.find((item) => item.userId === where.userId_communityId.userId && item.communityId === where.userId_communityId.communityId); return row || null; },
    async findMany({ where }) { return memberships.filter((item) => item.communityId === where.communityId && (!where.role || item.role === where.role)).map(({ userId }) => ({ userId })); },
  },
  auditEvent: {
    async findMany({ where, take }) { return auditEvents.filter((item) => item.communityId === where.communityId && (!where.eventType || item.eventType === where.eventType) && (!where.id || item.id < where.id.lt)).sort((a, b) => b.id - a.id).slice(0, take); },
    async create({ data }) { const actor = memberships.some((item) => item.userId === data.actorUserId) ? { id: data.actorUserId, firstName: "Member", lastName: String(data.actorUserId) } : null; const row = { id: nextAuditId++, createdAt: new Date(), ...data, metadata: data.metadata ?? null, actor }; auditEvents.push(row); return row; },
    async upsert({ where, create }) { const existing = auditEvents.find((item) => item.dedupeKey === where.dedupeKey); return existing || this.create({ data: create }); },
  },
  notification: {
    async createMany({ data }) { for (const value of data) if (!notifications.some((item) => item.auditEventId === value.auditEventId && item.userId === value.userId)) notifications.push({ id: nextNotificationId++, createdAt: new Date(), readAt: null, ...value }); return { count: data.length }; },
    async findMany({ where, take }) { return notifications.filter((item) => item.userId === where.userId && item.communityId === where.communityId && (!where.id || item.id < where.id.lt)).sort((a, b) => b.id - a.id).slice(0, take); },
    async count({ where }) { return notifications.filter((item) => item.userId === where.userId && item.communityId === where.communityId && item.readAt === null).length; },
    async updateMany({ where, data }) { const found = notifications.filter((item) => item.userId === where.userId && item.communityId === where.communityId && (!where.id || item.id === where.id) && (where.readAt !== null || item.readAt === null)); found.forEach((item) => Object.assign(item, data)); return { count: found.length }; },
    async findFirst({ where }) { return notifications.find((item) => item.id === where.id && item.userId === where.userId && item.communityId === where.communityId) || null; },
  },
  spendingRequest: { async findFirst({ where }) { return where.id === 10 && where.wallet.is.communityId === 1 ? { id: 10 } : null; } },
  discussionMessage: {
    async create({ data, select }) { const row = { id: nextMessageId++, createdAt: new Date(), ...data, author: { id: data.authorUserId, firstName: "Member", lastName: String(data.authorUserId) } }; messages.push(row); return project(row, select); },
    async findMany({ where, take }) { return messages.filter((item) => item.communityId === where.communityId && item.spendingRequestId === where.spendingRequestId && (!where.id || item.id > where.id.gt)).sort((a, b) => a.id - b.id).slice(0, take); },
  },
  async $transaction(callback) { return callback(prisma); },
};

const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
const service = require("../src/services/activity.service");
const { recordEvent } = require("../src/services/domain-events.service");

test("audit and notification reads are scoped to membership, community, and user", async () => {
  const audit = await service.listAuditEvents(1, 1, { limit: 1 });
  assert.deepEqual(audit.events.map((item) => item.id), [2]);
  assert.equal(audit.events.some((item) => item.communityId === 2), false);
  await assert.rejects(() => service.listAuditEvents(3, 1), (error) => error.status === 403);

  const inbox = await service.listNotifications(1, 1);
  assert.deepEqual(inbox.notifications.map((item) => item.id), [1]);
  await assert.rejects(() => service.markNotificationRead(2, 1, 1), (error) => error.status === 404);
  assert.equal(notifications[0].readAt, null);
  assert.deepEqual(await service.unreadCount(1, 1), { count: 1 });
  await service.markAllNotificationsRead(1, 1);
  assert.equal((await service.unreadCount(1, 1)).count, 0);
});

test("discussion writes plain text atomically and notifies other community members", async () => {
  const body = '<img src=x onerror="alert(1)"> Please verify.';
  const result = await service.addDiscussionMessage(2, 1, 10, body);
  assert.equal(result.message.body, body);
  assert.equal(auditEvents.at(-1).eventType, "DISCUSSION_MESSAGE_ADDED");
  assert.equal(auditEvents.at(-1).actorUserId, 2);
  assert.equal(notifications.at(-1).userId, 1);
  assert.equal(notifications.some((item) => item.auditEventId === auditEvents.at(-1).id && item.userId === 2), false);
  const discussion = await service.listDiscussion(1, 1, 10, { limit: 20 });
  assert.deepEqual(discussion.messages.map((item) => item.id), [1]);
  const successfulEventCount = auditEvents.length;
  await assert.rejects(() => service.addDiscussionMessage(3, 1, 10, "cross-community"), (error) => error.status === 403);
  await assert.rejects(() => service.addDiscussionMessage(1, 1, 10, "\u0000invalid"), (error) => error.status === 400);
  assert.equal(messages.length, 1);
  assert.equal(auditEvents.length, successfulEventCount);
});

test("optional broadcast notification failure does not discard its audit event", async () => {
  const original = prisma.notification.createMany;
  const originalError = console.error;
  prisma.notification.createMany = async () => { throw new Error("notification store unavailable"); };
  console.error = () => {};
  const before = auditEvents.length;
  try {
    await recordEvent(prisma, {
      communityId: 1, actorUserId: 1, eventType: "SPENDING_REQUEST_BROADCAST", entityType: "spending_request", entityId: 11,
      dedupeKey: "spend-broadcast:11", notification: { audience: "members", category: "payment", message: "Broadcast", bestEffort: true },
    });
  } finally {
    prisma.notification.createMany = original;
    console.error = originalError;
  }
  assert.equal(auditEvents.length, before + 1);
  assert.equal(auditEvents.at(-1).eventType, "SPENDING_REQUEST_BROADCAST");
});

test("dedupe keys make retryable domain events and notifications idempotent", async () => {
  const beforeEvents = auditEvents.length;
  const beforeNotifications = notifications.length;
  const event = { communityId: 1, actorUserId: 1, eventType: "PAYMENT_CONFIRMED", entityType: "spending_request", entityId: 10, dedupeKey: "confirmed:1:abc", notification: { audience: "members", category: "payment", message: "Confirmed" } };
  await recordEvent(prisma, event);
  await recordEvent(prisma, event);
  assert.equal(auditEvents.length, beforeEvents + 1);
  assert.equal(notifications.length, beforeNotifications + 1);
  assert.equal(notifications.at(-1).userId, 2);
});
