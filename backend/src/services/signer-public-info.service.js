const prisma = require("../lib/prisma");

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
  return { registered: Boolean(signer.publicKey), publicKey: signer.publicKey || null };
}

async function putPublicInfo(userId, communityId, publicKey) {
  const signer = await currentSigner(userId, communityId);
  const result = await prisma.authorizedSigner.updateMany({
    where: { id: signer.id }, data: { publicKey },
  });
  if (result.count !== 1) throw new PublicInfoError(403, "Forbidden");
  return { registered: true, publicKey };
}

module.exports = { PublicInfoError, getPublicInfo, putPublicInfo };
