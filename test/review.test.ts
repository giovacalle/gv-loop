import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createReviewTask } from "../src/review";
import { taskFromDraft } from "../src/task-store";

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
  tempHome = undefined;
});

describe("review task creation", () => {
  test("creates a read-only child task from a completed run summary", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-review-test-"));
    const sourceTask = taskFromDraft({
      id: "implemented",
      title: "Implemented",
      prompt: "change code",
      cwd: "/repo",
    });

    const review = await createReviewTask({
      sourceTask,
      home: tempHome,
      finalReport: "Implemented the feature and ran tests.",
      summary: {
        version: 1,
        task: { id: "implemented", title: "Implemented", source: { kind: "manual" } },
        run: {
          id: "run-1",
          startedAt: "2026-06-19T10:00:00.000Z",
          finishedAt: "2026-06-19T10:01:00.000Z",
          cwd: "/repo",
          exitCode: 0,
          status: "done",
          tracePath: "/runs/trace.jsonl",
          finalPath: "/runs/final.md",
        },
        runner: { kind: "codex-exec", json: true, ephemeral: true, sandbox: "workspace-write", yolo: false },
        worktree: {
          enabled: true,
          path: "/tmp/wt",
          branch: "gv-loop/implemented",
          originalCwd: "/repo",
          diff: { statusShort: " M src/a.ts", changedFiles: ["src/a.ts"] },
        },
      },
    });

    expect(review).toMatchObject({
      title: "Review implemented",
      cwd: "/tmp/wt",
      runner: { sandbox: "read-only", yolo: false },
      source: { kind: "external", path: "/runs/final.md" },
      parent: { taskId: "implemented", runId: "run-1", depth: 1 },
      status: { state: "ready" },
    });
    expect(review.prompt).toContain("Verdict: PASS, FAIL, or NEEDS-HUMAN");
    expect(review.prompt).toContain("src/a.ts");
  });
});
