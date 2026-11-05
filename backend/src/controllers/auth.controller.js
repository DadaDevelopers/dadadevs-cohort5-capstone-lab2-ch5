const service = require("../services/auth.service");
const logError = require("../lib/log-error");
const jwt = require("jsonwebtoken");
const { createAccessToken, createRefreshToken } = require("../lib/auth-tokens");
const { isNonEmptyString, normalizeEmail, isValidEmail, isValidPassword } = require("../lib/auth-validation");
const { recordLoginFailure, clearLoginFailures } = require("../middleware/auth-rate-limit");

async function register(req, res) {
  const { firstName, lastName, email, password } = req.body || {};
  if (![firstName, lastName, email, password].every(isNonEmptyString)) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (firstName.trim().length > 100 || lastName.trim().length > 100) return res.status(400).json({ error: "Names must be at most 100 characters" });
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: "Invalid email" });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "Password must be at least 8 characters and at most 72 UTF-8 bytes" });
  }

  try {
    const user = await service.register(firstName.trim(), lastName.trim(), normalizedEmail, password);
    if (!user) return res.status(409).json({ error: "Email already registered" });
    return res.status(201).json({ user });
  } catch (error) {
    logError("Authentication request failed", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (!isValidEmail(normalizeEmail(email))) {
    return res.status(400).json({ error: "Invalid email" });
  }
  try {
    // bcrypt ignores bytes after 72; longer input must not match a shorter password.
    const user = Buffer.byteLength(password, "utf8") <= 72
      ? await service.login(normalizeEmail(email), password) : null;
    if (!user) {
      recordLoginFailure(req, email);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    clearLoginFailures(req, email);
    const token = createAccessToken(user.id);
    const refreshToken = createRefreshToken(user.id);
    return res.status(200).json({ token, refreshToken, user });
  } catch (error) {
    logError("Authentication request failed", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function refresh(req, res) {
  const refreshToken = req.body?.refreshToken;
  if (!isNonEmptyString(refreshToken)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, { algorithms: ["HS256"] });
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (payload.type !== "refresh" || !Number.isInteger(payload.userId) || payload.userId < 1 || payload.userId > 2147483647) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const exists = await service.userExists(payload.userId);
    if (!exists) return res.status(401).json({ error: "Unauthorized" });
    return res.status(200).json({ token: createAccessToken(payload.userId) });
  } catch (error) {
    logError("Authentication request failed", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function me(req, res) {
  try {
    const user = await service.findUser(req.userId);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    return res.status(200).json({ user });
  } catch (error) {
    logError("Authentication request failed", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function forgotPassword(req, res) {
  const email = req.body?.email;
  if (!isNonEmptyString(email) || !isValidEmail(normalizeEmail(email))) {
    return res.status(400).json({ error: "Invalid email" });
  }
  try {
    await service.requestPasswordReset(normalizeEmail(email));
    return res.status(200).json({ message: "If the email exists, the reset request was accepted" });
  } catch (error) {
    logError("Authentication request failed", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function resetPassword(req, res) {
  const { token, newPassword } = req.body || {};
  if (!isNonEmptyString(token) || token.length > 256 || !isValidPassword(newPassword)) {
    return res.status(400).json({ error: "Valid token and password of at least 8 characters and at most 72 UTF-8 bytes are required" });
  }
  try {
    const consumed = await service.resetPassword(token, newPassword);
    if (!consumed) return res.status(401).json({ error: "Invalid or expired reset token" });
    return res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    logError("Authentication request failed", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { register, login, refresh, me, forgotPassword, resetPassword };
