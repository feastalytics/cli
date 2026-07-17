import Ajv from "ajv";
import { CLI_MANIFEST, type CliManifestTool } from "./generated/manifest";

export type CliTool = CliManifestTool;

const ajv = new Ajv({ strict: false, allErrors: true });

export function buildToolRegistry(): CliTool[] {
  return CLI_MANIFEST.tools;
}

export function findTool(id: string): CliTool | undefined {
  return CLI_MANIFEST.tools.find((tool) => tool.id === id);
}

export function toolInputJsonSchema(tool: CliTool): object {
  return tool.inputJsonSchema ?? { type: "object", properties: {} };
}

export function validateToolInput(tool: CliTool, input: unknown): string[] {
  if (tool.inputJsonSchema == null) {
    return [];
  }
  const validate = ajv.compile(tool.inputJsonSchema);
  if (validate(input)) {
    return [];
  }
  return (validate.errors ?? []).map(
    (error) => `  ${error.instancePath || "(root)"}: ${error.message ?? "invalid"}`
  );
}
