const logError = require("../lib/log-error");
const { parseCommunityId } = require("../lib/community-validation");
const { CommunityAccessError } = require("../services/community-access.service");
const service = require("../services/activity.service");

function parseId(value) {
  const id = parseCommunityId(value);
  return id || null;
}

function fail(error, res) {
  if (error instanceof service.ActivityError || error instanceof CommunityAccessError) {
    return res.status(error.status).json({ error: error.message });
  }
  logError("Activity request failed", error);
  return res.status(500).json({ error: "Internal server error" });
}

function action(handler, success = 200) {
  return async (req, res) => {
    const communityId = parseId(req.params.communityId);
    const spendId = req.params.spendId === undefined ? null : parseId(req.params.spendId);
    const notificationId = req.params.notificationId === undefined ? null : parseId(req.params.notificationId);
    if (!communityId || (req.params.spendId !== undefined && !spendId) || (req.params.notificationId !== undefined && !notificationId)) {
      return res.status(400).json({ error: "Invalid identifier" });
    }
    try { return res.status(success).json(await handler(req, { communityId, spendId, notificationId })); }
    catch (error) { return fail(error, res); }
  };
}

module.exports = {
  audit: action((req, { communityId }) => service.listAuditEvents(req.userId, communityId, req.query)),
  notifications: action((req, { communityId }) => service.listNotifications(req.userId, communityId, req.query)),
  unread: action((req, { communityId }) => service.unreadCount(req.userId, communityId)),
  read: action((req, { communityId, notificationId }) => service.markNotificationRead(req.userId, communityId, notificationId)),
  readAll: action((req, { communityId }) => service.markAllNotificationsRead(req.userId, communityId)),
  discussion: action((req, { communityId, spendId }) => service.listDiscussion(req.userId, communityId, spendId, req.query)),
  addMessage: action((req, { communityId, spendId }) => service.addDiscussionMessage(req.userId, communityId, spendId, req.body?.body), 201),
};
