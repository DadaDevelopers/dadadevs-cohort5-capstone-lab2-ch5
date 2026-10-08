const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

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

module.exports = { validateName, validateDescription, validateJoinCode, parseCommunityId, MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH };
