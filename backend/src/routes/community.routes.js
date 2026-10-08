const express = require("express");
const authenticate = require("../middleware/auth.middleware");
const {
  requireCommunityMembership,
  requireCommunityRole,
  requireAuthorizedSigner,
} = require("../middleware/community-authorization.middleware");
const { authLimiter } = require("../middleware/auth-rate-limit");
const controller = require("../controllers/community.controller");
const memberController = require("../controllers/community-members.controller");
const signerController = require("../controllers/community-signers.controller");

const router = express.Router();

// Preserve the existing community route rate limit.
router.use(authLimiter);

router.post("/", authenticate, controller.create);
router.post("/join", authenticate, controller.join);
router.get("/", authenticate, controller.list);
router.get("/:identifier", authenticate, controller.get);
router.get("/:communityId/members", authenticate, controller.members);
router.post("/:communityId/members", authenticate, memberController.add);
router.patch("/:communityId/members/:userId/role", authenticate, memberController.changeRole);
router.delete("/:communityId/members/:userId", authenticate, memberController.remove);
router.post("/:communityId/signers", authenticate, signerController.select);
router.get("/:communityId/signers", authenticate, signerController.list);
router.delete("/:communityId/signers/:userId", authenticate, signerController.remove);

// A valid access token and current membership are both required.
router.get("/:communityId/test/member", authenticate, requireCommunityMembership, (req, res) => {
  res.status(200).json({ message: "Community membership confirmed" });
});
// The role check rejects members whose role is not COMMUNITY_ADMIN.
router.get("/:communityId/test/admin", authenticate, requireCommunityRole("COMMUNITY_ADMIN"), (req, res) => {
  res.status(200).json({ message: "Community admin access granted" });
});
// Signer access depends on the membership's linked AuthorizedSigner record.
router.get("/:communityId/test/signer", authenticate, requireAuthorizedSigner(), (req, res) => {
  res.status(200).json({ message: "Authorized signer access granted" });
});

module.exports = router;
