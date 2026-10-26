const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const normalizeEmail = (email) => email.trim().toLowerCase();
const isValidEmail = (email) => typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPassword = (password) =>
  typeof password === "string" && password.trim().length >= 8 && Buffer.byteLength(password, "utf8") <= 72;

module.exports = { isNonEmptyString, normalizeEmail, isValidEmail, isValidPassword };
