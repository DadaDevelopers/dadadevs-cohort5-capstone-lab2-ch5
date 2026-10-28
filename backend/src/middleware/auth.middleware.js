const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
  const authorization = req.headers.authorization;
  const match = typeof authorization === "string"
    ? /^Bearer (\S+)$/.exec(authorization)
    : null;

  if (!match) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.type === "refresh" || !Number.isInteger(payload.userId) || payload.userId < 1 || payload.userId > 2147483647) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.userId = payload.userId;
    req.user = { id: payload.userId };
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

module.exports = authenticate;
