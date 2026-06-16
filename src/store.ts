import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DraftLoop, LoopSpec } from "./types";
import { launchdDir, loopDir, loopsDir, loopSpecPath, promptPath, statePath } from "./paths";
import { assertSafeId } from "./util";

export async function ensureHome(home?: string): Promise<void> {
  await mkdir(loopsDir(home), { recursive: true });
}

export function loopFromDraft(draft: DraftLoop): LoopSpec {
  assertSafeId(draft.id);
  return {
    id: draft.id,
    version: 1,
    title: draft.title,
    createdAt: new Date().toISOString(),
    cwd: draft.cwd,
    timezone: draft.timezone,
    schedule: draft.schedule,
    prompt: draft.prompt,
    runner: {
      kind: "codex-exec",
      json: true,
      ephemeral: true,
      sandbox: "read-only",
      ...(draft.codexHome ? { codexHome: draft.codexHome } : {}),
    },
    output: {
      reportFormat: "markdown",
      trace: true,
      notify: draft.notify ?? "failures",
    },
    status: {
      enabled: true,
    },
  };
}

export async function saveLoop(spec: LoopSpec, home?: string): Promise<void> {
  assertSafeId(spec.id);
  const dir = loopDir(spec.id, home);
  await mkdir(dir, { recursive: true });
  await mkdir(launchdDir(spec.id, home), { recursive: true });
  await writeFile(loopSpecPath(spec.id, home), `${JSON.stringify(spec, null, 2)}\n`);
  await writeFile(promptPath(spec.id, home), `${spec.prompt.trim()}\n`);
  await writeFile(statePath(spec.id, home), "# State\n\n");
}

export async function readLoop(id: string, home?: string): Promise<LoopSpec> {
  assertSafeId(id);
  const json = await readFile(loopSpecPath(id, home), "utf8");
  const spec = JSON.parse(json) as LoopSpec;
  if (spec.version !== 1 || spec.id !== id) {
    throw new Error(`Invalid loop spec for ${id}.`);
  }
  return spec;
}

export async function writeLoop(spec: LoopSpec, home?: string): Promise<void> {
  await mkdir(dirname(loopSpecPath(spec.id, home)), { recursive: true });
  await writeFile(loopSpecPath(spec.id, home), `${JSON.stringify(spec, null, 2)}\n`);
}

export async function readPrompt(id: string, home?: string): Promise<string> {
  return readFile(promptPath(id, home), "utf8");
}

export async function listLoops(home?: string): Promise<LoopSpec[]> {
  await ensureHome(home);
  const entries = await readdir(loopsDir(home), { withFileTypes: true });
  const specs: LoopSpec[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      specs.push(await readLoop(entry.name, home));
    } catch {
      // Ignore broken loop folders; doctor can report them later.
    }
  }
  return specs.sort((a, b) => a.id.localeCompare(b.id));
}

export async function latestRunDir(id: string, home?: string): Promise<string | undefined> {
  const dir = join(loopDir(id, home), "runs");
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(dir, entry.name))
      .sort()
      .at(-1);
  } catch {
    return undefined;
  }
}
