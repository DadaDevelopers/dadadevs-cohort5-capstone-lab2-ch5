const { spawnSync } = require("node:child_process");

// Keep application limiters isolated and roomy. Focused limiter tests create
// their own short-lived instances, so no test run needs to wait for a window.
const result = spawnSync(process.execPath, ["--test"], {
  env: { ...process.env, NODE_ENV: "test" },
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.signal) process.kill(process.pid, result.signal);
process.exitCode = result.status ?? 1;
