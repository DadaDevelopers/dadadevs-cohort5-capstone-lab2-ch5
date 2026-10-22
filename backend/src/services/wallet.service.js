const prisma = require("../lib/prisma");
const { BitcoinRpc } = require("../lib/bitcoin-rpc");
const { btcToSats, satsToBtc, publicKeys, txFingerprint } = require("../lib/bitcoin-values");
const {
  stableJson, compareInputMetadata, compareFinalizedInputMetadata, comparePartialSignatures,
  verifyWalletPolicy, verifyFinalizedSignerPsbt, verifySignerPsbt,
} = require("../lib/psbt-verification");
const { requireMembership, asAdmin } = require("./community-access.service");

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
      if (existing.status === "ERROR") return existing;
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
    const ready = await prisma.communityWallet.update({ where: { id: wallet.id }, data: { status: "READY" } });
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

async function transactions(userId, communityId) {
  const wallet = await getWallet(userId, communityId);
  if (wallet.status !== "READY") throw new WalletError(409, "Community wallet is not ready");
  await rpc.assertRegtest();
  const items = await rpc.call("listtransactions", ["*", 100, 0, true], wallet.coreWalletName);
  return items.filter((i) => i.address === wallet.address || i.category === "send").map((i) => ({
    txid: i.txid, category: i.category, amountSats: btcToSats(Math.abs(i.amount)).toString(),
    confirmations: i.confirmations, blockhash: i.blockhash || null, time: i.time,
  }));
}

async function transaction(userId, communityId, txid) {
  if (!/^[0-9a-f]{64}$/i.test(txid)) throw new WalletError(400, "Invalid transaction ID");
  const wallet = await getWallet(userId, communityId);
  await rpc.assertRegtest();
  const item = await rpc.call("gettransaction", [txid, true, true], wallet.coreWalletName);
  return { txid, confirmations: item.confirmations, blockhash: item.blockhash || null, amountSats: btcToSats(Math.abs(item.amount)).toString() };
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
      return await tx.spendingRequest.create({
        data: {
          walletId: wallet.id, createdById: userId, recipient, amountSats: amount,
          feeSats: fee, unsignedTxHash: txFingerprint(decoded.tx), psbt: funded.psbt,
          inputs: { create: actual.map((i) => ({ walletId: wallet.id, ...i })) },
        }, select: { id: true, status: true, recipient: true, amountSats: true, feeSats: true },
      });
    } catch (error) {
      if (error.code === "P2002") throw new WalletError(409, "An input is already reserved");
      throw error;
    }
  }, { timeout: 60000, maxWait: 10000 });
}

async function getSpend(userId, communityId, spendId, includePsbt = false) {
  const wallet = await getWallet(userId, communityId);
  const spend = await prisma.spendingRequest.findFirst({
    where: { id: spendId, walletId: wallet.id }, include: { signatures: true },
  });
  if (!spend) throw new WalletError(404, "Spending request not found");
  const result = {
    id: spend.id, status: spend.status, recipient: spend.recipient,
    amountSats: spend.amountSats.toString(), feeSats: spend.feeSats.toString(),
    signatures: spend.signatures.map((s) => ({ signerId: s.signerId, createdAt: s.createdAt })),
    requiredSignatures: wallet.requiredSignatures, txid: spend.txid,
  };
  if (includePsbt) {
    const signer = snapshot(wallet).find((s) => s.userId === userId);
    if (!signer) throw new WalletError(403, "Only wallet signers may retrieve the PSBT");
    result.psbt = spend.psbt;
  }
  return result;
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
  if (spend.status === "BROADCAST") return { txid: spend.txid, status: "BROADCAST" };
  const final = await rpc.call("finalizepsbt", [spend.psbt]);
  if (!final.complete) throw new WalletError(409, "PSBT does not have enough valid signatures");
  const decoded = await rpc.call("decoderawtransaction", [final.hex]);
  if (decoded.txid !== spend.txid && spend.txid) throw new WalletError(409, "Broadcast transaction changed");
  await prisma.spendingRequest.update({ where: { id: spend.id }, data: { txid: decoded.txid } });
  const wallet = await prisma.communityWallet.findUnique({ where: { communityId } });
  const alreadyKnown = await rpc.call("gettransaction", [decoded.txid, true, true], wallet.coreWalletName).catch(() => null);
  if (alreadyKnown) {
    await prisma.spendingRequest.update({ where: { id: spend.id }, data: { status: "BROADCAST" } });
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
  await prisma.spendingRequest.update({ where: { id: spend.id }, data: { status: "BROADCAST" } });
  return { txid: decoded.txid, status: "BROADCAST" };
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
    return { id: spend.id, status: "CANCELLED" };
  });
}

module.exports = { WalletError, createWallet, getWallet, publicWallet, balance, utxos, transactions, transaction, createSpend, getSpend, submitPsbt, broadcast, cancelSpend };
