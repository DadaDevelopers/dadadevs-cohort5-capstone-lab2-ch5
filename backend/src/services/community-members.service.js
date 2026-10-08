const prisma = require("../lib/prisma");

class MemberManagementError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const membershipKey = (userId, communityId) => ({ userId_communityId: { userId, communityId } });

async function asAdmin(userId, communityId, operation) {
  return prisma.$transaction(async (tx) => {
    // Serialize admin mutations so concurrent demotions/removals cannot leave zero admins.
    const community = await tx.$queryRaw`SELECT "id" FROM "Community" WHERE "id" = ${communityId} FOR UPDATE`;
    if (community.length === 0) throw new MemberManagementError(404, "Community not found");
    const requester = await tx.communityMembership.findUnique({
      where: membershipKey(userId, communityId), select: { role: true },
    });
    if (requester?.role !== "COMMUNITY_ADMIN") throw new MemberManagementError(403, "Forbidden");
    return operation(tx);
  });
}

async function addMember(adminId, communityId, email) {
  return asAdmin(adminId, communityId, async (tx) => {
    const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new MemberManagementError(404, "User not found");
    const key = membershipKey(user.id, communityId);
    if (await tx.communityMembership.findUnique({ where: key, select: { id: true } })) {
      throw new MemberManagementError(409, "Already a member of this community");
    }
    try {
      const membership = await tx.communityMembership.create({
        data: { userId: user.id, communityId, role: "COMMUNITY_MEMBER" },
        select: { userId: true, communityId: true, role: true },
      });
      return { member: membership };
    } catch (error) {
      if (error?.code === "P2002") throw new MemberManagementError(409, "Already a member of this community");
      throw error;
    }
  });
}

async function requireTarget(tx, communityId, targetUserId, lock = false) {
  if (lock) {
    // This row lock also prevents an AuthorizedSigner FK insert between the check and delete.
    const rows = await tx.$queryRaw`
      SELECT "id" FROM "CommunityMembership"
      WHERE "communityId" = ${communityId} AND "userId" = ${targetUserId} FOR UPDATE
    `;
    if (rows.length === 0) throw new MemberManagementError(404, "Community member not found");
  }
  const target = await tx.communityMembership.findUnique({
    where: membershipKey(targetUserId, communityId),
    select: { id: true, role: true, authorizedSigner: { select: { id: true } } },
  });
  if (!target) throw new MemberManagementError(404, "Community member not found");
  return target;
}

async function requireAnotherAdmin(tx, communityId) {
  const count = await tx.communityMembership.count({
    where: { communityId, role: "COMMUNITY_ADMIN" },
  });
  if (count <= 1) throw new MemberManagementError(409, "Community must retain an admin");
}

async function changeRole(adminId, communityId, targetUserId, role) {
  return asAdmin(adminId, communityId, async (tx) => {
    const target = await requireTarget(tx, communityId, targetUserId);
    if (target.role === "COMMUNITY_ADMIN" && role === "COMMUNITY_MEMBER") {
      await requireAnotherAdmin(tx, communityId);
    }
    if (target.role !== role) {
      await tx.communityMembership.update({ where: { id: target.id }, data: { role } });
    }
    return { member: { userId: targetUserId, communityId, role } };
  });
}

async function removeMember(adminId, communityId, targetUserId) {
  return asAdmin(adminId, communityId, async (tx) => {
    const target = await requireTarget(tx, communityId, targetUserId, true);
    if (target.authorizedSigner) {
      throw new MemberManagementError(409, "Remove signer authority before removing this member");
    }
    if (target.role === "COMMUNITY_ADMIN") await requireAnotherAdmin(tx, communityId);
    await tx.communityMembership.delete({ where: { id: target.id } });
  });
}

module.exports = { MemberManagementError, addMember, changeRole, removeMember };
