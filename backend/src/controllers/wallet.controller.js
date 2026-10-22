const logError = require("../lib/log-error");
const { BitcoinRpcError } = require("../lib/bitcoin-rpc");
const { parseCommunityId } = require("../lib/community-validation");
const { CommunityAccessError } = require("../services/community-access.service");
const service = require("../services/wallet.service");

function fail(error, res) {
  if (error instanceof service.WalletError) return res.status(error.status).json({ error: error.message });
  if (error instanceof CommunityAccessError) return res.status(error.status).json({ error: error.message });
  if (error instanceof BitcoinRpcError) {
    if (error.code === "WRONG_NETWORK") return res.status(503).json({ error: "Bitcoin node is not on Regtest" });
    logError("Bitcoin RPC unavailable", error);
    return res.status(503).json({ error: "Bitcoin service unavailable" });
  }
  logError("Wallet request failed", error);
  return res.status(500).json({ error: "Internal server error" });
}

const ids = (req, res) => {
  const communityId = parseCommunityId(req.params.communityId);
  const spendId = req.params.spendId === undefined ? null : parseCommunityId(req.params.spendId);
  if (!communityId || (req.params.spendId !== undefined && !spendId)) {
    res.status(400).json({ error: "Invalid community or spending request ID" });
    return null;
  }
  return { communityId, spendId };
};

function action(callback, success = 200) {
  return async (req, res) => {
    const parsed = ids(req, res);
    if (!parsed) return;
    try { return res.status(success).json(await callback(req, parsed)); }
    catch (error) { return fail(error, res); }
  };
}

module.exports = {
  create: action((req, { communityId }) => service.createWallet(req.userId, communityId), 201),
  get: action(async (req, { communityId }) => service.publicWallet(await service.getWallet(req.userId, communityId))),
  balance: action((req, { communityId }) => service.balance(req.userId, communityId)),
  utxos: action(async (req, { communityId }) => ({ utxos: await service.utxos(req.userId, communityId) })),
  transactions: action(async (req, { communityId }) => ({ transactions: await service.transactions(req.userId, communityId) })),
  transaction: action((req, { communityId }) => service.transaction(req.userId, communityId, req.params.txid)),
  createSpend: action(async (req, { communityId }) => {
    const result = await service.createSpend(req.userId, communityId, req.body?.recipient, req.body?.amountSats, req.body?.feeRate);
    return { ...result, amountSats: result.amountSats.toString(), feeSats: result.feeSats.toString() };
  }, 201),
  getSpend: action((req, { communityId, spendId }) => service.getSpend(req.userId, communityId, spendId)),
  psbt: action((req, { communityId, spendId }) => service.getSpend(req.userId, communityId, spendId, true)),
  sign: action((req, { communityId, spendId }) => service.submitPsbt(req.userId, communityId, spendId, req.body?.psbt)),
  broadcast: action((req, { communityId, spendId }) => service.broadcast(req.userId, communityId, spendId)),
  cancelSpend: action((req, { communityId, spendId }) => service.cancelSpend(req.userId, communityId, spendId)),
};
