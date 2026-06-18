import type { SandboxMode } from "./types";

export type SpawnIntent = {
  version: 1;
  kind: "spawn";
  title?: string;
  prompt: string;
  cwd: string;
  sandbox: SandboxMode;
  yolo: boolean;
  reason?: string;
};

const sandboxModes = new Set<SandboxMode>(["read-only", "workspace-write", "danger-full-access"]);

export function parseSpawnIntentJson(json: string): SpawnIntent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid spawn intent JSON.");
  }
  return parseSpawnIntent(parsed);
}

export function parseSpawnIntent(value: unknown): SpawnIntent {
  const object = expectObject(value);

  const version = object.version ?? 1;
  if (version !== 1) {
    throw new Error("Spawn intent version must be 1.");
  }
  if (object.kind !== "spawn") {
    throw new Error('Spawn intent kind must be "spawn".');
  }

  const prompt = expectNonEmptyString(object.prompt, "prompt");
  const cwd = expectNonEmptyString(object.cwd, "cwd");
  const title = optionalNonEmptyString(object.title, "title");
  const reason = optionalNonEmptyString(object.reason, "reason");
  const sandbox = object.sandbox ?? "workspace-write";
  if (!isSandboxMode(sandbox)) {
    throw new Error("Spawn intent sandbox is invalid.");
  }

  const yolo = object.yolo ?? false;
  if (typeof yolo !== "boolean") {
    throw new Error("Spawn intent yolo must be a boolean.");
  }

  const intent: SpawnIntent = {
    version: 1,
    kind: "spawn",
    prompt,
    cwd,
    sandbox,
    yolo,
  };
  if (title) intent.title = title;
  if (reason) intent.reason = reason;
  return intent;
}

export function isSandboxMode(value: unknown): value is SandboxMode {
  return typeof value === "string" && sandboxModes.has(value as SandboxMode);
}

function expectObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Spawn intent must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function expectNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Spawn intent ${field} must be a non-empty string.`);
  }
  return value;
}

function optionalNonEmptyString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Spawn intent ${field} must be a non-empty string when present.`);
  }
  return value;
}
