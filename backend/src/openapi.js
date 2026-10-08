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

const communitySecurity = [{ bearerAuth: [] }];
const communityErrors = {
  400: errorResponse("Invalid input"),
  401: errorResponse("Unauthorized"),
  403: errorResponse("Not a member"),
  404: errorResponse("Community not found"),
  409: errorResponse("Membership conflict"),
  429: errorResponse("Rate limited"),
  500: errorResponse("Internal server error"),
};

module.exports = {
  openapi: "3.0.3",
  info: {
    title: "CommunitySafe API", version: "1.0.0",
    description: "Authentication identifies a user globally. Authorization checks that user's current membership or signer authority in the requested community.",
  },
  servers: [{ url: "/" }],
  tags: [{ name: "Communities", description: "Community creation, membership and discovery" }],
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
    "/communities": {
      post: {
        tags: ["Communities"], summary: "Create a community", security: communitySecurity,
        description: "Names are trimmed and unique regardless of casing or surrounding whitespace.",
        requestBody: jsonBody({ type: "object", required: ["name", "description"], properties: { name: { type: "string", minLength: 1, maxLength: 100 }, description: { type: "string", minLength: 1, maxLength: 500 } } }, { name: "Dada Community Fund", description: "A community savings group for shared Bitcoin contributions." }),
        responses: {
          201: { description: "Community created; creator is admin", content: { "application/json": { example: { community: { id: 1, name: "Dada Community Fund", description: "A community savings group for shared Bitcoin contributions.", joinCode: "DADA-A1B2C3D4E5F6", role: "COMMUNITY_ADMIN", createdAt: "2026-10-08T10:00:00.000Z" } } } } },
          400: communityErrors[400], 401: communityErrors[401],
          409: { description: "Community name already exists", content: { "application/json": { example: { error: "Community name already exists" } } } },
          429: communityErrors[429], 500: communityErrors[500],
        },
      },
      get: {
        tags: ["Communities"], summary: "List my communities", security: communitySecurity,
        responses: {
          200: { description: "Only current memberships; join codes are omitted", content: { "application/json": { example: { communities: [{ id: 1, name: "Dada Community Fund", description: "A community savings group for shared Bitcoin contributions.", role: "COMMUNITY_ADMIN" }] } } } },
          401: communityErrors[401], 429: communityErrors[429], 500: communityErrors[500],
        },
      },
    },
    "/communities/join": {
      post: {
        tags: ["Communities"], summary: "Join by code", security: communitySecurity,
        requestBody: jsonBody({ type: "object", required: ["joinCode"], properties: { joinCode: { type: "string" } } }, { joinCode: "DADA-A1B2C3D4E5F6" }),
        responses: {
          201: { description: "Joined as member", content: { "application/json": { example: { community: { id: 1, name: "Dada Community Fund", role: "COMMUNITY_MEMBER" } } } } },
          400: communityErrors[400], 401: communityErrors[401], 404: communityErrors[404], 409: communityErrors[409], 429: communityErrors[429], 500: communityErrors[500],
        },
      },
    },
    "/communities/{identifier}": {
      get: {
        tags: ["Communities"], summary: "Get a community I belong to by ID or name", security: communitySecurity,
        description: "A numeric identifier is treated as an ID; other values are URL-decoded, trimmed, and matched as names without regard to case. Use by=name for a numeric-only community name. Membership controls access and only admins receive joinCode.",
        parameters: [
          { name: "identifier", in: "path", required: true, schema: { type: "string" }, example: "Dada Community Fund" },
          { name: "by", in: "query", required: false, schema: { type: "string", enum: ["id", "name"] }, description: "Optional lookup type; use name for numeric-only names" },
        ],
        responses: {
          200: { description: "Community details; joinCode is included only for admins", content: { "application/json": { example: { community: { id: 1, name: "Dada Community Fund", description: "A community savings group for shared Bitcoin contributions.", createdAt: "2026-10-08T10:00:00.000Z", role: "COMMUNITY_ADMIN", joinCode: "DADA-A1B2C3D4E5F6" } } } } },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403], 404: communityErrors[404], 429: communityErrors[429], 500: communityErrors[500],
        },
      },
    },
    "/communities/{communityId}/members": {
      get: {
        tags: ["Communities"], summary: "List community members", security: communitySecurity,
        parameters: [communityIdParameter],
        responses: {
          200: { description: "Safe member profiles and roles", content: { "application/json": { example: { members: [{ id: 1, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", role: "COMMUNITY_ADMIN" }] } } } },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403], 404: communityErrors[404], 429: communityErrors[429], 500: communityErrors[500],
        },
      },
      post: {
        tags: ["Communities"], summary: "Add an existing user as a community member", security: communitySecurity,
        description: "Requires the requester's current COMMUNITY_ADMIN membership. The user must already be registered; this does not grant signer authority.",
        parameters: [communityIdParameter],
        requestBody: jsonBody({ type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } }, { email: "member@example.com" }),
        responses: {
          201: { description: "Member added", content: { "application/json": { example: { member: { userId: 2, communityId: 1, role: "COMMUNITY_MEMBER" } } } } },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403], 404: errorResponse("Community or user not found"),
          409: errorResponse("User is already a member"), 429: communityErrors[429], 500: communityErrors[500],
        },
      },
    },
    "/communities/{communityId}/members/{userId}/role": {
      patch: {
        tags: ["Communities"], summary: "Change a community member's role", security: communitySecurity,
        description: "Only a current community admin may promote or demote. The last admin cannot be demoted.",
        parameters: [communityIdParameter, { name: "userId", in: "path", required: true, schema: { type: "integer", minimum: 1 }, example: 2 }],
        requestBody: jsonBody({ type: "object", required: ["role"], properties: { role: { type: "string", enum: ["COMMUNITY_MEMBER", "COMMUNITY_ADMIN"] } } }, { role: "COMMUNITY_ADMIN" }),
        responses: {
          200: { description: "Role updated", content: { "application/json": { example: { member: { userId: 2, communityId: 1, role: "COMMUNITY_ADMIN" } } } } },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403], 404: errorResponse("Community or member not found"),
          409: errorResponse("Community must retain an admin"), 429: communityErrors[429], 500: communityErrors[500],
        },
      },
    },
    "/communities/{communityId}/members/{userId}": {
      delete: {
        tags: ["Communities"], summary: "Remove a community member", security: communitySecurity,
        description: "Only a current community admin may remove members. The last admin and active authorized signers cannot be removed.",
        parameters: [communityIdParameter, { name: "userId", in: "path", required: true, schema: { type: "integer", minimum: 1 }, example: 2 }],
        responses: {
          204: { description: "Member removed" },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403], 404: errorResponse("Community or member not found"),
          409: errorResponse("Last admin or active signer conflict"), 429: communityErrors[429], 500: communityErrors[500],
        },
      },
    },
    "/communities/{communityId}/signers": {
      post: {
        tags: ["Communities"], summary: "Select an authorized signer", security: communitySecurity,
        description: "Only a current community admin may select an existing community member. Signer authority is separate from membership role.",
        parameters: [communityIdParameter],
        requestBody: jsonBody({ type: "object", required: ["userId"], properties: { userId: { type: "integer", minimum: 1 } } }, { userId: 2 }),
        responses: {
          201: { description: "Signer selected", content: { "application/json": { example: { signer: { signerId: 1, userId: 2, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", membershipRole: "COMMUNITY_MEMBER", isAuthorizedSigner: true, createdAt: "2026-10-08T10:00:00.000Z" } } } } },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403], 404: communityErrors[404],
          409: errorResponse("Target is not a member or is already a signer"), 429: communityErrors[429], 500: communityErrors[500],
        },
      },
      get: {
        tags: ["Communities"], summary: "List authorized signers", security: communitySecurity,
        description: "Any current member of the community may view its signers. Only safe user fields are returned.",
        parameters: [communityIdParameter],
        responses: {
          200: { description: "Community signers", content: { "application/json": { example: { signers: [{ signerId: 1, userId: 2, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", membershipRole: "COMMUNITY_MEMBER", isAuthorizedSigner: true, createdAt: "2026-10-08T10:00:00.000Z" }] } } } },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403], 404: communityErrors[404], 429: communityErrors[429], 500: communityErrors[500],
        },
      },
    },
    "/communities/{communityId}/signers/{userId}": {
      delete: {
        tags: ["Communities"], summary: "Remove an authorized signer", security: communitySecurity,
        description: "Only a current community admin may remove signer authority. Membership remains. Once wallet creation is implemented, signer removal must be locked after wallet creation.",
        parameters: [communityIdParameter, { name: "userId", in: "path", required: true, schema: { type: "integer", minimum: 1 }, example: 2 }],
        responses: {
          204: { description: "Signer authority removed" },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403], 404: errorResponse("Community, membership, or signer not found"),
          409: errorResponse("Signer set is locked after wallet creation (future rule)"), 429: communityErrors[429], 500: communityErrors[500],
        },
      },
    },
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
