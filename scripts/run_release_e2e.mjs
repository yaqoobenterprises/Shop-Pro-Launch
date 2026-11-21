import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

if (process.env.AQVORA_DISPOSABLE_STACK !== "1" || !process.env.AQVORA_LOCAL_SUPABASE_STATUS ||
    !/^[0-9a-f]{12,64}$/.test(process.env.AQVORA_E2E_RESTORE_CONTAINER ?? "")) {
  process.stderr.write("Release E2E requires an explicitly disposable local Supabase stack, status file and DB container; refusing a skipped green run.\n");
  process.exit(1);
}
const result = spawnSync(process.execPath, [fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)),
  "run", "tests/aqvora_release_e2e.test.ts", "tests/aqvora_release_security_e2e.test.ts",
  "--maxWorkers=1", "--no-file-parallelism"], {stdio: "inherit", env: process.env});
if (result.error) process.stderr.write(`${result.error.message}\n`);
process.exit(result.status ?? 1);
