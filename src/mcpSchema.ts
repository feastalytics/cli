type JsonSchema = { [key: string]: any };

function resolvePointer(root: JsonSchema, ref: string): unknown {
  if (!ref.startsWith("#/")) {
    return undefined;
  }
  let node: any = root;
  for (const segment of ref.slice(2).split("/")) {
    node = node?.[segment.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return node;
}

function collectRefs(node: unknown, refs: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((item) => collectRefs(item, refs));
    return;
  }
  if (node == null || typeof node !== "object") {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref" && typeof value === "string") {
      refs.add(value);
    } else {
      collectRefs(value, refs);
    }
  }
}

function retargetRefs(node: unknown, defNames: Map<string, string>): any {
  if (Array.isArray(node)) {
    return node.map((item) => retargetRefs(item, defNames));
  }
  if (node == null || typeof node !== "object") {
    return node;
  }
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => {
      const defName =
        key === "$ref" && typeof value === "string"
          ? defNames.get(value)
          : undefined;
      if (defName != null) {
        return [key, `#/$defs/${defName}`];
      }
      return [key, retargetRefs(value, defNames)];
    })
  );
}

function hoistRefs(root: JsonSchema): { schema: JsonSchema; defs: JsonSchema } {
  const refs = new Set<string>();
  collectRefs(root, refs);
  const defNames = new Map<string, string>();
  for (const ref of refs) {
    if (resolvePointer(root, ref) != null) {
      defNames.set(ref, `def${defNames.size + 1}`);
    }
  }
  const defs = Object.fromEntries(
    [...defNames].map(([ref, defName]) => [
      defName,
      retargetRefs(resolvePointer(root, ref), defNames),
    ])
  );
  return { schema: retargetRefs(root, defNames), defs };
}

function objectBranches(schema: JsonSchema): JsonSchema[] {
  if (schema.type === "object") {
    return [schema];
  }
  const branches = schema.anyOf ?? schema.oneOf;
  if (!Array.isArray(branches)) {
    return [];
  }
  return branches.filter((branch) => branch?.type === "object");
}

function describeBranch(branch: JsonSchema, index: number): string {
  const keys = Object.keys(branch.properties ?? {});
  const required: string[] = branch.required ?? [];
  const requiredLabel =
    required.length > 0 ? ` (required: ${required.join(", ")})` : "";
  return `${index + 1}. ${keys.join(", ")}${requiredLabel}`;
}

function mergeBranches(branches: JsonSchema[]): JsonSchema {
  const variantsByKey = new Map<string, JsonSchema[]>();
  for (const branch of branches) {
    for (const [key, value] of Object.entries(branch.properties ?? {})) {
      const variants = variantsByKey.get(key) ?? [];
      const serialized = JSON.stringify(value);
      if (!variants.some((variant) => JSON.stringify(variant) === serialized)) {
        variants.push(value as JsonSchema);
      }
      variantsByKey.set(key, variants);
    }
  }
  const properties = Object.fromEntries(
    [...variantsByKey].map(([key, variants]) => [
      key,
      variants.length === 1 ? variants[0] : { anyOf: variants },
    ])
  );
  const required = [...variantsByKey.keys()].filter((key) =>
    branches.every((branch) => (branch.required ?? []).includes(key))
  );
  return {
    type: "object",
    description: [
      "Accepts exactly one of these shapes:",
      ...branches.map(describeBranch),
    ].join("\n"),
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export function toObjectInputSchema(raw: JsonSchema | null): JsonSchema {
  if (raw == null) {
    return { type: "object", properties: {} };
  }
  const { schema: hoisted, defs } = hoistRefs(raw);
  const branches = objectBranches(hoisted);
  if (branches.length === 0) {
    return { type: "object", properties: {} };
  }
  const { $schema: _schema, ...schema } =
    branches.length === 1 ? branches[0]! : mergeBranches(branches);
  return {
    ...schema,
    type: "object",
    properties: schema.properties ?? {},
    ...(Object.keys(defs).length > 0 ? { $defs: defs } : {}),
  };
}
