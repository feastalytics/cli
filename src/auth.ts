import {
  clearTokens,
  loadTokens,
  saveTokens,
  type StoredTokens,
} from "./credentials";
import { createHttpCaller } from "./http";

export interface AccessTokenPayload {
  sub: string;
  username?: string;
  "cognito:groups"?: string[];
  exp: number;
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function decodeJwtPayload(jwt: string): AccessTokenPayload {
  const payload = jwt.split(".")[1];
  if (payload == null) {
    throw new Error("Malformed JWT");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
}

export async function login(
  username: string,
  password: string
): Promise<StoredTokens> {
  const client = createHttpCaller({});
  const response = await client.api.auth.login.query({ username, password });
  if (response == null) {
    throw new Error("Login returned an empty response");
  }
  if (response.type === "challenge") {
    throw new Error(
      "This account requires a new password. Log in once through the web app to set it, then retry."
    );
  }
  if (response.type === "unconfirmed") {
    throw new Error(
      `Account ${response.username} is unconfirmed. Confirm it through the web app, then retry.`
    );
  }
  saveTokens(response.tokens);
  return response.tokens;
}

export function logout(): void {
  clearTokens();
}

export async function ensureFreshTokens(): Promise<StoredTokens> {
  const tokens = loadTokens();
  if (tokens == null) {
    throw new Error("Not logged in. Run: feast login <username>");
  }

  const now = Date.now();
  const needsRefresh = now >= tokens.accessToken.expiration - REFRESH_MARGIN_MS;
  if (!needsRefresh) {
    return tokens;
  }

  const isExpired = now >= tokens.accessToken.expiration;
  const client = createHttpCaller({
    accessToken: tokens.accessToken.jwtToken,
  });
  try {
    const refreshed = await client.api.auth.refresh.query({
      refreshToken: tokens.refreshToken,
    });
    const next: StoredTokens = {
      accessToken: refreshed.accessToken,
      idToken: refreshed.idToken,
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    };
    saveTokens(next);
    return next;
  } catch (error) {
    if (!isExpired) {
      console.error(
        `Warning: token refresh failed, continuing with the current access token: ${errorMessage(error)}`
      );
      return tokens;
    }
    throw new Error("Session expired. Run: feast login <username>");
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
