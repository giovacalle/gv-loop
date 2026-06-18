import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
  tempHome = undefined;
});

describe("CLI add", () => {
  test("creates a loop from --prompt-file", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-cli-test-"));
    const promptFile = join(tempHome, "prompt.md");
    await writeFile(promptFile, "Process exactly one issue.\n");

    const proc = Bun.spawn(
      [
        "bun",
        "src/cli.ts",
        "add",
        "--id",
        "file-prompt",
        "--schedule",
        "3600s",
        "--prompt-file",
        promptFile,
        "--yes",
        "--no-install",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, GV_LOOP_HOME: tempHome },
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("Loop: file-prompt");
    expect(await readFile(join(tempHome, "loops", "file-prompt", "prompt.md"), "utf8")).toBe(
      "Process exactly one issue.\n"
    );
  });
});

describe("CLI task", () => {
  test("creates and lists a task from --prompt-file", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-cli-test-"));
    const promptFile = join(tempHome, "task.md");
    await writeFile(promptFile, "Process one ready issue.\n");

    const add = Bun.spawn(
      ["bun", "src/cli.ts", "task", "add", "--id", "ready-issue", "--prompt-file", promptFile],
      {
        cwd: process.cwd(),
        env: { ...process.env, GV_LOOP_HOME: tempHome },
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const [addStdout, addStderr, addExitCode] = await Promise.all([
      new Response(add.stdout).text(),
      new Response(add.stderr).text(),
      add.exited,
    ]);

    expect(addExitCode, addStderr).toBe(0);
    expect(addStdout).toContain("Task: ready-issue");
    expect(await readFile(join(tempHome, "tasks", "ready-issue", "prompt.md"), "utf8")).toBe(
      "Process one ready issue.\n"
    );

    const list = Bun.spawn(["bun", "src/cli.ts", "task", "list"], {
      cwd: process.cwd(),
      env: { ...process.env, GV_LOOP_HOME: tempHome },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [listStdout, listStderr, listExitCode] = await Promise.all([
      new Response(list.stdout).text(),
      new Response(list.stderr).text(),
      list.exited,
    ]);

    expect(listExitCode, listStderr).toBe(0);
    expect(listStdout).toContain("ready");
    expect(listStdout).toContain("ready-issue");
  });

  test("claims a named task", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-cli-test-"));
    const add = Bun.spawn(["bun", "src/cli.ts", "task", "add", "--id", "claim-me", "do work"], {
      cwd: process.cwd(),
      env: { ...process.env, GV_LOOP_HOME: tempHome },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await add.exited).toBe(0);

    const claim = Bun.spawn(["bun", "src/cli.ts", "task", "claim", "claim-me", "--worker-id", "cli-worker"], {
      cwd: process.cwd(),
      env: { ...process.env, GV_LOOP_HOME: tempHome },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(claim.stdout).text(),
      new Response(claim.stderr).text(),
      claim.exited,
    ]);

    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("Claimed: claim-me");
    expect(await readFile(join(tempHome, "tasks", "claim-me", "task.json"), "utf8")).toContain(
      '"workerId": "cli-worker"'
    );
  });

  test("creates a worktree-enabled task", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-cli-test-"));
    const add = Bun.spawn(
      [
        "bun",
        "src/cli.ts",
        "task",
        "add",
        "--id",
        "isolated",
        "--worktree",
        "--worktree-base",
        "main",
        "change code",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, GV_LOOP_HOME: tempHome },
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(add.stdout).text(),
      new Response(add.stderr).text(),
      add.exited,
    ]);

    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("Worktree: enabled");
    expect(await readFile(join(tempHome, "tasks", "isolated", "task.json"), "utf8")).toContain(
      '"baseBranch": "main"'
    );
  });
});
