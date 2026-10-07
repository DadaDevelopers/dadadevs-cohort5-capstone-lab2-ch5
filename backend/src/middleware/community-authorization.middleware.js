const prisma = require("../lib/prisma");

function authorizeCommunity(isAllowed) {
  return async (req, res, next) => {
    if (!Number.isInteger(req.user?.id)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const communityIdText = req.params.communityId;
    const communityId = Number(communityIdText);
    if (!/^\d+$/.test(communityIdText) || !Number.isSafeInteger(communityId) || communityId < 1) {
      return res.status(403).json({ error: "Forbidden" });
    }

    try {
      const membership = await prisma.communityMembership.findUnique({
        where: { userId_communityId: { userId: req.user.id, communityId } },
        select: { id: true, role: true, authorizedSigner: { select: { id: true } } },
      });
      if (!membership || !isAllowed(membership)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      req.communityMembership = membership;
      return next();
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}

const requireCommunityMembership = authorizeCommunity(() => true);
const requireCommunityRole = (...roles) =>
  authorizeCommunity((membership) => roles.includes(membership.role));
const requireAuthorizedSigner = () =>
  authorizeCommunity((membership) => membership.authorizedSigner !== null);

module.exports = {
  requireCommunityMembership,
  requireCommunityRole,
  requireAuthorizedSigner,
};
