const service = require("../services/signer-public-info.service");
const { parseCommunityId } = require("../lib/community-validation");
const { validatePublicInfo } = require("../lib/signer-public-info-validation");

function failure(error, res) {
  if (error instanceof service.PublicInfoError) return res.status(error.status).json({ error: error.message });
  // Prisma diagnostics may contain query values; log only a safe error identifier.
  console.error("Signer public info request failed", error?.code || error?.name || "unknown");
  return res.status(500).json({ error: "Internal server error" });
}

async function put(req, res) {
  const communityId = parseCommunityId(req.params.communityId);
  if (!communityId) return res.status(400).json({ error: "Invalid community ID" });
  const parsed = validatePublicInfo(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    return res.status(200).json(await service.putPublicInfo(req.userId, communityId, parsed.publicKey));
  } catch (error) { return failure(error, res); }
}

async function get(req, res) {
  const communityId = parseCommunityId(req.params.communityId);
  if (!communityId) return res.status(400).json({ error: "Invalid community ID" });
  try {
    return res.status(200).json(await service.getPublicInfo(req.userId, communityId));
  } catch (error) { return failure(error, res); }
}

module.exports = { put, get };
