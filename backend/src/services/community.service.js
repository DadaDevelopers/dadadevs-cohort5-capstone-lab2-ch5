const crypto = require("node:crypto");
const prisma = require("../lib/prisma");
const { requireMembership } = require("./community-access.service");
const { recordEvent } = require("./domain-events.service");

const generateJoinCode = () => `DADA-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
const isUniqueConflict = (error) => error?.code === "P2002";
const findCommunityIdByName = async (name) => {
  const rows = await prisma.$queryRaw`
    SELECT "id" FROM "Community" WHERE lower(btrim("name")) = lower(${name}) LIMIT 1
  `;
  return rows[0]?.id ?? null;
};

class CommunityNameConflict extends Error {
  constructor() {
    super("Community name already exists");
    this.code = "COMMUNITY_NAME_CONFLICT";
  }
}

async function createCommunity(userId, name, description) {
  if (await findCommunityIdByName(name)) throw new CommunityNameConflict();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const joinCode = generateJoinCode();
    try {
      return await prisma.$transaction(async (tx) => {
        const community = await tx.community.create({
          data: { name, description, joinCode },
          select: { id: true, name: true, description: true, joinCode: true, createdAt: true },
        });
        await tx.communityMembership.create({
          data: { userId, communityId: community.id, role: "COMMUNITY_ADMIN" },
        });
        await recordEvent(tx, {
          communityId: community.id, actorUserId: userId, eventType: "COMMUNITY_CREATED",
          entityType: "community", entityId: community.id, metadata: { name: community.name },
        });
        return { id: community.id, name: community.name, description: community.description, joinCode: community.joinCode, createdAt: community.createdAt, role: "COMMUNITY_ADMIN" };
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        if (await findCommunityIdByName(name)) throw new CommunityNameConflict();
        const collision = await prisma.community.findUnique({
          where: { joinCode }, select: { id: true },
        });
        if (collision) continue;
      }
      throw error;
    }
  }
  throw new Error("Unable to generate a unique join code");
}

async function joinCommunity(userId, joinCode) {
  const community = await prisma.community.findUnique({
    where: { joinCode }, select: { id: true, name: true },
  });
  if (!community) return null;
  const existing = await prisma.communityMembership.findUnique({
    where: { userId_communityId: { userId, communityId: community.id } }, select: { id: true },
  });
  if (existing) return { conflict: true };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.communityMembership.create({ data: { userId, communityId: community.id, role: "COMMUNITY_MEMBER" } });
      await recordEvent(tx, {
        communityId: community.id, actorUserId: userId, eventType: "MEMBER_JOINED",
        entityType: "member", entityId: userId, notification: {
          audience: "admins", category: "membership", message: "A member joined the community.",
        },
      });
    });
  } catch (error) {
    // Prisma's PostgreSQL adapter may omit meta.target on this compound unique constraint.
    if (isUniqueConflict(error)) {
      return { conflict: true };
    }
    throw error;
  }
  return { community: { id: community.id, name: community.name, role: "COMMUNITY_MEMBER" } };
}

function setupStageFor(community) {
  const signers = (community.memberships || []).flatMap(({ authorizedSigner }) => authorizedSigner ? [authorizedSigner] : []);
  return community.wallet?.status === "READY"
    ? "active"
    : community.wallet
      ? "review"
      : signers.length === 0
        ? "members"
        : community.requiredSignatures === null || community.requiredSignatures === undefined
          ? "rule"
          : signers.some(({ publicKey }) => !publicKey)
            ? "signers"
            : "review";
}

async function listCommunities(userId) {
  const memberships = await prisma.communityMembership.findMany({
    where: { userId }, orderBy: { createdAt: "desc" },
    select: { role: true, community: { select: {
      id: true, name: true, description: true, requiredSignatures: true,
      wallet: { select: { status: true } },
      memberships: { select: { authorizedSigner: { select: { publicKey: true } } } },
    } } },
  });
  return memberships.map(({ role, community }) => {
    return { id: community.id, name: community.name, description: community.description, role, setupStage: setupStageFor(community) };
  });
}

async function getCommunity(userId, communityId) {
  const community = await prisma.community.findUnique({
    where: { id: communityId }, select: { id: true, name: true, description: true, joinCode: true, createdAt: true },
  });
  if (!community) return { missing: true };
  const membership = await prisma.communityMembership.findUnique({
    where: { userId_communityId: { userId, communityId } }, select: { role: true },
  });
  if (!membership) return { forbidden: true };
  return { community: {
    id: community.id, name: community.name, description: community.description, createdAt: community.createdAt, role: membership.role,
    ...(membership.role === "COMMUNITY_ADMIN" ? { joinCode: community.joinCode } : {}),
  } };
}

async function getCommunityByName(userId, name) {
  const id = await findCommunityIdByName(name);
  return id ? getCommunity(userId, id) : { missing: true };
}

async function listMembers(userId, communityId) {
  await requireMembership(prisma, userId, communityId);
  const memberships = await prisma.communityMembership.findMany({
    where: { communityId }, orderBy: { createdAt: "asc" },
    select: { role: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  return { members: memberships.map(({ role, user }) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role })) };
}

module.exports = { createCommunity, joinCommunity, listCommunities, getCommunity, getCommunityByName, listMembers, setupStageFor };
