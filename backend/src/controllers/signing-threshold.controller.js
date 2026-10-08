const service = require("../services/community-signers.service");
const { parseCommunityId, validateRequiredSignatures } = require("../lib/community-validation");

function failure(error, res) {
  if (error instanceof service.SignerManagementError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error("Signing threshold request failed", error);
  return res.status(500).json({ error: "Internal server error" });
}

async function put(req, res) {
  const communityId = parseCommunityId(req.params.communityId);
  const requiredSignatures = validateRequiredSignatures(req.body?.requiredSignatures);
  if (!communityId || !requiredSignatures) return res.status(400).json({ error: "Invalid signing threshold or community ID" });
  try {
    return res.status(200).json(await service.setSigningThreshold(req.userId, communityId, requiredSignatures));
  } catch (error) { return failure(error, res); }
}

async function get(req, res) {
  const communityId = parseCommunityId(req.params.communityId);
  if (!communityId) return res.status(400).json({ error: "Invalid community ID" });
  try {
    return res.status(200).json(await service.getSigningThreshold(req.userId, communityId));
  } catch (error) { return failure(error, res); }
}

module.exports = { put, get };
