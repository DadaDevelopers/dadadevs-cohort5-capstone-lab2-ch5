const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const { createAccessToken, createRefreshToken } = require("../lib/auth-tokens");
const { isNonEmptyString, normalizeEmail, isValidEmail, isValidPassword } = require("../lib/auth-validation");
const { recordLoginFailure, clearLoginFailures } = require("../middleware/auth-rate-limit");

const RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const safeUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  createdAt: true,
  updatedAt: true,
};
const resetTokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");

function logDevelopmentResetToken(token) {
  if (process.env.NODE_ENV === "development") {
    console.log(`Development password reset token: ${token}`);
  }
}

async function register(req, res) {
  const { firstName, lastName, email, password } = req.body || {};
  if (![firstName, lastName, email, password].every(isNonEmptyString)) {
    return res.status(400).json({ error: "All fields are required" });
  }
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: "Invalid email" });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existingUser) {
      return res.status(409).json({ error: "Email already registered" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        passwordHash,
      },
      select: safeUserSelect,
    });
    return res.status(201).json({ user });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Email already registered" });
    }
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
    const user = await prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: { ...safeUserSelect, passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      recordLoginFailure(req, email);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    clearLoginFailures(req, email);
    const token = createAccessToken(user.id);
    const refreshToken = createRefreshToken(user.id);
    const { passwordHash, ...safeUser } = user;
    return res.status(200).json({ token, refreshToken, user: safeUser });
  } catch (error) {
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
    payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (payload.type !== "refresh" || !Number.isInteger(payload.userId) || payload.userId < 1) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true } });
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    return res.status(200).json({ token: createAccessToken(user.id) });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function me(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: safeUserSelect,
    });
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    return res.status(200).json({ user });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function forgotPassword(req, res) {
  const email = req.body?.email;
  if (!isNonEmptyString(email) || !isValidEmail(normalizeEmail(email))) {
    return res.status(400).json({ error: "Invalid email" });
  }
  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: { id: true },
    });
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: resetTokenHash(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
        },
      });
      logDevelopmentResetToken(token);
    }
    return res.status(200).json({ message: "If the email exists, the reset request was accepted" });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function resetPassword(req, res) {
  const { token, newPassword } = req.body || {};
  if (!isNonEmptyString(token) || !isValidPassword(newPassword)) {
    return res.status(400).json({ error: "Valid token and password of at least 8 characters are required" });
  }
  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const consumed = await prisma.$transaction(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({
        where: { tokenHash: resetTokenHash(token) },
        select: { id: true, userId: true },
      });
      if (!record) return false;
      const update = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (update.count !== 1) return false;
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      return true;
    });
    if (!consumed) return res.status(401).json({ error: "Invalid or expired reset token" });
    return res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { register, login, refresh, me, forgotPassword, resetPassword };
