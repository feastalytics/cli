import { createTRPCProxyClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import { getApiKey, getApiUrl } from "./config";

export interface RequestAuth {
  accessToken?: string;
  preferredRole?: string;
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
          };
          if (auth.accessToken != null) {
            headers["x-access-token"] = `Bearer ${auth.accessToken}`;
            headers["x-timezone"] =
              Intl.DateTimeFormat().resolvedOptions().timeZone;
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
