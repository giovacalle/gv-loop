import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { taskWorktreeDir, worktreesDir } from "./paths";
import type { TaskSpec } from "./types";

export type GitCommand = (args: string[], options: { cwd: string }) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

export type WorktreeSetup = {
  cwd: string;
  path: string;
  branch: string;
  originalCwd: string;
  repoRoot: string;
};

export async function setupTaskWorktree(task: TaskSpec, home?: string, git: GitCommand = runGit): Promise<WorktreeSetup> {
  if (!task.worktree?.enabled) {
    return {
      cwd: task.cwd,
      path: task.cwd,
      branch: "",
      originalCwd: task.cwd,
      repoRoot: task.cwd,
    };
  }

  const repoRoot = (await gitOk(["rev-parse", "--show-toplevel"], { cwd: task.cwd }, git)).stdout.trim();
  const relativeCwd = relative(repoRoot, task.cwd);
  if (relativeCwd.startsWith("..")) {
    throw new Error(`Task cwd ${task.cwd} is outside git repository ${repoRoot}.`);
  }

  const path = task.worktree.path ?? taskWorktreeDir(task.id, home);
  const branch = task.worktree.branch ?? `gv-loop/${task.id}`;
  const base = task.worktree.baseBranch ?? "HEAD";
  await mkdir(worktreesDir(home), { recursive: true });
  await gitOk(["worktree", "add", "-B", branch, path, base], { cwd: repoRoot }, git);

  return {
    cwd: relativeCwd ? join(path, relativeCwd) : path,
    path,
    branch,
    originalCwd: task.cwd,
    repoRoot,
  };
}

async function runGit(args: string[], options: { cwd: string }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function gitOk(args: string[], options: { cwd: string }, git: GitCommand) {
  const result = await git(args, options);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }
  return result;
}
