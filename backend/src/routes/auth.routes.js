const express = require("express");
const authController = require("../controllers/auth.controller");
const authenticate = require("../middleware/auth.middleware");
const { authLimiter, loginLimiter, loginLockout } = require("../middleware/auth-rate-limit");

const router = express.Router();

router.use(authLimiter);

router.post("/register", authController.register);
router.post("/login", loginLimiter, loginLockout, authController.login);
router.post("/refresh", authController.refresh);
router.get("/me", authenticate, authController.me);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

module.exports = router;
