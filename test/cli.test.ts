import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

  test("prints a concise task result from summary.json", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-cli-test-"));
    const runDir = join(tempHome, "tasks", "reported", "runs", "2026-06-19T10-00-00-000Z");
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, "summary.json"),
      `${JSON.stringify({
        version: 1,
        task: { id: "reported", title: "Reported", source: { kind: "manual" } },
        run: {
          id: "2026-06-19T10-00-00-000Z",
          startedAt: "2026-06-19T10:00:00.000Z",
          finishedAt: "2026-06-19T10:01:00.000Z",
          cwd: "/tmp/project",
          exitCode: 0,
          status: "done",
          tracePath: "/tmp/trace.jsonl",
          finalPath: "/tmp/final.md",
        },
        runner: { kind: "codex-exec", json: true, ephemeral: true, sandbox: "workspace-write", yolo: false },
        spawnIntents: { accepted: [{ taskId: "child", file: "child.json" }], rejected: [] },
      })}\n`
    );

    const result = Bun.spawn(["bun", "src/cli.ts", "task", "result", "reported"], {
      cwd: process.cwd(),
      env: { ...process.env, GV_LOOP_HOME: tempHome },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(result.stdout).text(),
      new Response(result.stderr).text(),
      result.exited,
    ]);

    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("reported: done");
    expect(stdout).toContain("Final: /tmp/final.md");
    expect(stdout).toContain("Spawn intents: 1 accepted, 0 rejected");
  });

  test("creates a review task from the latest task result", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-cli-test-"));
    await mkdir(join(tempHome, "tasks", "implemented"), { recursive: true });
    await writeFile(
      join(tempHome, "tasks", "implemented", "task.json"),
      `${JSON.stringify({
        id: "implemented",
        version: 1,
        title: "Implemented",
        createdAt: "2026-06-19T10:00:00.000Z",
        updatedAt: "2026-06-19T10:00:00.000Z",
        cwd: "/repo",
        prompt: "implement",
        runner: { kind: "codex-exec", json: true, ephemeral: true, sandbox: "workspace-write", yolo: false },
        source: { kind: "manual" },
        status: { state: "done", lastRunId: "2026-06-19T10-00-00-000Z" },
      })}\n`
    );
    await writeFile(join(tempHome, "tasks", "implemented", "prompt.md"), "implement\n");
    const runDir = join(tempHome, "tasks", "implemented", "runs", "2026-06-19T10-00-00-000Z");
    await mkdir(runDir, { recursive: true });
    const finalPath = join(runDir, "final.md");
    await writeFile(finalPath, "Implemented and tested.\n");
    await writeFile(
      join(runDir, "summary.json"),
      `${JSON.stringify({
        version: 1,
        task: { id: "implemented", title: "Implemented", source: { kind: "manual" } },
        run: {
          id: "2026-06-19T10-00-00-000Z",
          startedAt: "2026-06-19T10:00:00.000Z",
          finishedAt: "2026-06-19T10:01:00.000Z",
          cwd: "/repo",
          exitCode: 0,
          status: "done",
          tracePath: join(runDir, "trace.jsonl"),
          finalPath,
        },
        runner: { kind: "codex-exec", json: true, ephemeral: true, sandbox: "workspace-write", yolo: false },
      })}\n`
    );

    const review = Bun.spawn(["bun", "src/cli.ts", "task", "review", "implemented"], {
      cwd: process.cwd(),
      env: { ...process.env, GV_LOOP_HOME: tempHome },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(review.stdout).text(),
      new Response(review.stderr).text(),
      review.exited,
    ]);

    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain("Review task:");
    expect(stdout).toContain("Status: ready");
    const entries = await (await import("node:fs/promises")).readdir(join(tempHome, "tasks"));
    const reviewTaskId = entries.find((entry) => entry.startsWith("review-implemented"));
    expect(reviewTaskId).toBeTruthy();
    expect(await readFile(join(tempHome, "tasks", reviewTaskId!, "prompt.md"), "utf8")).toContain(
      "Implemented and tested."
    );
  });
});
