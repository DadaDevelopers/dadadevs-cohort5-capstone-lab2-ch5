const fs = require("node:fs/promises");

class BitcoinRpcError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "BitcoinRpcError";
    this.code = code;
  }
}

class BitcoinRpc {
  constructor(options = {}) {
    this.url = new URL(options.url || process.env.BITCOIN_RPC_URL || "http://127.0.0.1:18444");
    if (this.url.protocol !== "http:" || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(this.url.hostname)) {
      throw new BitcoinRpcError("Bitcoin RPC must use local HTTP", "CONFIG");
    }
    const explicitCredentials = options.user !== undefined || options.password !== undefined;
    this.cookieFile = options.cookieFile !== undefined
      ? options.cookieFile
      : explicitCredentials ? undefined : process.env.BITCOIN_RPC_COOKIE_FILE;
    this.user = options.user ?? process.env.BITCOIN_RPC_USER;
    this.password = options.password ?? process.env.BITCOIN_RPC_PASSWORD;
    this.timeoutMs = Number(options.timeoutMs || process.env.BITCOIN_RPC_TIMEOUT_MS || 10000);
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 100 || this.timeoutMs > 120000) {
      throw new BitcoinRpcError("Invalid Bitcoin RPC timeout", "CONFIG");
    }
  }

  async credentials() {
    if (this.cookieFile) {
      try {
        const cookie = (await fs.readFile(this.cookieFile, "utf8")).trim();
        if (/^[^:\s]+:[^\s]+$/.test(cookie)) return cookie;
      } catch (_) { /* keep the cookie path out of error messages */ }
      throw new BitcoinRpcError("Bitcoin RPC cookie cannot be read", "CONFIG");
    }
    if (this.user && this.password) return `${this.user}:${this.password}`;
    throw new BitcoinRpcError("Bitcoin RPC credentials are not configured", "CONFIG");
  }

  async call(method, params = [], walletName) {
    if (!/^[a-z][a-z0-9]*$/.test(method)) throw new BitcoinRpcError("Invalid RPC method", "CONFIG");
    if (walletName && !/^communitysafe-[1-9][0-9]*$/.test(walletName)) {
      throw new BitcoinRpcError("Invalid coordinator wallet name", "CONFIG");
    }
    const url = new URL(this.url);
    url.pathname = walletName ? `/wallet/${encodeURIComponent(walletName)}` : "/";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Basic ${Buffer.from(await this.credentials()).toString("base64")}`,
        },
        body: JSON.stringify({ jsonrpc: "1.0", id: "communitysafe", method, params }),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) throw new BitcoinRpcError("Bitcoin RPC authentication failed", "AUTH");
      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object") throw new BitcoinRpcError("Invalid Bitcoin RPC response", "PROTOCOL");
      if (payload.error) throw new BitcoinRpcError(`Bitcoin RPC ${method} failed: ${payload.error.message}`, payload.error.code);
      if (!response.ok) throw new BitcoinRpcError(`Bitcoin RPC ${method} returned HTTP ${response.status}`, "HTTP");
      return payload.result;
    } catch (error) {
      if (error instanceof BitcoinRpcError) throw error;
      if (error.name === "AbortError") throw new BitcoinRpcError("Bitcoin RPC timed out", "TIMEOUT");
      throw new BitcoinRpcError("Bitcoin RPC connection failed", "CONNECTION");
    } finally {
      clearTimeout(timer);
    }
  }

  async assertRegtest() {
    const info = await this.call("getblockchaininfo");
    if (info.chain !== "regtest") throw new BitcoinRpcError("Bitcoin node is not on Regtest", "WRONG_NETWORK");
    return info;
  }
}

module.exports = { BitcoinRpc, BitcoinRpcError };
