const prisma = require("../lib/prisma");

class SignerManagementError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const membershipKey = (userId, communityId) => ({ userId_communityId: { userId, communityId } });
const safeUser = { id: true, firstName: true, lastName: true, email: true };

async function asAdmin(userId, communityId, operation) {
  return prisma.$transaction(async (tx) => {
    // Share the community lock used by member removal so signer selection cannot race a membership delete.
    const community = await tx.$queryRaw`SELECT "id" FROM "Community" WHERE "id" = ${communityId} FOR UPDATE`;
    if (community.length === 0) throw new SignerManagementError(404, "Community not found");
    const requester = await tx.communityMembership.findUnique({
      where: membershipKey(userId, communityId), select: { role: true },
    });
    if (requester?.role !== "COMMUNITY_ADMIN") throw new SignerManagementError(403, "Forbidden");
    return operation(tx);
  });
}

function signerResponse(signer, membership) {
  return {
    signerId: signer.id,
    userId: membership.user.id,
    firstName: membership.user.firstName,
    lastName: membership.user.lastName,
    email: membership.user.email,
    membershipRole: membership.role,
    isAuthorizedSigner: true,
    publicInfoRegistered: Boolean(signer.publicKey),
    createdAt: signer.createdAt,
  };
}

async function selectSigner(adminId, communityId, targetUserId) {
  return asAdmin(adminId, communityId, async (tx) => {
    const membership = await tx.communityMembership.findUnique({
      where: membershipKey(targetUserId, communityId),
      select: { id: true, role: true, user: { select: safeUser }, authorizedSigner: { select: { id: true } } },
    });
    if (!membership) throw new SignerManagementError(409, "User is not a member of this community");
    if (membership.authorizedSigner) throw new SignerManagementError(409, "Already an authorized signer");
    try {
      // The unique membershipId constraint is the final guard against duplicate signer selection.
      const signer = await tx.authorizedSigner.create({
        data: { membershipId: membership.id }, select: { id: true, publicKey: true, createdAt: true },
      });
      return { signer: signerResponse(signer, membership) };
    } catch (error) {
      if (error?.code === "P2002") throw new SignerManagementError(409, "Already an authorized signer");
      throw error;
    }
  });
}

async function listSigners(userId, communityId) {
  const community = await prisma.community.findUnique({ where: { id: communityId }, select: { id: true } });
  if (!community) throw new SignerManagementError(404, "Community not found");
  const requester = await prisma.communityMembership.findUnique({
    where: membershipKey(userId, communityId), select: { id: true },
  });
  if (!requester) throw new SignerManagementError(403, "Forbidden");
  const signers = await prisma.authorizedSigner.findMany({
    where: { membership: { is: { communityId } } }, orderBy: { createdAt: "asc" },
    select: { id: true, publicKey: true, createdAt: true, membership: { select: { role: true, user: { select: safeUser } } } },
  });
  return { signers: signers.map((signer) => signerResponse(signer, signer.membership)) };
}

async function removeSigner(adminId, communityId, targetUserId) {
  return asAdmin(adminId, communityId, async (tx) => {
    const membership = await tx.communityMembership.findUnique({
      where: membershipKey(targetUserId, communityId),
      select: { authorizedSigner: { select: { id: true } } },
    });
    if (!membership) throw new SignerManagementError(404, "Community member not found");
    if (!membership.authorizedSigner) throw new SignerManagementError(404, "Authorized signer not found");
    // Wallet-stage invariant: once a wallet exists, reject signer removal here before deleting.
    await tx.authorizedSigner.delete({ where: { id: membership.authorizedSigner.id } });
  });
}

module.exports = { SignerManagementError, selectSigner, listSigners, removeSigner };
