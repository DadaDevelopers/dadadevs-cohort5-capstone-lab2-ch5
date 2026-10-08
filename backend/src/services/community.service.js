const crypto = require("node:crypto");
const prisma = require("../lib/prisma");

const code = () => `DADA-${crypto.randomBytes(9).toString("hex").slice(0, 12).toUpperCase()}`;
const isUniqueConflict = (error) => error?.code === "P2002";
const conflictsOn = (error, field) => {
  const target = error?.meta?.target;
  return Array.isArray(target) ? target.includes(field) : typeof target === "string" && target.includes(field);
};
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
    const joinCode = code();
    try {
      return await prisma.$transaction(async (tx) => {
        const community = await tx.community.create({
          data: { name, description, joinCode },
          select: { id: true, name: true, description: true, joinCode: true, createdAt: true },
        });
        await tx.communityMembership.create({
          data: { userId, communityId: community.id, role: "COMMUNITY_ADMIN" },
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
    await prisma.communityMembership.create({
      data: { userId, communityId: community.id, role: "COMMUNITY_MEMBER" },
    });
  } catch (error) {
    if (isUniqueConflict(error) && (conflictsOn(error, "userId") || conflictsOn(error, "communityId"))) {
      return { conflict: true };
    }
    throw error;
  }
  return { community: { id: community.id, name: community.name, role: "COMMUNITY_MEMBER" } };
}

async function listCommunities(userId) {
  const memberships = await prisma.communityMembership.findMany({
    where: { userId }, orderBy: { createdAt: "desc" },
    select: { role: true, community: { select: { id: true, name: true, description: true } } },
  });
  return memberships.map(({ role, community }) => ({ id: community.id, name: community.name, description: community.description, role }));
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
  const access = await getCommunity(userId, communityId);
  if (!access.community) return access;
  const memberships = await prisma.communityMembership.findMany({
    where: { communityId }, orderBy: { createdAt: "asc" },
    select: { role: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  return { members: memberships.map(({ role, user }) => ({ id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role })) };
}

module.exports = { createCommunity, joinCommunity, listCommunities, getCommunity, getCommunityByName, listMembers };
