const prisma = require("../lib/prisma");
const { BitcoinRpc } = require("../lib/bitcoin-rpc");
const { btcToSats, satsToBtc, publicKeys, txFingerprint } = require("../lib/bitcoin-values");
const {
  stableJson, compareInputMetadata, compareFinalizedInputMetadata, comparePartialSignatures,
  verifyWalletPolicy, verifyFinalizedSignerPsbt, verifySignerPsbt,
} = require("../lib/psbt-verification");
const { requireMembership, asAdmin } = require("./community-access.service");
const { recordEvent, recordEventTransaction } = require("./domain-events.service");

class WalletError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const rpc = new BitcoinRpc();
const walletName = (communityId) => `communitysafe-${communityId}`;
const snapshot = (wallet) => wallet.signerSnapshot;
const publicWallet = (wallet) => ({
  communityId: wallet.communityId, status: wallet.status, network: wallet.network,
  address: wallet.address, descriptor: wallet.descriptor,
  requiredSignatures: wallet.requiredSignatures, signers: snapshot(wallet),
  createdAt: wallet.createdAt,
});

async function getWallet(userId, communityId) {
  await requireMembership(prisma, userId, communityId);
  const wallet = await prisma.communityWallet.findUnique({ where: { communityId } });
  if (!wallet) throw new WalletError(404, "Community wallet not found");
  return wallet;
}

async function createWallet(userId, communityId) {
  const membership = await requireMembership(prisma, userId, communityId);
  if (membership.role !== "COMMUNITY_ADMIN") throw new WalletError(403, "Forbidden");
  const wallet = await asAdmin(userId, communityId, async (tx, community) => {
    const existing = await tx.communityWallet.findUnique({ where: { communityId } });
    if (existing) {
      if (existing.status === "ERROR" || existing.status === "READY") return existing;
      throw new WalletError(409, "Community wallet already exists");
    }
    const signers = await tx.authorizedSigner.findMany({
      where: { membership: { is: { communityId } } },
      select: { id: true, publicKey: true, membership: { select: { userId: true } } },
    });
    if (community.requiredSignatures === null) {
      throw new WalletError(409, "Configure the signing threshold before creating the wallet");
    }
    if (signers.length < 2 || community.requiredSignatures > signers.length) {
      throw new WalletError(409, "The signing threshold is incompatible with the authorized signer count");
    }
    let keys;
    try { keys = publicKeys(signers.map((s) => s.publicKey), community.requiredSignatures); }
    catch (error) {
      if (error.message.includes("compressed public key")) {
        throw new WalletError(409, "Every authorized signer must register a valid compressed public key before wallet creation");
      }
      if (error.message.includes("Duplicate")) {
        throw new WalletError(409, "Authorized signers must use distinct public keys");
      }
      throw new WalletError(409, error.message);
    }
    await rpc.assertRegtest();
    const descriptorBody = `wsh(sortedmulti(${community.requiredSignatures},${keys.join(",")}))`;
    const descriptorInfo = await rpc.call("getdescriptorinfo", [descriptorBody]);
    if (descriptorInfo.isrange || descriptorInfo.issolvable === false || descriptorInfo.hasprivatekeys) {
      throw new WalletError(502, "Bitcoin Core rejected the public multisig policy");
    }
    const descriptor = descriptorInfo.descriptor;
    const [address] = await rpc.call("deriveaddresses", [descriptor]);
    if (!address?.startsWith("bcrt1") || !descriptor.startsWith("wsh(sortedmulti(") || !descriptor.includes("#")) {
      throw new WalletError(502, "Bitcoin Core returned an invalid descriptor");
    }
    return tx.communityWallet.create({
      data: {
        communityId, coreWalletName: walletName(communityId), descriptor, address,
        requiredSignatures: community.requiredSignatures,
        signerSnapshot: signers.map((s) => ({ signerId: s.id, userId: s.membership.userId, publicKey: s.publicKey.toLowerCase() })),
      },
    });
  }, { timeout: 60000, maxWait: 10000 });
  if (wallet.status === "READY") {
    await recordEventTransaction({
      communityId, actorUserId: userId, eventType: "WALLET_CREATED", entityType: "wallet", entityId: wallet.id,
      dedupeKey: `wallet-ready:${wallet.id}`, notification: { audience: "members", category: "wallet", message: "The community wallet is ready." },
    });
    throw new WalletError(409, "Community wallet already exists");
  }
  try {
    const loaded = await rpc.call("listwallets");
    if (loaded.includes(wallet.coreWalletName) && wallet.status !== "ERROR") {
      throw new WalletError(409, "Coordinator wallet name already exists");
    }
    if (!loaded.includes(wallet.coreWalletName)) {
      const directory = await rpc.call("listwalletdir");
      if (directory.wallets.some((entry) => entry.name === wallet.coreWalletName)) {
        if (wallet.status !== "ERROR") throw new WalletError(409, "Coordinator wallet name already exists");
        await rpc.call("loadwallet", [wallet.coreWalletName]);
      } else {
        await rpc.call("createwallet", [wallet.coreWalletName, true, true, "", false, true, true]);
      }
    }
    const info = await rpc.call("getwalletinfo", [], wallet.coreWalletName);
    if (info.private_keys_enabled !== false || info.descriptors !== true) throw new WalletError(502, "Coordinator wallet is not watch-only descriptor based");
    const known = await rpc.call("listdescriptors", [], wallet.coreWalletName);
    if (!known.descriptors.some((entry) => entry.desc === wallet.descriptor)) {
      const [imported] = await rpc.call("importdescriptors", [[{ desc: wallet.descriptor, timestamp: "now", active: false }]], wallet.coreWalletName);
      if (!imported?.success) throw new WalletError(502, "Descriptor import failed");
    }
    const ready = await prisma.$transaction(async (tx) => {
      const updated = await tx.communityWallet.update({ where: { id: wallet.id }, data: { status: "READY", lastError: null } });
      await recordEvent(tx, {
        communityId, actorUserId: userId, eventType: "WALLET_CREATED", entityType: "wallet", entityId: wallet.id,
        dedupeKey: `wallet-ready:${wallet.id}`, notification: { audience: "members", category: "wallet", message: "The community wallet is ready." },
      });
      return updated;
    });
    return publicWallet(ready);
  } catch (error) {
    await prisma.communityWallet.update({ where: { id: wallet.id }, data: { status: "ERROR", lastError: error.message } });
    throw error;
  }
}

async function balance(userId, communityId) {
  const wallet = await getWallet(userId, communityId);
  if (wallet.status !== "READY") throw new WalletError(409, "Community wallet is not ready");
  await rpc.assertRegtest();
  const data = await rpc.call("getbalances", [], wallet.coreWalletName);
  const watched = data.watchonly;
  if (!watched) {
    // Newer Core descriptor wallets omit the legacy watchonly bucket.
    const outputs = await rpc.call("listunspent", [0, 9999999, [wallet.address]], wallet.coreWalletName);
    let confirmed = 0n;
    let pending = 0n;
    for (const output of outputs.filter((item) => item.address === wallet.address)) {
      if (output.confirmations >= 1) confirmed += btcToSats(output.amount);
      else pending += btcToSats(output.amount);
    }
    return { confirmedSats: confirmed.toString(), pendingSats: pending.toString(), immatureSats: btcToSats(data.mine?.immature || 0).toString() };
  }
  return {
    confirmedSats: btcToSats(watched.trusted || 0).toString(),
    pendingSats: btcToSats(watched.untrusted_pending || 0).toString(),
    immatureSats: btcToSats(watched.immature || 0).toString(),
  };
}

async function utxos(userId, communityId) {
  const wallet = await getWallet(userId, communityId);
  if (wallet.status !== "READY") throw new WalletError(409, "Community wallet is not ready");
  await rpc.assertRegtest();
  const items = await rpc.call("listunspent", [0, 9999999, [wallet.address]], wallet.coreWalletName);
  return items.filter((i) => i.address === wallet.address).map((i) => ({
    txid: i.txid, vout: i.vout, amountSats: btcToSats(i.amount).toString(),
    confirmations: i.confirmations, solvable: i.solvable,
  }));
}

function activitySats(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WalletError(502, `Bitcoin Core returned an invalid ${label}`);
  }
  try {
    return btcToSats(Math.abs(value));
  } catch (_) {
    throw new WalletError(502, `Bitcoin Core returned an invalid ${label}`);
  }
}

/**
 * Bitcoin Core reports one ledger line per wallet-relevant output. A wallet send
 * with change therefore appears as a send for the recipient, a send for the
 * change output, and a receive for that same change output. Collapse those lines
 * into one logical transaction so change is never exposed as an external payment
 * or as a new contribution.
 */
function aggregateActivity(entries, walletAddress) {
  const groups = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry.txid !== "string" || !/^[0-9a-f]{64}$/i.test(entry.txid)) continue;
    if (entry.category !== "send" && entry.category !== "receive") continue;
    const address = typeof entry.address === "string" ? entry.address : null;
    const own = address !== null && address === walletAddress;
    if (entry.category === "receive" && !own) continue;
    let group = groups.get(entry.txid);
    if (!group) {
      group = {
        txid: entry.txid, receivedByVout: new Map(), sent: [], feeSats: null,
        confirmations: null, blockhash: null, blockHeight: null, time: null,
      };
      groups.set(entry.txid, group);
    }
    const amountSats = activitySats(entry.amount, "transaction amount");
    if (entry.category === "receive") {
      const vout = Number.isInteger(entry.vout) ? entry.vout : group.receivedByVout.size;
      group.receivedByVout.set(vout, (group.receivedByVout.get(vout) ?? 0n) + amountSats);
    } else {
      group.sent.push({ address, own, amountSats });
      if (group.feeSats === null && typeof entry.fee === "number") {
        group.feeSats = activitySats(entry.fee, "transaction fee");
      }
    }
    if (group.confirmations === null && Number.isInteger(entry.confirmations)) group.confirmations = entry.confirmations;
    if (!group.blockhash && typeof entry.blockhash === "string" && /^[0-9a-f]{64}$/i.test(entry.blockhash)) {
      group.blockhash = entry.blockhash;
    }
    if (group.blockHeight === null && Number.isInteger(entry.blockheight) && entry.blockheight >= 0) {
      group.blockHeight = entry.blockheight;
    }
    if (group.time === null && Number.isFinite(entry.time)) group.time = Math.trunc(entry.time);
  }

  const items = [];
  for (const group of groups.values()) {
    const receivedSats = [...group.receivedByVout.values()].reduce((total, value) => total + value, 0n);
    const ownSends = group.sent.filter((entry) => entry.own);
    const externalSends = group.sent.filter((entry) => !entry.own);
    const changeSats = ownSends.reduce((total, entry) => total + entry.amountSats, 0n);
    const externalSats = externalSends.reduce((total, entry) => total + entry.amountSats, 0n);
    const outgoing = ownSends.length > 0 || externalSends.length > 0;
    if (!outgoing && receivedSats === 0n) continue;

    const byAddress = new Map();
    for (const entry of externalSends) {
      if (!entry.address) continue;
      byAddress.set(entry.address, (byAddress.get(entry.address) ?? 0n) + entry.amountSats);
    }
    const recipients = [...byAddress].map(([address, amountSats]) => ({ address, amountSats: amountSats.toString() }));
    const feeSats = outgoing ? group.feeSats : null;
    const totalDebitSats = outgoing && feeSats !== null ? externalSats + feeSats : null;
    const confirmations = group.confirmations ?? 0;

    items.push({
      txid: group.txid,
      // `category` stays for older clients; `direction` is the logical classification.
      category: outgoing ? "send" : "receive",
      direction: outgoing ? "outgoing" : "incoming",
      amountSats: (outgoing ? externalSats : receivedSats).toString(),
      feeSats: feeSats === null ? null : feeSats.toString(),
      changeSats: (outgoing ? changeSats : 0n).toString(),
      totalDebitSats: totalDebitSats === null ? null : totalDebitSats.toString(),
      recipientAddress: recipients.length === 1 ? recipients[0].address : null,
      recipientCount: externalSends.length,
      recipients,
      requestId: null,
      confirmations,
      blockhash: confirmations > 0 ? group.blockhash : null,
      blockHeight: confirmations > 0 ? group.blockHeight : null,
      time: group.time ?? 0,
    });
  }
  return items.sort((a, b) => b.time - a.time || a.txid.localeCompare(b.txid));
}

async function fillBlockHeights(items) {
  const missing = items.filter((item) => item.confirmations > 0 && item.blockHeight === null && item.blockhash);
  const hashes = [...new Set(missing.map((item) => item.blockhash))];
  const heights = new Map();
  await Promise.all(hashes.map(async (blockhash) => {
    try {
      const header = await rpc.call("getblockheader", [blockhash]);
      if (Number.isInteger(header?.height) && header.height >= 0) heights.set(blockhash, header.height);
    } catch (_) {
      // The confirmation count is still authoritative; leave the height unknown
      // rather than inventing one or failing the whole history request.
    }
  }));
  for (const item of items) {
    if (item.confirmations > 0 && item.blockHeight === null && heights.has(item.blockhash)) {
      item.blockHeight = heights.get(item.blockhash);
    }
  }
}

async function activityRequestLinks(walletId, txids) {
  if (txids.length === 0) return new Map();
  const rows = await prisma.spendingRequest.findMany({
    where: { walletId, txid: { in: txids } },
    select: { id: true, txid: true },
  });
  const wanted = new Set(txids);
  return new Map(rows.filter((row) => wanted.has(row.txid)).map((row) => [row.txid, String(row.id)]));
}

async function activityRequestLink(walletId, txid) {
  const rows = await prisma.spendingRequest.findMany({
    where: { walletId, txid },
    select: { id: true, txid: true },
  });
  const row = rows.find((item) => item.txid === txid);
  return row ? String(row.id) : null;
}

async function transactions(userId, communityId) {
  const wallet = await getWallet(userId, communityId);
  if (wallet.status !== "READY") throw new WalletError(409, "Community wallet is not ready");
  await rpc.assertRegtest();
  const entries = await rpc.call("listtransactions", ["*", 100, 0, true], wallet.coreWalletName);
  if (!Array.isArray(entries)) throw new WalletError(502, "Bitcoin Core returned invalid wallet activity");
  const items = aggregateActivity(entries, wallet.address);
  await fillBlockHeights(items);
  const links = await activityRequestLinks(wallet.id, items.map((item) => item.txid));
  for (const item of items) item.requestId = links.get(item.txid) ?? null;
  await reconcileObservedActivity(communityId, items);
  return items;
}

async function transaction(userId, communityId, txid) {
  if (!/^[0-9a-f]{64}$/i.test(txid)) throw new WalletError(400, "Invalid transaction ID");
  const wallet = await getWallet(userId, communityId);
  await rpc.assertRegtest();
  const item = await rpc.call("gettransaction", [txid, true, true], wallet.coreWalletName);
  const details = Array.isArray(item.details) ? item.details : [];
  const entries = details.map((detail) => ({
    ...detail, txid,
    fee: typeof detail.fee === "number" ? detail.fee : item.fee,
    confirmations: item.confirmations,
    blockhash: item.blockhash,
    blockheight: item.blockheight,
    time: item.time,
  }));
  const [summary] = aggregateActivity(entries, wallet.address);
  if (!summary) throw new WalletError(404, "Transaction is not part of this community wallet");
  await fillBlockHeights([summary]);
  summary.requestId = await activityRequestLink(wallet.id, txid);
  await reconcileObservedActivity(communityId, [summary]);
  return summary;
}

async function reconcileObservedActivity(communityId, items) {
  for (const item of items.filter((entry) => entry.confirmations > 0)) {
    const outgoing = item.direction === "outgoing";
    const entityType = outgoing && item.requestId ? "spending_request" : "transaction";
    const entityId = outgoing && item.requestId ? item.requestId : item.txid;
    await recordEventTransaction({
      communityId, actorUserId: null,
      eventType: outgoing ? "PAYMENT_CONFIRMED" : "CONTRIBUTION_CONFIRMED",
      entityType, entityId, dedupeKey: `confirmed:${communityId}:${item.txid}`,
      metadata: { txid: item.txid },
      notification: {
        audience: "members", category: outgoing ? "payment" : "contribution",
        message: outgoing ? "A community payment was confirmed." : "A contribution was confirmed.",
      },
    });
  }
}

function checkOutputs(decoded, wallet, recipient, amountSats, expectedFeeSats) {
  if (!decoded?.tx?.vin?.length || !decoded.tx.vout?.length) throw new WalletError(400, "Invalid PSBT transaction");
  const outputs = decoded.tx.vout;
  const recipients = outputs.filter((o) => o.scriptPubKey.address === recipient);
  if (recipients.length !== 1 || btcToSats(recipients[0].value) !== amountSats) throw new WalletError(400, "PSBT recipient or amount changed");
  if (outputs.some((o) => o !== recipients[0] && o.scriptPubKey.address !== wallet.address)) throw new WalletError(400, "PSBT contains an unexpected output");
  if (btcToSats(decoded.fee) !== expectedFeeSats) throw new WalletError(400, "PSBT fee changed");
}

async function createSpend(userId, communityId, recipient, amountSats, feeRate) {
  const membership = await requireMembership(prisma, userId, communityId);
  if (membership.role !== "COMMUNITY_ADMIN") throw new WalletError(403, "Forbidden");
  if (typeof recipient !== "string" || !/^(bcrt1)[023456789acdefghjklmnpqrstuvwxyz]{8,87}$/.test(recipient)) throw new WalletError(400, "Recipient must be a Regtest bech32 address");
  if (typeof amountSats !== "string" || amountSats.length > 16 || !/^[1-9]\d*$/.test(amountSats) || BigInt(amountSats) > 2100000000000000n) throw new WalletError(400, "Invalid amountSats");
  if (!Number.isInteger(feeRate) || feeRate < 1 || feeRate > 100) throw new WalletError(400, "feeRate must be 1–100 sat/vB");
  const amount = BigInt(amountSats);
  await rpc.assertRegtest();
  return asAdmin(userId, communityId, async (tx) => {
    const wallet = await tx.communityWallet.findUnique({ where: { communityId } });
    if (!wallet || wallet.status !== "READY") throw new WalletError(409, "Community wallet is not ready");
    await tx.$queryRaw`SELECT "id" FROM "CommunityWallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
    const valid = await rpc.call("validateaddress", [recipient]);
    if (!valid.isvalid || valid.iswitness === false || recipient === wallet.address) throw new WalletError(400, "Invalid recipient address");
    const unspent = await rpc.call("listunspent", [1, 9999999, [wallet.address]], wallet.coreWalletName);
    const reserved = await tx.spendingInput.findMany({ where: { walletId: wallet.id, reserved: true }, select: { txid: true, vout: true } });
    const blocked = new Set(reserved.map((i) => `${i.txid}:${i.vout}`));
    const available = unspent.filter((i) => i.address === wallet.address && i.solvable && !blocked.has(`${i.txid}:${i.vout}`));
    available.sort((a, b) => (btcToSats(a.amount) < btcToSats(b.amount) ? -1 : 1));
    const selected = [];
    let total = 0n;
    for (const item of available) {
      selected.push(item);
      total += btcToSats(item.amount);
      if (total >= amount + BigInt((selected.length * 150 + 100) * feeRate)) break;
    }
    if (total < amount + BigInt((selected.length * 150 + 100) * feeRate)) throw new WalletError(409, "Insufficient unreserved confirmed funds");
    const funded = await rpc.call("walletcreatefundedpsbt", [
      selected.map((i) => ({ txid: i.txid, vout: i.vout })),
      [{ [recipient]: Number(satsToBtc(amount)) }], 0,
      { add_inputs: false, changeAddress: wallet.address, fee_rate: feeRate, lockUnspents: false }, true,
    ], wallet.coreWalletName);
    const decoded = await rpc.call("decodepsbt", [funded.psbt]);
    const fee = btcToSats(funded.fee);
    checkOutputs(decoded, wallet, recipient, amount, fee);
    if (fee > amount / 10n + 10000n) throw new WalletError(409, "Fee exceeds spending safety limit");
    const actual = decoded.tx.vin.map((i) => ({ txid: i.txid, vout: i.vout }));
    if (actual.length !== selected.length || actual.some((i) => !selected.some((s) => s.txid === i.txid && s.vout === i.vout))) {
      throw new WalletError(502, "Bitcoin Core changed selected inputs");
    }
    try {
      const created = await tx.spendingRequest.create({
        data: {
          walletId: wallet.id, createdById: userId, recipient, amountSats: amount,
          feeSats: fee, unsignedTxHash: txFingerprint(decoded.tx), psbt: funded.psbt,
          inputs: { create: actual.map((i) => ({ walletId: wallet.id, ...i })) },
        }, select: { id: true, status: true, recipient: true, amountSats: true, feeSats: true },
      });
      await recordEvent(tx, {
        communityId, actorUserId: userId, eventType: "SPENDING_REQUEST_CREATED", entityType: "spending_request", entityId: created.id,
        notification: {
          audience: "members", category: "payment", message: `Payment #${created.id} was proposed.`,
          signerMessage: `Payment #${created.id} needs your signature.`,
        },
      });
      return created;
    } catch (error) {
      if (error.code === "P2002") throw new WalletError(409, "An input is already reserved");
      throw error;
    }
  }, { timeout: 60000, maxWait: 10000 });
}

async function getSpend(userId, communityId, spendId, includePsbt = false) {
  const wallet = await getWallet(userId, communityId);
  const spend = await prisma.spendingRequest.findFirst({
    where: { id: spendId, walletId: wallet.id }, include: {
      signatures: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!spend) throw new WalletError(404, "Spending request not found");
  const result = {
    id: spend.id, status: spend.status, recipient: spend.recipient,
    amountSats: spend.amountSats.toString(), feeSats: spend.feeSats.toString(),
    signatures: spend.signatures.map((s) => ({ signerId: s.signerId, createdAt: s.createdAt })),
    requiredSignatures: wallet.requiredSignatures, signerCount: snapshot(wallet).length, txid: spend.txid,
    createdBy: spend.createdBy, createdAt: spend.createdAt, updatedAt: spend.updatedAt,
  };
  if (includePsbt) {
    const signer = snapshot(wallet).find((s) => s.userId === userId);
    if (!signer) throw new WalletError(403, "Only wallet signers may retrieve the PSBT");
    result.psbt = spend.psbt;
  }
  return result;
}

async function listSpends(userId, communityId) {
  const wallet = await getWallet(userId, communityId);
  const spends = await prisma.spendingRequest.findMany({
    where: { walletId: wallet.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true, status: true, recipient: true, amountSats: true, feeSats: true,
      txid: true, createdAt: true, updatedAt: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      signatures: { select: { signerId: true, createdAt: true }, orderBy: { createdAt: "asc" } },
    },
  });
  return {
    requiredSignatures: wallet.requiredSignatures,
    signerCount: snapshot(wallet).length,
    spends: spends.map((spend) => ({
      ...spend,
      amountSats: spend.amountSats.toString(),
      feeSats: spend.feeSats.toString(),
    })),
  };
}

async function submitPsbt(userId, communityId, spendId, signedPsbt) {
  await requireMembership(prisma, userId, communityId);
  if (typeof signedPsbt !== "string" || signedPsbt.length > 200000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(signedPsbt)) throw new WalletError(400, "Invalid PSBT");
  await rpc.assertRegtest();
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.communityWallet.findUnique({ where: { communityId } });
    if (!wallet) throw new WalletError(404, "Community wallet not found");
    await requireMembership(tx, userId, communityId);
    const signer = snapshot(wallet).find((s) => s.userId === userId);
    if (!signer) throw new WalletError(403, "Not an authorized wallet signer");
    await tx.$queryRaw`SELECT "id" FROM "SpendingRequest" WHERE "id" = ${spendId} FOR UPDATE`;
    const spend = await tx.spendingRequest.findFirst({ where: { id: spendId, walletId: wallet.id }, include: { signatures: true } });
    if (!spend) throw new WalletError(404, "Spending request not found");
    if (spend.status !== "SIGNING") throw new WalletError(409, "Spending request is not collecting signatures");
    if (spend.signatures.some((s) => s.signerId === signer.signerId)) throw new WalletError(409, "Signer has already submitted a signature");
    const [current, incoming] = await Promise.all([
      rpc.call("decodepsbt", [spend.psbt]), rpc.call("decodepsbt", [signedPsbt]),
    ]);
    if (txFingerprint(incoming.tx) !== spend.unsignedTxHash || txFingerprint(current.tx) !== spend.unsignedTxHash) throw new WalletError(400, "Unsigned transaction changed");
    checkOutputs(incoming, wallet, spend.recipient, spend.amountSats, spend.feeSats);
    if (incoming.inputs.length !== current.inputs.length) throw new WalletError(400, "PSBT inputs changed");
    if (stableJson(incoming.outputs) !== stableJson(current.outputs)) throw new WalletError(400, "PSBT output metadata changed");
    const signerKeys = snapshot(wallet).map((item) => item.publicKey);
    if (!verifyWalletPolicy(spend.psbt, wallet.requiredSignatures, signerKeys) ||
        !verifyWalletPolicy(signedPsbt, wallet.requiredSignatures, signerKeys)) {
      throw new WalletError(400, "PSBT signing policy changed");
    }
    const finalizedSubmission = incoming.inputs.every((input) => input.final_scriptwitness);
    if (incoming.inputs.some((input) => Boolean(input.final_scriptwitness) !== finalizedSubmission)) {
      throw new WalletError(400, "PSBT inputs have inconsistent finalization");
    }
    for (let i = 0; i < incoming.inputs.length; i += 1) {
      const comparison = finalizedSubmission
        ? compareFinalizedInputMetadata(current.inputs[i], incoming.inputs[i])
        : compareInputMetadata(current.inputs[i], incoming.inputs[i], signer.publicKey);
      if (!comparison.valid) {
        // Log field names and types only; decoded PSBT values may contain sensitive wallet metadata.
        console.warn("Rejected PSBT input metadata change", { inputIndex: i, changes: comparison.changes });
        throw new WalletError(400, "PSBT input metadata changed");
      }
      if (!finalizedSubmission && !comparePartialSignatures(current.inputs[i], incoming.inputs[i], signer.publicKey)) {
        throw new WalletError(400, "PSBT does not contain only the expected new signer signature");
      }
    }
    const validSignerSignature = finalizedSubmission
      ? verifyFinalizedSignerPsbt(spend.psbt, signedPsbt, signer.publicKey, signerKeys)
      : verifySignerPsbt(signedPsbt, signer.publicKey);
    if (!validSignerSignature) throw new WalletError(400, "Invalid signer signature");
    const combined = await rpc.call("combinepsbt", [[spend.psbt, signedPsbt]]);
    const finalized = await rpc.call("finalizepsbt", [combined]);
    if (finalized.complete) {
      const [acceptance] = await rpc.call("testmempoolaccept", [[finalized.hex]]);
      if (!acceptance.allowed) throw new WalletError(400, `Signed transaction rejected: ${acceptance["reject-reason"] || "invalid signatures"}`);
    }
    await tx.spendingSignature.create({ data: { spendingRequestId: spend.id, signerId: signer.signerId, publicKey: signer.publicKey } });
    await tx.spendingRequest.update({ where: { id: spend.id }, data: { psbt: combined, status: finalized.complete ? "READY" : "SIGNING" } });
    await recordEvent(tx, {
      communityId, actorUserId: userId, eventType: "SPENDING_REQUEST_SIGNED", entityType: "spending_request", entityId: spend.id,
      dedupeKey: `spend-signature:${spend.id}:${signer.signerId}`,
      metadata: { signatures: spend.signatures.length + 1, requiredSignatures: wallet.requiredSignatures },
      notification: { audience: "members", category: "payment", message: `Payment #${spend.id} received a signature.` },
    });
    if (finalized.complete) {
      await recordEvent(tx, {
        communityId, actorUserId: userId, eventType: "SPENDING_THRESHOLD_REACHED", entityType: "spending_request", entityId: spend.id,
        dedupeKey: `spend-ready:${spend.id}`,
        notification: { audience: "admins", category: "payment", message: `Payment #${spend.id} is ready to broadcast.` },
      });
    }
    return { status: finalized.complete ? "READY" : "SIGNING", signatures: spend.signatures.length + 1, requiredSignatures: wallet.requiredSignatures };
  }, { timeout: 60000, maxWait: 10000 });
}

async function broadcast(userId, communityId, spendId) {
  const membership = await requireMembership(prisma, userId, communityId);
  if (membership.role !== "COMMUNITY_ADMIN") throw new WalletError(403, "Forbidden");
  await rpc.assertRegtest();
  const spend = await asAdmin(userId, communityId, async (tx) => {
    const wallet = await tx.communityWallet.findUnique({ where: { communityId } });
    if (!wallet) throw new WalletError(404, "Community wallet not found");
    await tx.$queryRaw`SELECT "id" FROM "SpendingRequest" WHERE "id" = ${spendId} FOR UPDATE`;
    const item = await tx.spendingRequest.findFirst({ where: { id: spendId, walletId: wallet.id } });
    if (!item) throw new WalletError(404, "Spending request not found");
    if (item.status === "BROADCAST") return item;
    if (item.status === "BROADCASTING") return item;
    if (item.status !== "READY") throw new WalletError(409, "Spending request is not ready");
    return tx.spendingRequest.update({ where: { id: item.id }, data: { status: "BROADCASTING" } });
  });
  if (spend.status === "BROADCAST") {
    await recordBroadcastEvent(userId, communityId, spend);
    return { txid: spend.txid, status: "BROADCAST" };
  }
  const final = await rpc.call("finalizepsbt", [spend.psbt]);
  if (!final.complete) throw new WalletError(409, "PSBT does not have enough valid signatures");
  const decoded = await rpc.call("decoderawtransaction", [final.hex]);
  if (decoded.txid !== spend.txid && spend.txid) throw new WalletError(409, "Broadcast transaction changed");
  await prisma.spendingRequest.update({ where: { id: spend.id }, data: { txid: decoded.txid } });
  const wallet = await prisma.communityWallet.findUnique({ where: { communityId } });
  const alreadyKnown = await rpc.call("gettransaction", [decoded.txid, true, true], wallet.coreWalletName).catch(() => null);
  if (alreadyKnown) {
    await markBroadcast(userId, communityId, spend.id, decoded.txid);
    return { txid: decoded.txid, status: "BROADCAST" };
  }
  const [acceptance] = await rpc.call("testmempoolaccept", [[final.hex]]);
  if (!acceptance.allowed && !["txn-already-in-mempool", "txn-already-known"].includes(acceptance["reject-reason"])) {
    throw new WalletError(409, "Transaction is not accepted by the mempool");
  }
  try {
    await rpc.call("sendrawtransaction", [final.hex]);
  } catch (error) {
    // A previous attempt may have reached Core before the database update failed.
    const known = await rpc.call("gettransaction", [decoded.txid, true, true], wallet.coreWalletName).catch(() => null);
    if (!known) throw error;
  }
  await markBroadcast(userId, communityId, spend.id, decoded.txid);
  return { txid: decoded.txid, status: "BROADCAST" };
}

async function recordBroadcastEvent(userId, communityId, spend) {
  await recordEventTransaction({
    communityId, actorUserId: userId, eventType: "SPENDING_REQUEST_BROADCAST", entityType: "spending_request", entityId: spend.id,
    dedupeKey: `spend-broadcast:${spend.id}`, metadata: { txid: spend.txid },
    notification: { audience: "members", category: "payment", message: `Payment #${spend.id} was broadcast.`, bestEffort: true },
  });
}

async function markBroadcast(userId, communityId, spendId, txid) {
  await prisma.$transaction(async (tx) => {
    await tx.spendingRequest.update({ where: { id: spendId }, data: { status: "BROADCAST", txid } });
    await recordEvent(tx, {
      communityId, actorUserId: userId, eventType: "SPENDING_REQUEST_BROADCAST", entityType: "spending_request", entityId: spendId,
      dedupeKey: `spend-broadcast:${spendId}`, metadata: { txid },
      notification: { audience: "members", category: "payment", message: `Payment #${spendId} was broadcast.`, bestEffort: true },
    });
  });
}

async function cancelSpend(userId, communityId, spendId) {
  return asAdmin(userId, communityId, async (tx) => {
    const wallet = await tx.communityWallet.findUnique({ where: { communityId } });
    if (!wallet) throw new WalletError(404, "Community wallet not found");
    await tx.$queryRaw`SELECT "id" FROM "SpendingRequest" WHERE "id" = ${spendId} FOR UPDATE`;
    const spend = await tx.spendingRequest.findFirst({ where: { id: spendId, walletId: wallet.id } });
    if (!spend) throw new WalletError(404, "Spending request not found");
    if (!["SIGNING", "READY"].includes(spend.status)) throw new WalletError(409, "Spending request cannot be cancelled");
    await tx.spendingRequest.update({ where: { id: spend.id }, data: { status: "CANCELLED" } });
    await tx.spendingInput.updateMany({ where: { spendingRequestId: spend.id }, data: { reserved: false } });
    await recordEvent(tx, {
      communityId, actorUserId: userId, eventType: "SPENDING_REQUEST_CANCELLED", entityType: "spending_request", entityId: spend.id,
      notification: { audience: "members", category: "payment", message: `Payment #${spend.id} was cancelled.` },
    });
    return { id: spend.id, status: "CANCELLED" };
  });
}

module.exports = { WalletError, createWallet, getWallet, publicWallet, balance, utxos, transactions, transaction, createSpend, listSpends, getSpend, submitPsbt, broadcast, cancelSpend };
