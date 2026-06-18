import { describe, expect, test } from "bun:test";
import { buildRunSummary } from "../src/run-summary";
import { taskFromDraft } from "../src/task-store";

describe("run summary", () => {
  test("builds a stable summary for a basic task run", async () => {
    const task = taskFromDraft({
      id: "summary-task",
      title: "Summary task",
      prompt: "do work",
      cwd: "/tmp/project",
    });

    const summary = await buildRunSummary({
      task,
      runId: "run-1",
      worktree: { cwd: "/tmp/project", path: "/tmp/project", branch: "", originalCwd: "/tmp/project", repoRoot: "/tmp/project" },
      metadata: {
        loopId: "summary-task",
        startedAt: "2026-06-19T10:00:00.000Z",
        finishedAt: "2026-06-19T10:01:00.000Z",
        cwd: "/tmp/project",
        exitCode: 0,
        tracePath: "/runs/trace.jsonl",
        finalPath: "/runs/final.md",
      },
    });

    expect(summary).toMatchObject({
      version: 1,
      task: { id: "summary-task", title: "Summary task", source: { kind: "manual" } },
      run: {
        id: "run-1",
        status: "done",
        cwd: "/tmp/project",
        exitCode: 0,
        tracePath: "/runs/trace.jsonl",
        finalPath: "/runs/final.md",
      },
      runner: { kind: "codex-exec", sandbox: "workspace-write", yolo: false },
    });
  });

  test("includes worktree diff and spawn result summaries when present", async () => {
    const task = taskFromDraft({
      id: "summary-task",
      title: "Summary task",
      prompt: "do work",
      cwd: "/repo",
      worktree: { enabled: true, branch: "gv-loop/summary-task", path: "/tmp/wt", originalCwd: "/repo" },
    });

    const summary = await buildRunSummary({
      task,
      runId: "run-1",
      worktree: { cwd: "/tmp/wt", path: "/tmp/wt", branch: "gv-loop/summary-task", originalCwd: "/repo", repoRoot: "/repo" },
      git: async () => ({
        stdout: " M src/a.ts\n?? test/a.test.ts\n",
        stderr: "",
        exitCode: 0,
      }),
      spawnResult: {
        accepted: [
          {
            status: "accepted",
            file: "/tmp/intents/child.json",
            taskId: "child-task",
            intent: {
              version: 1,
              kind: "spawn",
              prompt: "child",
              cwd: "/repo",
              sandbox: "workspace-write",
              yolo: false,
            },
          },
        ],
        rejected: [{ status: "rejected", file: "/tmp/intents/bad.json", reasons: ["outside cwd"] }],
      },
      metadata: {
        loopId: "summary-task",
        startedAt: "2026-06-19T10:00:00.000Z",
        finishedAt: "2026-06-19T10:01:00.000Z",
        cwd: "/tmp/wt",
        exitCode: 0,
        tracePath: "/runs/trace.jsonl",
        finalPath: "/runs/final.md",
      },
    });

    expect(summary.worktree).toMatchObject({
      enabled: true,
      path: "/tmp/wt",
      branch: "gv-loop/summary-task",
      originalCwd: "/repo",
      diff: {
        statusShort: " M src/a.ts\n?? test/a.test.ts",
        changedFiles: ["src/a.ts", "test/a.test.ts"],
      },
    });
    expect(summary.spawnIntents).toEqual({
      accepted: [{ taskId: "child-task", file: "child.json" }],
      rejected: [{ file: "bad.json", reasons: ["outside cwd"] }],
    });
  });
});
