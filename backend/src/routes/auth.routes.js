const express = require("express");
const authController = require("../controllers/auth.controller");
const authenticate = require("../middleware/auth.middleware");
const limits = require("../middleware/auth-rate-limit");
const { authLimiter, loginLimiter, loginLockout } = limits;
const sessionLimiter = limits.sessionLimiter || authLimiter;
const refreshLimiter = limits.refreshLimiter || sessionLimiter;

const router = express.Router();

router.post("/register", authLimiter, authController.register);
router.post("/login", authLimiter, loginLimiter, loginLockout, authController.login);
router.post("/refresh", refreshLimiter, authController.refresh);
router.get("/me", authenticate, sessionLimiter, authController.me);
router.post("/forgot-password", authLimiter, authController.forgotPassword);
router.post("/reset-password", authLimiter, authController.resetPassword);

module.exports = router;
