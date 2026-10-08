const prisma = require("../lib/prisma");

class CommunityAccessError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const membershipKey = (userId, communityId) => ({ userId_communityId: { userId, communityId } });

async function requireMembership(client, userId, communityId) {
  const community = await client.community.findUnique({ where: { id: communityId }, select: { id: true } });
  if (!community) throw new CommunityAccessError(404, "Community not found");
  const membership = await client.communityMembership.findUnique({
    where: membershipKey(userId, communityId), select: { id: true, role: true },
  });
  if (!membership) throw new CommunityAccessError(403, "Forbidden");
  return membership;
}

async function asAdmin(userId, communityId, operation) {
  return prisma.$transaction(async (tx) => {
    // Admin mutations take this lock before checking
    // permissions, so concurrent requests cannot remove the last admin or invalidate M-of-N.
    const rows = await tx.$queryRaw`SELECT "id", "requiredSignatures" FROM "Community" WHERE "id" = ${communityId} FOR UPDATE`;
    if (!rows.length) throw new CommunityAccessError(404, "Community not found");
    const requester = await tx.communityMembership.findUnique({
      where: membershipKey(userId, communityId), select: { role: true },
    });
    if (requester?.role !== "COMMUNITY_ADMIN") throw new CommunityAccessError(403, "Forbidden");
    return operation(tx, rows[0]);
  });
}

module.exports = { CommunityAccessError, membershipKey, requireMembership, asAdmin };
