const express = require("express");
const authController = require("../controllers/auth.controller");
const authenticate = require("../middleware/auth.middleware");
const { authLimiter, loginLimiter, loginLockout } = require("../middleware/auth-rate-limit");

const router = express.Router();

router.use(authLimiter);

// Registration creates a global user account, independent of community membership.
router.post("/register", authController.register);
// Login applies both the request limit and failed-attempt lockout before issuing tokens.
router.post("/login", loginLimiter, loginLockout, authController.login);
// Refresh exchanges a valid refresh token for a new access token.
router.post("/refresh", authController.refresh);
// The current-user endpoint requires an access token.
router.get("/me", authenticate, authController.me);
// Password reset requests always use the controller's generic acknowledgement.
router.post("/forgot-password", authController.forgotPassword);
// Reset validates and consumes the reset token in the auth controller.
router.post("/reset-password", authController.resetPassword);

module.exports = router;
