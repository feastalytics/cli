import { CLI_MANIFEST, type CliManifestTool } from "./generated/manifest";

export type CliTool = CliManifestTool;

export function buildToolRegistry(): CliTool[] {
  return CLI_MANIFEST.tools;
}

export function findTool(id: string): CliTool | undefined {
  return CLI_MANIFEST.tools.find((tool) => tool.id === id);
}

export function toolSummary(tool: CliTool): string {
  const summary = (tool as { summary?: string }).summary;
  if (summary != null && summary.length > 0) {
    return summary;
  }
  const firstLine = tool.description.trim().split("\n")[0] ?? "";
  const match = firstLine.match(/^.*?[.!?](?=\s|$)/);
  return (match?.[0] ?? firstLine).trim();
}

export function toolDetails(tool: CliTool): string | null {
  const details = (tool as { details?: string | null }).details;
  return details != null && details.length > 0 ? details : null;
}

export function toolInputJsonSchema(tool: CliTool): object {
  return tool.inputJsonSchema ?? { type: "object", properties: {} };
}
