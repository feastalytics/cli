import fs from "fs";
import {
  decodeJwtPayload,
  ensureFreshTokens,
  errorMessage,
  login,
  logout,
} from "./auth";
import { browserLogin } from "./browserLogin";
import { getWebBaseUrl } from "./config";
import { getCredentialsPath } from "./credentials";
import { callProcedure, createHttpCaller } from "./http";
import {
  listOrgRoles,
  resolveOrganizationId,
  resolvePreferredRole,
} from "./orgs";
import { promptConfirm, promptHidden, promptText } from "./prompt";
import {
  buildToolRegistry,
  type CliTool,
  findTool,
  toolInputJsonSchema,
  validateToolInput,
} from "./registry";

const USAGE = `Usage: feast <command> [options]

Commands:
  login                                 Log in via the browser (opens ${getWebBaseUrl()}/oauth)
  login --password [username]           Log in with username/password (headless/CI)
  logout                                Delete stored tokens
  whoami                                Show the logged-in user and their organizations
  tools [--domain <domain>] [--json]    List available tools
  describe <tool>                       Show a tool's description and input JSON schema
  call <tool> [options]                 Invoke a tool

Call options:
  --org <organizationId>    Organization to act on (required unless you belong to exactly one)
  --input <json>            Tool input as a JSON string (default: {})
  --input-file <path>       Tool input from a JSON file
  --yes                     Skip the confirmation prompt for mutations

Environment:
  FEAST_API_URL             Override the API base URL (default: production)
  FEAST_WEB_URL             Override the web app base URL for browser login (default: production)`;

interface ParsedArgs {
  positional: string[];
  flags: { [key: string]: string | boolean };
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: { [key: string]: string | boolean } = {};
  const valueFlags = new Set(["org", "input", "input-file", "domain"]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (valueFlags.has(name)) {
      const value = argv[i + 1];
      if (value == null || value.startsWith("--")) {
        throw new Error(`Flag --${name} requires a value`);
      }
      flags[name] = value;
      i++;
    } else {
      flags[name] = true;
    }
  }
  return { positional, flags };
}

async function commandLogin(args: ParsedArgs): Promise<void> {
  if (args.flags["password"] === true) {
    const username =
      args.positional[0] ?? (await promptText("Username: "));
    if (username.length === 0) {
      throw new Error("Username is required");
    }
    const password = await promptHidden("Password: ");
    if (password.length === 0) {
      throw new Error("Password is required");
    }
    const tokens = await login(username, password);
    const payload = decodeJwtPayload(tokens.accessToken.jwtToken);
    console.info(`Logged in as ${payload.username ?? username}`);
    console.info(`Tokens stored in ${getCredentialsPath()}`);
    return;
  }

  const tokens = await browserLogin();
  const payload = decodeJwtPayload(tokens.accessToken.jwtToken);
  console.info(`Logged in as ${payload.username ?? payload.sub}`);
  console.info(`Tokens stored in ${getCredentialsPath()}`);
}

async function commandWhoami(): Promise<void> {
  const tokens = await ensureFreshTokens();
  const payload = decodeJwtPayload(tokens.accessToken.jwtToken);
  const orgRoles = listOrgRoles(tokens.accessToken.jwtToken);
  console.info(`User: ${payload.username ?? payload.sub}`);
  console.info(`Sub: ${payload.sub}`);

  const namesByOrgId = await loadOrganizationNames(tokens.accessToken.jwtToken);

  console.info("Organizations:");
  for (const orgRole of orgRoles) {
    const name = namesByOrgId.get(orgRole.organizationId);
    const label = name != null ? `${name} — ${orgRole.organizationId}` : orgRole.organizationId;
    console.info(`  ${label} (${orgRole.role})`);
  }
}

async function loadOrganizationNames(
  accessToken: string
): Promise<Map<string, string>> {
  const namesByOrgId = new Map<string, string>();
  try {
    const client = createHttpCaller({ accessToken });
    const organizations = await client.api.user.organizations.query();
    for (const entry of organizations ?? []) {
      const id = entry?.organization?.organizationId;
      const name = entry?.organization?.name;
      if (id != null && name != null) {
        namesByOrgId.set(id, name);
      }
    }
  } catch {
    return namesByOrgId;
  }
  return namesByOrgId;
}

function commandTools(args: ParsedArgs): void {
  const domainFilter = args.flags["domain"] as string | undefined;
  const tools = buildToolRegistry().filter(
    (tool) => domainFilter == null || tool.domain === domainFilter
  );
  if (args.flags["json"] === true) {
    console.info(
      JSON.stringify(
        tools.map((tool) => ({
          id: tool.id,
          domain: tool.domain,
          type: tool.type,
          needsApproval: tool.needsApproval,
          path: tool.path.join("."),
        })),
        null,
        2
      )
    );
    return;
  }
  for (const tool of tools) {
    const flags = [
      tool.type,
      ...(tool.needsApproval ? ["needs-approval"] : []),
    ].join(", ");
    console.info(`${tool.id} [${tool.domain}] (${flags})`);
    console.info(`    ${tool.description.split("\n")[0]}`);
  }
}

function commandDescribe(args: ParsedArgs): void {
  const toolId = args.positional[0];
  if (toolId == null) {
    throw new Error("Usage: feast describe <tool>");
  }
  const tool = requireTool(toolId);
  console.info(`Tool: ${tool.id}`);
  console.info(`Domain: ${tool.domain}`);
  console.info(`Type: ${tool.type}`);
  console.info(`Procedure: ${tool.path.join(".")}`);
  console.info(`Needs approval: ${tool.needsApproval}`);
  console.info(`\n${tool.description}`);
  console.info("\nInput schema:");
  console.info(JSON.stringify(toolInputJsonSchema(tool), null, 2));
}

function requireTool(toolId: string): CliTool {
  const tool = findTool(toolId);
  if (tool != null) {
    return tool;
  }
  const available = buildToolRegistry()
    .map((candidate) => `  ${candidate.id}`)
    .join("\n");
  throw new Error(`Unknown tool "${toolId}". Available tools:\n${available}`);
}

function readCallInput(args: ParsedArgs): unknown {
  const inputJson = args.flags["input"] as string | undefined;
  const inputFile = args.flags["input-file"] as string | undefined;
  if (inputJson != null && inputFile != null) {
    throw new Error("Pass either --input or --input-file, not both");
  }
  let raw = inputJson;
  if (inputFile != null) {
    raw = fs.readFileSync(inputFile, "utf-8");
  }
  if (raw == null) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Input is not valid JSON: ${errorMessage(error)}`);
  }
}

async function verifyOrganization(
  client: any,
  expectedOrganizationId: string
): Promise<{ id: string; name?: string }> {
  const result = await callProcedure(
    client,
    ["api", "organization", "loadCurrentOrganization"],
    "query",
    {}
  );
  const organization = result?.organization ?? result;
  const resolvedId = organization?.organizationId ?? organization?.id;
  if (resolvedId == null) {
    throw new Error(
      "Could not verify the resolved organization; aborting before any write"
    );
  }
  if (resolvedId !== expectedOrganizationId) {
    throw new Error(
      `Organization mismatch: requested ${expectedOrganizationId} but the API resolved ${resolvedId}. Aborting.`
    );
  }
  return { id: resolvedId, name: organization?.name };
}

async function commandCall(args: ParsedArgs): Promise<void> {
  const toolId = args.positional[0];
  if (toolId == null) {
    throw new Error("Usage: feast call <tool> [options]");
  }
  const tool = requireTool(toolId);
  const input = readCallInput(args);

  const issues = validateToolInput(tool, input);
  if (issues.length > 0) {
    throw new Error(
      `Input does not match the tool schema:\n${issues.join("\n")}\n\nRun: feast describe ${tool.id}`
    );
  }

  const tokens = await ensureFreshTokens();
  const isWrite = tool.type === "mutation" || tool.needsApproval;

  const organizationId = resolveOrganizationId(
    tokens.accessToken.jwtToken,
    args.flags["org"] as string | undefined
  );
  const resolved = resolvePreferredRole(
    tokens.accessToken.jwtToken,
    organizationId
  );
  console.error(
    `Acting on organization ${organizationId} as ${resolved.orgRole.role}`
  );

  const client = createHttpCaller({
    accessToken: tokens.accessToken.jwtToken,
    preferredRole: resolved.arn,
  });

  if (isWrite) {
    const organization = await verifyOrganization(client, organizationId);
    if (args.flags["yes"] !== true) {
      const orgLabel =
        organization.name != null
          ? `"${organization.name}" (${organization.id})`
          : organization.id;
      const approved = await promptConfirm(
        `Run ${tool.id} (${tool.type}) against organization ${orgLabel}?`
      );
      if (!approved) {
        console.error("Aborted");
        process.exitCode = 1;
        return;
      }
    }
  }

  const result = await callProcedure(client, tool.path, tool.type, input);
  console.info(JSON.stringify(result ?? null, null, 2));
}

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  switch (command) {
    case "login":
      await commandLogin(args);
      break;
    case "logout":
      logout();
      console.info("Logged out");
      break;
    case "whoami":
      await commandWhoami();
      break;
    case "tools":
      commandTools(args);
      break;
    case "describe":
      commandDescribe(args);
      break;
    case "call":
      await commandCall(args);
      break;
    default:
      console.info(USAGE);
      if (command != null && command !== "help") {
        process.exitCode = 1;
      }
  }
}
