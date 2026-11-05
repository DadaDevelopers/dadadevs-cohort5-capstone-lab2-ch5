const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");

const safeUserSelect = {
  id: true, firstName: true, lastName: true, email: true, createdAt: true, updatedAt: true,
};
const resetTokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");

async function register(firstName, lastName, email, password) {
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return null;
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    return await prisma.user.create({
      data: { firstName, lastName, email, passwordHash }, select: safeUserSelect,
    });
  } catch (error) {
    if (error?.code === "P2002") return null;
    throw error;
  }
}

async function login(email, password) {
  const user = await prisma.user.findUnique({
    where: { email }, select: { ...safeUserSelect, passwordHash: true },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

const findUser = (id) => prisma.user.findUnique({ where: { id }, select: safeUserSelect });
const userExists = async (id) => Boolean(await prisma.user.findUnique({ where: { id }, select: { id: true } }));

async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: resetTokenHash(token), expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
  });
  // Deliver the token privately when email delivery is added; never log it.
}

async function resetPassword(token, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  return prisma.$transaction(async (tx) => {
    const record = await tx.passwordResetToken.findUnique({
      where: { tokenHash: resetTokenHash(token) }, select: { id: true, userId: true },
    });
    if (!record) return false;
    // Only one request can consume an unexpired token and change the password.
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) return false;
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    return true;
  });
}

module.exports = { register, login, findUser, userExists, requestPasswordReset, resetPassword };
