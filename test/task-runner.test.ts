import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { claimTask, readTask, saveTask, taskFromDraft } from "../src/task-store";
import { runTask } from "../src/task-runner";

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) await rm(tempHome, { recursive: true, force: true });
  tempHome = undefined;
});

describe("task runner", () => {
  test("runs a claimed task through an injected executor", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-task-runner-test-"));
    await saveTask(
      taskFromDraft({
        id: "run-me",
        title: "Run me",
        prompt: "Do useful work.",
        cwd: "/tmp/project",
      }),
      tempHome
    );
    await claimTask("run-me", "worker-a", tempHome);

    const metadata = await runTask("run-me", tempHome, async ({ cwd, prompt, runner }) => {
      expect(cwd).toBe("/tmp/project");
      expect(prompt.trim()).toBe("Do useful work.");
      expect(runner.yolo).toBe(false);
      return {
        stdout: `${JSON.stringify({ type: "agent_message", text: "completed task" })}\n`,
        stderr: "",
        exitCode: 0,
      };
    });

    expect(metadata.exitCode).toBe(0);
    expect(await readFile(metadata.finalPath, "utf8")).toBe("completed task\n");
    expect((await readTask("run-me", tempHome)).status.state).toBe("done");
  });

  test("marks failed task runs as failed", async () => {
    tempHome = await mkdtemp(join(tmpdir(), "gv-loop-task-runner-test-"));
    await saveTask(taskFromDraft({ id: "fail-me", title: "Fail me", prompt: "fail", cwd: "/tmp/project" }), tempHome);
    await claimTask("fail-me", "worker-a", tempHome);

    const metadata = await runTask("fail-me", tempHome, async () => ({
      stdout: "",
      stderr: "boom",
      exitCode: 2,
    }));

    expect(metadata.exitCode).toBe(2);
    expect(await readFile(metadata.finalPath, "utf8")).toContain("Codex failed with exit code 2");
    expect((await readTask("fail-me", tempHome)).status.state).toBe("failed");
  });
});
