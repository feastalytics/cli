import { decodeJwtPayload } from "./auth";
import { CLI_MANIFEST } from "./generated/manifest";

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
