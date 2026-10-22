const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const prisma = require("./lib/prisma");
const authRoutes = require("./routes/auth.routes");
const communityRoutes = require("./routes/community.routes");
const openApiSpec = require("./openapi");
const logError = require("./lib/log-error");

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  allowedHeaders: ["Authorization", "Content-Type"],
}));
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/communities", communityRoutes);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    logError("Health check failed", error);

    res.status(500).json({
      status: "error",
      database: "disconnected",
    });
  }
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  if (error instanceof URIError && error.status === 400) {
    return res.status(400).json({ error: "Invalid URL encoding" });
  }
  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body too large" });
  }
  if ([400, 415].includes(error.status) && typeof error.type === "string") {
    return res.status(error.status).json({ error: "Invalid request body" });
  }
  logError("Request failed", error);
  return res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
