import Ajv, { type ErrorObject } from "ajv";
import { type CliTool } from "./registry";

const ajv = new Ajv({ strict: false, allErrors: true, logger: false });

const MAX_CONTEXTS = 3;
const MAX_RENDER_LENGTH = 2500;
const RENDER_DEPTHS = [4, 3, 2, 1, 0];
const UNION_KEYWORDS = ["anyOf", "oneOf"];

interface Issue {
  path: string;
  message: string;
  contextPointer: string;
  contextPath: string;
  fromUnion?: boolean;
}

const MAX_PLAIN_SHAPE_LINES = 15;

interface Walk {
  root: any;
  key: string;
}

function escapeSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function unescapeSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function nodeAt(root: any, pointer: string): any {
  if (pointer === "" || pointer === "#") {
    return root;
  }
  let node = root;
  for (const segment of pointer.replace(/^#\//, "").split("/")) {
    if (node == null) {
      return undefined;
    }
    node = node[unescapeSegment(segment)];
  }
  return node;
}

function resolve(walk: Walk, pointer: string): { node: any; pointer: string } {
  let current = pointer;
  const seen = new Set<string>();
  let node = nodeAt(walk.root, current);
  while (node != null && typeof node === "object" && typeof node.$ref === "string") {
    if (seen.has(current)) {
      break;
    }
    seen.add(current);
    current = node.$ref;
    node = nodeAt(walk.root, current);
  }
  return { node, pointer: current };
}

function childPointer(pointer: string, ...segments: string[]): string {
  const base = pointer === "" ? "#" : pointer;
  return [base, ...segments.map(escapeSegment)].join("/");
}

function displayPath(path: string): string {
  return path === "" ? "(root)" : path;
}

function validatorFor(walk: Walk, pointer: string): any {
  const ref = `${walk.key}${pointer === "" ? "" : pointer}`;
  return ajv.getSchema(ref);
}

function isValid(walk: Walk, pointer: string, value: unknown): boolean {
  const validate = validatorFor(walk, pointer);
  return validate == null ? true : validate(value) === true;
}

function errorsAt(walk: Walk, pointer: string, value: unknown): ErrorObject[] {
  const validate = validatorFor(walk, pointer);
  if (validate == null || validate(value) === true) {
    return [];
  }
  return [...(validate.errors ?? [])];
}

function jsonType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value;
}

function typeMatches(schemaType: unknown, value: unknown): boolean {
  if (schemaType == null) {
    return true;
  }
  const types = Array.isArray(schemaType) ? schemaType : [schemaType];
  const actual = jsonType(value);
  return types.some(
    (type) => type === actual || (type === "number" && actual === "integer")
  );
}

function isPlainObject(value: unknown): value is { [key: string]: unknown } {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isEmptySchema(node: any): boolean {
  return node === true || (isPlainObject(node) && Object.keys(node).length === 0);
}

function constProperties(node: any): { [key: string]: unknown } {
  const result: { [key: string]: unknown } = {};
  for (const [key, child] of Object.entries(node?.properties ?? {})) {
    if (isPlainObject(child) && "const" in child) {
      result[key] = (child as any).const;
    }
  }
  return result;
}

function branchMismatch(walk: Walk, pointer: string, value: unknown): number {
  const { node } = resolve(walk, pointer);
  if (node == null) {
    return 3;
  }
  if (isPlainObject(node.not) && isEmptySchema(node.not)) {
    return value === undefined ? 0 : 3;
  }
  if (!typeMatches(node.type, value)) {
    return 2;
  }
  if (isPlainObject(value)) {
    for (const [key, constant] of Object.entries(constProperties(node))) {
      if (key in value && value[key] !== constant) {
        return 1;
      }
    }
  }
  return 0;
}

function formatError(error: ErrorObject): string {
  const params = error.params as any;
  switch (error.keyword) {
    case "additionalProperties":
      return `must NOT have additional property '${params.additionalProperty}'`;
    case "const":
      return `must be ${JSON.stringify(params.allowedValue)}`;
    case "enum":
      return `must be one of ${(params.allowedValues ?? []).map((item: unknown) => JSON.stringify(item)).join(", ")}`;
    case "type":
      return `must be ${params.type}`;
    default:
      return error.message ?? "invalid";
  }
}

function explain(
  walk: Walk,
  pointer: string,
  path: string,
  value: unknown,
  context: { pointer: string; path: string }
): Issue[] {
  if (isValid(walk, pointer, value)) {
    return [];
  }
  const resolved = resolve(walk, pointer);
  const node = resolved.node;
  if (node == null || typeof node !== "object") {
    return [];
  }
  const unionKeyword = UNION_KEYWORDS.find((keyword) => Array.isArray(node[keyword]));
  if (unionKeyword != null) {
    return explainUnion(walk, resolved.pointer, unionKeyword, path, value, context).map(
      (issue) => ({ ...issue, fromUnion: true })
    );
  }
  const isObjectNode =
    node.type === "object" || (node.type == null && isPlainObject(node.properties));
  const ownContext =
    isObjectNode && isPlainObject(value)
      ? { pointer: resolved.pointer, path }
      : context;
  const issues: Issue[] = errorsAt(walk, resolved.pointer, value)
    .filter(
      (error) =>
        error.instancePath === "" && !UNION_KEYWORDS.includes(error.keyword)
    )
    .map((error) => ({
      path,
      message: formatError(error),
      contextPointer: isObjectNode ? resolved.pointer : context.pointer,
      contextPath: isObjectNode ? path : context.path,
    }));
  if (isPlainObject(value) && isPlainObject(node.properties)) {
    for (const [key, child] of Object.entries(value)) {
      if (key in node.properties) {
        issues.push(
          ...explain(walk, childPointer(resolved.pointer, "properties", key), `${path}/${escapeSegment(key)}`, child, ownContext)
        );
      } else if (isPlainObject(node.additionalProperties)) {
        issues.push(
          ...explain(walk, childPointer(resolved.pointer, "additionalProperties"), `${path}/${escapeSegment(key)}`, child, ownContext)
        );
      }
    }
  } else if (isPlainObject(value) && isPlainObject(node.additionalProperties)) {
    for (const [key, child] of Object.entries(value)) {
      issues.push(
        ...explain(walk, childPointer(resolved.pointer, "additionalProperties"), `${path}/${escapeSegment(key)}`, child, ownContext)
      );
    }
  }
  if (Array.isArray(value) && node.items != null) {
    value.forEach((item, index) => {
      const itemPointer = Array.isArray(node.items)
        ? childPointer(resolved.pointer, "items", String(index))
        : childPointer(resolved.pointer, "items");
      if (nodeAt(walk.root, itemPointer) != null) {
        issues.push(...explain(walk, itemPointer, `${path}/${index}`, item, context));
      }
    });
  }
  return issues;
}

function explainUnion(
  walk: Walk,
  pointer: string,
  keyword: string,
  path: string,
  value: unknown,
  context: { pointer: string; path: string }
): Issue[] {
  const branches: any[] = nodeAt(walk.root, pointer)[keyword];
  const scored = branches.map((_, index) => {
    const branchPointer = childPointer(pointer, keyword, String(index));
    const issues = explain(walk, branchPointer, path, value, context);
    return { index, issues, mismatch: branchMismatch(walk, branchPointer, value) };
  });
  if (isPlainObject(value)) {
    const discriminator = discriminatorIssue(walk, pointer, keyword, path, value, scored);
    if (discriminator != null) {
      return [discriminator];
    }
  }
  scored.sort(
    (left, right) =>
      left.mismatch - right.mismatch || left.issues.length - right.issues.length
  );
  const best = scored[0];
  if (best == null) {
    return [];
  }
  if (best.issues.length === 0) {
    return [
      {
        path,
        message: `must match one of the ${branches.length} allowed shapes`,
        contextPointer: pointer,
        contextPath: path,
      },
    ];
  }
  return best.issues;
}

function discriminatorIssue(
  walk: Walk,
  pointer: string,
  keyword: string,
  path: string,
  value: { [key: string]: unknown },
  scored: { mismatch: number }[]
): Issue | undefined {
  if (scored.some((branch) => branch.mismatch === 0)) {
    return undefined;
  }
  const branches: any[] = nodeAt(walk.root, pointer)[keyword];
  const constants = branches.map((_, index) =>
    constProperties(resolve(walk, childPointer(pointer, keyword, String(index))).node)
  );
  const keys = Object.keys(constants[0] ?? {}).filter((key) =>
    constants.every((props) => key in props)
  );
  const key = keys.find((candidate) => candidate in value);
  if (key == null) {
    return undefined;
  }
  const allowed = constants.map((props) => JSON.stringify(props[key]));
  return {
    path: `${path}/${escapeSegment(key)}`,
    message: `must be one of ${allowed.join(", ")}`,
    contextPointer: pointer,
    contextPath: path,
  };
}

function indent(text: string, prefix: string): string {
  return text.split("\n").join(`\n${prefix}`);
}

function render(walk: Walk, pointer: string, depth: number, stack: string[]): string {
  const resolved = resolve(walk, pointer);
  const node = resolved.node;
  if (node == null || isEmptySchema(node)) {
    return "any";
  }
  if (stack.includes(resolved.pointer)) {
    return "…";
  }
  const nextStack = [...stack, resolved.pointer];
  if ("const" in node) {
    return JSON.stringify(node.const);
  }
  if (Array.isArray(node.enum)) {
    return node.enum.map((item: unknown) => JSON.stringify(item)).join(" | ");
  }
  if (isPlainObject(node.not) && isEmptySchema(node.not)) {
    return "undefined";
  }
  const unionKeyword = UNION_KEYWORDS.find((keyword) => Array.isArray(node[keyword]));
  if (unionKeyword != null) {
    const parts = (node[unionKeyword] as any[]).map((_, index) =>
      render(walk, childPointer(resolved.pointer, unionKeyword, String(index)), depth, nextStack)
    );
    if (parts.some((part) => part.includes("\n"))) {
      return parts.map((part) => `| ${indent(part, "  ")}`).join("\n");
    }
    return mergeSummaries(parts) ?? parts.join(" | ");
  }
  if (node.type === "array" || node.items != null) {
    const items =
      node.items == null || Array.isArray(node.items)
        ? "any"
        : render(walk, childPointer(resolved.pointer, "items"), depth, nextStack);
    if (items.includes("\n") && items.startsWith("|")) {
      return `Array<\n  ${indent(items, "  ")}\n>`;
    }
    return items.includes(" | ") && !items.includes("\n") ? `Array<${items}>` : `${items}[]`;
  }
  if (node.type === "object" || isPlainObject(node.properties)) {
    return renderObject(walk, resolved.pointer, node, depth, nextStack);
  }
  const types = Array.isArray(node.type) ? node.type.join(" | ") : node.type ?? "any";
  return node.format != null ? `${types} (${node.format})` : types;
}

function mergeSummaries(parts: string[]): string | undefined {
  const matches = parts.map((part) => part.match(/^\{ (\w+): ("[^"]*"), … \}$/));
  const key = matches[0]?.[1];
  if (parts.length < 2 || key == null || matches.some((match) => match?.[1] !== key)) {
    return undefined;
  }
  return `{ ${key}: ${matches.map((match) => match![2]).join(" | ")}, … }`;
}

function renderObject(
  walk: Walk,
  pointer: string,
  node: any,
  depth: number,
  stack: string[]
): string {
  const properties: { [key: string]: unknown } = node.properties ?? {};
  const required = new Set<string>(node.required ?? []);
  const keys = Object.keys(properties);
  if (keys.length === 0) {
    if (isPlainObject(node.additionalProperties) && !isEmptySchema(node.additionalProperties)) {
      const values = render(walk, childPointer(pointer, "additionalProperties"), depth, stack);
      return `{ [key: string]: ${indent(values, "  ")} }`;
    }
    return "object";
  }
  if (depth <= 0) {
    const constants = Object.entries(constProperties(node)).map(
      ([key, constant]) => `${key}: ${JSON.stringify(constant)}`
    );
    return `{ ${[...constants, "…"].join(", ")} }`;
  }
  const lines = keys.map((key) => {
    const optional = required.has(key) ? "" : "?";
    const rendered = render(walk, childPointer(pointer, "properties", key), depth - 1, stack);
    return `  ${key}${optional}: ${indent(rendered, "  ")}`;
  });
  return ["{", ...lines, "}"].join("\n");
}

function renderSchema(walk: Walk, pointer: string): string {
  let rendered = "";
  for (const depth of RENDER_DEPTHS) {
    rendered = render(walk, pointer, depth, []);
    if (rendered.length <= MAX_RENDER_LENGTH) {
      return rendered;
    }
  }
  return rendered;
}

function walkFor(tool: CliTool): Walk | undefined {
  if (tool.inputJsonSchema == null) {
    return undefined;
  }
  const key = `feast-tool:${tool.id}`;
  if (ajv.getSchema(key) == null) {
    ajv.addSchema(tool.inputJsonSchema as any, key);
  }
  return { root: tool.inputJsonSchema, key };
}

function formatReport(walk: Walk, heading: string, issues: Issue[]): string {
  const lines = [...new Set(issues.map((issue) => `  ${displayPath(issue.path)}: ${issue.message}`))];
  const contexts = new Map<string, { pointer: string; path: string; fromUnion: boolean }>();
  for (const issue of issues) {
    const id = `${issue.contextPath}\u0000${issue.contextPointer}`;
    const existing = contexts.get(id);
    if (existing != null) {
      existing.fromUnion = existing.fromUnion || issue.fromUnion === true;
    } else if (contexts.size < MAX_CONTEXTS) {
      contexts.set(id, { pointer: issue.contextPointer, path: issue.contextPath, fromUnion: issue.fromUnion === true });
    }
  }
  const sections = [...contexts.values()].flatMap((context) => {
    const shape = renderSchema(walk, context.pointer);
    return context.fromUnion || shape.split("\n").length <= MAX_PLAIN_SHAPE_LINES
      ? [`Expected at ${displayPath(context.path)}:\n${shape}`]
      : [];
  });
  return [heading, ...lines, ...sections.flatMap((section) => ["", section])].join("\n");
}

export function explainInputMismatch(tool: CliTool, input: unknown): string | undefined {
  const walk = walkFor(tool);
  if (walk == null || isValid(walk, "", input)) {
    return undefined;
  }
  const issues = explain(walk, "", "", input, { pointer: "", path: "" });
  if (issues.length === 0) {
    issues.push({
      path: "",
      message: "does not match the schema",
      contextPointer: "",
      contextPath: "",
    });
  }
  return formatReport(walk, "Input does not match the tool schema:", issues);
}

function pointerForPath(
  walk: Walk,
  value: unknown,
  segments: string[]
): { pointer: string; contextPointer: string; contextPath: string } {
  let pointer = "";
  let current = value;
  let path = "";
  let contextPointer = "";
  let contextPath = "";
  for (let step = 0; step <= segments.length; step += 1) {
    let resolved = resolve(walk, pointer);
    const unionKeyword = UNION_KEYWORDS.find((keyword) => Array.isArray(resolved.node?.[keyword]));
    if (unionKeyword != null) {
      const branches: any[] = resolved.node[unionKeyword];
      const pick = branches
        .map((_, index) => childPointer(resolved.pointer, unionKeyword, String(index)))
        .map((branch) => ({ branch, mismatch: branchMismatch(walk, branch, current) }))
        .sort((left, right) => left.mismatch - right.mismatch)[0];
      if (pick != null && pick.mismatch === 0) {
        resolved = resolve(walk, pick.branch);
      }
    }
    pointer = resolved.pointer;
    const node = resolved.node;
    if (isPlainObject(node) && (node.type === "object" || isPlainObject(node.properties))) {
      contextPointer = pointer;
      contextPath = path;
    }
    if (step === segments.length || node == null) {
      break;
    }
    const segment = segments[step]!;
    if (isPlainObject(node.properties) && segment in node.properties) {
      pointer = childPointer(pointer, "properties", segment);
    } else if (node.items != null && !Array.isArray(node.items)) {
      pointer = childPointer(pointer, "items");
    } else if (isPlainObject(node.additionalProperties)) {
      pointer = childPointer(pointer, "additionalProperties");
    } else {
      break;
    }
    current = (current as any)?.[segment];
    path = `${path}/${escapeSegment(segment)}`;
  }
  return { pointer, contextPointer, contextPath };
}

function serverIssues(error: unknown): any[] | undefined {
  const code = (error as any)?.data?.code ?? (error as any)?.shape?.data?.code;
  if (code !== "BAD_REQUEST") {
    return undefined;
  }
  const message = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(message);
    const isZodIssueList =
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(
        (issue) =>
          isPlainObject(issue) &&
          typeof issue.code === "string" &&
          Array.isArray(issue.path)
      );
    return isZodIssueList ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function explainServerInputError(
  tool: CliTool,
  input: unknown,
  error: unknown
): string | undefined {
  const parsed = serverIssues(error);
  const walk = walkFor(tool);
  if (parsed == null || walk == null) {
    return undefined;
  }
  const issues: Issue[] = parsed.map((issue) => {
    const segments: string[] = issue.path.map(String);
    const contextSegments =
      issue.code === "unrecognized_keys" ? segments : segments.slice(0, -1);
    const located = pointerForPath(walk, input, contextSegments);
    return {
      path: segments.map((segment) => `/${escapeSegment(segment)}`).join(""),
      message: String(issue.message ?? issue.code),
      contextPointer: located.contextPointer,
      contextPath: located.contextPath,
    };
  });
  return formatReport(walk, "The server rejected the input:", issues);
}
