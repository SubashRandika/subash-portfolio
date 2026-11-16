/**
 * Builds the site exactly as a production deployment would, so the checks in
 * next.config.ts (real domain, a way to get in touch) run locally.
 *
 *   NEXT_PUBLIC_SITE_URL=https://www.example.com npm run check:deploy
 */

import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DEPLOY_ENV: "production" },
});
process.exit(result.status ?? 1);
