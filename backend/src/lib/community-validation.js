const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const { normalizeEmail, isValidEmail } = require("./auth-validation");

function validateName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > MAX_NAME_LENGTH) {
    return null;
  }
  return value.trim();
}

function validateJoinCode(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^DADA-[A-Z0-9]{12}$/.test(code) ? code : null;
}

function validateDescription(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > MAX_DESCRIPTION_LENGTH) {
    return null;
  }
  return value.trim();
}

function parseCommunityId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

function validateMemberEmail(value) {
  if (typeof value !== "string") return null;
  const email = normalizeEmail(value);
  return email.length <= 254 && isValidEmail(email) ? email : null;
}

function validateUserIdBody(value) {
  return Number.isInteger(value) && value > 0 && value <= 2147483647 ? value : null;
}

function validateRequiredSignatures(value) {
  return Number.isInteger(value) && value >= 2 && value <= 2147483647 ? value : null;
}

module.exports = { validateName, validateDescription, validateJoinCode, parseCommunityId, validateMemberEmail, validateUserIdBody, validateRequiredSignatures, MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH };
