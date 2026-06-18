import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  taskClaimLockPath,
  taskDir,
  taskPromptPath,
  taskSpecPath,
  tasksDir,
} from "./paths";
import type { DraftTask, TaskClaim, TaskSpec, TaskState } from "./types";
import { assertSafeId, timestampId } from "./util";

export async function ensureTaskHome(home?: string): Promise<void> {
  await mkdir(tasksDir(home), { recursive: true });
}

export function taskFromDraft(draft: DraftTask): TaskSpec {
  assertSafeId(draft.id);
  const now = new Date().toISOString();
  return {
    id: draft.id,
    version: 1,
    title: draft.title,
    createdAt: now,
    updatedAt: now,
    cwd: draft.cwd,
    prompt: draft.prompt,
    runner: {
      kind: "codex-exec",
      json: true,
      ephemeral: true,
      sandbox: draft.sandbox ?? "workspace-write",
      yolo: draft.yolo ?? false,
      ...(draft.codexHome ? { codexHome: draft.codexHome } : {}),
    },
    source: draft.source ?? { kind: "manual" },
    ...(draft.parent ? { parent: draft.parent } : {}),
    ...(draft.worktree ? { worktree: draft.worktree } : {}),
    status: {
      state: "ready",
    },
  };
}

export async function saveTask(spec: TaskSpec, home?: string): Promise<void> {
  assertSafeId(spec.id);
  await mkdir(taskDir(spec.id, home), { recursive: true });
  await writeTask(spec, home);
  await writeFile(taskPromptPath(spec.id, home), `${spec.prompt.trim()}\n`);
}

export async function readTask(id: string, home?: string): Promise<TaskSpec> {
  assertSafeId(id);
  const json = await readFile(taskSpecPath(id, home), "utf8");
  const spec = JSON.parse(json) as TaskSpec;
  if (spec.version !== 1 || spec.id !== id) {
    throw new Error(`Invalid task spec for ${id}.`);
  }
  return spec;
}

export async function writeTask(spec: TaskSpec, home?: string): Promise<void> {
  assertSafeId(spec.id);
  spec.updatedAt = new Date().toISOString();
  await mkdir(taskDir(spec.id, home), { recursive: true });
  await writeFile(taskSpecPath(spec.id, home), `${JSON.stringify(spec, null, 2)}\n`);
}

export async function readTaskPrompt(id: string, home?: string): Promise<string> {
  return readFile(taskPromptPath(id, home), "utf8");
}

export async function listTasks(home?: string): Promise<TaskSpec[]> {
  await ensureTaskHome(home);
  const entries = await readdir(tasksDir(home), { withFileTypes: true });
  const tasks: TaskSpec[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      tasks.push(await readTask(entry.name, home));
    } catch {
      // Ignore broken task folders; doctor can grow a repair/report command later.
    }
  }
  return tasks.sort((a, b) => a.id.localeCompare(b.id));
}

export async function listTaskTree(rootId: string, home?: string): Promise<TaskSpec[]> {
  const tasks = await listTasks(home);
  const byParent = new Map<string, TaskSpec[]>();
  for (const task of tasks) {
    const parentId = task.parent?.taskId;
    if (!parentId) continue;
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), task]);
  }

  const root = tasks.find((task) => task.id === rootId);
  if (!root) throw new Error(`Task ${rootId} not found.`);
  const tree: TaskSpec[] = [];
  const visit = (task: TaskSpec) => {
    tree.push(task);
    for (const child of byParent.get(task.id) ?? []) visit(child);
  };
  visit(root);
  return tree;
}

export async function setTaskApproval(id: string, approved: boolean, home?: string): Promise<TaskSpec> {
  const task = await readTask(id, home);
  task.status = {
    ...task.status,
    approved,
    state: approved ? task.status.state : "rejected",
  };
  await writeTask(task, home);
  return task;
}

export async function stopTaskTree(rootId: string, home?: string): Promise<TaskSpec[]> {
  const tree = await listTaskTree(rootId, home);
  const stopped: TaskSpec[] = [];
  for (const task of tree.slice(1)) {
    if (!isTerminalState(task.status.state)) {
      task.status = { ...task.status, state: "rejected", approved: false };
      await writeTask(task, home);
      stopped.push(task);
    }
  }
  return stopped;
}

export async function claimNextTask(workerId: string, home?: string, leaseSeconds = 1800): Promise<TaskSpec | undefined> {
  const ready = (await listTasks(home)).filter((task) => task.status.state === "ready");
  for (const task of ready) {
    const claimed = await claimTask(task.id, workerId, home, leaseSeconds);
    if (claimed) return claimed;
  }
  return undefined;
}

export async function claimTask(
  id: string,
  workerId: string,
  home?: string,
  leaseSeconds = 1800
): Promise<TaskSpec | undefined> {
  assertSafeId(id);
  const lockPath = taskClaimLockPath(id, home);
  try {
    await mkdir(lockPath);
  } catch {
    return undefined;
  }

  try {
    const spec = await readTask(id, home);
    if (spec.status.state !== "ready") {
      await rm(lockPath, { recursive: true, force: true });
      return undefined;
    }
    const now = new Date();
    const claim: TaskClaim = {
      workerId,
      claimedAt: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000).toISOString(),
    };
    spec.status = { state: "claimed", claim };
    await writeTask(spec, home);
    await writeFile(join(lockPath, "claim.json"), `${JSON.stringify(claim, null, 2)}\n`);
    return spec;
  } catch (error) {
    await rm(lockPath, { recursive: true, force: true });
    throw error;
  }
}

export function defaultTaskId(title: string, createdAt = new Date()): string {
  const timestamp = timestampId(createdAt).replaceAll("-", "").slice(0, 14).toLowerCase();
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42)
    .replace(/-+$/g, "");
  return `${base || "task"}-${timestamp}`;
}

function isTerminalState(state: TaskState): boolean {
  return state === "done" || state === "failed" || state === "rejected";
}
