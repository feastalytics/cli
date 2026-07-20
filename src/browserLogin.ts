import { spawn } from "child_process";
import { createHash, randomBytes } from "crypto";
import http from "http";
import { getWebBaseUrl } from "./config";
import { type StoredTokens, saveTokens } from "./credentials";
import { createHttpCaller } from "./http";

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function tabHtml(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#0f0f0f;color:#f5f5f5;
display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{text-align:center;padding:2rem 3rem}.t{font-size:1.4rem;font-weight:600;margin-bottom:.5rem}
.b{color:#a1a1a1}</style></head><body><div class="card">
<div class="t">${title}</div><div class="b">${body}</div></div></body></html>`;
}

function openBrowser(url: string): void {
  let command: string;
  let args: string[];
  if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Non-fatal: the URL is also printed for the user to open manually.
  }
}

interface Loopback {
  port: number;
  waitForCode: Promise<string>;
  close: () => void;
}

function startLoopback(expectedState: string): Promise<Loopback> {
  return new Promise((resolveOuter, rejectOuter) => {
    let resolveCode: (code: string) => void = () => {};
    let rejectCode: (error: Error) => void = () => {};
    const waitForCode = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });
    waitForCode.catch(() => {});

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

      const error = url.searchParams.get("error");
      if (error != null) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(tabHtml("Authorization declined", "You can close this tab."));
        rejectCode(new Error(`Authorization declined: ${error}`));
        return;
      }

      if (url.searchParams.get("state") !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          tabHtml("Invalid request", "State mismatch — retry from the CLI.")
        );
        rejectCode(new Error("State mismatch — aborting (possible CSRF)"));
        return;
      }

      const code = url.searchParams.get("code");
      if (code == null || code.length === 0) {
        res.writeHead(400);
        res.end();
        rejectCode(new Error("Authorization callback did not include a code"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        tabHtml(
          "You're all set ✓",
          "The feast CLI is authorized. Close this tab and return to your terminal."
        )
      );
      resolveCode(code);
    });

    const timeout = setTimeout(() => {
      rejectCode(
        new Error("Timed out waiting for browser authorization (5 minutes)")
      );
    }, CALLBACK_TIMEOUT_MS);

    const close = (): void => {
      clearTimeout(timeout);
      server.close();
    };

    server.on("error", rejectOuter);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address != null ? address.port : 0;
      resolveOuter({ port, waitForCode, close });
    });
  });
}

export async function browserLogin(): Promise<StoredTokens> {
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(
    createHash("sha256").update(codeVerifier).digest()
  );
  const state = base64url(randomBytes(16));

  const { port, waitForCode, close } = await startLoopback(state);
  try {
    const authUrl =
      `${getWebBaseUrl()}/oauth?port=${port}` +
      `&state=${encodeURIComponent(state)}` +
      `&challenge=${encodeURIComponent(codeChallenge)}`;

    console.error("Opening your browser to authorize the feast CLI...");
    console.error(`If it doesn't open, visit:\n  ${authUrl}\n`);
    openBrowser(authUrl);

    const code = await waitForCode;

    const client = createHttpCaller({});
    const tokens: StoredTokens = await client.api.auth.exchangeAuthCode.mutate({
      code,
      codeVerifier,
    });
    if (tokens == null) {
      throw new Error("Authorization failed: empty token response");
    }

    saveTokens(tokens);
    return tokens;
  } finally {
    close();
  }
}
