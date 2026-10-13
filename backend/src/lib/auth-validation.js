const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const normalizeEmail = (email) => email.trim().toLowerCase();
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPassword = (password) =>
  typeof password === "string" && password.trim().length >= 8;

module.exports = { isNonEmptyString, normalizeEmail, isValidEmail, isValidPassword };
