import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { taskRunSpawnIntentsDir, taskRunsDir } from "./paths";
import { type SpawnPolicy } from "./policy";
import { buildCodexExecArgs, extractFinalMessage } from "./runner";
import { writeRunSummary } from "./run-summary";
import { processSpawnIntents } from "./spawn-processor";
import type { SpawnProcessingResult } from "./spawn-processor";
import { readTask, readTaskPrompt, writeTask } from "./task-store";
import type { RunMetadata, RunnerSpec } from "./types";
import { timestampId } from "./util";
import { setupTaskWorktree, type GitCommand } from "./worktree";

export type TaskExecution = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type TaskExecutor = (input: {
  cwd: string;
  prompt: string;
  runner: RunnerSpec;
}) => Promise<TaskExecution>;

export type RunTaskOptions = {
  execute?: TaskExecutor;
  git?: GitCommand;
  spawnPolicy?: SpawnPolicy;
};

export async function runTask(
  id: string,
  home?: string,
  executeOrOptions: TaskExecutor | RunTaskOptions = executeCodex
): Promise<RunMetadata> {
  const options: RunTaskOptions = typeof executeOrOptions === "function" ? { execute: executeOrOptions } : executeOrOptions;
  const execute = options.execute ?? executeCodex;
  const spec = await readTask(id, home);
  if (spec.status.state !== "claimed" && spec.status.state !== "running") {
    throw new Error(`Task ${id} must be claimed before it can run.`);
  }

  const prompt = await readTaskPrompt(id, home);
  const startedAt = new Date();
  const runId = timestampId(startedAt);
  const runDir = join(taskRunsDir(id, home), runId);
  const spawnIntentsDir = taskRunSpawnIntentsDir(id, runId, home);
  await mkdir(runDir, { recursive: true });
  if (options.spawnPolicy) await mkdir(spawnIntentsDir, { recursive: true });
  await writeFile(join(runDir, "prompt.md"), prompt);

  const worktree = await setupTaskWorktree(spec, home, options.git);
  if (spec.worktree?.enabled) {
    spec.worktree = {
      ...spec.worktree,
      branch: worktree.branch,
      path: worktree.path,
      originalCwd: worktree.originalCwd,
    };
  }
  spec.status = { ...spec.status, state: "running", lastRunId: runId };
  await writeTask(spec, home);

  const basePrompt = spec.worktree?.enabled ? promptWithWorktreeInstructions(prompt, worktree.cwd, worktree.branch) : prompt;
  const executionPrompt = options.spawnPolicy ? promptWithSpawnInstructions(basePrompt, spawnIntentsDir) : basePrompt;
  const { stdout, stderr, exitCode } = await execute({ cwd: worktree.cwd, prompt: executionPrompt, runner: spec.runner });
  const final = extractFinalMessage(stdout) ?? fallbackFinal(exitCode, stderr);
  const finishedAt = new Date();
  const tracePath = join(runDir, "trace.jsonl");
  const finalPath = join(runDir, "final.md");
  await writeFile(tracePath, stdout);
  await writeFile(join(runDir, "stdout.log"), stdout);
  await writeFile(join(runDir, "stderr.log"), stderr);
  await writeFile(join(runDir, "exit-code.txt"), `${exitCode}\n`);
  await writeFile(finalPath, final.trim() ? `${final.trim()}\n` : "\n");
  let spawnResult: SpawnProcessingResult | undefined;
  if (options.spawnPolicy && exitCode === 0) {
    const input = {
      parentTask: spec,
      runId,
      intentsDir: spawnIntentsDir,
      policy: options.spawnPolicy,
    };
    spawnResult = await processSpawnIntents(home ? { ...input, home } : input);
  }

  const metadata: RunMetadata = {
    loopId: id,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    cwd: worktree.cwd,
    exitCode,
    tracePath,
    finalPath,
  };
  const summaryPath = await writeRunSummary(runDir, {
    task: spec,
    metadata,
    runId,
    worktree,
    ...(spawnResult ? { spawnResult } : {}),
    ...(options.git ? { git: options.git } : {}),
  });
  metadata.summaryPath = summaryPath;
  await writeFile(join(runDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);

  const latest = await readTask(id, home);
  latest.status = {
    ...latest.status,
    state: exitCode === 0 ? "done" : "failed",
    lastRunId: runId,
  };
  await writeTask(latest, home);
  return metadata;
}

function promptWithWorktreeInstructions(prompt: string, cwd: string, branch: string): string {
  return `${prompt.trim()}

---

gv-loop worktree isolation is enabled for this task.

Run all file edits and verification in this working directory:

${cwd}

The isolated branch is:

${branch}

Do not edit the original checkout.
`;
}

function promptWithSpawnInstructions(prompt: string, spawnIntentsDir: string): string {
  return `${prompt.trim()}

---

gv-loop spawn intents are enabled for this run.

If you discover follow-up work that should be delegated to another agent, write one JSON file per child task into:

${spawnIntentsDir}

Each file must have this shape:

{
  "version": 1,
  "kind": "spawn",
  "title": "short optional title",
  "prompt": "complete prompt for the child agent",
  "cwd": "/absolute/path/to/workspace",
  "sandbox": "workspace-write",
  "yolo": false,
  "reason": "optional reason for creating this child task"
}

Do not create shell scripts to spawn agents. Only write spawn intent JSON files when follow-up work is clearly useful.
`;
}

async function executeCodex(input: { cwd: string; prompt: string; runner: RunnerSpec }): Promise<TaskExecution> {
  const proc = Bun.spawn(["codex", ...buildCodexExecArgs(input.runner, input.prompt)], {
    cwd: input.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: runnerEnv(input.runner.codexHome),
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

function fallbackFinal(exitCode: number, stderr: string): string {
  if (exitCode === 0) return "Codex completed without a final message.";
  return `Codex failed with exit code ${exitCode}.\n\n${stderr.trim()}`;
}

function runnerEnv(codexHome?: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ["HOME", "PATH", "USER", "SHELL", "TERM", "TMPDIR", "CODEX_HOME", "XDG_CONFIG_HOME"]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  if (codexHome) env.CODEX_HOME = codexHome;
  return env;
}
