// Server secrets. Each comes from its environment variable when set; otherwise Socio generates it once
// and keeps it in DATA_DIR/secrets.json (readable by the app's user only), so a fresh install needs no
// hand-made secrets. DATA_DIR must survive redeploys: losing ENCRYPTION_KEY means reconnecting every account.
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const GENERATORS = {
  ENCRYPTION_KEY: () => randomBytes(32).toString("hex"),
  SESSION_SECRET: () => randomBytes(48).toString("base64url"),
  CRON_SECRET: () => randomBytes(32).toString("base64url"),
};
export type SecretName = keyof typeof GENERATORS;

export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR || "./data");
}

let cache: Record<string, string> | null = null;

function stored(): Record<string, string> {
  if (cache) return cache;
  const file = path.join(dataDir(), "secrets.json");
  const current: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  let changed = false;
  for (const [name, make] of Object.entries(GENERATORS)) {
    if (!process.env[name] && !current[name]) {
      current[name] = make();
      changed = true;
    }
  }
  if (changed) {
    mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify(current, null, 2), { mode: 0o600 });
    chmodSync(file, 0o600);
  }
  cache = current;
  return current;
}

export function secret(name: SecretName): string {
  return process.env[name] || stored()[name];
}

/**
 * Writes DATA_DIR/cron.sh, the script the hosting cron job runs every minute.
 * It holds the cron secret, so the cron job's command never has to.
 */
export function writeCronScript() {
  const url = `${(process.env.APP_URL ?? "").replace(/\/+$/, "")}/api/cron/publish`;
  const file = path.join(dataDir(), "cron.sh");
  const body = `#!/bin/sh\n# Written by Socio at startup. Publishes due posts.\ncurl -fsS -m 290 -H "x-cron-secret: ${secret("CRON_SECRET")}" "${url}" >/dev/null\n`;
  mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  writeFileSync(file, body, { mode: 0o700 });
  chmodSync(file, 0o700);
}
