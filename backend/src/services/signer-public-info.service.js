const prisma = require("../lib/prisma");
const { normalizeCompressedPublicKey } = require("../lib/bitcoin-values");

class PublicInfoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function currentSigner(userId, communityId) {
  const community = await prisma.community.findUnique({
    where: { id: communityId }, select: { id: true },
  });
  if (!community) throw new PublicInfoError(404, "Community not found");
  const membership = await prisma.communityMembership.findUnique({
    where: { userId_communityId: { userId, communityId } },
    select: { authorizedSigner: { select: { id: true, publicKey: true } } },
  });
  if (!membership?.authorizedSigner) throw new PublicInfoError(403, "Forbidden");
  return membership.authorizedSigner;
}

async function getPublicInfo(userId, communityId) {
  const signer = await currentSigner(userId, communityId);
  const publicKey = normalizeCompressedPublicKey(signer.publicKey);
  return { registered: Boolean(publicKey), publicKey };
}

async function putPublicInfo(userId, communityId, publicKey) {
  const result = await prisma.$transaction(async (tx) => {
    const community = await tx.$queryRaw`SELECT "id" FROM "Community" WHERE "id" = ${communityId} FOR UPDATE`;
    if (!community.length) throw new PublicInfoError(404, "Community not found");
    if (await tx.communityWallet.findUnique({ where: { communityId }, select: { id: true } })) {
      throw new PublicInfoError(409, "Wallet signer keys are immutable; rotate to a new wallet");
    }
    const membership = await tx.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId } },
      select: { authorizedSigner: { select: { id: true } } },
    });
    if (!membership?.authorizedSigner) throw new PublicInfoError(403, "Forbidden");
    const duplicate = await tx.authorizedSigner.findFirst({
      where: {
        id: { not: membership.authorizedSigner.id },
        publicKey: { equals: publicKey, mode: "insensitive" },
        membership: { is: { communityId } },
      },
      select: { id: true },
    });
    if (duplicate) throw new PublicInfoError(409, "Public key is already registered by another signer");
    return tx.authorizedSigner.updateMany({ where: { id: membership.authorizedSigner.id }, data: { publicKey } });
  });
  if (result.count !== 1) throw new PublicInfoError(403, "Forbidden");
  return { registered: true, publicKey };
}

module.exports = { PublicInfoError, getPublicInfo, putPublicInfo };
