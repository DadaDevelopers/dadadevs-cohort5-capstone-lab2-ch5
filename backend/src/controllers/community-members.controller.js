const logError = require("../lib/log-error");
const service = require("../services/community-members.service");
const { parseCommunityId, validateMemberEmail } = require("../lib/community-validation");

function ids(req, res, needsUserId) {
  const communityId = parseCommunityId(req.params.communityId);
  const userId = needsUserId ? parseCommunityId(req.params.userId) : null;
  if (!communityId || (needsUserId && !userId)) {
    res.status(400).json({ error: "Invalid community or user ID" });
    return null;
  }
  return { communityId, userId };
}

function failure(error, res) {
  if (error instanceof service.MemberManagementError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error?.code === "P2002") return res.status(409).json({ error: "Already a member of this community" });
  if (error?.code === "P2025") return res.status(404).json({ error: "Community member not found" });
  logError("Community member request failed", error);
  return res.status(500).json({ error: "Internal server error" });
}

async function add(req, res) {
  const values = ids(req, res, false);
  if (!values) return;
  const email = validateMemberEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: "Valid email is required" });
  try {
    return res.status(201).json(await service.addMember(req.userId, values.communityId, email));
  } catch (error) { return failure(error, res); }
}

async function changeRole(req, res) {
  const values = ids(req, res, true);
  if (!values) return;
  const role = req.body?.role;
  if (role !== "COMMUNITY_MEMBER" && role !== "COMMUNITY_ADMIN") {
    return res.status(400).json({ error: "Invalid community role" });
  }
  try {
    return res.status(200).json(await service.changeRole(req.userId, values.communityId, values.userId, role));
  } catch (error) { return failure(error, res); }
}

async function remove(req, res) {
  const values = ids(req, res, true);
  if (!values) return;
  try {
    await service.removeMember(req.userId, values.communityId, values.userId);
    return res.status(204).send();
  } catch (error) { return failure(error, res); }
}

module.exports = { add, changeRole, remove };
