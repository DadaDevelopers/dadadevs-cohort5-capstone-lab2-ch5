const jwt = require("jsonwebtoken");

function createAccessToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
}

function createRefreshToken(userId) {
  return jwt.sign({ userId, type: "refresh" }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN,
  });
}

module.exports = { createAccessToken, createRefreshToken };
