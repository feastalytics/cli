import fs from "fs";
import os from "os";
import path from "path";

export interface StoredToken {
  jwtToken: string;
  expiration: number;
}

export interface StoredTokens {
  accessToken: StoredToken;
  idToken: StoredToken;
  refreshToken: string;
}

const CREDENTIALS_DIR = path.join(os.homedir(), ".config", "feast-cli");
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, "credentials.json");

export function saveTokens(tokens: StoredTokens): void {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
  });
}

export function loadTokens(): StoredTokens | undefined {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    return undefined;
  }
  try {
    return JSON.parse(
      fs.readFileSync(CREDENTIALS_PATH, "utf-8")
    ) as StoredTokens;
  } catch {
    return undefined;
  }
}

export function clearTokens(): void {
  if (fs.existsSync(CREDENTIALS_PATH)) {
    fs.rmSync(CREDENTIALS_PATH);
  }
}

export function getCredentialsPath(): string {
  return CREDENTIALS_PATH;
}
