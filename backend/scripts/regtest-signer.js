#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

require("dotenv").config();

const { BitcoinRpc, BitcoinRpcError } = require("../src/lib/bitcoin-rpc");
const { btcToSats, normalizeCompressedPublicKey } = require("../src/lib/bitcoin-values");
const { verifyWalletPolicy } = require("../src/lib/psbt-verification");

const DEFAULT_API_URL = "http://127.0.0.1:3000";
const DEFAULT_RPC_URL = "http://127.0.0.1:18444";
const DEFAULT_REGISTRY = path.join(os.homedir(), ".communitysafe", "regtest-signers.json");
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function usage() {
  return `CommunitySafe Regtest signer utility

Setup a signer key:
  npm run regtest:signer -- setup --community-id <id> --user-id <id>

Review and sign a spending request:
  npm run regtest:signer -- sign --community-id <id> --user-id <id> --spend-id <id>

Environment:
  COMMUNITYSAFE_TOKEN             Access token for the signer
  COMMUNITYSAFE_API_URL           Defaults to http://127.0.0.1:3000
  COMMUNITYSAFE_SIGNER_REGISTRY   Defaults to ~/.communitysafe/regtest-signers.json
  BITCOIN_RPC_URL                 Must be local Regtest RPC port 18444
  BITCOIN_RPC_COOKIE_FILE         Preferred Bitcoin Core authentication

Private keys remain inside the independent Bitcoin Core signer wallet.`;
}

function positiveId(value, name) {
  if (!/^[1-9][0-9]*$/.test(value || "") || Number(value) > 2147483647) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(value);
}

function parseArgs(argv) {
  const command = argv[0];
  if (["help", "--help", "-h"].includes(command) || !command) return { command: "help" };
  if (!new Set(["setup", "sign"]).has(command)) throw new Error("Command must be setup or sign");
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined) throw new Error(`Invalid option ${flag || ""}`.trim());
    options[flag.slice(2)] = value;
  }
  const result = {
    command,
    communityId: positiveId(options["community-id"], "community-id"),
    userId: positiveId(options["user-id"], "user-id"),
  };
  if (command === "sign") result.spendId = positiveId(options["spend-id"], "spend-id");
  return result;
}

function localHttpUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !LOCAL_HOSTS.has(url.hostname) || url.username || url.password) {
    throw new Error(`${label} must use local HTTP without credentials in the URL`);
  }
  return url;
}

function validateApiUrl(value) {
  const url = localHttpUrl(value, "CommunitySafe API URL");
  url.pathname = url.pathname.replace(/\/$/, "");
  return url;
}

function validateRpcUrl(value) {
  const url = localHttpUrl(value, "Bitcoin RPC URL");
  if ((url.port || "80") !== "18444") throw new Error("The signer utility only uses the isolated Regtest RPC port 18444");
  return url;
}

function associationIdentity(apiUrl, rpcUrl, communityId, userId) {
  const source = `communitysafe-regtest-v1|${apiUrl.origin}|${rpcUrl.origin}|${communityId}|${userId}`;
  const id = crypto.createHash("sha256").update(source).digest("hex").slice(0, 32);
  return { id, walletName: `cs-signer-${id}` };
}

async function loadRegistry(filename) {
  try {
    const value = JSON.parse(await fs.readFile(filename, "utf8"));
    if (value?.version !== 1 || !value.associations || typeof value.associations !== "object") throw new Error();
    return value;
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, associations: {} };
    throw new Error("Signer registry is unreadable or invalid");
  }
}

async function saveRegistry(filename, registry) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, filename);
}

async function apiRequest(apiUrl, token, method, route, body) {
  const url = new URL(route, apiUrl);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`CommunitySafe ${method} ${route} failed (${response.status}): ${payload?.error || "Unexpected response"}`);
  return payload;
}

async function signerRpc(rpc, walletName, method, params = []) {
  if (!/^cs-signer-[0-9a-f]{32}$/.test(walletName)) throw new Error("Invalid signer wallet association");
  const url = new URL(rpc.url);
  url.pathname = `/wallet/${encodeURIComponent(walletName)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), rpc.timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(await rpc.credentials()).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "1.0", id: "communitysafe-signer", method, params }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!payload || payload.error || !response.ok) {
      throw new Error(payload?.error?.message || `Bitcoin Core returned HTTP ${response.status}`);
    }
    return payload.result;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Bitcoin Core signer request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function confirmIdentity(apiUrl, token, communityId, userId) {
  const me = await apiRequest(apiUrl, token, "GET", "/auth/me");
  if (me.user?.id !== userId) throw new Error("The access token does not belong to the requested signer user");
  const listed = await apiRequest(apiUrl, token, "GET", `/communities/${communityId}/signers`);
  if (!listed.signers?.some((signer) => signer.userId === userId)) {
    throw new Error("This user is not an authorized signer for the community");
  }
  return me.user;
}

async function ensureLoaded(rpc, walletName, requireExisting) {
  const loaded = await rpc.call("listwallets");
  if (loaded.includes(walletName)) return;
  const directory = await rpc.call("listwalletdir");
  const exists = directory.wallets.some((entry) => entry.name === walletName);
  if (exists) {
    await rpc.call("loadwallet", [walletName]);
    return;
  }
  if (requireExisting) throw new Error("The registered signer wallet is missing; refusing to generate a replacement key");
  await rpc.call("createwallet", [walletName, false, false, "", false, true, true]);
}

async function verifyAssociation(rpc, entry) {
  await ensureLoaded(rpc, entry.walletName, true);
  const wallet = await signerRpc(rpc, entry.walletName, "getwalletinfo");
  if (wallet.private_keys_enabled !== true || wallet.descriptors !== true) {
    throw new Error("The signer wallet is not a private-key-enabled descriptor wallet");
  }
  const info = await signerRpc(rpc, entry.walletName, "getaddressinfo", [entry.address]);
  const publicKey = normalizeCompressedPublicKey(info.pubkey);
  if (!info.ismine || !publicKey || publicKey !== entry.publicKey) {
    throw new Error("The signer wallet no longer matches its recorded public association");
  }
  return entry;
}

async function setup(context) {
  const { apiUrl, token, rpc, registryFile, communityId, userId, association } = context;
  const user = await confirmIdentity(apiUrl, token, communityId, userId);
  const registry = await loadRegistry(registryFile);
  let entry = registry.associations[association.id];
  if (entry) {
    if (entry.communityId !== communityId || entry.userId !== userId || entry.walletName !== association.walletName) {
      throw new Error("The signer registry contains an inconsistent association");
    }
    entry = await verifyAssociation(rpc, entry);
  } else {
    const loaded = await rpc.call("listwallets");
    const directory = await rpc.call("listwalletdir");
    if (loaded.includes(association.walletName) || directory.wallets.some((item) => item.name === association.walletName)) {
      throw new Error("A signer wallet exists without its association record; refusing to generate or replace a key");
    }
    await ensureLoaded(rpc, association.walletName, false);
    const wallet = await signerRpc(rpc, association.walletName, "getwalletinfo");
    if (wallet.private_keys_enabled !== true || wallet.descriptors !== true) throw new Error("Bitcoin Core created an unexpected signer wallet type");
    const address = await signerRpc(rpc, association.walletName, "getnewaddress", [`community-${communityId}-user-${userId}`, "bech32"]);
    const info = await signerRpc(rpc, association.walletName, "getaddressinfo", [address]);
    const publicKey = normalizeCompressedPublicKey(info.pubkey);
    if (!info.ismine || !publicKey) throw new Error("Bitcoin Core did not return a valid compressed signer public key");
    entry = { communityId, userId, walletName: association.walletName, address, publicKey, createdAt: new Date().toISOString() };
    registry.associations[association.id] = entry;
    await saveRegistry(registryFile, registry);
  }
  stdout.write(`Signer: ${user.email || `user ${userId}`} (user ${userId})\nCommunity: ${communityId}\nPublic key: ${entry.publicKey}\n\n`);
  stdout.write(`Register it in Swagger with PUT /communities/${communityId}/signers/me/public-info as this signer:\n`);
  stdout.write(`${JSON.stringify({ publicKey: entry.publicKey }, null, 2)}\n`);
}

function inspectPsbt(decoded, wallet, spend) {
  if (!decoded?.tx?.vin?.length || !decoded.tx.vout?.length) throw new Error("Bitcoin Core returned an invalid PSBT");
  const amount = BigInt(spend.amountSats);
  const fee = BigInt(spend.feeSats);
  const recipients = decoded.tx.vout.filter((output) => output.scriptPubKey.address === spend.recipient);
  if (recipients.length !== 1 || btcToSats(recipients[0].value) !== amount) throw new Error("PSBT recipient or amount does not match the spending request");
  if (decoded.tx.vout.some((output) => output !== recipients[0] && output.scriptPubKey.address !== wallet.address)) {
    throw new Error("PSBT contains an output outside the recipient and community wallet");
  }
  if (btcToSats(decoded.fee) !== fee) throw new Error("PSBT fee does not match the spending request");
  const signerKeys = wallet.signers.map((signer) => signer.publicKey);
  if (!verifyWalletPolicy(spend.psbt, wallet.requiredSignatures, signerKeys)) throw new Error("PSBT does not match the community wallet policy");
  return { amount, fee, inputs: decoded.tx.vin.map(({ txid, vout }) => `${txid}:${vout}`) };
}

async function verifyUnspentInputs(rpc, decoded) {
  const outpoints = new Set();
  for (let index = 0; index < decoded.tx.vin.length; index += 1) {
    const { txid, vout } = decoded.tx.vin[index];
    const outpoint = `${txid}:${vout}`;
    if (outpoints.has(outpoint)) throw new Error("PSBT contains a duplicate input");
    outpoints.add(outpoint);
    const current = await rpc.call("gettxout", [txid, vout, true]);
    const witness = decoded.inputs?.[index]?.witness_utxo;
    if (!current || !witness || btcToSats(current.value) !== btcToSats(witness.amount) ||
        current.scriptPubKey?.hex !== witness.scriptPubKey?.hex) {
      throw new Error("PSBT input no longer matches an unspent Regtest output");
    }
  }
}

async function sign(context) {
  const { apiUrl, token, rpc, registryFile, communityId, userId, spendId, association } = context;
  await confirmIdentity(apiUrl, token, communityId, userId);
  const registry = await loadRegistry(registryFile);
  const stored = registry.associations[association.id];
  if (!stored) throw new Error("Run signer setup for this user and community before signing");
  const entry = await verifyAssociation(rpc, stored);
  const wallet = await apiRequest(apiUrl, token, "GET", `/communities/${communityId}/wallet`);
  if (wallet.network !== "regtest" || wallet.status !== "READY") throw new Error("The community wallet is not ready on Regtest");
  const signer = wallet.signers?.find((item) => item.userId === userId);
  if (!signer || signer.publicKey !== entry.publicKey) throw new Error("The registered wallet signer key does not match this local signer wallet");
  const details = await apiRequest(apiUrl, token, "GET", `/communities/${communityId}/wallet/spends/${spendId}`);
  if (details.status !== "SIGNING") throw new Error(`Spending request is ${details.status}, not SIGNING`);
  const spend = await apiRequest(apiUrl, token, "GET", `/communities/${communityId}/wallet/spends/${spendId}/psbt`);
  const decoded = await rpc.call("decodepsbt", [spend.psbt]);
  const review = inspectPsbt(decoded, wallet, spend);
  await verifyUnspentInputs(rpc, decoded);
  stdout.write(`Community: ${communityId}\nSpending request: ${spendId}\nRecipient: ${spend.recipient}\nAmount: ${review.amount} sats\nFee: ${review.fee} sats\nPolicy: ${wallet.requiredSignatures}-of-${wallet.signers.length}\nInputs: ${review.inputs.length}\n`);
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  const answer = await prompt.question("Type SIGN to approve this transaction: ");
  prompt.close();
  if (answer !== "SIGN") throw new Error("Signing cancelled");
  const signed = await signerRpc(rpc, entry.walletName, "walletprocesspsbt", [spend.psbt]);
  const result = await apiRequest(apiUrl, token, "POST", `/communities/${communityId}/wallet/spends/${spendId}/signatures`, { psbt: signed.psbt });
  stdout.write(`Signature accepted. Status: ${result.status}; signatures: ${result.signatures}/${result.requiredSignatures}\n`);
}

async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.command === "help") {
    stdout.write(`${usage()}\n`);
    return;
  }
  const token = process.env.COMMUNITYSAFE_TOKEN;
  if (!token) throw new Error("Set COMMUNITYSAFE_TOKEN to this signer's access token");
  const apiUrl = validateApiUrl(process.env.COMMUNITYSAFE_API_URL || DEFAULT_API_URL);
  const rpcUrl = validateRpcUrl(process.env.BITCOIN_RPC_URL || DEFAULT_RPC_URL);
  const rpc = new BitcoinRpc({ url: rpcUrl.toString() });
  await rpc.assertRegtest();
  const association = associationIdentity(apiUrl, rpcUrl, parsed.communityId, parsed.userId);
  const context = {
    ...parsed, apiUrl, token, rpc, association,
    registryFile: process.env.COMMUNITYSAFE_SIGNER_REGISTRY || DEFAULT_REGISTRY,
  };
  if (parsed.command === "setup") await setup(context);
  else await sign(context);
}

if (require.main === module) {
  main().catch((error) => {
    const message = error instanceof BitcoinRpcError ? error.message : error?.message || "Signer utility failed";
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, validateApiUrl, validateRpcUrl, associationIdentity, inspectPsbt, verifyUnspentInputs, main };
