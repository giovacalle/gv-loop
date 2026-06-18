import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { taskRunsDir } from "./paths";
import { buildCodexExecArgs, extractFinalMessage } from "./runner";
import { readTask, readTaskPrompt, writeTask } from "./task-store";
import type { RunMetadata, RunnerSpec } from "./types";
import { timestampId } from "./util";

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

export async function runTask(id: string, home?: string, execute: TaskExecutor = executeCodex): Promise<RunMetadata> {
  const spec = await readTask(id, home);
  if (spec.status.state !== "claimed" && spec.status.state !== "running") {
    throw new Error(`Task ${id} must be claimed before it can run.`);
  }

  const prompt = await readTaskPrompt(id, home);
  const startedAt = new Date();
  const runId = timestampId(startedAt);
  const runDir = join(taskRunsDir(id, home), runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "prompt.md"), prompt);

  spec.status = { ...spec.status, state: "running", lastRunId: runId };
  await writeTask(spec, home);

  const { stdout, stderr, exitCode } = await execute({ cwd: spec.cwd, prompt, runner: spec.runner });
  const final = extractFinalMessage(stdout) ?? fallbackFinal(exitCode, stderr);
  const finishedAt = new Date();
  const tracePath = join(runDir, "trace.jsonl");
  const finalPath = join(runDir, "final.md");
  await writeFile(tracePath, stdout);
  await writeFile(join(runDir, "stdout.log"), stdout);
  await writeFile(join(runDir, "stderr.log"), stderr);
  await writeFile(join(runDir, "exit-code.txt"), `${exitCode}\n`);
  await writeFile(finalPath, final.trim() ? `${final.trim()}\n` : "\n");

  const metadata: RunMetadata = {
    loopId: id,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    cwd: spec.cwd,
    exitCode,
    tracePath,
    finalPath,
  };
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
