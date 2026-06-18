import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { SpawnProcessingResult } from "./spawn-processor";
import type { RunMetadata, TaskSpec } from "./types";
import type { GitCommand, WorktreeSetup } from "./worktree";

export type RunSummary = {
  version: 1;
  task: {
    id: string;
    title: string;
    source: TaskSpec["source"];
    parent?: TaskSpec["parent"];
  };
  run: {
    id: string;
    startedAt: string;
    finishedAt: string;
    cwd: string;
    exitCode: number;
    status: "done" | "failed";
    tracePath: string;
    finalPath: string;
  };
  runner: TaskSpec["runner"];
  worktree?: {
    enabled: boolean;
    path: string;
    branch: string;
    originalCwd: string;
    diff?: {
      statusShort: string;
      changedFiles: string[];
    };
  };
  spawnIntents?: {
    accepted: Array<{ taskId: string; file: string }>;
    rejected: Array<{ file: string; reasons: string[] }>;
  };
};

export type BuildRunSummaryInput = {
  task: TaskSpec;
  metadata: RunMetadata;
  runId: string;
  worktree: WorktreeSetup;
  spawnResult?: SpawnProcessingResult;
  git?: GitCommand;
};

export async function writeRunSummary(runDir: string, input: BuildRunSummaryInput): Promise<string> {
  const summary = await buildRunSummary(input);
  const path = join(runDir, "summary.json");
  await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`);
  return path;
}

export async function buildRunSummary(input: BuildRunSummaryInput): Promise<RunSummary> {
  const summary: RunSummary = {
    version: 1,
    task: {
      id: input.task.id,
      title: input.task.title,
      source: input.task.source,
      ...(input.task.parent ? { parent: input.task.parent } : {}),
    },
    run: {
      id: input.runId,
      startedAt: input.metadata.startedAt,
      finishedAt: input.metadata.finishedAt,
      cwd: input.metadata.cwd,
      exitCode: input.metadata.exitCode,
      status: input.metadata.exitCode === 0 ? "done" : "failed",
      tracePath: input.metadata.tracePath,
      finalPath: input.metadata.finalPath,
    },
    runner: input.task.runner,
  };

  if (input.task.worktree?.enabled) {
    const diff = input.git ? await readWorktreeDiff(input.worktree.path, input.git) : undefined;
    summary.worktree = {
      enabled: true,
      path: input.worktree.path,
      branch: input.worktree.branch,
      originalCwd: input.worktree.originalCwd,
      ...(diff ? { diff } : {}),
    };
  }

  if (input.spawnResult) {
    summary.spawnIntents = {
      accepted: input.spawnResult.accepted
        .filter((item) => item.status === "accepted")
        .map((item) => ({ taskId: item.taskId, file: basename(item.file) })),
      rejected: input.spawnResult.rejected
        .filter((item) => item.status === "rejected")
        .map((item) => ({ file: basename(item.file), reasons: item.reasons })),
    };
  }

  return summary;
}

export async function readRunSummary(path: string): Promise<RunSummary> {
  return JSON.parse(await readFile(path, "utf8")) as RunSummary;
}

async function readWorktreeDiff(path: string, git: GitCommand): Promise<{ statusShort: string; changedFiles: string[] }> {
  const result = await git(["status", "--short"], { cwd: path });
  if (result.exitCode !== 0) {
    return {
      statusShort: "",
      changedFiles: [],
    };
  }
  const lines = result.stdout.split(/\r?\n/).filter((line) => line.trim());
  const statusShort = lines.join("\n");
  return {
    statusShort,
    changedFiles: lines.map((line) => line.slice(3).trim()).filter(Boolean),
  };
}
