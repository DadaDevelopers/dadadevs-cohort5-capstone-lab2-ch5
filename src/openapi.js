// Reuse the same error schema across authentication and community checks.
const errorResponse = (description) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
});

// Mark auth request bodies as required and include a usable example.
const jsonBody = (schema, example) => ({
  required: true,
  content: { "application/json": { schema, example } },
});

// Both registration and /auth/me return the user in the same envelope.
const userResponse = (description) => ({
  description,
  content: { "application/json": { schema: {
    type: "object",
    properties: { user: { $ref: "#/components/schemas/User" } },
  } } },
});

const communityIdParameter = {
  // Shared by the temporary community permission checks below.
  name: "communityId", in: "path", required: true,
  description: "Community to authorize against",
  schema: { type: "integer", minimum: 1 }, example: 1,
};

// The temporary checks share success and permission-error response shapes.
const communityTestResponses = (message) => ({
  200: { description: message, content: { "application/json": { example: { message } } } },
  401: errorResponse("Unauthorized"),
  403: errorResponse("Not a member or insufficient community permission"),
  429: errorResponse("Rate limited"),
});

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "CommunitySafe API", version: "1.0.0",
    description: "Authentication identifies a user globally. Authorization checks that user's current membership or signer authority in the requested community.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: { type: "object", properties: { error: { type: "string" } } },
      User: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1 },
          firstName: { type: "string", example: "Ada" },
          lastName: { type: "string", example: "Lovelace" },
          email: { type: "string", format: "email", example: "ada@example.com" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    // This endpoint reports database reachability as well as API health.
    "/health": {
      get: {
        summary: "Check API and database health",
        responses: {
          200: { description: "Database connected", content: { "application/json": { example: { status: "ok", database: "connected" } } } },
          500: { description: "Database disconnected", content: { "application/json": { example: { status: "error", database: "disconnected" } } } },
        },
      },
    },
    // Registration documents its validation and duplicate-email responses.
    "/auth/register": {
      post: {
        summary: "Register a user",
        requestBody: jsonBody({
          type: "object", required: ["firstName", "lastName", "email", "password"],
          properties: { firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 } },
        }, { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", password: "example-password" }),
        responses: { 201: userResponse("User created"), 400: errorResponse("Invalid input"), 409: errorResponse("Email already registered"), 429: errorResponse("Rate limited") },
      },
    },
    // Login returns both token types and the authenticated user.
    "/auth/login": {
      post: {
        summary: "Log in",
        requestBody: jsonBody({
          type: "object", required: ["email", "password"],
          properties: { email: { type: "string", format: "email" }, password: { type: "string" } },
        }, { email: "ada@example.com", password: "example-password" }),
        responses: {
          200: { description: "Access and refresh tokens", content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" }, refreshToken: { type: "string" }, user: { $ref: "#/components/schemas/User" } } } } } },
          400: errorResponse("Invalid input"), 401: errorResponse("Invalid credentials"), 429: errorResponse("Rate limited or temporarily locked out"),
        },
      },
    },
    // Refresh accepts a refresh token and returns an access token.
    "/auth/refresh": {
      post: {
        summary: "Get a new access token",
        requestBody: jsonBody({ type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } }, { refreshToken: "<refresh-token>" }),
        responses: { 200: { description: "New access token", content: { "application/json": { example: { token: "<access-token>" } } } }, 401: errorResponse("Invalid or expired refresh token"), 429: errorResponse("Rate limited") },
      },
    },
    // Reading the current user requires bearer authentication.
    "/auth/me": {
      get: {
        summary: "Get the authenticated user", security: [{ bearerAuth: [] }],
        responses: { 200: userResponse("Current user"), 401: errorResponse("Unauthorized"), 429: errorResponse("Rate limited") },
      },
    },
    // Membership is evaluated for the community named in the path.
    "/communities/{communityId}/test/member": {
      get: {
        tags: ["Community"],
        summary: "Development authorization test: community member",
        description: "Checks current membership in this community.",
        parameters: [communityIdParameter], security: [{ bearerAuth: [] }],
        responses: communityTestResponses("Community membership confirmed"),
      },
    },
    // Admin access requires the COMMUNITY_ADMIN membership role.
    "/communities/{communityId}/test/admin": {
      get: {
        tags: ["Community"],
        summary: "Development authorization test: community admin",
        description: "Checks current COMMUNITY_ADMIN membership in this community.",
        parameters: [communityIdParameter], security: [{ bearerAuth: [] }],
        responses: communityTestResponses("Community admin access granted"),
      },
    },
    // Signer access requires an AuthorizedSigner linked to this membership.
    "/communities/{communityId}/test/signer": {
      get: {
        tags: ["Community"],
        summary: "Development authorization test: authorized signer",
        description: "Checks an AuthorizedSigner record linked to this community membership.",
        parameters: [communityIdParameter], security: [{ bearerAuth: [] }],
        responses: communityTestResponses("Authorized signer access granted"),
      },
    },
    // The same acknowledgement is returned whether the email exists or not.
    "/auth/forgot-password": {
      post: {
        summary: "Request a password reset",
        requestBody: jsonBody({ type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } }, { email: "ada@example.com" }),
        responses: { 200: { description: "Generic acknowledgement", content: { "application/json": { example: { message: "If the email exists, the reset request was accepted" } } } }, 400: errorResponse("Invalid email"), 429: errorResponse("Rate limited") },
      },
    },
    // An expired or already used reset token is rejected.
    "/auth/reset-password": {
      post: {
        summary: "Set a new password",
        requestBody: jsonBody({ type: "object", required: ["token", "newPassword"], properties: { token: { type: "string" }, newPassword: { type: "string", minLength: 8 } } }, { token: "<reset-token>", newPassword: "new-example-password" }),
        responses: { 200: { description: "Password changed", content: { "application/json": { example: { message: "Password reset successful" } } } }, 400: errorResponse("Invalid input"), 401: errorResponse("Invalid or expired reset token"), 429: errorResponse("Rate limited") },
      },
    },
  },
};
