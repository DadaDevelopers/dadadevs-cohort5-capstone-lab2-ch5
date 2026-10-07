const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const prisma = require("./lib/prisma");
const authRoutes = require("./routes/auth.routes");
const communityRoutes = require("./routes/community.routes");
const openApiSpec = require("./openapi");

const app = express();

// CORS and JSON parsing apply to both route areas.
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  allowedHeaders: ["Authorization", "Content-Type"],
}));
app.use(express.json());
app.use("/auth", authRoutes);
// Community permission checks have their own route namespace.
app.use("/communities", communityRoutes);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

// Health checks verify that the database can answer a query.
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      status: "error",
      database: "disconnected",
    });
  }
});

// Preserve the existing JSON response for malformed request bodies.
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  return res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
