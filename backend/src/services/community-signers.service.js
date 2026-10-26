const prisma = require("../lib/prisma");
const { normalizeCompressedPublicKey } = require("../lib/bitcoin-values");

const { CommunityAccessError: SignerManagementError, membershipKey, requireMembership, asAdmin } = require("./community-access.service");
const { recordEvent } = require("./domain-events.service");
const safeUser = { id: true, firstName: true, lastName: true, email: true };

const authorizedSignerCount = (client, communityId) => client.authorizedSigner.count({
  where: { membership: { is: { communityId } } },
});

function signerResponse(signer, membership) {
  return {
    signerId: signer.id,
    userId: membership.user.id,
    firstName: membership.user.firstName,
    lastName: membership.user.lastName,
    email: membership.user.email,
    membershipRole: membership.role,
    isAuthorizedSigner: true,
    publicInfoRegistered: Boolean(normalizeCompressedPublicKey(signer.publicKey)),
    createdAt: signer.createdAt,
  };
}

async function selectSigner(adminId, communityId, targetUserId) {
  return asAdmin(adminId, communityId, async (tx) => {
    if (await tx.communityWallet.findUnique({ where: { communityId }, select: { id: true } })) {
      throw new SignerManagementError(409, "Wallet signer configuration is immutable; rotate to a new wallet");
    }
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
      await recordEvent(tx, {
        communityId, actorUserId: adminId, eventType: "SIGNER_SELECTED", entityType: "signer", entityId: signer.id,
        metadata: { userId: targetUserId }, notification: { userIds: [targetUserId], excludeActor: false, category: "signer", message: "You were selected as an authorized signer." },
      });
      return { signer: signerResponse(signer, membership) };
    } catch (error) {
      if (error?.code === "P2002") throw new SignerManagementError(409, "Already an authorized signer");
      throw error;
    }
  });
}

async function listSigners(userId, communityId) {
  await requireMembership(prisma, userId, communityId);
  const signers = await prisma.authorizedSigner.findMany({
    where: { membership: { is: { communityId } } }, orderBy: { createdAt: "asc" },
    select: { id: true, publicKey: true, createdAt: true, membership: { select: { role: true, user: { select: safeUser } } } },
  });
  return { signers: signers.map((signer) => signerResponse(signer, signer.membership)) };
}

async function removeSigner(adminId, communityId, targetUserId) {
  return asAdmin(adminId, communityId, async (tx, community) => {
    if (await tx.communityWallet.findUnique({ where: { communityId }, select: { id: true } })) {
      throw new SignerManagementError(409, "Wallet signer configuration is immutable; rotate to a new wallet");
    }
    const membership = await tx.communityMembership.findUnique({
      where: membershipKey(targetUserId, communityId),
      select: { authorizedSigner: { select: { id: true } } },
    });
    if (!membership) throw new SignerManagementError(404, "Community member not found");
    if (!membership.authorizedSigner) throw new SignerManagementError(404, "Authorized signer not found");
    if (community.requiredSignatures !== null) {
      const count = await authorizedSignerCount(tx, communityId);
      // Do not remove a signer if the configured threshold would become impossible to satisfy.
      if (community.requiredSignatures > count - 1) {
        throw new SignerManagementError(409, "Lower the signing threshold before removing this signer");
      }
    }
    await tx.authorizedSigner.delete({ where: { id: membership.authorizedSigner.id } });
    await recordEvent(tx, {
      communityId, actorUserId: adminId, eventType: "SIGNER_REMOVED", entityType: "member", entityId: targetUserId,
      notification: { userIds: [targetUserId], excludeActor: false, category: "signer", message: "Your signer authorization was removed." },
    });
  });
}

async function setSigningThreshold(adminId, communityId, requiredSignatures) {
  return asAdmin(adminId, communityId, async (tx) => {
    if (await tx.communityWallet.findUnique({ where: { communityId }, select: { id: true } })) {
      throw new SignerManagementError(409, "Wallet signing threshold is immutable; rotate to a new wallet");
    }
    const count = await authorizedSignerCount(tx, communityId);
    if (count < 2) throw new SignerManagementError(409, "At least two authorized signers are required");
    if (requiredSignatures > count) {
      throw new SignerManagementError(409, "Signing threshold exceeds authorized signer count");
    }
    await tx.community.update({ where: { id: communityId }, data: { requiredSignatures } });
    await recordEvent(tx, {
      communityId, actorUserId: adminId, eventType: "SIGNING_THRESHOLD_CHANGED", entityType: "community", entityId: communityId,
      metadata: { requiredSignatures, authorizedSignerCount: count },
      notification: { audience: "members", category: "governance", message: `The signing threshold is now ${requiredSignatures} of ${count}.` },
    });
    return { requiredSignatures, authorizedSignerCount: count };
  });
}

async function getSigningThreshold(userId, communityId) {
  // Read M and N from one snapshot, even if an admin changes them during this request.
  return prisma.$transaction(async (tx) => {
    const community = await tx.community.findUnique({
      where: { id: communityId }, select: { requiredSignatures: true },
    });
    if (!community) throw new SignerManagementError(404, "Community not found");
    const membership = await tx.communityMembership.findUnique({
      where: membershipKey(userId, communityId), select: { id: true },
    });
    if (!membership) throw new SignerManagementError(403, "Forbidden");
    return {
      requiredSignatures: community.requiredSignatures,
      authorizedSignerCount: await authorizedSignerCount(tx, communityId),
    };
  }, { isolationLevel: "RepeatableRead" });
}

module.exports = { SignerManagementError, selectSigner, listSigners, removeSigner, setSigningThreshold, getSigningThreshold };
