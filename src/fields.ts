interface FieldNode {
  path?: string;
  children: Map<string, FieldNode>;
}

export interface FieldProjection {
  value: unknown;
  matched: string[];
  unmatched: string[];
}

function isPlainObject(value: unknown): value is { [key: string]: unknown } {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function parseFieldPaths(raw: string): string[] {
  const paths = raw
    .split(",")
    .map((path) => path.trim().replace(/\[\]/g, ""))
    .filter((path) => path.length > 0);
  if (paths.length === 0) {
    throw new Error("--fields needs at least one field path, e.g. --fields id,name");
  }
  for (const path of paths) {
    if (path.split(".").some((segment) => segment.length === 0)) {
      throw new Error(`Invalid --fields path "${path}": use dotted keys such as files.key`);
    }
  }
  return [...new Set(paths)];
}

function buildFieldTree(paths: string[]): FieldNode {
  const root: FieldNode = { children: new Map() };
  for (const path of paths) {
    let node = root;
    for (const segment of path.split(".")) {
      let child = node.children.get(segment);
      if (child == null) {
        child = { children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.path = path;
  }
  return root;
}

function markAll(node: FieldNode, matched: Set<string>): void {
  if (node.path != null) {
    matched.add(node.path);
  }
  for (const child of node.children.values()) {
    markAll(child, matched);
  }
}

function projectNode(
  value: unknown,
  node: FieldNode,
  matched: Set<string>
): unknown {
  if (Array.isArray(value)) {
    const projected = value.map((element) => projectNode(element, node, matched));
    if (projected.every((element) => element === undefined)) {
      return undefined;
    }
    return projected.map((element, index) =>
      element !== undefined ? element : isPlainObject(value[index]) ? {} : null
    );
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  const out: { [key: string]: unknown } = {};
  for (const [key, child] of node.children) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    if (child.path != null) {
      out[key] = value[key];
      markAll(child, matched);
      continue;
    }
    const projected = projectNode(value[key], child, matched);
    if (projected !== undefined) {
      out[key] = projected;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function projectFields(value: unknown, paths: string[]): FieldProjection {
  const matched = new Set<string>();
  const projected = projectNode(value, buildFieldTree(paths), matched);
  return {
    value: projected === undefined ? (Array.isArray(value) ? [] : {}) : projected,
    matched: paths.filter((path) => matched.has(path)),
    unmatched: paths.filter((path) => !matched.has(path)),
  };
}

function collectValues(value: unknown): unknown[] {
  return Array.isArray(value) ? value.flatMap(collectValues) : [value];
}

function availableKeys(values: unknown[]): string[] {
  const keys = new Set<string>();
  for (const value of values) {
    if (isPlainObject(value)) {
      for (const key of Object.keys(value)) {
        keys.add(key);
      }
    }
  }
  return [...keys];
}

export function describeUnmatchedPath(value: unknown, path: string): string {
  const segments = path.split(".");
  let current = collectValues(value);
  for (let depth = 0; depth < segments.length; depth++) {
    const segment = segments[depth]!;
    const next = current
      .filter(
        (candidate) =>
          isPlainObject(candidate) &&
          Object.prototype.hasOwnProperty.call(candidate, segment)
      )
      .flatMap((candidate) => collectValues((candidate as { [key: string]: unknown })[segment]));
    if (next.length === 0) {
      const where =
        depth === 0 ? "top level" : segments.slice(0, depth).join(".");
      const keys = availableKeys(current);
      return keys.length > 0
        ? `${path} (keys at ${where}: ${keys.join(", ")})`
        : `${path} (${where} has no keys)`;
    }
    current = next;
  }
  return path;
}

export function unmatchedFieldsMessage(value: unknown, unmatched: string[]): string {
  return `--fields matched nothing for: ${unmatched
    .map((path) => describeUnmatchedPath(value, path))
    .join("; ")}`;
}
