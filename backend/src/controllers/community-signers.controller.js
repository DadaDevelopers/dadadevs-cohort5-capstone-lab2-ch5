const logError = require("../lib/log-error");
const service = require("../services/community-signers.service");
const { parseCommunityId, validateUserIdBody } = require("../lib/community-validation");

function failure(error, res) {
  if (error instanceof service.SignerManagementError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error?.code === "P2002") return res.status(409).json({ error: "Already an authorized signer" });
  if (error?.code === "P2025") return res.status(404).json({ error: "Authorized signer not found" });
  logError("Community signer request failed", error);
  return res.status(500).json({ error: "Internal server error" });
}

async function select(req, res) {
  const communityId = parseCommunityId(req.params.communityId);
  const userId = validateUserIdBody(req.body?.userId);
  if (!communityId || !userId) return res.status(400).json({ error: "Invalid community or user ID" });
  try {
    return res.status(201).json(await service.selectSigner(req.userId, communityId, userId));
  } catch (error) { return failure(error, res); }
}

async function list(req, res) {
  const communityId = parseCommunityId(req.params.communityId);
  if (!communityId) return res.status(400).json({ error: "Invalid community ID" });
  try {
    return res.status(200).json(await service.listSigners(req.userId, communityId));
  } catch (error) { return failure(error, res); }
}

async function remove(req, res) {
  const communityId = parseCommunityId(req.params.communityId);
  const userId = parseCommunityId(req.params.userId);
  if (!communityId || !userId) return res.status(400).json({ error: "Invalid community or user ID" });
  try {
    await service.removeSigner(req.userId, communityId, userId);
    return res.status(204).send();
  } catch (error) { return failure(error, res); }
}

module.exports = { select, list, remove };
