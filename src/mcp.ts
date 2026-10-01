import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  environmentAccessToken,
  resolveActingContext,
} from "./actingContext";
import { ensureFreshTokens, errorMessage } from "./auth";
import { CLI_VERSION, callProcedure, createHttpCaller } from "./http";
import { toObjectInputSchema } from "./mcpSchema";
import { listOrgRoles, loadOrganizationNames, verifyOrganization } from "./orgs";
import { buildToolRegistry, type CliTool, findTool, validateToolInput } from "./registry";

const ORGANIZATION_ARGUMENT = "organizationId";
const LIST_ORGANIZATIONS_TOOL = "listOrganizations";

const INSTRUCTIONS = [
  "Feastalytics tools, acting as the user logged in with `feast login`.",
  `Every tool acts on one organization, chosen by the ${ORGANIZATION_ARGUMENT} argument. Call ${LIST_ORGANIZATIONS_TOOL} to see the user's organizations and roles. ${ORGANIZATION_ARGUMENT} may be left out only when the user belongs to exactly one.`,
  "Read-only tools never change anything. Every other tool writes to production for a real restaurant, so be sure of the organization and the change before calling one.",
].join("\n\n");

const ORGANIZATION_PROPERTY = {
  type: "string",
  description: `Organization to act on, from ${LIST_ORGANIZATIONS_TOOL}. Required unless the user belongs to exactly one organization.`,
};

const LIST_ORGANIZATIONS: Tool = {
  name: LIST_ORGANIZATIONS_TOOL,
  description:
    "List the organizations the logged-in user can act on, with each one's name and the user's role there. Use an organizationId from here on every other tool.",
  inputSchema: { type: "object", properties: {} },
  annotations: { readOnlyHint: true },
};

function toMcpTool(tool: CliTool): Tool {
  const schema = toObjectInputSchema(tool.inputJsonSchema);
  return {
    name: tool.id,
    description: tool.description,
    inputSchema: {
      ...schema,
      type: "object",
      properties: {
        ...schema.properties,
        [ORGANIZATION_ARGUMENT]: ORGANIZATION_PROPERTY,
      },
    },
    annotations: { readOnlyHint: tool.type === "query" },
  };
}

function jsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value ?? null, null, 2) }],
  };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function listOrganizations(): Promise<unknown> {
  if (environmentAccessToken() != null) {
    const acting = await resolveActingContext(undefined, undefined);
    return [{ organizationId: acting.organizationId, role: acting.roleLabel }];
  }
  const tokens = await ensureFreshTokens();
  const accessToken = tokens.accessToken.jwtToken;
  const namesByOrgId = await loadOrganizationNames(accessToken);
  return listOrgRoles(accessToken).map((orgRole) => ({
    organizationId: orgRole.organizationId,
    name: namesByOrgId.get(orgRole.organizationId) ?? null,
    role: orgRole.role,
  }));
}

async function callManifestTool(
  tool: CliTool,
  args: { [key: string]: unknown }
): Promise<CallToolResult> {
  const { [ORGANIZATION_ARGUMENT]: organizationId, ...input } = args;
  if (organizationId != null && typeof organizationId !== "string") {
    return errorResult(`${ORGANIZATION_ARGUMENT} must be a string`);
  }
  const issues = validateToolInput(tool, input);
  if (issues.length > 0) {
    return errorResult(
      `Input does not match the tool schema:\n${issues.join("\n")}`
    );
  }
  const acting = await resolveActingContext(
    organizationId ?? undefined,
    undefined
  );
  const client = createHttpCaller({
    accessToken: acting.accessToken,
    preferredRole: acting.preferredRole,
  });
  if (tool.type === "mutation") {
    await verifyOrganization(client, acting.organizationId);
  }
  return jsonResult(await callProcedure(client, tool.path, tool.type, input));
}

async function callTool(
  name: string,
  args: { [key: string]: unknown }
): Promise<CallToolResult> {
  try {
    if (name === LIST_ORGANIZATIONS_TOOL) {
      return jsonResult(await listOrganizations());
    }
    const tool = findTool(name);
    if (tool == null) {
      return errorResult(`Unknown tool "${name}"`);
    }
    return await callManifestTool(tool, args);
  } catch (error) {
    return errorResult(errorMessage(error));
  }
}

export async function runMcpServer(): Promise<void> {
  const tools = [LIST_ORGANIZATIONS, ...buildToolRegistry().map(toMcpTool)];
  const server = new Server(
    { name: "feast", version: CLI_VERSION },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callTool(request.params.name, request.params.arguments ?? {})
  );
  const closed = new Promise<void>((resolve) => {
    server.onclose = resolve;
    process.stdin.once("end", resolve);
  });
  await server.connect(new StdioServerTransport());
  await closed;
}
