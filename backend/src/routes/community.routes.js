const express = require("express");
const authenticate = require("../middleware/auth.middleware");
const { authLimiter } = require("../middleware/auth-rate-limit");
const controller = require("../controllers/community.controller");
const memberController = require("../controllers/community-members.controller");
const signerController = require("../controllers/community-signers.controller");
const publicInfoController = require("../controllers/signer-public-info.controller");
const thresholdController = require("../controllers/signing-threshold.controller");
const walletController = require("../controllers/wallet.controller");

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
router.post("/:communityId/wallet", authenticate, walletController.create);
router.get("/:communityId/wallet", authenticate, walletController.get);
router.get("/:communityId/wallet/balance", authenticate, walletController.balance);
router.get("/:communityId/wallet/utxos", authenticate, walletController.utxos);
router.get("/:communityId/wallet/transactions", authenticate, walletController.transactions);
router.get("/:communityId/wallet/transactions/:txid", authenticate, walletController.transaction);
router.post("/:communityId/wallet/spends", authenticate, walletController.createSpend);
router.get("/:communityId/wallet/spends/:spendId", authenticate, walletController.getSpend);
router.get("/:communityId/wallet/spends/:spendId/psbt", authenticate, walletController.psbt);
router.post("/:communityId/wallet/spends/:spendId/signatures", authenticate, walletController.sign);
router.post("/:communityId/wallet/spends/:spendId/broadcast", authenticate, walletController.broadcast);
router.post("/:communityId/wallet/spends/:spendId/cancel", authenticate, walletController.cancelSpend);

module.exports = router;
