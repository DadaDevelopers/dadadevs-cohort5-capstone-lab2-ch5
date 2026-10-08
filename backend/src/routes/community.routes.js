const express = require("express");
const authenticate = require("../middleware/auth.middleware");
const { authLimiter } = require("../middleware/auth-rate-limit");
const controller = require("../controllers/community.controller");
const memberController = require("../controllers/community-members.controller");
const signerController = require("../controllers/community-signers.controller");
const publicInfoController = require("../controllers/signer-public-info.controller");
const thresholdController = require("../controllers/signing-threshold.controller");

const router = express.Router();

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
router.put("/:communityId/signers/me/public-info", authenticate, publicInfoController.put);
router.get("/:communityId/signers/me/public-info", authenticate, publicInfoController.get);
router.put("/:communityId/signing-threshold", authenticate, thresholdController.put);
router.get("/:communityId/signing-threshold", authenticate, thresholdController.get);

module.exports = router;
