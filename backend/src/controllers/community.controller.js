const service = require("../services/community.service");
const { validateName, validateDescription, validateJoinCode, parseCommunityId } = require("../lib/community-validation");

function failure(error, res) {
  if (error?.code === "COMMUNITY_NAME_CONFLICT") {
    return res.status(409).json({ error: "Community name already exists" });
  }
  if (error?.code === "P2002") return res.status(409).json({ error: "Conflict" });
  console.error("Community request failed", error);
  return res.status(500).json({ error: "Internal server error" });
}

async function create(req, res) {
  const name = validateName(req.body?.name);
  if (!name) return res.status(400).json({ error: "Name must be a nonempty string of at most 100 characters" });
  const description = validateDescription(req.body?.description);
  if (!description) return res.status(400).json({ error: "Description must be a nonempty string of at most 500 characters" });
  try {
    return res.status(201).json({ community: await service.createCommunity(req.userId, name, description) });
  } catch (error) { return failure(error, res); }
}

async function join(req, res) {
  const joinCode = validateJoinCode(req.body?.joinCode);
  if (!joinCode) return res.status(400).json({ error: "Invalid join code" });
  try {
    const result = await service.joinCommunity(req.userId, joinCode);
    if (!result) return res.status(404).json({ error: "Community not found" });
    if (result.conflict) return res.status(409).json({ error: "Already a member of this community" });
    return res.status(201).json(result);
  } catch (error) { return failure(error, res); }
}

async function list(req, res) {
  try {
    return res.status(200).json({ communities: await service.listCommunities(req.userId) });
  } catch (error) { return failure(error, res); }
}

function idOrError(req, res) {
  const id = parseCommunityId(req.params.communityId);
  if (!id) res.status(400).json({ error: "Invalid community ID" });
  return id;
}

function accessError(result, res) {
  if (result.missing) return res.status(404).json({ error: "Community not found" });
  if (result.forbidden) return res.status(403).json({ error: "Forbidden" });
  return null;
}

async function get(req, res) {
  const { identifier } = req.params;
  const by = req.query.by;
  if (by !== undefined && by !== "id" && by !== "name") {
    return res.status(400).json({ error: "Invalid lookup type" });
  }
  const useName = by === "name" || (by !== "id" && !/^[+-]?\d+$/.test(identifier));
  const value = useName ? validateName(identifier) : parseCommunityId(identifier);
  if (!value) return res.status(400).json({ error: useName ? "Invalid community name" : "Invalid community ID" });
  try {
    const result = useName
      ? await service.getCommunityByName(req.userId, value)
      : await service.getCommunity(req.userId, value);
    return accessError(result, res) || res.status(200).json(result);
  } catch (error) { return failure(error, res); }
}

async function members(req, res) {
  const id = idOrError(req, res);
  if (!id) return;
  try {
    const result = await service.listMembers(req.userId, id);
    return accessError(result, res) || res.status(200).json(result);
  } catch (error) { return failure(error, res); }
}

module.exports = { create, join, list, get, members };
