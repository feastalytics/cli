import { ensureFreshTokens } from "./auth";
import { CLI_MANIFEST } from "./generated/manifest";
import {
  formRoleArn,
  resolveOrganizationId,
  resolvePreferredRole,
} from "./orgs";

export interface ActingContext {
  accessToken: string;
  organizationId: string;
  preferredRole: string;
  roleLabel: string;
  source: "environment" | "credentials";
}

export function environmentAccessToken(): string | undefined {
  const token = process.env.FEAST_ACCESS_TOKEN;
  return token != null && token.length > 0 ? token : undefined;
}

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (value != null && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function roleLabelFromArn(arn: string): string {
  return arn.split("/").pop()?.split(".").pop() ?? arn;
}

function buildPreferredRole(organizationId: string, role: string): string {
  if (role.startsWith("arn:")) {
    return role;
  }
  if (!CLI_MANIFEST.organizationRoles.includes(role)) {
    throw new Error(
      `Unknown role "${role}". Expected one of ${CLI_MANIFEST.organizationRoles.join(", ")}, or a full role ARN.`
    );
  }
  return formRoleArn(organizationId, role);
}

function resolvePinned(
  pinned: string | undefined,
  flag: string | undefined,
  variableName: string,
  flagName: string
): string | undefined {
  if (pinned == null) {
    return flag;
  }
  if (flag != null && flag !== pinned) {
    throw new Error(
      `${variableName} pins this session to ${pinned}, so ${flagName} ${flag} is not allowed.`
    );
  }
  return pinned;
}

function resolveFromEnvironment(
  accessToken: string,
  orgFlag: string | undefined,
  roleFlag: string | undefined
): ActingContext {
  const organizationId = resolvePinned(
    firstNonEmpty(process.env.FEAST_ORGANIZATION_ID),
    orgFlag,
    "FEAST_ORGANIZATION_ID",
    "--org"
  );
  if (organizationId == null) {
    throw new Error(
      "FEAST_ACCESS_TOKEN is set, so the organization cannot be read from the token. Pass --org <organizationId> or set FEAST_ORGANIZATION_ID."
    );
  }
  const role = resolvePinned(
    firstNonEmpty(process.env.FEAST_PREFERRED_ROLE),
    roleFlag,
    "FEAST_PREFERRED_ROLE",
    "--role"
  );
  if (role == null) {
    throw new Error(
      "FEAST_ACCESS_TOKEN is set, so the role cannot be read from the token. Pass --role <role> or set FEAST_PREFERRED_ROLE."
    );
  }
  const preferredRole = buildPreferredRole(organizationId, role);
  return {
    accessToken,
    organizationId,
    preferredRole,
    roleLabel: roleLabelFromArn(preferredRole),
    source: "environment",
  };
}

export async function resolveActingContext(
  orgFlag: string | undefined,
  roleFlag: string | undefined
): Promise<ActingContext> {
  const environmentToken = environmentAccessToken();
  if (environmentToken != null) {
    return resolveFromEnvironment(environmentToken, orgFlag, roleFlag);
  }

  const tokens = await ensureFreshTokens();
  const accessToken = tokens.accessToken.jwtToken;
  const organizationId = resolveOrganizationId(accessToken, orgFlag);
  const resolved = resolvePreferredRole(accessToken, organizationId);
  return {
    accessToken,
    organizationId,
    preferredRole: resolved.arn,
    roleLabel: resolved.orgRole.role,
    source: "credentials",
  };
}
