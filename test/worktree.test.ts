import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setupTaskWorktree } from "../src/worktree";
import { taskFromDraft } from "../src/task-store";

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
  tempHome = undefined;
});

describe("worktree setup", () => {
  test("creates an isolated worktree and preserves cwd below repo root", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-worktree-test-"));
    const calls: Array<{ args: string[]; cwd: string }> = [];
    const task = taskFromDraft({
      id: "worktree-task",
      title: "Worktree task",
      prompt: "change code",
      cwd: "/repo/packages/app",
      worktree: { enabled: true, baseBranch: "main" },
    });

    const setup = await setupTaskWorktree(task, tempHome, async (args, options) => {
      calls.push({ args, cwd: options.cwd });
      if (args.join(" ") === "rev-parse --show-toplevel") {
        return { stdout: "/repo\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });

    expect(setup).toMatchObject({
      cwd: join(tempHome, "worktrees", "worktree-task", "packages/app"),
      path: join(tempHome, "worktrees", "worktree-task"),
      branch: "gv-loop/worktree-task",
      originalCwd: "/repo/packages/app",
      repoRoot: "/repo",
    });
    expect(calls).toEqual([
      { args: ["rev-parse", "--show-toplevel"], cwd: "/repo/packages/app" },
      {
        args: ["worktree", "add", "-B", "gv-loop/worktree-task", join(tempHome, "worktrees", "worktree-task"), "main"],
        cwd: "/repo",
      },
    ]);
  });
});
