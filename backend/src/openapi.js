const errorResponse = (description) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
});

const jsonBody = (schema, example) => ({
  required: true,
  content: { "application/json": { schema, example } },
});

const userResponse = (description) => ({
  description,
  content: { "application/json": { schema: {
    type: "object",
    properties: { user: { $ref: "#/components/schemas/User" } },
  } } },
});

const communityIdParameter = {
  name: "communityId", in: "path", required: true,
  description: "Community to authorize against",
  schema: { type: "integer", minimum: 1, maximum: 2147483647 }, example: 1,
};
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
          email: { type: "string", format: "email", maxLength: 254, example: "ada@example.com" },
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
        requestBody: jsonBody({ type: "object", required: ["email"], properties: { email: { type: "string", format: "email", maxLength: 254 } } }, { email: "member@example.com" }),
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
        parameters: [communityIdParameter, { name: "userId", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: 2147483647 }, example: 2 }],
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
        parameters: [communityIdParameter, { name: "userId", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: 2147483647 }, example: 2 }],
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
          201: { description: "Signer selected", content: { "application/json": { example: { signer: { signerId: 1, userId: 2, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", membershipRole: "COMMUNITY_MEMBER", isAuthorizedSigner: true, publicInfoRegistered: false, createdAt: "2026-10-08T10:00:00.000Z" } } } } },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403], 404: communityErrors[404],
          409: errorResponse("Target is not a member or is already a signer"), 429: communityErrors[429], 500: communityErrors[500],
        },
      },
      get: {
        tags: ["Communities"], summary: "List authorized signers", security: communitySecurity,
        description: "Any current member of the community may view its signers. Only safe user fields are returned.",
        parameters: [communityIdParameter],
        responses: {
          200: { description: "Community signers; keys are omitted", content: { "application/json": { example: { signers: [{ signerId: 1, userId: 2, firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", membershipRole: "COMMUNITY_MEMBER", isAuthorizedSigner: true, publicInfoRegistered: true, createdAt: "2026-10-08T10:00:00.000Z" }] } } } },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403], 404: communityErrors[404], 429: communityErrors[429], 500: communityErrors[500],
        },
      },
    },
    "/communities/{communityId}/signers/{userId}": {
      delete: {
        tags: ["Communities"], summary: "Remove an authorized signer", security: communitySecurity,
        description: "Only a current community admin may remove signer authority. Membership remains. Removal is rejected if the remaining signer count would fall below the configured threshold, and signer changes are locked after wallet creation.",
        parameters: [communityIdParameter, { name: "userId", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: 2147483647 }, example: 2 }],
        responses: {
          204: { description: "Signer authority removed" },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403], 404: errorResponse("Community, membership, or signer not found"),
          409: errorResponse("Removal would invalidate the configured threshold"), 429: communityErrors[429], 500: communityErrors[500],
        },
      },
    },
    "/communities/{communityId}/signers/me/public-info": {
      put: {
        tags: ["Communities"], summary: "Register or update my signer public information", security: communitySecurity,
        description: "Only the current authorized signer may register their key. The value is normalized to lowercase and must be a valid 33-byte compressed secp256k1 public key beginning with 02 or 03. Keys must be distinct within the community. Never submit private keys, mnemonic phrases, or seed phrases. Key updates are locked after wallet creation.",
        parameters: [communityIdParameter],
        requestBody: jsonBody({ type: "object", required: ["publicKey"], additionalProperties: false, properties: { publicKey: { type: "string", minLength: 66, maxLength: 66, pattern: "^(02|03)[0-9a-fA-F]{64}$" } } }, { publicKey: "031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f" }),
        responses: {
          200: { description: "Validated public key stored", content: { "application/json": { example: { registered: true, publicKey: "031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f" } } } },
          400: errorResponse("Invalid input or private material submitted"), 401: communityErrors[401], 403: communityErrors[403],
          404: communityErrors[404], 409: errorResponse("Duplicate signer key or wallet policy is already immutable"), 429: communityErrors[429], 500: communityErrors[500],
        },
      },
      get: {
        tags: ["Communities"], summary: "Get my signer public information", security: communitySecurity,
        description: "Only the current authorized signer may view their registration status in this community.",
        parameters: [communityIdParameter],
        responses: {
          200: { description: "Current registration status", content: { "application/json": { examples: {
            registered: { value: { registered: true, publicKey: "031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f" } },
            pending: { value: { registered: false, publicKey: null } },
          } } } },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403],
          404: communityErrors[404], 429: communityErrors[429], 500: communityErrors[500],
        },
      },
    },
    "/communities/{communityId}/signing-threshold": {
      put: {
        tags: ["Communities"], summary: "Set the multisig signing threshold", security: communitySecurity,
        description: "Only a current COMMUNITY_ADMIN may set M. With 3 AuthorizedSigners and requiredSignatures 2, the wallet is 2-of-3. At least two signers are required; M must not exceed N. The threshold is immutable after wallet creation.",
        parameters: [communityIdParameter],
        requestBody: jsonBody({ type: "object", required: ["requiredSignatures"], properties: { requiredSignatures: { type: "integer", minimum: 2, maximum: 2147483647 } } }, { requiredSignatures: 2 }),
        responses: {
          200: { description: "Threshold configured", content: { "application/json": { example: { requiredSignatures: 2, authorizedSignerCount: 3 } } } },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403], 404: communityErrors[404],
          409: errorResponse("Fewer than two signers or threshold exceeds signer count"),
          429: communityErrors[429], 500: communityErrors[500],
        },
      },
      get: {
        tags: ["Communities"], summary: "Get the signing threshold and signer count", security: communitySecurity,
        description: "Any current member may view M and N. An unconfigured threshold is null; signer count can still be zero. Signer removal is rejected if it would make M exceed the remaining N.",
        parameters: [communityIdParameter],
        responses: {
          200: { description: "Current configuration", content: { "application/json": { examples: {
            configured: { value: { requiredSignatures: 2, authorizedSignerCount: 3 } },
            unconfigured: { value: { requiredSignatures: null, authorizedSignerCount: 3 } },
          } } } },
          400: communityErrors[400], 401: communityErrors[401], 403: communityErrors[403], 404: communityErrors[404],
          429: communityErrors[429], 500: communityErrors[500],
        },
      },
    },
    "/health": {
      get: {
        summary: "Check API and database health",
        responses: {
          200: { description: "Database connected", content: { "application/json": { example: { status: "ok", database: "connected" } } } },
          500: { description: "Database disconnected", content: { "application/json": { example: { status: "error", database: "disconnected" } } } },
        },
      },
    },
    "/auth/register": {
      post: {
        summary: "Register a user",
        requestBody: jsonBody({
          type: "object", required: ["firstName", "lastName", "email", "password"],
          properties: { firstName: { type: "string", minLength: 1, maxLength: 100 }, lastName: { type: "string", minLength: 1, maxLength: 100 }, email: { type: "string", format: "email", maxLength: 254 }, password: { type: "string", minLength: 8, description: "At most 72 UTF-8 bytes (bcrypt limit)" } },
        }, { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", password: "example-password" }),
        responses: { 201: userResponse("User created"), 400: errorResponse("Invalid input"), 409: errorResponse("Email already registered"), 429: errorResponse("Rate limited") },
      },
    },
    "/auth/login": {
      post: {
        summary: "Log in",
        requestBody: jsonBody({
          type: "object", required: ["email", "password"],
          properties: { email: { type: "string", format: "email", maxLength: 254 }, password: { type: "string" } },
        }, { email: "ada@example.com", password: "example-password" }),
        responses: {
          200: { description: "Access and refresh tokens", content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" }, refreshToken: { type: "string" }, user: { $ref: "#/components/schemas/User" } } } } } },
          400: errorResponse("Invalid input"), 401: errorResponse("Invalid credentials"), 429: errorResponse("Rate limited or temporarily locked out"),
        },
      },
    },
    "/auth/refresh": {
      post: {
        summary: "Get a new access token",
        requestBody: jsonBody({ type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } }, { refreshToken: "<refresh-token>" }),
        responses: { 200: { description: "New access token", content: { "application/json": { example: { token: "<access-token>" } } } }, 401: errorResponse("Invalid or expired refresh token"), 429: errorResponse("Rate limited") },
      },
    },
    "/auth/me": {
      get: {
        summary: "Get the authenticated user", security: [{ bearerAuth: [] }],
        responses: { 200: userResponse("Current user"), 401: errorResponse("Unauthorized"), 429: errorResponse("Rate limited") },
      },
    },
    "/auth/forgot-password": {
      post: {
        summary: "Request a password reset",
        requestBody: jsonBody({ type: "object", required: ["email"], properties: { email: { type: "string", format: "email", maxLength: 254 } } }, { email: "ada@example.com" }),
        responses: { 200: { description: "Generic acknowledgement", content: { "application/json": { example: { message: "If the email exists, the reset request was accepted" } } } }, 400: errorResponse("Invalid email"), 429: errorResponse("Rate limited") },
      },
    },
    "/auth/reset-password": {
      post: {
        summary: "Set a new password",
        requestBody: jsonBody({ type: "object", required: ["token", "newPassword"], properties: { token: { type: "string", minLength: 1, maxLength: 256 }, newPassword: { type: "string", minLength: 8, description: "At most 72 UTF-8 bytes (bcrypt limit)" } } }, { token: "<reset-token>", newPassword: "new-example-password" }),
        responses: { 200: { description: "Password changed", content: { "application/json": { example: { message: "Password reset successful" } } } }, 400: errorResponse("Invalid input"), 401: errorResponse("Invalid or expired reset token"), 429: errorResponse("Rate limited") },
      },
    },
  },
};

const walletPrefix = "/communities/{communityId}/wallet";
const walletSecurity = [{ bearerAuth: [] }];
const spendIdParameter = { name: "spendId", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: 2147483647 } };
const txidParameter = { name: "txid", in: "path", required: true, schema: { type: "string", pattern: "^[0-9a-fA-F]{64}$" } };
const walletResponse = (description) => ({ 200: { description }, 400: errorResponse("Invalid input"), 401: errorResponse("Unauthorized"), 403: errorResponse("Forbidden"), 404: errorResponse("Not found"), 409: errorResponse("Conflict"), 429: errorResponse("Rate limited"), 500: errorResponse("Internal server error"), 503: errorResponse("Bitcoin service unavailable") });
const walletOperation = (summary, description, extra = {}) => ({ tags: ["Wallets"], summary, description, security: walletSecurity, parameters: [communityIdParameter], responses: walletResponse(description), ...extra });
module.exports.tags.push({ name: "Wallets", description: "Regtest watch-only community wallets and externally signed PSBTs" });
module.exports.paths[walletPrefix] = {
  post: walletOperation("Create community wallet", "Admin only. Reads the configured threshold and every authorized signer key. All keys must be valid, registered and distinct before Bitcoin Core is contacted. The resulting signer policy is immutable. Retry a wallet in ERROR state.", { responses: { ...walletResponse("Wallet created"), 201: { description: "READY Regtest watch-only community wallet created" } } }),
  get: walletOperation("Get community wallet", "Members can see the fixed receiving address and public descriptor."),
};
module.exports.paths[`${walletPrefix}/balance`] = { get: walletOperation("Get wallet balance", "Amounts are decimal strings in satoshis.") };
module.exports.paths[`${walletPrefix}/utxos`] = { get: walletOperation("List wallet UTXOs", "Lists only outputs to this community wallet's address.") };
module.exports.paths[`${walletPrefix}/transactions`] = { get: walletOperation("List wallet transactions", "Wallet-scoped transaction activity.") };
module.exports.paths[`${walletPrefix}/transactions/{txid}`] = { get: walletOperation("Get transaction confirmations", "Wallet-scoped confirmation status.", { parameters: [communityIdParameter, txidParameter] }) };
const spendBody = jsonBody({ type: "object", required: ["recipient", "amountSats", "feeRate"], properties: {
  recipient: { type: "string" }, amountSats: { type: "string", pattern: "^[1-9][0-9]*$" }, feeRate: { type: "integer", minimum: 1, maximum: 100 },
} }, { recipient: "bcrt1q...", amountSats: "100000", feeRate: 2 });
module.exports.paths[`${walletPrefix}/spends`] = {
  post: walletOperation("Create spending request", "Admin only. Reserves confirmed UTXOs and returns a request ID.", { requestBody: spendBody, responses: { ...walletResponse("Spending request created"), 201: { description: "Spending request created" } } }),
};
module.exports.paths[`${walletPrefix}/spends/{spendId}`] = { get: walletOperation("Get spending request", "Members can see recipient, satoshi amount, fee, status, required signatures and accepted signature records.", { parameters: [communityIdParameter, spendIdParameter] }) };
module.exports.paths[`${walletPrefix}/spends/{spendId}/psbt`] = { get: walletOperation("Retrieve unsigned or partially signed PSBT", "Only original wallet signers may retrieve the PSBT for independent signing.", { parameters: [communityIdParameter, spendIdParameter] }) };
module.exports.paths[`${walletPrefix}/spends/{spendId}/signatures`] = {
  post: walletOperation("Submit externally signed PSBT", "Only original wallet signers. Transaction outputs, inputs, UTXO data, scripts, fee, SIGHASH_ALL policy, prior signatures and signer identity are verified before combining. Core-finalized threshold PSBTs are accepted only after every final-witness signature is verified.", {
    parameters: [communityIdParameter, spendIdParameter],
    requestBody: jsonBody({ type: "object", required: ["psbt"], properties: { psbt: { type: "string" } } }, { psbt: "cHNidP..." }),
  }),
};
module.exports.paths[`${walletPrefix}/spends/{spendId}/broadcast`] = { post: walletOperation("Broadcast authorized transaction", "Admin only. Broadcasts a fully signed transaction and records its txid.", { parameters: [communityIdParameter, spendIdParameter] }) };
module.exports.paths[`${walletPrefix}/spends/{spendId}/cancel`] = { post: walletOperation("Cancel spending request", "Admin only. Releases reserved inputs before broadcasting.", { parameters: [communityIdParameter, spendIdParameter] }) };

// JSON parsing happens before controllers, so these errors apply to every request body.
for (const [path, item] of Object.entries(module.exports.paths)) {
  for (const operation of Object.values(item)) {
    if (path.startsWith("/auth/")) operation.responses[500] = errorResponse("Internal server error");
    if (operation.requestBody) {
      operation.responses[400] ||= errorResponse("Invalid JSON or input");
      operation.responses[413] = errorResponse("Request body exceeds 100 KB");
      operation.responses[415] = errorResponse("Unsupported request encoding");
    }
  }
}
