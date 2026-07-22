import { createRequire } from "node:module";
import { createTRPCProxyClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import { getApiKey, getApiUrl } from "./config";
import { decodeJwtPayload } from "./jwt";

export interface RequestAuth {
  accessToken?: string;
  preferredRole?: string;
}

function readPackageVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    return require("../package.json").version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export const CLI_VERSION = readPackageVersion();
export const CLI_CLIENT_ID = `feast-cli/${CLI_VERSION}`;
const CLI_USER_AGENT = `${CLI_CLIENT_ID} node/${process.versions.node}`;

function usernameFromToken(accessToken: string): string | undefined {
  try {
    const payload = decodeJwtPayload(accessToken);
    return payload.username ?? payload.sub;
  } catch {
    return undefined;
  }
}

export function createHttpCaller(auth: RequestAuth): any {
  return createTRPCProxyClient<any>({
    transformer: superjson,
    links: [
      httpLink({
        url: getApiUrl(),
        headers: () => {
          const headers: { [key: string]: string } = {
            "x-api-key": getApiKey(),
            "x-client": CLI_CLIENT_ID,
            "user-agent": CLI_USER_AGENT,
          };
          if (auth.accessToken != null) {
            headers["x-access-token"] = `Bearer ${auth.accessToken}`;
            headers["x-timezone"] =
              Intl.DateTimeFormat().resolvedOptions().timeZone;
            const username = usernameFromToken(auth.accessToken);
            if (username != null) {
              headers["x-client-user"] = username;
            }
          }
          if (auth.preferredRole != null) {
            headers["x-preferred-role"] = auth.preferredRole;
          }
          return headers;
        },
      }),
    ],
  });
}

export function callProcedure(
  client: any,
  pathSegments: string[],
  type: "query" | "mutation",
  input: unknown
): Promise<any> {
  let node: any = client;
  for (const segment of pathSegments) {
    node = node[segment];
  }
  return type === "query" ? node.query(input) : node.mutate(input);
}
