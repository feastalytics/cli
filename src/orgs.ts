import { decodeJwtPayload } from "./auth";
import { CLI_MANIFEST } from "./generated/manifest";
import { callProcedure, createHttpCaller } from "./http";

export interface OrgRole {
  organizationId: string;
  role: string;
}

export function listOrgRoles(accessTokenJwt: string): OrgRole[] {
  const groups = decodeJwtPayload(accessTokenJwt)["cognito:groups"] ?? [];
  const orgRoles: OrgRole[] = [];
  for (const group of groups) {
    const parts = group.split(".");
    if (parts.length !== 2) {
      continue;
    }
    const [organizationId, role] = parts;
    if (
      organizationId == null ||
      role == null ||
      !CLI_MANIFEST.organizationRoles.includes(role)
    ) {
      continue;
    }
    orgRoles.push({ organizationId, role });
  }
  return orgRoles;
}

export function formRoleArn(organizationId: string, role: string): string {
  return `arn:aws:iam::${CLI_MANIFEST.awsAccountId}:role/${organizationId}.${role}`;
}

export function resolveOrganizationId(
  accessTokenJwt: string,
  explicitOrganizationId: string | undefined
): string {
  if (explicitOrganizationId != null) {
    return explicitOrganizationId;
  }
  const orgRoles = listOrgRoles(accessTokenJwt);
  const uniqueOrgIds = [
    ...new Set(orgRoles.map((orgRole) => orgRole.organizationId)),
  ];
  if (uniqueOrgIds.length === 0) {
    throw new Error(
      "Your access token has no organization roles. Re-run: feast login <username>"
    );
  }
  if (uniqueOrgIds.length > 1) {
    const available = orgRoles
      .map((orgRole) => `  ${orgRole.organizationId} (${orgRole.role})`)
      .join("\n");
    throw new Error(
      `You belong to multiple organizations; pass --org <organizationId> to choose one (the API would otherwise silently pick one for you). Your organizations:\n${available}`
    );
  }
  return uniqueOrgIds[0]!;
}

export function resolvePreferredRole(
  accessTokenJwt: string,
  organizationId: string
): { arn: string; orgRole: OrgRole } {
  const orgRoles = listOrgRoles(accessTokenJwt);
  if (orgRoles.length === 0) {
    throw new Error(
      "Your access token has no organization roles. Re-run: feast login <username>"
    );
  }
  const candidates = orgRoles.filter(
    (orgRole) => orgRole.organizationId === organizationId
  );
  if (candidates.length === 0) {
    const available = orgRoles
      .map((orgRole) => `  ${orgRole.organizationId} (${orgRole.role})`)
      .join("\n");
    throw new Error(
      `You have no role in organization ${organizationId}. Your organizations:\n${available}`
    );
  }
  const precedence = CLI_MANIFEST.organizationRoles;
  const chosen = [...candidates].sort(
    (a, b) => precedence.indexOf(a.role) - precedence.indexOf(b.role)
  )[0]!;
  return {
    arn: formRoleArn(chosen.organizationId, chosen.role),
    orgRole: chosen,
  };
}

export async function loadOrganizationNames(
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

export async function verifyOrganization(
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
