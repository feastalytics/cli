import fs from "fs";
import { createRequire } from "node:module";
import os from "os";
import path from "path";

const PACKAGE_NAME = "@feastalytics/cli";
const REGISTRY_URL = "https://registry.npmjs.org";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;

const CACHE_DIR = path.join(os.homedir(), ".config", "feast-cli");
const CACHE_PATH = path.join(CACHE_DIR, "update-check.json");

interface UpdateCache {
  checkedAt: number;
  latest: string;
}

function readPackageVersion(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const version = require("../package.json").version;
    return typeof version === "string" ? version : undefined;
  } catch {
    return undefined;
  }
}

function parseVersion(version: string): number[] | undefined {
  const parts = version.split(".");
  if (parts.length !== 3) {
    return undefined;
  }
  const numbers = parts.map((part) => Number(part));
  return numbers.some((number) => !Number.isInteger(number) || number < 0)
    ? undefined
    : numbers;
}

function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (a == null || b == null) {
    return false;
  }
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) {
      return a[i]! > b[i]!;
    }
  }
  return false;
}

function isDisabled(): boolean {
  return (
    process.env.FEAST_NO_UPDATE_CHECK != null ||
    process.env.NO_UPDATE_NOTIFIER != null ||
    process.env.CI != null ||
    !process.stderr.isTTY
  );
}

function readCache(): UpdateCache | undefined {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(CACHE_PATH, "utf-8")
    ) as UpdateCache;
    return typeof parsed.latest === "string" &&
      typeof parsed.checkedAt === "number"
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(cache: UpdateCache): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
  } catch {
    return;
  }
}

async function fetchLatestVersion(): Promise<string | undefined> {
  try {
    const response = await fetch(
      `${REGISTRY_URL}/${encodeURIComponent(PACKAGE_NAME)}/latest`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === "string" ? body.version : undefined;
  } catch {
    return undefined;
  }
}

export async function notifyIfOutdated(): Promise<void> {
  if (isDisabled()) {
    return;
  }
  const current = readPackageVersion();
  if (current == null) {
    return;
  }
  const cached = readCache();
  let latest = cached?.latest;
  if (cached == null || Date.now() - cached.checkedAt > CHECK_INTERVAL_MS) {
    const fetched = await fetchLatestVersion();
    if (fetched != null) {
      latest = fetched;
      writeCache({ checkedAt: Date.now(), latest: fetched });
    } else {
      writeCache({ checkedAt: Date.now(), latest: latest ?? current });
    }
  }
  if (latest == null || !isNewer(latest, current)) {
    return;
  }
  console.error(
    `\nUpdate available: feast ${current} → ${latest}\n  npx ${PACKAGE_NAME}@latest <command>   (or: npm install -g ${PACKAGE_NAME}@latest)\n`
  );
}
