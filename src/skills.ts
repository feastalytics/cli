import fs from "fs";
import os from "os";
import path from "path";
import { resolveActingContext } from "./actingContext";
import { callProcedure, createHttpCaller } from "./http";

interface SkillFile {
  path: string;
  content: string;
}

interface SkillIndexEntry {
  name: string;
  displayTitle: string;
  description: string;
  version: string;
  publishedAt: string;
}

interface SkillBundle extends SkillIndexEntry {
  files: SkillFile[];
}

const MARKER_FILE = ".feast-skill.json";
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function defaultSkillsDir(): string {
  return path.join(os.homedir(), ".claude", "skills");
}

async function createClient(orgFlag: string | undefined, roleFlag: string | undefined) {
  const acting = await resolveActingContext(orgFlag, roleFlag);
  return createHttpCaller({
    accessToken: acting.accessToken,
    preferredRole: acting.preferredRole,
  });
}

export async function listSkills(
  orgFlag: string | undefined,
  roleFlag: string | undefined
): Promise<SkillIndexEntry[]> {
  const client = await createClient(orgFlag, roleFlag);
  const entries = await callProcedure(client, ["api", "skills", "list"], "query", undefined);
  return Array.isArray(entries) ? entries : [];
}

export async function fetchSkill(
  name: string,
  orgFlag: string | undefined,
  roleFlag: string | undefined
): Promise<SkillBundle> {
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid skill name "${name}". Run: feast skill list`);
  }
  const client = await createClient(orgFlag, roleFlag);
  return callProcedure(client, ["api", "skills", "get"], "query", { name });
}

function assertInsideDir(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing to write outside the skill directory: ${relative}`);
  }
  return target;
}

function readMarker(dir: string): { version?: string } | undefined {
  const markerPath = path.join(dir, MARKER_FILE);
  if (!fs.existsSync(markerPath)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(markerPath, "utf-8"));
  } catch {
    return {};
  }
}

export function writeSkill(
  bundle: SkillBundle,
  targetDir: string,
  force: boolean
): { dir: string; written: number; replaced: boolean } {
  const dir = path.resolve(targetDir);
  const exists = fs.existsSync(dir);
  const marker = exists ? readMarker(dir) : undefined;
  if (exists && marker == null && !force) {
    throw new Error(
      `${dir} exists and was not installed by feast. Pass --force to replace it.`
    );
  }
  if (exists) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
  for (const file of bundle.files) {
    const target = assertInsideDir(dir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
  fs.writeFileSync(
    path.join(dir, MARKER_FILE),
    `${JSON.stringify(
      {
        name: bundle.name,
        version: bundle.version,
        publishedAt: bundle.publishedAt,
        installedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`
  );
  return { dir, written: bundle.files.length, replaced: exists };
}

export function shortVersion(version: string): string {
  return version.slice(0, 7);
}
